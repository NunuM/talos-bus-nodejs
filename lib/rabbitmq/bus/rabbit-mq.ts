/** node modules */
import util from 'util';

const backoff = util.promisify(setTimeout);

/** package imports */
import {v4 as uuid} from 'uuid';
import amqplib, {Channel, Connection, Replies} from 'amqplib';

/** project imports */
import {Bus} from '../../bus';
import {Message, OnReturnedMessageCallback} from '../message/message';
import {Subscription, SubscriptionImpl} from '../subscription/subscription';
import {CircularBuffer} from "../../utils/circular-buffer";
import {ClientConfig} from './client-config';

enum ConnectionState {
    NotConnected,
    Reconnecting,
    Connected,
    Blocked,
    Disconnecting,
    Disconnected
}


export class RabbitMQ implements Bus {

    private _connection?: Connection;
    private _channel?: Channel
    private _state: ConnectionState = ConnectionState.NotConnected;
    private readonly _messagesBuffer: CircularBuffer<Message> = new CircularBuffer(100);
    private readonly _subscriptions: SubscriptionImpl[] = [];
    private _connectionLock: boolean = false;
    private _reconnectionAttempts: number = 0;

    private _onErrorCallbacks: Map<string, OnReturnedMessageCallback> = new Map();

    /**
     * @constructor
     */
    constructor(private readonly _configs: ClientConfig) {
    }

    private get messagesBuffer(): CircularBuffer<Message> {
        return this._messagesBuffer;
    }

    private get logger() {
        return this._configs.logger;
    }

    get isConnected(): boolean {
        return this._state === ConnectionState.Connected;
    }

    get isReconnecting(): boolean {
        return this._state === ConnectionState.Reconnecting;
    }

    get isClientBlocked(): boolean {
        return this._state === ConnectionState.Blocked;
    }

    get isToDisconnect(): boolean {
        return this._state === ConnectionState.Disconnecting || this._state === ConnectionState.Disconnected;
    }

    /**
     * @inheritDoc
     */
    async subscribe(subscription: Subscription): Promise<boolean> {

        if (!(subscription instanceof SubscriptionImpl)) {
            throw new TypeError("");
        }

        if (!this._subscriptions.includes(subscription))
            this._subscriptions.push(subscription);

        if (!this.isConnected) {
            this.logger.debug('Connection is not available, postpone subscription');
            return false;
        }

        if (subscription.isOnlyQueueSubscription) {

            try {
                await this._channel?.assertQueue(subscription.queue, subscription.queueOptions);
                const consumerReply: Replies.Consume | undefined = await this._channel?.consume(
                    subscription.queue,
                    (msg) => {
                        if (msg) {
                            if (this._configs.useConfirmChannel) {
                                this._channel?.ack(msg);
                            }
                            subscription.onMessage(msg);
                        }
                    }, subscription.consumerOptions);

                subscription.onSubscription();

                this.logger.debug(`Queue ${subscription.queue} with consumer tag of: ${consumerReply?.consumerTag}`);
                return true;
            } catch (e) {
                this.logger.debug(`Could not create queue: ${subscription.queue}`, e);
                this._subscriptions.splice(this._subscriptions.indexOf(subscription), 1);
                subscription.onSubscriptionError(e);
                return false;
            }
        } else {

            if (!subscription.exchange
                || !subscription.pattern) {
                throw new Error("Subscription to exchange must have the name,type and pattern assigned");
            }

            if (subscription.isToCreateExchange) {

                if (!subscription.exchangeType) {
                    throw new Error("Creating exchange must have the type defined");
                }

                try {
                    await this._channel?.assertExchange(subscription.exchange,
                        subscription.exchangeType,
                        subscription.exchangeOptions);
                } catch (e) {
                    this.logger.debug(`Exchange not exists: ${subscription.exchange}`, e);
                    return false;
                }
            } else {
                try {
                    await this._channel?.checkExchange(subscription.exchange);
                } catch (e) {
                    this.logger.debug(`Exchange not exists: ${subscription.exchange}`, e);
                    return false;
                }
            }

            try {
                await this._channel?.assertQueue(subscription.queue, subscription.queueOptions);
                await this._channel?.bindQueue(subscription.queue, subscription.exchange, subscription.pattern);
                await this._channel?.consume(subscription.queue, (msg) => {
                    if (msg) {
                        if (this._configs.useConfirmChannel) {
                            this._channel?.ack(msg);
                        }
                        subscription.onMessage(msg);
                    }
                }, subscription.consumerOptions);

                subscription.onSubscription();
                return true;
            } catch (e) {
                this.logger.debug(`Could not bind to exchange: ${subscription.exchange}`, e);
                this._subscriptions.splice(this._subscriptions.indexOf(subscription), 1);
                subscription.onSubscriptionError(e);
                return false;
            }
        }
    }


    /**
     *  @inheritDoc
     */
    async unsubscribe(subscription: Subscription): Promise<boolean> {

        if (!(subscription instanceof SubscriptionImpl)) {
            throw new TypeError("");
        }


        if (!this._subscriptions.includes(subscription)) {
            throw new Error('Subscription not found');
        }

        const idx = this._subscriptions.indexOf(subscription);
        this._subscriptions.splice(idx, 1);

        if (this.isConnected) {
            if (subscription.isOnlyQueueSubscription) {
                try {
                    const deletedCount = await this._channel?.deleteQueue(subscription.queue, subscription.deleteQueueOptions);

                    this.logger.debug(`Deleted ${deletedCount?.messageCount} from subscription ${subscription}`);

                    return true;
                } catch (error) {
                    this.logger.debug('Cannot unsubscribe', subscription, error);
                }
            } else {
                if (!subscription.exchange
                    || !subscription.exchangeType
                    || !subscription.pattern) {
                    throw new Error("UnSubscription to exchange must have the name,type and pattern assigned");
                }

                await Promise.all([
                    this._channel?.unbindQueue(subscription.queue, subscription.exchange, subscription.pattern),
                    this._channel?.deleteQueue(subscription.queue, subscription.deleteQueueOptions)
                        .then((deleteCount) => {
                            this.logger.debug(`Deleted ${deleteCount?.messageCount} from subscription ${subscription}`);
                        })
                ]).catch((error) => {
                    this.logger.debug('Cannot unsubscribe', subscription, error);
                });

                return true;
            }
        }

        return false;
    }

    /**
     * @inheritDoc
     */
    publish(message: Message): boolean {

        if (!(message instanceof Message)) {
            return false;
        }

        if (!this.isConnected || this.isClientBlocked) {
            this.messagesBuffer.write(message);
            return false;
        }

        if (message.hasReturnCallback) {

            const key = uuid();

            message.withHeader('return', key);

            // @ts-ignore
            this._onErrorCallbacks.set(key, message.onReturn);

            setTimeout(() => {
                this._onErrorCallbacks.delete(key);
            }, 1000 * 10);

        }

        try {
            if (message.isToQueue) {

                this._channel?.sendToQueue(message.queue, message.content, message.options);

                //@ts-ignore
                return this._channel?.sendToQueue(message.queue, message.content, message.options, (error) => {
                    if (error) {
                        this.logger.warn('Message will be re-queued by not receiving ack', error);
                        this._messagesBuffer.write(message);
                    }
                }) || false;

            } else {
                //@ts-ignore
                return this._channel?.publish(message.exchange, message.routingKey, message.content, message.options, (error) => {
                    if (error) {
                        this.logger.warn('Message will be re-queued by not receiving ack', error);
                        this._messagesBuffer.write(message);
                    }
                }) || false;
            }
        } catch (e) {
            this.logger.debug('The channel is closed, this bus should be reported', e);
        }

        return false;
    }


    /**
     * @inheritDoc
     */
    async connect(): Promise<boolean> {

        if (this.isConnected) {
            return true;
        }

        if (this._connectionLock) {
            return false;
        }

        this._connectionLock = true;
        this.logger.debug("Connecting to RabbitMQ server");

        try {

            this._connection = await amqplib.connect(this._configs.connectionString);

            this.registerConnectionHandlers();

            await this.createChannel();

            if (this._state !== ConnectionState.Reconnecting) {
                try {
                    await this.flushQueuedMessages();
                } catch (e) {

                }
            }

            this._state = ConnectionState.Connected;
            this.logger.info("Connected to RabbitMQ server");

            return true;

        } catch (e) {

            this.logger.debug("Error creation connecting to:", this._configs.connectionString, e);
            this._state = ConnectionState.NotConnected;

            process.nextTick(() => {
                this.reconnect().catch((error) => {
                    this.logger.debug("Error re-connecting to", this._configs.connectionString, error);
                });
            });

            return false;

        } finally {
            this._connectionLock = false;
        }
    }


    private async createChannel(): Promise<boolean> {

        if (this._configs.useConfirmChannel) {
            this._channel = await this._connection?.createConfirmChannel();
        } else {
            this._channel = await this._connection?.createChannel();
        }

        await this._channel?.prefetch(this._configs.qosPrefetch);

        this.registerChannelHandlers();

        return true;

    }

    /**
     * @inheritDoc
     */
    async disconnect(): Promise<boolean> {
        this._state = ConnectionState.Disconnecting;

        this.logger.debug("Disconnecting from server:", this._configs.connectionString);

        await this.stop();

        this._state = ConnectionState.Disconnected;

        this.logger.debug("Disconnected from server:", this._configs.connectionString);

        return true;
    }

    /**
     * Stops communication
     */
    private async stop(): Promise<void> {
        try {
            this._channel?.removeAllListeners();
            await this._channel?.close();
        } catch (e) {
            this.logger.debug("Error closing channel", e);
        } finally {
            this._channel = undefined;
        }

        try {
            this._connection?.removeAllListeners();
            await this._connection?.close();
        } catch (e) {
            this.logger.debug("Error closing connection", e);
        } finally {
            this._connection = undefined;
        }

        this._state = this.isToDisconnect ? ConnectionState.Disconnected : ConnectionState.NotConnected;
    }


    /**
     * Registers connection events
     * @private
     */
    private registerConnectionHandlers() {

        this._connection?.on('close', (error) => {
            this.logger.debug('Received close event', error);
            this._state = ConnectionState.NotConnected;
            process.nextTick(() => {
                this.reconnect().finally();
            });
        });

        this._connection?.on('error', (error) => {
            this.logger.debug('Received error event', error);
            this._state = ConnectionState.NotConnected;
            this._connection?.close().catch((e) => {
                this.logger.debug("Error closing connection", e);
            });
        });

        this._connection?.on('blocked', (reason) => {
            this._state = ConnectionState.Blocked;
            this.logger.debug('RabbitMQ server blocked this client', reason);
        });

        this._connection?.on('unblocked', () => {
            this._state = ConnectionState.Connected;
            this.logger.debug('RabbitMQ server unblocked this client');
        });
    }

    private registerChannelHandlers() {
        /**
         * Not know what do in an error for a channel,
         * I don't know if the connection also receives it
         * and the documentation is not explicit either.
         *
         * Playing safe (I think), close and start a new connection
         * while buffering messages in memory.
         */
        this._channel?.on('error', (error) => {
            this._state = ConnectionState.NotConnected;

            this.logger.debug('Channel error', error);

            process.nextTick(() => {
                this.createChannel()
                    .catch((e) => {
                        this.logger.debug("Unable to create channel", e);
                        return this.stop();
                    })
                    .then((created) => {
                        if (created) {
                            this.logger.debug("Re-created channel");
                        } else {
                            if (!this.isToDisconnect) {
                                return this.connect();
                            }
                        }
                    })
                    .catch((e) => {
                        this.logger.debug("Unable to re-connect", e);
                    });
            });
        });

        this._channel?.on('return', (msg: amqplib.Message) => {
            this.logger.debug('Channel return event:', msg);

            if (msg.properties.headers.hasOwnProperty('return')) {

                const key: string = msg.properties.headers.return;
                const fn = this._onErrorCallbacks.get(key);

                if (fn) {
                    const isToRequeue: boolean = fn(msg);
                    if (isToRequeue) {
                        this._messagesBuffer.write(Message.fromReturnedMessage(msg));
                    }
                }
                this._onErrorCallbacks.delete(key);
            }
        });
    }


    /**
     * Attempts to reconnect to the server
     * @private
     * @return {Promise<boolean>}
     */
    async reconnect() {

        this.logger.debug('Reconnecting to bus');

        if (this._state === ConnectionState.Reconnecting || this.isToDisconnect) {
            return false;
        } else {
            this._state = ConnectionState.Reconnecting;
        }

        await backoff(this._configs.reconnectionBackoff);
        this._reconnectionAttempts += 1;
        const isConnected = await this.connect();

        if (!isConnected) {
            return false;
        }

        this.logger.info(`Re-connected after ${this._reconnectionAttempts}(${(this._reconnectionAttempts * this._configs.reconnectionBackoff) / 60_000}m) attempts`)
        this._reconnectionAttempts = 0;

        try {
            await this.reEstablishSubscriptions();
        } catch (e) {
            this.logger.debug("Error executing establish subscriptions", e);
        }

        try {
            await this.flushQueuedMessages();
        } catch (e) {
            this.logger.debug("Error flushing queued messages", e);
        }

        return true;
    }


    /**
     * After Reconnection
     * @private
     * @return {Promise<boolean>}
     */
    private async reEstablishSubscriptions() {

        for (const subscription of this._subscriptions) {
            await this.subscribe(subscription);
        }

        return true;
    }

    /**
     * Send in memory queued messages
     * @private
     * @return {Promise<boolean>}
     */
    private async flushQueuedMessages() {
        for (const message of this.messagesBuffer) {
            await backoff(50);
            this.publish(message);
        }
        return true;
    }
}

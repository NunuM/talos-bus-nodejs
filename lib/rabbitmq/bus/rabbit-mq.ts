/** node modules */
import util from 'util';
/** package imports */
import {v4 as uuid} from 'uuid';
import amqplib, {Channel, Connection, Replies} from 'amqplib';

/** project imports */
import {Bus} from '../../bus';
import {Message, OnReturnedMessageCallback} from '../message/message';
import {Subscription, SubscriptionImpl} from '../subscription/subscription';
import {CircularBuffer} from "../../utils/circular-buffer";
import {ClientConfig} from './client-config';

const backoff = util.promisify(setTimeout);

enum ConnectionState {
    NotConnected,
    Reconnecting,
    Connected,
    Blocked,
    Disconnecting,
    Disconnected,
    ConnectedWithNoChannel
}


export class RabbitMQ implements Bus {

    private _connection?: Connection;
    private _channel?: Channel
    private _state: ConnectionState = ConnectionState.NotConnected;
    private readonly _messagesBuffer: CircularBuffer<Message> = new CircularBuffer(100);
    private readonly _subscriptions: Set<SubscriptionImpl> = new Set<SubscriptionImpl>();
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

    get isChannelClosed(): boolean {
        return this._state === ConnectionState.ConnectedWithNoChannel;
    }

    get isToDisconnect(): boolean {
        return this._state === ConnectionState.Disconnecting || this._state === ConnectionState.Disconnected;
    }

    /**
     * @inheritDoc
     */
    async subscribe(subscription: Subscription): Promise<boolean> {

        if (!(subscription instanceof SubscriptionImpl)) {
            throw new TypeError("Subscription must be created from the library subscription builders");
        }

        if (!this.isConnected) {
            this.logger.debug('Connection is not available, postpone subscription');
            this._subscriptions.add(subscription);
            return false;
        }

        if (subscription.isOnlyQueueSubscription) {

            try {
                const queueReply: Replies.AssertQueue | undefined = await this._channel?.assertQueue(subscription.queue, subscription.queueOptions);
                if (typeof subscription.queue === 'string' && subscription.queue.length === 0 && queueReply) {
                    subscription['_options']['queue'] = queueReply.queue;
                }
                const consumerReply: Replies.Consume | undefined = await this._channel?.consume(
                    subscription.queue,
                    (msg) => {
                        if (msg) {
                            if (this._configs.useConfirmChannel) {
                                this._channel?.ack(msg);
                            }
                            subscription.emit('message', msg);
                        }
                    }, subscription.consumerOptions);

                subscription.emit("subscribed");
                this.logger.debug(`Queue ${subscription.queue} with consumer tag of: ${consumerReply?.consumerTag}`);
            } catch (e) {
                this.logger.debug(`Could not create queue: ${subscription.queue}`, e);
                subscription.emit("subscriptionError", e);
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
                    subscription.emit("subscriptionError", e);
                    return false;
                }
            } else {
                try {
                    await this._channel?.checkExchange(subscription.exchange);
                } catch (e) {
                    this.logger.debug(`Exchange not exists: ${subscription.exchange}`, e);
                    subscription.emit("subscriptionError", e);
                    return false;
                }
            }

            try {
                const queueReply: Replies.AssertQueue | undefined = await this._channel?.assertQueue(subscription.queue, subscription.queueOptions);
                if (typeof subscription.queue === 'string' && subscription.queue.length === 0 && queueReply) {
                    subscription['_options']['queue'] = queueReply.queue;
                }
                await this._channel?.bindQueue(subscription.queue, subscription.exchange, subscription.pattern);
                await this._channel?.consume(subscription.queue, (msg) => {
                    if (msg) {
                        if (this._configs.useConfirmChannel) {
                            this._channel?.ack(msg);
                        }
                        subscription.emit("message", msg);
                    }
                }, subscription.consumerOptions);

                subscription.emit("subscribed");
            } catch (e) {
                this.logger.debug(`Could not bind to exchange: ${subscription.exchange}`, e);
                subscription.emit("subscriptionError", e);
                return false;
            }
        }

        this._subscriptions.add(subscription);

        return true;
    }


    /**
     *  @inheritDoc
     */
    async unsubscribe(subscription: Subscription): Promise<boolean> {

        if (!(subscription instanceof SubscriptionImpl)) {
            throw new TypeError("Subscription must be created from the library subscription builders");
        }

        if (this._subscriptions.has(subscription)) {
            this._subscriptions.delete(subscription);
        }

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
                    || !subscription.queue
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

        if (!this.isConnected || this.isClientBlocked || this.isChannelClosed) {
            this.logger.debug("Queuing message due connectivity error:", this._state);
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

            const oldStats = this._state;
            this._state = ConnectionState.Connected;
            if (oldStats !== ConnectionState.Reconnecting) {
                try {
                    await this.reEstablishSubscriptions();
                    await this.flushQueuedMessages();
                } catch (e) {
                    this.logger.debug("Error re-subscribing", e);
                }
            }

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

    /**
     * Create channel
     * @private
     */
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
            this._state = ConnectionState.ConnectedWithNoChannel;

            this.logger.debug('Channel error', error);

            process.nextTick(() => {
                backoff(30 * 1000).then(() => {
                    return this.createChannel();
                }).then((created) => {
                    this.logger.debug("Channel created:", created);
                    if (created) {
                        this._state = ConnectionState.Connected;
                        return true;
                    } else {
                        return Promise.reject("Channel not created");
                    }
                }).then((restored) => {
                    if (restored) {
                        this.logger.debug("Re-created channel");
                        return this.reEstablishSubscriptions()
                            .then(() => {
                                return this.flushQueuedMessages();
                            });
                    } else {
                        return Promise.reject("Channel not created");
                    }
                }).catch((e) => {
                    this.logger.debug("Unable to re-connect channel", e);
                    if (!this.isToDisconnect) {
                        return this.disconnect().then(() => this.connect());
                    } else {
                        return Promise.resolve(true);
                    }
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
    private async reconnect() {

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
            if(!this.publish(message)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Object  state
     */
    toString(): string {
        const buffer: string[] = [
            RabbitMQ.name,
            `state: ${this._state}`,
            `number of subscriptions: ${this._subscriptions.size}`,
            `number of callbacks: ${this._onErrorCallbacks.size}`,
            `reconnection of attempts: ${this._onErrorCallbacks.size}`,
            `number of buffered messages: ${this._messagesBuffer.size()}`,
        ];

        return buffer.join(", ");
    }
}

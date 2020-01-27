/** node modules */
const util = require('util');
const backoff = util.promisify(setTimeout);

/** package imports */
const amqplib = require('amqplib');

/** project imports */
const {Bus} = require('../bus');
const {RabbitMQMessage} = require('./rabbitmq_message');
const {RabbitMQMessageHandler} = require('./rabbitmq_message_handler');


class RabbitMQBus extends Bus {

    /**
     * @constructor
     * @param {string} url
     * @param { {useConfirmChannel:boolean, reconnectionBackoff: number, client:{timeout:number}, qos:{prefetch:number} }  } [options={}]
     * @param {Logger} [logger=console]
     */
    constructor(url, options, logger) {
        super();
        this._url = url;
        this._connection = null;
        this._isConnecting = false;
        this._isReconnecting = false;
        this._noChannelAvailable = true;
        this._isClientBlocked = false;
        this._isToClose = false;
        this._logger = logger || console;
        this._options = Object.assign({
            useConfirmChannel: true,
            reconnectionBackoff: 60000,
            client: {timeout: 0},
            qos: {prefetch: 100}
        }, options || {});

        /**
         *
         * @type {Array<RabbitMQMessage>}
         * @private
         */
        this._buffer = [];
        this._reconnectionAttempt = 0;
        this._channel = null;
        /**
         *
         * @type {Array<RabbitMQMessageHandler>}
         * @private
         */
        this._subscriptions = [];
    }

    get isConnected() {
        return !(this._isConnecting
            || this._isReconnecting
            || this._noChannelAvailable);
    }

    get isClientBlocked() {
        return this._isClientBlocked;
    }

    /**
     * @inheritDoc
     */
    subscribe(handler) {

        if (!this._subscriptions.includes(handler))
            this._subscriptions.push(handler);

        if (!this.isConnected || this.isClientBlocked) {
            this._logger.debug('Connection is not available, postpone subscription');
            return;
        }

        if (handler.isFromQueue) {
            this._channel.assertQueue(handler.queue, handler.queueOptions)
                .then(() => {
                    return this._channel.consume(handler.queue, (msg) => {
                        if (msg) {
                            this._channel.ack(msg);
                            this._logger.debug(msg.content.toString());
                            handler.onMessage(msg);
                        }
                    }, handler.consumerOptions);
                })
                .then(({consumerTag}) => {
                    this._logger.debug(`Queue ${handler.queue} with consumer tag of: ${consumerTag}`);
                    handler.onSubscription();
                })
                .catch((error) => {
                    this._logger.error(`Could not create queue: ${handler.queue}`, error);
                    this._subscriptions.splice(this._subscriptions.indexOf(handler), 1);
                    handler.onSubscriptionError(error);
                });
        } else {

            let promises = [];

            if (handler.isToCreateExchange) {
                promises.push(this._channel.assertExchange(handler.exchange, handler.exchangeType, handler.exchangeOptions));
            } else {
                promises.push(this._channel.checkExchange(handler.exchange));
            }

            Promise
                .all(promises.concat([
                    this._channel.assertQueue(handler.queue, handler.queueOptions),
                    this._channel.bindQueue(handler.queue, handler.exchange, handler.pattern),
                    this._channel.consume(handler.queue, (msg) => {
                        if (msg) {
                            this._channel.ack(msg);
                            this._logger.debug(msg.content.toString());
                            handler.onMessage(msg);
                        }
                    }, handler.consumerOptions)
                ]))
                .then(() => {
                    handler.onSubscription();
                })
                .catch((error) => {
                    this._logger.error(`Could not bind to exchange: ${handler.exchange}`, error);
                    this._subscriptions.splice(this._subscriptions.indexOf(handler), 1);
                    handler.onSubscriptionError(error);
                });
        }
    }


    /**
     *  @inheritDoc
     */
    unsubscribe(handler) {
        if (!this._subscriptions.includes(handler)) {
            throw new Error('Subscription not found');
        }

        const idx = this._subscriptions.indexOf(handler);
        this._subscriptions.splice(idx, 1);

        if (this.isConnected) {
            if (handler.isFromQueue) {
                this._channel.deleteQueue(handler.queue, {ifEmpty: true}, (error) => {
                    if (error) {
                        this._logger.error('Cannot unsubscribe', error);
                    }
                });
            } else {
                Promise.all([
                    this._channel.unbindQueue(handler.queue, handler.exchange, handler.pattern),
                    this._channel.deleteQueue(handler.queue, {ifEmpty: true})
                ]).catch((error) => {
                    this._logger.error('Cannot unsubscribe', error);
                })
            }
        }
    }

    /**
     * @inheritDoc
     */
    publish(message) {

        if (!this.isConnected || this.isClientBlocked) {
            this._buffer.push(message);
            return;
        }

        try {
            if (message.isToQueue) {

                this._channel.sendToQueue(message.queue, message.content, message.options, (error, ok) => {
                    if (error) {
                        this._logger.warn('Message will be re-queued by not receiving ack', error);
                        this._buffer.push(message);
                    }
                });
            } else {
                this._channel.publish(message.exchange, message.routingKey, message.content, (error) => {
                    if (error) {
                        this._logger.warn('Message will be re-queued by not receiving ack', error);
                        this._buffer.push(message);
                    }
                });
            }
        } catch (e) {
            this._logger.error('The channel is closed, this bus should be reported', e);
        }


        this.flushQueuedMessages().finally();
    }


    /**
     * @inheritDoc
     */
    async connect() {

        if (!this._isConnecting) {
            this._isConnecting = true;

            this._logger.info("Connecting to RabbitMQ server");
            this._connection = await amqplib.connect(this._url, this._options.client);

            if (this._options.useConfirmChannel) {
                this._channel = await this._connection.createConfirmChannel();
            } else {
                this._channel = await this._connection.createChannel();
            }

            this._channel.prefetch(this._options.qos.prefetch);
            this._noChannelAvailable = false;

            this.registerEvenHandlers();

            this._isConnecting = false;
            this._isReconnecting = false;

            await this.afterReConnection();

            return true;
        }

        return !this._isConnecting;
    }

    /**
     * @inheritDoc
     */
    async disconnect() {
        this._isToClose = true;

        await this._connection.close();

        return true;
    }

    /**
     * Registers connection events
     * @private
     */
    registerEvenHandlers() {

        this._connection.on('close', (error) => {
            this._logger.error('Received close event', error);

            if (this._isToClose) {
                return;
            }

            if (this._isReconnecting) {
                return;
            } else {
                this._isReconnecting = true;
            }

            process.nextTick(() => {
                if (!this._isConnecting) {
                    this.reconnect().finally();
                }
            })
        });

        this._connection.on('error', (error) => {
            this._logger.error('Received error event', error);
            this._connection.close((err) => {
                this._logger.error('Error while close connection?', err);
            });
        });

        this._connection.on('blocked', (reason) => {
            this._isClientBlocked = true;
            this._logger.info('RabbitMQ server blocked this client', reason);
        });

        this._connection.on('unblocked', () => {
            this._isClientBlocked = false;
            this._logger.info('RabbitMQ server unblocked this client');
        });

        /**
         * Not know what do in an error for a channel,
         * I don't know if the connection also receives it
         * and the documentation is not explicit either.
         *
         * Playing safe (I think), close and start a new connection
         * while buffering messages in memory.
         */
        this._channel.on('error', (error) => {

            if (!this._noChannelAvailable) {
                this._noChannelAvailable = true;
                this._logger.error('Channel error event', error);
                this._connection.close((err) => {
                    this._logger.error('Error while close connection?', err);
                });
            }
        });

        this._channel.on('return', (msg) => {
            this._logger.error('Channel return event', msg);
            this._buffer.push(RabbitMQMessage.fromReturnedMessage(msg));
        });
    }


    /**
     * Attempts to reconnect to the server
     * @private
     * @return {Promise<boolean>}
     */
    async reconnect() {
        this._logger.info('Reconnecting bus');
        let isConnectionEstablished = false;

        do {
            await backoff(this._options.reconnectionBackoff);
            ++this._reconnectionAttempt;

            try {
                if (await this.connect()) {
                    isConnectionEstablished = true;
                }
            } catch (e) {
                this._logger.error(`Reconnection number ${this._reconnectionAttempt} was failed`, e);
            }

        } while (!isConnectionEstablished);

        this._logger.info(`Reconnection number ${this._reconnectionAttempt} was succeeded`);

        this._reconnectionAttempt = 0;

        await this.afterReConnection();

        return true;
    }


    /**
     * After Reconnection
     * @private
     * @return {Promise<boolean>}
     */
    async afterReConnection() {

        for (const subscription of this._subscriptions) {
            this.subscribe(subscription);
        }

        return await this.flushQueuedMessages();
    }

    /**
     * Send in memory queued messages
     * @private
     * @return {Promise<boolean>}
     */
    async flushQueuedMessages() {

        while (this._buffer.length > 0) {
            await backoff(500);
            this.publish(this._buffer.pop());
        }
        return true;
    }
}

module.exports = {RabbitMQBus};
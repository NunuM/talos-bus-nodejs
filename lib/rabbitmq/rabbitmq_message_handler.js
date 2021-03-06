class RabbitMQMessageHandler {

    /**
     * @constructor
     * @private
     * @param {string} queue
     * @param {boolean} [isFromQueue=false]
     * @param {string} [exchange='']
     * @param {string} [pattern='']
     */
    constructor(queue, isFromQueue, exchange, pattern) {
        this._queue = queue;
        this._isFromQueue = isFromQueue || true;
        this._exchange = exchange;
        this._pattern = pattern;
        this._isFromQueue = isFromQueue;
        this._queueOptions = {};
        this._consumerOptions = {};
        this._isToCreateExchange = false;
        this._exchangeType = null;
        this._exchangeOptions = {};
        this._messageHandler = null;
        this._errorHandler = null;
        this._subscriptionHandler = null;
    }

    get queue() {
        return this._queue;
    }

    get isFromQueue() {
        return this._isFromQueue;
    }

    get exchange() {
        return this._exchange;
    }

    get pattern() {
        return this._pattern;
    }

    get queueOptions() {
        return this._queueOptions;
    }

    get consumerOptions() {
        return this._consumerOptions;
    }


    get isToCreateExchange() {
        return this._isToCreateExchange;
    }

    get exchangeType() {
        return this._exchangeType;
    }

    get exchangeOptions() {
        return this._exchangeOptions;
    }

    /**
     * @protected
     * @param {{}} msg
     */
    onMessage(msg) {
        if (this._messageHandler)
            this._messageHandler(msg);
    }

    /**
     * @protected
     * @param {Error} error
     */
    onError(error) {
        if (this._errorHandler)
            this._errorHandler(error);
    }

    /**
     * @protected
     */
    onSubscription() {
        if (this._subscriptionHandler)
            this._subscriptionHandler(false);
    }

    /**
     * @protected
     * @param {Error} error
     */
    onSubscriptionError(error) {
        if (this._subscriptionHandler)
            this._subscriptionHandler(true, error);
    }

    /**
     *  This only register the consumer from a given queue
     *
     * @param {string} queue
     * @return {RabbitMQMessageHandler}
     */
    static forQueue(queue) {
        return new RabbitMQMessageHandler(queue, true);
    }

    /**
     * This will bind the queue with the given exchange
     *
     * @param {string} exchange
     * @param {string} queue
     * @param {string} pattern
     * @return {RabbitMQMessageHandler}
     */
    static forExchange(exchange, queue, pattern) {
        return new RabbitMQMessageHandler(queue, false, exchange, pattern);
    }

    /**
     * Scopes the queue to the connection
     *
     * @return {RabbitMQMessageHandler}
     */
    makeQueueExclusive() {
        this._queueOptions.exclusive = true;
        return this;
    }

    /**
     * The queue will be deleted when the number of consumers drops to zero
     *
     * @return {RabbitMQMessageHandler}
     */
    makeQueueAutoDelete() {
        this._queueOptions.autoDelete = true;
        return this;
    }

    /**
     * Makes the queue a priority queue
     *
     * @param priority
     * @return {RabbitMQMessageHandler}
     */
    withQueueMaxPriority(priority) {
        this._queueOptions = priority;
        return this;
    }

    /**
     * An exchange to which messages discarded from the queue will be resent.
     *
     * @param {string} exchange
     * @return {RabbitMQMessageHandler}
     */
    withDeadLetterExchange(exchange) {
        this._queueOptions.deadLetterExchange = exchange;
        return this;
    }

    /**
     * Higher priority consumers get messages in preference to lower priority consumers
     *
     * @param {number} priority
     */
    withConsumerPriority(priority) {
        this._consumerOptions.priority = priority;
    }

    /**
     * The broker won’t let anyone else consume from this queue
     *
     * @return {RabbitMQMessageHandler}
     */
    makeConsumerExclusive() {
        this._consumerOptions.exclusive = true;
        return this;
    }

    /**
     * Callback
     * @param {Function} handler
     */
    withMessageHandler(handler) {
        this._messageHandler = handler;
        return this;
    }

    /**
     * Callback
     * @param {Function} handler
     */
    withErrorHandler(handler) {
        this._errorHandler = handler;
        return this;
    }

    /**
     * Callback
     * @param {Function} handler
     */
    withSubscriptionHandler(handler) {
        this._subscriptionHandler = handler;
        return this;
    }

    /**
     *
     * @param {string} type
     * @return {RabbitMQMessageHandler}
     */
    createExchangeIfNotExists(type) {
        this._isToCreateExchange = true;
        this._exchangeType = type;
        return this;
    }

    /**
     * The exchange will survive broker restarts
     * @return {RabbitMQMessageHandler}
     */
    makeExchangeDurable() {
        this._exchangeOptions.durable = true;
        return this;
    }

    /**
     * The exchange will be destroyed once the number of bindings for which it is the source drop to zero
     * @return {RabbitMQMessageHandler}
     */
    makeExchangeAutoDelete() {
        this._exchangeOptions.autoDelete = true;
        return this;
    }

    /**
     * An exchange to send messages to if this exchange can’t route them to any queues
     * @param {string} fallbackExchange
     * @return {RabbitMQMessageHandler}
     */
    exchangeWithFallbackExchange(fallbackExchange) {
        this._exchangeOptions.alternateExchange = fallbackExchange;
        return this;
    }

}

module.exports = {RabbitMQMessageHandler};
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
        this._handler = null;
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

    /**
     *
     * @param {} msg
     */
    onMessage(msg) {
        if (this._handler)
            this._handler(msg);
    }

    /**
     *  This only register the consumer from a given queue
     *
     * @param {string} queue
     * @return {RabbitMQMessageHandler}
     */
    static forQueue(queue) {
        return new RabbitMQMessageHandler(queue);
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
    withHandler(handler) {
        this._handler = handler;
        return this;
    }
}

module.exports = {RabbitMQMessageHandler};
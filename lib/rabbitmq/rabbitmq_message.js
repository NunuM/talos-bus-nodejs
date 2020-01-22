const uuid = require('uuid/v4');

class RabbitMQMessage {

    /**
     * @private
     * @constructor
     *
     * @param {string} [queue='']
     * @param {string} [exchange='']
     * @param {string} [routingKey='']
     * @param {Any} [content='']
     * @param {{}} [options={}]
     * @param {boolean} [isToQueue=false]
     */
    constructor(queue, exchange, routingKey, content, options, isToQueue) {
        this._queue = queue || '';
        this._exchange = exchange || '';
        this._routingKey = routingKey || '';
        this._content = Buffer.from(content || '');
        this._options = options || {};
        this._isToQueue = isToQueue || false;
        this._options = options;
    }

    /**
     * Queue Name
     * @return {string}
     */
    get queue() {
        return this._queue;
    }

    /**
     * Exchange Name
     * @return {string}
     */
    get exchange() {
        return this._exchange;
    }

    /**
     * Routing key
     * @return {string}
     */
    get routingKey() {
        return this._routingKey;
    }

    /**
     * Message
     * @return {Buffer}
     */
    get content() {
        return this._content;
    }

    /**
     *
     * @return {{}}
     */
    get options() {
        return this._options;
    }

    /**
     *
     * @return {boolean}
     */
    get isToQueue() {
        return this._isToQueue;
    }

    /**
     * @private
     * @param {string} queueName
     */
    set queue(queueName) {
        this._queue = queueName;
    }

    /**
     * @private
     * @param {string} exchangeName
     */
    set exchange(exchangeName) {
        this._exchange = exchangeName;
    }

    /**
     * @private
     * @param value
     */
    set routingKey(value) {
        this._routingKey = value;
    }

    /**
     * Message to be sent
     * @param {Any} message
     */
    set content(message) {
        this._content = message;
    }

    /**
     * Define message options
     * @private
     * @param {{}} value
     */
    set options(value) {
        this._options = value;
    }

    /**
     * @private
     * @param {boolean} value
     */
    set isToQueue(value) {
        this._isToQueue = value;
    }

    /**
     *
     * @param {string} queue
     * @param {Any} message
     * @return {RabbitMQMessage}
     */
    static toQueue(queue, message) {
        return new RabbitMQMessage(queue, '', '', message, {}, true);
    }

    /**
     *
     * @param {Any} message
     * @return {RabbitMQMessage}
     */
    static toLambdaLoggingConsumers(message) {
        return new RabbitMQMessage('lambdas.logging', '', '', message, {}, false);
    }

    /**
     *
     * @param {Any} message
     * @return {RabbitMQMessage}
     */
    static toDiscoveryConsumers(message) {
        return new RabbitMQMessage('service.discovery', '', '', message, {}, true);
    }

    /**
     *
     * @param {string} exchange
     * @param {string} routingKey
     * @param {Any} message
     * @return {RabbitMQMessage}
     */
    static toExchange(exchange, routingKey, message) {
        return new RabbitMQMessage('', exchange, routingKey, message);
    }

    /**
     *
     * @param {{content:Buffer,properties:{},fields:{}}} obj
     * @return {RabbitMQMessage}
     */
    static fromReturnedMessage(obj) {
        let instance = new RabbitMQMessage();

        instance.content = obj.content;
        instance.options = obj.properties;

        if (obj.fields.exchange === '') {
            instance.isToQueue = true;
            instance.queue = obj.fields.routingKey;
            return instance;
        }

        instance.routingKey = obj.fields.routingKey;
        instance.exchange = obj.fields.exchange;

        return instance;
    }

    /**
     * The message will be discarded from a queue once it’s been there longer
     * than the given number of milliseconds
     * @param {number} timeInMilliseconds
     * @return {RabbitMQMessage}
     */
    withExpirationTimeOf(timeInMilliseconds) {
        this._options.expiration = String(timeInMilliseconds);
        return this;
    }

    /**
     * If supplied, RabbitMQ will compare it to the username supplied
     * when opening the connection, and reject messages for which it
     * does not match.
     *
     * @param {string} userId
     * @return {RabbitMQMessage}
     */
    withUserID(userId) {
        this._options.userId = userId;
        return this;
    }

    /**
     * An array of routing keys as strings; messages will be routed to these
     * routing keys in addition to that given as the routingKey parameter.
     * A string will be implicitly treated as an array containing just that string
     *
     * @param {string} cc
     * @return {RabbitMQMessage}
     */
    withCC(cc) {
        this._options.cc = (this._options.cc || []).push(cc);
        return this;
    }

    /**
     * A priority for the message
     *
     * @param {number} priority
     * @return {RabbitMQMessage}
     */
    withPriority(priority) {
        this._options.priority = priority;
        return this;
    }

    /**
     * The message will survive broker restarts provided it’s in a queue that also survives restarts.
     * @return {RabbitMQMessage}
     */
    makeMessagePersistence() {
        this._options.persistent = true;
        return this;
    }

    /**
     * The message will be returned if it is not routed to a queue.
     * @return {RabbitMQMessage}
     */
    makeMessageMandatory() {
        this._options.mandatory = true;
        return this;
    }

    /**
     * MIME type for the message content
     *
     * @param {string} contentType
     * @return {RabbitMQMessage}
     */
    withContentType(contentType) {
        this._options.contentType = contentType;
        return this;
    }

    /**
     * Protobuf MIME type for the message content
     *
     * @return {RabbitMQMessage}
     */
    protobufMediaType() {
        return this.withContentType('application/protobuf');
    }

    /**
     * JSON MIME type for the message content
     *
     * @return {RabbitMQMessage}
     */
    jsonMediaType() {
        return this.withContentType('application/json');
    }

    /**
     * MIME encoding for the message content
     *
     * @param {string} encoding
     * @return {RabbitMQMessage}
     */
    withContentEnconding(encoding) {
        this._options.encoding = encoding;
        return this;
    }

    /**
     * Application specific headers to be carried along with the message content.
     *
     * @param {string} key
     * @param {string} value
     * @return {RabbitMQMessage}
     */
    withHeader(key, value) {
        this._options.headers = Object.assign((this._options.headers || {}), {key: value});
        return this;
    }

    /**
     *
     * @param {string} correlationId
     * @return {RabbitMQMessage}
     */
    withCorrelationId(correlationId) {
        this._options.correlationId = correlationId;
        return this;
    }

    /**
     *
     * @return {RabbitMQMessage}
     */
    withUUIDCorrelatedId() {
        return this.withCorrelationId(uuid());
    }

    /**
     * Often used to name a queue to which the receiving application must send replies, in an RPC scenario
     *
     * @param {string} replyTo
     * @return {RabbitMQMessage}
     */
    withReplyTo(replyTo) {
        this._options.replyTo = replyTo;
        return this;
    }

    /**
     * Arbitrary application-specific identifier for the message
     *
     * @param {string} messageId
     * @return {RabbitMQMessage}
     */
    withMessageId(messageId) {
        this._options.messageId = messageId;
        return this;
    }

    /**
     * A timestamp for the message
     *
     * @return {RabbitMQMessage}
     */
    withTimestamp() {
        this._options.timestamp = new Date().getTime();
        return this;
    }

    /**
     * An arbitrary application-specific type for the message
     *
     * @param {string} type
     * @return {RabbitMQMessage}
     */
    withType(type) {
        this._options.type = type;
        return this;
    }

    /**
     * An arbitrary identifier for the originating application.
     *
     * @param {string} appId
     * @return {RabbitMQMessage}
     */
    withAppId(appId) {
        this._options.appId = appId;
        return this;
    }

}

module.exports = {RabbitMQMessage};
import {Options} from "amqplib/properties";
import {Message as ClientMessage} from "amqplib";

const {v4: uuid} = require('uuid');

export type OnReturnedMessageCallback = (message: ClientMessage) => boolean;

export class Message {

    private _onReturn?: OnReturnedMessageCallback;

    /**
     * @private
     * @constructor
     */
    private constructor(private _queue: string = '',
                        private _exchange: string = '',
                        private _routingKey = '',
                        private _content: Buffer = Buffer.of(),
                        private _options: Options.Publish = {},
                        private _isToQueue = false) {
    }

    /**
     * Queue Name
     * @return {string}
     */
    get queue(): string {
        return this._queue;
    }

    /**
     * Exchange Name
     * @return {string}
     */
    get exchange(): string {
        return this._exchange;
    }

    /**
     * Routing key
     * @return {string}
     */
    get routingKey(): string {
        return this._routingKey;
    }

    /**
     * Message
     * @return {Buffer}
     */
    get content(): Buffer {
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
    get isToQueue(): boolean {
        return this._isToQueue;
    }

    /**
     *
     * @return {boolean}
     */
    get isMandatory(): boolean {
        return this._options?.mandatory || false;
    }

    /**
     *
     * @return {boolean}
     */
    get hasReturnCallback(): boolean {
        return this.isMandatory && typeof this._onReturn === 'function';
    }

    /**
     *
     * @return {function}
     */
    get onReturn(): OnReturnedMessageCallback | undefined {
        return this._onReturn;
    }

    /**
     * @private
     * @param {string} queueName
     */
    set queue(queueName: string) {
        this._queue = queueName;
    }

    /**
     * @private
     * @param {string} exchangeName
     */
    set exchange(exchangeName: string) {
        this._exchange = exchangeName;
    }

    /**
     * @private
     * @param value
     */
    set routingKey(value: string) {
        this._routingKey = value;
    }

    /**
     * Message to be sent
     * @param {Any} message
     */
    set content(message: any) {
        this._content = message;
    }

    /**
     * Define message options
     * @private
     * @param {{}} value
     */
    set options(value: Options.Publish) {
        this._options = value;
    }

    /**
     * @private
     * @param {boolean} toQueue
     */
    set isToQueue(toQueue: boolean) {
        this._isToQueue = toQueue;
    }

    /**
     * Send this message to queue
     *
     * @param {string} queueName
     * @param {*} message
     * @return {Message}
     */
    static toQueue(queueName: string, message: Buffer): Message {
        return new Message(queueName, '', '', message, {}, true);
    }

    /**
     * Send message to exchange with some routing key
     *
     * @param {string} exchange
     * @param {string} routingKey
     * @param {Buffer} message
     * @return {Message}
     */
    static toExchange(exchange: string, routingKey: string, message: Buffer): Message {
        return new Message('', exchange, routingKey, message);
    }

    /**
     * Create RabbitMQMessage instance from returned message‘
     *
     * @param {ClientMessage} message
     * @return {Message}
     */
    static fromReturnedMessage(message: ClientMessage): Message {
        let instance = new Message();

        instance.content = message.content;
        instance.options = message.properties;

        if (message.fields.exchange === '') {
            instance.isToQueue = true;
            instance.queue = message.fields.routingKey;
            return instance;
        }

        instance.routingKey = message.fields.routingKey;
        instance.exchange = message.fields.exchange;

        return instance;
    }

    /**
     * The message will be discarded from a queue once it’s been there longer
     * than the given number of milliseconds
     * @param {number} timeInMilliseconds
     * @return {Message}
     */
    withExpirationTimeOf(timeInMilliseconds: number): Message {
        this._options.expiration = String(timeInMilliseconds);
        return this;
    }

    /**
     * If supplied, RabbitMQ will compare it to the username supplied
     * when opening the connection, and reject messages for which it
     * does not match.
     *
     * @param {string} userId
     * @return {Message}
     */
    withUserID(userId: string): Message {
        this._options.userId = userId;
        return this;
    }

    /**
     * An array of routing keys as strings; messages will be routed to these
     * routing keys in addition to that given as the routingKey parameter.
     * A string will be implicitly treated as an array containing just that string
     *
     * @param {string} cc
     * @return {Message}
     */
    withCC(cc: string): Message {

        if (!this._options.CC) {
            this._options.CC = [];
        }

        if (Array.isArray(this._options.CC)) {
            this._options.CC.push(cc);
        }

        return this;
    }

    /**
     * A priority for the message
     *
     * @param {number} priority
     * @return {Message}
     */
    withPriority(priority: number): Message {
        this._options.priority = priority;
        return this;
    }

    /**
     * The message will survive broker restarts provided it’s in a queue that also survives restarts.
     * @return {Message}
     */
    makeMessagePersistence() {
        this._options.persistent = true;
        return this;
    }

    /**
     * The message will be returned if it is not routed to a queue.
     * @param {function} [onError=null]
     * @return {Message}
     */
    makeMessageMandatory(onError: OnReturnedMessageCallback): Message {
        this._options.mandatory = true;

        if (onError) {
            this._onReturn = onError;
        }

        return this;
    }

    /**
     * MIME type for the message content
     *
     * @param {string} contentType
     * @return {Message}
     */
    withContentType(contentType: string): Message {
        this._options.contentType = contentType;
        return this;
    }

    /**
     * Protobuf MIME type for the message content
     *
     * @return {Message}
     */
    protobufMediaType(): Message {
        return this.withContentType('application/protobuf');
    }

    /**
     * JSON MIME type for the message content
     *
     * @return {Message}
     */
    jsonMediaType(): Message {
        return this.withContentType('application/json');
    }

    /**
     * MIME encoding for the message content
     *
     * @param {string} contentEncoding
     * @return {Message}
     */
    withContentEncoding(contentEncoding: string): Message {
        this._options.contentEncoding = contentEncoding;
        return this;
    }

    /**
     * Application specific headers to be carried along with the message content.
     *
     * @param {string} key
     * @param {string} value
     * @return {Message}
     */
    withHeader(key: string, value: string): Message {

        if (!this._options.headers) {
            this._options.headers = {};
        }

        this._options.headers[key] = value;
        return this;
    }

    /**
     *
     * @param {string} correlationId
     * @return {Message}
     */
    withCorrelationId(correlationId: string): Message {
        this._options.correlationId = correlationId;
        return this;
    }

    /**
     *
     * @return {Message}
     */
    withUUIDCorrelatedId() {
        return this.withCorrelationId(uuid());
    }

    /**
     * Often used to name a queue to which the receiving application must send replies, in an RPC scenario
     *
     * @param {string} replyTo
     * @return {Message}
     */
    withReplyTo(replyTo: string): Message {
        this._options.replyTo = replyTo;
        return this;
    }

    /**
     * Arbitrary application-specific identifier for the message
     *
     * @param {string} messageId
     * @return {Message}
     */
    withMessageId(messageId: string): Message {
        this._options.messageId = messageId;
        return this;
    }

    /**
     * A timestamp for the message
     *
     * @return {Message}
     */
    withTimestamp(): Message {
        this._options.timestamp = new Date().getTime();
        return this;
    }

    /**
     * An arbitrary application-specific type for the message
     *
     * @param {string} type
     * @return {Message}
     */
    withType(type: string): Message {
        this._options.type = type;
        return this;
    }

    /**
     * An arbitrary identifier for the originating application.
     *
     * @param {string} appId
     * @return {Message}
     */
    withAppId(appId: string) {
        this._options.appId = appId;
        return this;
    }

}

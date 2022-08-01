import {Options} from "amqplib/properties";
import {Subscription, SubscriptionImpl} from "../subscription";


export class ConsumerOptionsBuilder {

    constructor(private _consumeOptions: Options.Consume = {},
                private _queueSubscription: QueueSubscriptionBuilder) {
    }


    get consumeOptions(): Options.Consume {
        return this._consumeOptions;
    }

    get queueSubscription(): QueueSubscriptionBuilder {
        return this._queueSubscription;
    }

    /**
     * if true, the broker won’t expect an acknowledgement of messages delivered to this consumer; i.e.,
     * it will dequeue messages as soon as they’ve been sent down the wire.
     * Defaults to false (i.e., you will be expected to acknowledge messages).
     * @param noAck
     */
    isNoAck(noAck: boolean): this {
        this._consumeOptions.noAck = noAck;
        return this;
    }

    /**
     * in theory, if true then the broker won’t deliver messages to the consumer
     * if they were also published on this connection; RabbitMQ doesn’t implement it though, and will ignore it.
     * Defaults to false.
     * @param noLocal
     */
    isNoLocal(noLocal: boolean): this {
        this._consumeOptions.noLocal = noLocal;
        return this;
    }

    /**
     * When registering a consumer with an AMQP 0-9-1 client, the exclusive flag can be set to true
     * to request the consumer to be the only one on the target queue. The call succeeds only if there's
     * no consumer already registered to the queue at that time. This allows to make sure only one
     * consumer at a time consumes from the queue.
     *
     * @param isExclusive
     */
    isExclusive(isExclusive: boolean): this {
        this._consumeOptions.exclusive = isExclusive;
        return this;
    }

    /**
     * Gives a priority to the consumer; higher priority consumers get messages in preference to lower priority consumers
     * @param priority
     */
    withPriority(priority: number): this {
        this._consumeOptions.priority = priority;
        return this;
    }

    /**
     * New instance
     */
    build(): Subscription {
        return this._queueSubscription.build();
    }
}


export class QueueSubscriptionBuilder {

    protected readonly _consumerOptions: ConsumerOptionsBuilder;

    constructor(private _queueName: string,
                protected _queueOptions: Options.AssertQueue,
                protected _deleteQueueOptions: Options.DeleteQueue,
                consumerOptions?: ConsumerOptionsBuilder) {
        this._consumerOptions = consumerOptions || new ConsumerOptionsBuilder({}, this);
    }

    /**
     * Exclusive true if we are declaring an exclusive queue (restricted to this connection)
     *
     * @param exclusiveQueue
     */
    isExclusive(exclusiveQueue: boolean): this {
        this._queueOptions.exclusive = exclusiveQueue;
        return this;
    }

    /**
     * Durable true if we are declaring a durable queue (the queue will survive a server restart)
     *
     * @param durable
     */
    isDurable(durable: boolean): this {
        this._queueOptions.durable = durable;
        return this;
    }

    /**
     * AutoDelete true if we are declaring an autodelete queue (server will delete it when no longer in use)
     *
     * @param autoDelete
     */
    isAutoDelete(autoDelete?: boolean): this {
        this._queueOptions.autoDelete = autoDelete;
        return this;
    }

    /**
     * ifUnused true if the queue should be deleted only if not in use
     *
     * @param ifUnused
     */
    deleteIfIsUnused(ifUnused: boolean): this {
        this._deleteQueueOptions.ifUnused = ifUnused;
        return this;
    }

    /**
     * ifEmpty true if the queue should be deleted only if empty
     *
     * @param ifEmpty
     */
    deleteIfIsEmpty(ifEmpty: boolean): this {
        this._deleteQueueOptions.ifEmpty = ifEmpty;
        return this;
    }

    /**
     * Queues can have their length limited. Queues and messages can have a TTL.
     * @param ttl
     */
    withMessageTTL(ttl: number): this {
        this._queueOptions.messageTtl = ttl;
        return this;
    }

    /**
     * A TTL can be specified on a per-message basis, by setting the expiration property when publishing a message.
     *
     * The value of the expiration field describes the TTL period in milliseconds.
     * The same constraints as for x-message-ttl apply. Since the expiration field must be a string,
     * the broker will (only) accept the string representation of the number.
     *
     * @param expiration
     */
    withExpiration(expiration: number): this {
        this._queueOptions.expires = expiration;
        return this;
    }

    /**
     * Messages from a queue can be "dead-lettered"; that is, republished to an exchange when
     * any of the following events occur:
     *
     * - The message is negatively acknowledged by a consumer using basic.reject or basic.nack
     *   with requeue parameter set to false.
     * - The message expires due to per-message TTL; or
     * - The message is dropped because its queue exceeded a length limit
     * @param exchange
     */
    withDeadLetterExchange(exchange: string): this {
        this._queueOptions.deadLetterExchange = exchange;
        return this;
    }

    /**
     * Dead-lettered messages are routed to their dead letter exchange either:
     *
     * - with the routing key specified for the queue they were on; or, if this was not set,
     * - with the same routing keys they were originally published with
     * @param routingKey
     */
    withDeadLetterRoutingKey(routingKey: string): this {
        this._queueOptions.deadLetterRoutingKey = routingKey;
        return this;
    }

    /**
     * Maximum number of messages can be set by supplying the x-max-length queue
     * declaration argument with a non-negative integer value.
     *
     * Maximum length in bytes can be set by supplying the x-max-length-bytes queue
     * declaration argument with a non-negative integer value.
     *
     * @param maxLength
     */
    withMaxLength(maxLength: number): this {
        this._queueOptions.maxLength = maxLength;
        return this;
    }

    /**
     * RabbitMQ has priority queue implementation in the core as of version 3.5.0.
     * Any queue can be turned into a priority one using client-provided optional
     * arguments (but, unlike other features that use optional arguments, not policies).
     * The implementation supports a limited number of priorities: 255. Values between 1 and 10 are recommended.
     *
     * @param maxPriority
     */
    withMaxPriority(maxPriority: number): this {
        this._queueOptions.maxLength = maxPriority;
        return this;
    }


    /**
     * Build subscription instance
     */
    build(): Subscription {
        return new SubscriptionImpl({
                queue: this._queueName
            },
            this._queueOptions,
            this._deleteQueueOptions,
            this._consumerOptions.consumeOptions);
    }

    /**
     * New builder
     * @param queue name
     */
    static newBuilder(queue: string) {
        return new QueueSubscriptionBuilder(
            queue,
            {},
            {}
        );
    }

}

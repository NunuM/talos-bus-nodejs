import {Options} from "amqplib/properties";
import {ConsumerOptionsBuilder, QueueSubscriptionBuilder} from "./queue-subscription-builder";
import {ExchangeType, Subscription, SubscriptionImpl, SubscriptionOptions} from "../subscription";


export class ExchangeQueueSubscriptionBuilder extends QueueSubscriptionBuilder {

    constructor(queueName: string,
                queueOptions: Options.AssertQueue,
                deleteQueueOptions: Options.DeleteQueue,
                private _exchangeSubscriptionBuilder: ExchangeSubscriptionBuilder) {
        super(queueName, queueOptions, deleteQueueOptions);

    }

    queueOptions(): Options.AssertQueue {
        return this._queueOptions;
    }

    deleteQueueOptions(): Options.DeleteQueue {
        return this._deleteQueueOptions;
    }

    consumerOptions(): ConsumerOptionsBuilder {
        return this._consumerOptions;
    }

    exchangeOptions(): ExchangeSubscriptionBuilder {
        return this._exchangeSubscriptionBuilder;
    }

    /**
     * @inheritDoc
     */
    build(): Subscription {
        return this._exchangeSubscriptionBuilder.build();
    }
}

export class ExchangeSubscriptionBuilder {

    private readonly _queue: ExchangeQueueSubscriptionBuilder;

    constructor(queue: string,
                private _exchangeOptions: Options.AssertExchange,
                private _deleteExchangeOptions: Options.DeleteExchange,
                private _exchangeSubscriptionOptions: SubscriptionOptions) {
        this._queue = new ExchangeQueueSubscriptionBuilder(queue, {}, {}, this);
    }

    /**
     * if true, the exchange will survive broker restarts. Defaults to true.
     *
     * @param durable
     */
    isDurable(durable: boolean): this {
        this._exchangeOptions.durable = durable;
        return this;
    }

    /**
     * if true, messages cannot be published directly to the exchange
     * (i.e., it can only be the target of bindings, or possibly create
     * messages ex-nihilo). Defaults to false
     *
     * @param internal
     */
    isInternal(internal: boolean) {
        this._exchangeOptions.internal = internal;
        return this;
    }

    /**
     * if true, the exchange will be destroyed once the number of bindings
     * for which it is the source drop to zero. Defaults to false.
     *
     * @param autoDelete
     */
    isAutoDelete(autoDelete: boolean): this {
        this._exchangeOptions.autoDelete = autoDelete;
        return this;
    }

    /**
     * An exchange to send messages to if this exchange can’t route them to any queues.
     *
     * @param exchange
     */
    withAlternateExchange(exchange: string): this {
        this._exchangeOptions.alternateExchange = exchange;
        return this;
    }


    queueOptions(): ExchangeQueueSubscriptionBuilder {
        return this._queue;
    }

    /**
     * New subscription
     */
    build(): Subscription {
        return new SubscriptionImpl(
            this._exchangeSubscriptionOptions,
            this._queue.queueOptions(),
            this._queue.deleteQueueOptions(),
            this._queue.consumerOptions().consumeOptions,
            this._exchangeOptions,
            this._deleteExchangeOptions
        );
    }

    /**
     * Register this _queue to receive messages from a given exchange when some pattern is matched
     * @param exchange
     * @param pattern
     * @param queue
     */
    static newBuilder(exchange: string, pattern: string, queue: string) {
        return new ExchangeSubscriptionBuilder(
            queue,
            {},
            {},
            {
                exchange,
                queue,
                pattern,
                createExchange: false
            }
        );
    }

    /**
     * Create exchange and register this _queue to receive messages from created exchange when some pattern is matched
     *
     * @param type
     * @param exchange
     * @param pattern
     * @param queue
     */
    static createExchange(type: ExchangeType, exchange: string, pattern: string, queue: string) {
        return new ExchangeSubscriptionBuilder(
            queue,
            {},
            {},
            {
                exchange,
                queue,
                pattern,
                createExchange: true,
                exchangeType: type
            }
        );
    }
}

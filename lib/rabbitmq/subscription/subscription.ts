import {Options} from "amqplib/properties";
import {EventEmitter} from "events";
import amqplib from "amqplib";

export enum ExchangeType {
    Direct = 'direct',
    Topic = 'topic',
    Headers = 'headers',
    Fanout = 'fanout',
    match = 'match'
}

export interface SubscriptionOptions {
    queue: string,
    exchange?: string,
    pattern?: string
    createExchange?: boolean,
    exchangeType?: ExchangeType
}

export interface SubscriptionEvent {

    message(message: amqplib.Message): void;

    error(error?: Error): void;

    subscribed(): void;

    subscriptionError(error?: Error | any): void;

}

export interface Subscription {
    on<U extends keyof SubscriptionEvent>(event: U, listener: SubscriptionEvent[U]): this;

    once<U extends keyof SubscriptionEvent>(event: U, listener: SubscriptionEvent[U]): this;

    off<U extends keyof SubscriptionEvent>(event: U, listener: SubscriptionEvent[U]): this;

    emit<U extends keyof SubscriptionEvent>(
        event: U,
        ...args: Parameters<SubscriptionEvent[U]>
    ): boolean;
}

export class SubscriptionImpl extends EventEmitter implements Subscription {

    constructor(private readonly _options: SubscriptionOptions,
                private readonly _queueOptions: Options.AssertQueue = {},
                private readonly _deleteQueueOptions: Options.DeleteQueue = {},
                private readonly _consumeOptions: Options.Consume = {},
                private readonly _exchangeOptions: Options.AssertExchange = {},
                private readonly _deleteExchangeOptions: Options.DeleteExchange = {}) {
        super();
    }

    get queue(): string {
        return this._options.queue;
    }

    get isOnlyQueueSubscription(): boolean {
        return this._options.exchange === undefined;
    }

    get exchange(): string | undefined {
        return this._options.exchange;
    }

    get pattern(): string | undefined {
        return this._options.pattern;
    }

    get queueOptions(): Options.AssertQueue {
        return this._queueOptions;
    }

    get exchangeOptions(): Options.AssertExchange {
        return this._exchangeOptions;
    }

    get consumerOptions(): Options.Consume {
        return this._consumeOptions;
    }

    get deleteQueueOptions(): Options.DeleteQueue {
        return this._deleteQueueOptions;
    }

    get deleteExchangeOptions(): Options.DeleteExchange {
        return this._deleteExchangeOptions;
    }

    get isToCreateExchange(): boolean {
        return this._options.createExchange || false;
    }

    get exchangeType(): ExchangeType | undefined {
        return this._options.exchangeType;
    }

    toString(): string {
        return JSON.stringify(this);
    }
}

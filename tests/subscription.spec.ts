import {ExchangeSubscriptionBuilder, ExchangeType, QueueSubscriptionBuilder, SubscriptionImpl} from "../lib";


describe('testing subscriptions', () => {


    test('testing subscription to queue', () => {

        const subscription = QueueSubscriptionBuilder
            .newBuilder('receive_pt_logs')
            .isAutoDelete(true)
            .isDurable(false)
            .isExclusive(false)
            .build() as SubscriptionImpl;

        expect(subscription.queue).toBe('receive_pt_logs');
        expect(subscription.queueOptions.autoDelete).toBe(true);
        expect(subscription.queueOptions.durable).toBe(false);
        expect(subscription.queueOptions.exclusive).toBe(false);
        expect(subscription.queueOptions.expires).toBe(undefined);
    });


    test('testing subscription to exchange', () => {

        const subscription = ExchangeSubscriptionBuilder
            .createExchange(ExchangeType.Topic, "logs", "pt", "pluto")
            .isAutoDelete(true)
            .isDurable(false)
            .queueOptions()
            .isDurable(true)
            .exchangeOptions()
            .queueOptions()
            .consumerOptions()
            .isExclusive(true)
            .build() as SubscriptionImpl;

        expect(subscription.exchange).toBe('logs');
        expect(subscription.pattern).toBe('pt');

        expect(subscription.queueOptions.durable).toBe(true);

        expect(subscription.consumerOptions.exclusive).toBe(true);

        expect(subscription.isToCreateExchange).toBe(true);
        expect(subscription.exchangeType).toBe(ExchangeType.Topic);

    });


});

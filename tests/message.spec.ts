import {Message} from "../lib";

describe('testing rabbitmq messages', () => {
    test('test message to queue', () => {

        const message = Message.toQueue('test', Buffer.from('message'))
            .withAppId('tests')
            .withContentEncoding('identity')
            .withHeader('date', 'today')
            .withTimestamp()
            .makeMessagePersistence()
            .makeMessageMandatory(() => {
                return true;
            });


        expect(message.hasReturnCallback).toBe(true);
        expect(message.queue).toBe('test');
        expect(message.content.toString('utf8')).toBe('message');
        expect(message.isToQueue).toBe(true);

    });

    test('test message to exchange', () => {

        const message = Message.toExchange('logs', 'pt', Buffer.from('message'))
            .withAppId('tests')
            .withContentEncoding('identity')
            .withHeader('date', 'today')
            .withTimestamp()
            .makeMessagePersistence()
            .makeMessageMandatory(() => {
                return true;
            });


        expect(message.hasReturnCallback).toBe(true);
        expect(message.queue).toBe('');
        expect(message.content.toString('utf8')).toBe('message');
        expect(message.isToQueue).toBe(false);
        expect(message.exchange).toBe('logs');
        expect(message.routingKey).toBe('pt');

    });
});

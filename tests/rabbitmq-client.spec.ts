import {ClientConfig, ExchangeSubscriptionBuilder, Message, QueueSubscriptionBuilder, RabbitMQ} from "../lib";

const CONNECTION_STR = 'amqp://mazikeen:NunoTiago12_34@aella/';

describe('testing client', () => {

    test('test to not existing server', async () => {

        const client = new RabbitMQ(new ClientConfig(
            'amqp://guest:guest@localhost:5672'
        ));

        const result = await client.connect();
        expect(result).toBe(false);
        expect(client['_state']).toBe(0);

        client.publish(Message.toQueue('pluto', Buffer.from('ttestt')));
        expect(client['_messagesBuffer'].size()).toBe(1);
        await client.subscribe(QueueSubscriptionBuilder.newBuilder('pluto').build());
        expect(client['_subscriptions'].size).toBe(1);

        await client.disconnect();

    });


    test('test server', async () => {

        const client = new RabbitMQ(new ClientConfig(
            CONNECTION_STR,
            true
        ));

        const result = await client.connect();
        expect(result).toBe(true);

        return new Promise((resolve, reject) => {
            try {
                const sent = client.publish(Message.toQueue('pluto', Buffer.from('test'))
                    .makeMessageMandatory((msg) => {
                        expect(msg.content.toString('utf8')).toBe('test');
                        client.disconnect().finally(() => {
                            resolve(true);
                        });
                        return false;
                    }));

                expect(sent).toBe(true);
            } catch (e) {
                reject(e);
            }
        });
    });


    test('test connect and disconnect', async () => {

        const client = new RabbitMQ(new ClientConfig(
            CONNECTION_STR
        ));

        let result = await client.connect();
        expect(result).toBe(true);
        result = await client.disconnect();
        expect(result).toBe(true);

        expect(client['_connection']).toBe(undefined);
        expect(client['_channel']).toBe(undefined);

        result = await client.connect();
        expect(result).toBe(true);
        const sent = client.publish(Message.toExchange('logs', 'pt', Buffer.from('test')));
        expect(sent).toBe(true);
        result = await client.disconnect();
        expect(result).toBe(true);

        expect(client['_connection']).toBe(undefined);
        expect(client['_channel']).toBe(undefined);

    });


    test('test receive message', async () => {

        const client = new RabbitMQ(new ClientConfig(
            CONNECTION_STR
        ));

        let result = await client.connect();
        expect(result).toBe(true);


        const subscription = QueueSubscriptionBuilder.newBuilder("logs").isAutoDelete(true).build();

        return new Promise(async (resolve, reject) => {
            let e = false;
            let e1 = false;

            subscription.on("subscribed", () => {
                e = true;
            });

            await client.subscribe(subscription);


            subscription.on("message", (msg) => {
                e1 = msg.content.toString('utf8') === 'message';

                if (e1 && e) {
                    resolve(true);
                } else {
                    reject(new Error(""));
                }
            });

            const sent = client.publish(Message.toQueue('logs', Buffer.from('message')));
            expect(sent).toBe(true);
        }).finally(() => {
            return client.disconnect();
        });

    });


    test('test send to not existing exchange', async () => {

        const client = new RabbitMQ(new ClientConfig(
            CONNECTION_STR
        ));

        const result = await client.connect();
        expect(result).toBe(true);

        return new Promise(async (resolve, reject) => {
            try {
                const sent = client.publish(Message.toExchange('logs', 'pt', Buffer.from('test')));
                expect(sent).toBe(true);
                await client.subscribe(ExchangeSubscriptionBuilder.newBuilder('logs', 'pt', 'ha').build());
                let notSent = client.publish(Message.toQueue('logs', Buffer.from('test')));
                expect(notSent).toBe(false);
            } catch (e) {
                reject(e);
            } finally {
                client.disconnect()
                    .then(() => {
                        resolve(true);
                    }).catch((e) => {
                    reject(e);
                })
            }
        });
    });


    test('test re-connection', async () => {
        const client = new RabbitMQ(new ClientConfig(
            CONNECTION_STR
        ));

        await client.connect();

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(true);
            }, 1000 * 60 * 60 * 4)
        });
    }, 1000 * 60 * 60 * 5);

});

[![NPM version][npm-image]][npm-url]

RabbitMQ client using [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_unbindQueue)

## Features

* Well-defined API
* Implemented Bus interface for RabbitMQ
* Automatic re-connection
* Message buffering between link failures
* Subscriptions are preserved between re-connections
* Injectable logger, let you use log4js for example
* Easy and intuitive to use

## Install

```bash
npm install talos-bus
```

## Example

```typescript
const client = new RabbitMQ(new ClientConfig(
    'amqp://guest:guest@localhost:5672'
));

const isConnected: boolean = await client.connect();

const subscription: Subscription = QueueSubscriptionBuilder.newBuilder("logs").isAutoDelete(true).build();

await client.subscribe(subscription);
subscription.on("message", console.log);
const sent: boolean = client.publish(Message.toQueue('logs', Buffer.from('message')));

```

[npm-url]: https://www.npmjs.com/package/talos-bus
[npm-image]: https://img.shields.io/npm/v/talos-bus.svg

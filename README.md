
This is a wrapper for [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_unbindQueue) used by [Talos edge platform](https://talos.sh)

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


## Usage

### Async Version

```js
const tbus = require('talos-bus');

async function fn() {
  
    /**
    * 
    * @type {Bus}
    */
    const bus = new tbus.RabbitMQBus('amqp://guest:guest@localhost:5672', {timeout:60000}, console);
    
    try {
        await bus.connect();   
        
        //subscribe to test
        bus.subscribe(tbus.RabbitMQMessageHandler.forQueue('test')
                          .makeQueueExclusive()
                          .withMessageHandler(console.log)
        );
        
        //send message
        bus.publish(tbus.RabbitMQMessage.toQueue('test', 'test').withContentType('text/plain').makeMessagePersistence());
        
        // More options are available either on RabbitMQMessage and on RabbitMQMessageHandler, this a a simple example
        
    } catch (e) {
       console.error('Error', e);
       
    }
}
```

### Sequential declaration

```js
const tbus = require('talos-bus');

const bus = new tbus.RabbitMQBus('amqp://guest:guest@localhost:5672', {timeout:60000}, console);

// 3 - This will run after since is a promise
// on connection the subscription will be restored and then, the message is publish
bus.connect().finally(); 

// 1 - Queue message in memory
bus.publish(tbus.RabbitMQMessage.toQueue('test', JSON.stringify({o: 1}))
    .jsonMediaType()
    .makeMessagePersistence());


const c = tbus.RabbitMQMessageHandler.forQueue('test')
    .makeQueueAutoDelete()
    .makeQueueExclusive()
    .withMessageHandler((msg) => {
        console.log(msg.content.toString());
        bus.unsubscribe(c);
    });

// 2 - Preserve subscription
bus.subscribe(c);

```
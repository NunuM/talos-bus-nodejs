
This is a wrapper for [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_unbindQueue) for [Talos edge platform](https://talos.sh)

## Features
* Well-defined API
* Implemented Bus interface for RabbitMQ
* Automatic re-connection
* Message buffering between link failures
* Subscriptions are preserved between re-connections
* Injectable logger, let you use log4js for example
* Easy to use

## Install

```bash
npm install talos-bus
```


## Usage

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
        
    } catch (e) {
       console.error('Error', e);
       
    }
}


```
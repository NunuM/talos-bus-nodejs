/**
 * @interface
 */
class Bus {

    /**
     * Registers subscription
     *
     * @abstract
     * @param {RabbitMQMessageHandler} handler
     */
    subscribe(handler) {
        throw new Error('must be implemented in subclass');
    }


    /**
     * Removes subscription
     *
     * @param {RabbitMQMessageHandler} handler
     * @throws {Error} If passed handler does not exists
     */
    unsubscribe(handler) {
        throw new Error('must be implemented in subclass');
    }


    /**
     * Send a message
     *
     * @abstract
     * @param {RabbitMQMessage} message
     */
    publish(message) {
        throw new Error('must be implemented in subclass');
    }


    /**
     * Make connection with the server
     *
     * @abstract
     * @return {Promise<boolean>}
     * @throws {Error} if connection is not possible
     */
    async connect() {
        throw new Error('must be implemented in subclass');
    }


    /**
     * @abstract
     * @return {Promise<boolean>}
     */
    async disconnect() {
        throw new Error('must be implemented in subclass');
    }

}


module.exports = {Bus};
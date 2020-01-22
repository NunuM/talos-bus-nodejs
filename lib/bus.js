/**
 * @interface
 */
class Bus {

    /**
     * Listens an message
     *
     * @abstract
     * @param {RabbitMQMessageHandler} handler
     */
    subscribe(handler) {
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
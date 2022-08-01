/**
 * @interface
 */
import {Message} from "./rabbitmq/message/message";
import {Subscription} from "./rabbitmq/subscription/subscription";

export interface Bus {

    /**
     * Registers subscription
     *
     * @param {Subscription} subscription
     */
    subscribe(subscription: Subscription): Promise<boolean>;


    /**
     * Removes subscription
     *
     * @param {Subscription} subscription
     * @throws {Error} If passed subscription not exists
     */
    unsubscribe(subscription: Subscription): Promise<boolean>;


    /**
     * Send a message
     *
     * @abstract
     * @param {Message} message
     */
    publish(message: Message): boolean;


    /**
     * Make connection with the server
     *
     * @abstract
     * @return {Promise<boolean>}
     * @throws {Error} if connection is not possible
     */
    connect(): Promise<boolean>;


    /**
     * @abstract
     * @return {Promise<boolean>}
     */
    disconnect(): Promise<boolean>;
}

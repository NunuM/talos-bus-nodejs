/**
 * Override circular buffer
 */
export class CircularBuffer<T> implements Iterable<T> {

    private _buffer: T[] = [];
    private _readIndex: number = 0;
    private _writeIndex: number = 0;
    private _size: number = 0;

    constructor(private _capacity: number) {
    }


    write(item: T) {

        if (this.isFull()) {
            if ((this._writeIndex % this._capacity) === this._readIndex) {
                this._readIndex = (this._readIndex + 1) % this._capacity;
            }
        }

        if (this._writeIndex >= this._capacity) {
            this._writeIndex = 0;
        }

        this._buffer[this._writeIndex] = item;
        this._writeIndex += 1;

        if (this._size < this._capacity)
            this._size += 1;

    }

    read(): T | undefined {

        if (this.size() == 0) {
            return;
        }

        if (this._readIndex >= this._capacity) {
            this._readIndex = 0;
        }

        const element = this._buffer[this._readIndex];
        this._readIndex = this._readIndex + 1;
        this._size -= 1;

        return element;
    }

    isFull(): boolean {
        return this.size() === this._capacity;
    }

    size(): number {
        return this._size;
    }

    [Symbol.iterator](): Iterator<T> {
        return new CircularBufferIterator(this);
    }
}

class CircularBufferIterator<T> implements Iterator<T> {


    constructor(private readonly _buffer: CircularBuffer<T>) {
    }

    next(): IteratorResult<T> {

        const item: T | undefined = this._buffer.read();

        if (item) {
            return {
                done: false,
                value: item,
            }
        } else {
            return {
                done: true,
                value: undefined
            }
        }
    }
}

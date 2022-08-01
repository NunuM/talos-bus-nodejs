import {CircularBuffer} from "../lib/utils/circular-buffer";

describe('testing circular buffer', () => {

    test('test empty buffer', () => {
        const buffer: CircularBuffer<number> = new CircularBuffer<number>(2);
        expect(buffer.read()).toBe(undefined);
    });

    test('test one element buffer', () => {
        const buffer: CircularBuffer<number> = new CircularBuffer<number>(2);
        buffer.write(1);
        expect(buffer.size()).toBe(1);

        expect(buffer.read()).toBe(1);
        expect(buffer.size()).toBe(0);
        expect(buffer.isFull()).toBe(false);
        expect(buffer.read()).toBe(undefined);
    });

    test('test full capacity buffer', () => {
        const buffer: CircularBuffer<number> = new CircularBuffer<number>(2);
        buffer.write(1);
        buffer.write(2);
        expect(buffer.isFull()).toBe(true);

        expect(buffer.read()).toBe(1);
        expect(buffer.read()).toBe(2);
        expect(buffer.read()).toBe(undefined);
        expect(buffer.read()).toBe(undefined);
    });


    test('test behind capacity buffer', () => {
        const buffer: CircularBuffer<number> = new CircularBuffer<number>(2);
        buffer.write(1);
        expect(buffer.size()).toBe(1);
        buffer.write(2);
        expect(buffer.size()).toBe(2);

        buffer.write(3);
        expect(buffer.size()).toBe(2);
        buffer.write(4);

        expect(buffer.size()).toBe(2);
        buffer.write(5);

        expect(buffer.read()).toBe(4);
        expect(buffer.size()).toBe(1);
        expect(buffer.read()).toBe(5);
        expect(buffer.size()).toBe(0);
        expect(buffer.read()).toBe(undefined);
        expect(buffer.read()).toBe(undefined);
    });



    test('test rotation on buffer', () => {
        const buffer: CircularBuffer<number> = new CircularBuffer<number>(2);

        buffer.write(3);
        buffer.write(4);

        expect(buffer.size()).toBe(2);
        expect(buffer.isFull()).toBe(true);

        expect(buffer.read()).toBe(3);
        expect(buffer.read()).toBe(4);
        expect(buffer['_readIndex']).toBe(2);
        expect(buffer['_writeIndex']).toBe(2);
        expect(buffer.size()).toBe(0);
        expect(buffer.read()).toBe(undefined);

        buffer.write(1);
        expect(buffer['_readIndex']).toBe(2);
        expect(buffer['_writeIndex']).toBe(1);

        expect(buffer.read()).toBe(1);
        expect(buffer['_readIndex']).toBe(1);
        expect(buffer['_writeIndex']).toBe(1);

        buffer.write(2);
        expect(buffer['_readIndex']).toBe(1);
        expect(buffer['_writeIndex']).toBe(2);

        buffer.write(4);
        expect(buffer['_readIndex']).toBe(1);
        expect(buffer['_writeIndex']).toBe(1);

        expect(buffer.read()).toBe(2);
        expect(buffer['_readIndex']).toBe(2);
        expect(buffer['_writeIndex']).toBe(1);

        expect(buffer.read()).toBe(4);
        expect(buffer.read()).toBe(undefined);
    });

    test('test iterator', () => {
        const buffer: CircularBuffer<number> = new CircularBuffer<number>(5);
        buffer.write(1);
        buffer.write(2);
        buffer.write(3);
        buffer.write(4);
        buffer.write(5);

        expect(buffer.size()).toBe(5);

        let idx = 1;
        // @ts-ignore
        for (const item of buffer) {
            expect(item).toBe(idx);
            idx++;
        }
    });

    test('test read index maintains the same', () => {
        const buffer: CircularBuffer<number> = new CircularBuffer<number>(4);
        buffer.write(1);
        buffer.write(2);
        expect(buffer.read()).toBe(1);
        expect(buffer.read()).toBe(2);
        expect(buffer.read()).toBe(undefined);
        expect(buffer['_readIndex']).toBe(2);
        expect(buffer.read()).toBe(undefined);
        expect(buffer['_readIndex']).toBe(2);
    });

    test('test shift read index', () => {
        const buffer: CircularBuffer<number> = new CircularBuffer<number>(2);
        buffer.write(5);
        buffer.write(6);
        buffer.write(7);
        expect(buffer.read()).toBe(6);
        expect(buffer.read()).toBe(7);
    });
});

'use strict';

const assert = require('node:assert');
const { it, describe } = require('node:test');
const { Stack, Queue } = require('../.');

const PARTITIONS = 4;
const SAMPLES = ['I', 'Hope', 'this', 'works', 'as', 'expected', ' ', '!'];
const PARTITION_LEN = SAMPLES.length / PARTITIONS;
const QUEUE_NAME = 'TEST_QUEUE';
const QUEUE_TIMEOUT = 200;

describe('utils/structs', () => {
  it('Stack', () => {
    const stack = new Stack();
    assert(stack.length === 0);
    assert(stack.peek() === undefined);
    assert(stack.pop() === undefined);
    stack.push(SAMPLES[0]);
    assert(stack.length === 1);
    assert(stack.peek() === SAMPLES[0]);
    assert(stack.pop() === SAMPLES[0]);
    for (var i = 1; i < SAMPLES.length; i++) stack.push(SAMPLES[i]);
    assert(stack.length === SAMPLES.length - 1);
    assert(stack.peek() === SAMPLES.at(-1));
    assert(stack.pop() === SAMPLES.at(-1));
    assert(stack.peek() === SAMPLES.at(-2));
    stack.clear();
    assert(stack.length === 0);
  });

  it('Static Queue', async () => {
    const { promise, resolve, reject } = Promise.withResolvers();
    var nextCounter, drainCounter, timeoutCounter;
    nextCounter = drainCounter = timeoutCounter = 0;
    const result = [];
    // eslint-disable-next-line consistent-return
    const queue = new Queue(QUEUE_NAME, QUEUE_TIMEOUT, (item, done) => {
      assert(item === SAMPLES.at(0 - nextCounter));
      assert(queue.length === SAMPLES.length - nextCounter + 1);
      result.push(item);
      if (nextCounter === 1) process.nextTick(done);
      if (nextCounter === 2) queueMicrotask(done);
      if (nextCounter === 3) return Promise.resolve();
      if (nextCounter === 4) setTimeout(done, 300);
      if (nextCounter === 5) setImmediate(done);
      if (nextCounter === 6) setTimeout(done, 0);
      // No done called for 7 & 8, awaiting timeout
    });

    queue.on('next', () => ++nextCounter);
    queue.on('timeout', () => ++timeoutCounter);
    queue.on('drain', () => {
      const reversed = SAMPLES.reverse();
      if (++drainCounter > 1) throw new Error('Drain event received more than once');
      for (var i = 0; i < SAMPLES.length; i++) {
        if (result[i] === reversed[i]) continue;
        reject(`Invalid result order ${result[i]} != ${reversed[i]} at ${i}`);
      }
      resolve();
    });

    assert(queue.length === 0);
    assert(queue.timeout === QUEUE_TIMEOUT);
    assert(queue.name === QUEUE_NAME);

    for (var sample of SAMPLES) queue.unshift(sample);
    assert(queue.length === SAMPLES.length);
    assert(queue.isPaused === true);
    assert(queue.isIdle === false);
    assert(nextCounter + drainCounter + timeoutCounter === 0);
    queue.resume();

    return promise.then(() => {
      assert(nextCounter === SAMPLES.length);
      assert(queue.length === 0);
      assert(queue.isIdle === true);
      assert(queue.isPaused === false);
      assert(timeoutCounter === 3);
    });
  });

  it('Dynamic Queue', async () => {
    const { promise, resolve, reject } = Promise.withResolvers();
    var nextCounter, drainCounter, timeoutCounter;
    nextCounter = drainCounter = timeoutCounter = 0;
    const result = [];
    // eslint-disable-next-line consistent-return
    const queue = new Queue(QUEUE_NAME, QUEUE_TIMEOUT, (item, done) => {
      assert(item === SAMPLES[nextCounter - 1]);
      result.push(item);
      if (nextCounter === 1) process.nextTick(done);
      if (nextCounter === 2) queueMicrotask(done);
      if (nextCounter === 3) return Promise.resolve();
      if (nextCounter === 4) setTimeout(done, 300);
      if (nextCounter === 5) setImmediate(done);
      if (nextCounter === 6) setTimeout(done, 0);
    });

    queue.on('next', () => ++nextCounter);
    queue.on('timeout', () => ++timeoutCounter);
    queue.on('drain', () => {
      if (++drainCounter > PARTITIONS) throw new Error('Drain event received more than expected');
      for (var i = PARTITION_LEN * drainCounter; i < SAMPLES.length; i++) {
        if (i > PARTITION_LEN * (drainCounter + 1) - 1) break;
        queue.push(SAMPLES[i]);
      }

      if (drainCounter < PARTITIONS) {
        assert(queue.length === PARTITION_LEN);
        return;
      }

      for (var i = 0; i < SAMPLES.length; i++) {
        if (result[i] === SAMPLES[i]) continue;
        reject(`Invalid result order ${result[i]} != ${SAMPLES[i]} at ${i}`);
      }
      resolve();
    });

    assert(queue.length === 0);
    assert(queue.timeout === QUEUE_TIMEOUT);
    assert(queue.name === QUEUE_NAME);

    for (var i = 0; i < SAMPLES.length; i++) {
      if (i === PARTITION_LEN) break;
      queue.push(SAMPLES[i]);
    }

    assert(queue.length === PARTITION_LEN);
    assert(queue.isPaused === true);
    assert(queue.isIdle === false);
    assert(nextCounter + drainCounter + timeoutCounter === 0);
    queue.resume();

    return promise.then(() => {
      assert(nextCounter === SAMPLES.length);
      assert(queue.length === 0);
      assert(queue.isIdle === true);
      assert(queue.isPaused === false);
      assert(timeoutCounter === 3);
    });
  });

  it('Queue without done callback', async () => {
    const { promise, resolve, reject } = Promise.withResolvers();
    var nextCounter, drainCounter, timeoutCounter;
    nextCounter = drainCounter = timeoutCounter = 0;
    const result = [];
    // eslint-disable-next-line consistent-return
    const queue = new Queue(QUEUE_NAME, QUEUE_TIMEOUT, item => {
      assert(item === SAMPLES[nextCounter - 1]);
      result.push(item);
      if (nextCounter < SAMPLES.length / 2) {
        return Promise.resolve();
      }
    });

    queue.on('next', () => ++nextCounter);
    queue.on('timeout', () => ++timeoutCounter);
    queue.on('drain', () => {
      if (++drainCounter > 1) throw new Error('Drain event received more than once');
      for (var i = 0; i < SAMPLES.length; i++) {
        if (result[i] === SAMPLES[i]) continue;
        reject(`Invalid result order ${result[i]} != ${SAMPLES[i]} at ${i}`);
      }
      resolve();
    });

    assert(queue.length === 0);
    assert(queue.timeout === QUEUE_TIMEOUT);
    assert(queue.name === QUEUE_NAME);

    for (var sample of SAMPLES) queue.push(sample);
    assert(queue.length === SAMPLES.length);
    assert(queue.isPaused === true);
    assert(queue.isIdle === false);
    assert(nextCounter + drainCounter + timeoutCounter === 0);
    queue.resume();

    return promise.then(() => {
      assert(nextCounter === SAMPLES.length);
      assert(queue.length === 0);
      assert(queue.isIdle === true);
      assert(queue.isPaused === false);
      assert(timeoutCounter === 0);
    });
  });
});

'use strict';

const { HELM_ERR_QUEUE_TIMEOUT, ERR_INVALID_ARG_TYPE } = require('../errors');
const { events: EE } = require('../polyfills');

/**
 * @description LinkedList based worker queue, for sequential tasks processing
 * @event drain - Emitted when the queue is empty & no worker is running
 * @event next - Emitted when worker starts to process new task (pause accessible)
 * @event timeout - Emitted when worker process exceeds the timeout
 * @warning Pause doesn't stop current task from processing.
 */
class Queue extends EE {
  #isPaused = true;
  #isAwaiting = false;
  #head = null;
  #tail = null;
  #length = 0;
  #timer;

  get length() {
    return this.#length;
  }

  get isIdle() {
    return !this.#isAwaiting && this.#length === 0;
  }

  get isPaused() {
    return this.#isPaused;
  }

  constructor(name = 'PLUGIN_QUEUE', timeout = 0, worker) {
    if (typeof name === 'number') [worker, timeout, name] = [timeout, name, 'NAMELESS_QUEUE'];
    if (typeof name === 'function') [worker, timeout, name] = [name, 0, 'NAMELESS_QUEUE'];
    if (typeof timeout === 'function') [worker, timeout] = [timeout, 0];
    if (typeof worker !== 'function') throw new ERR_INVALID_ARG_TYPE('worker', typeof worker);

    super();
    this.name = name;
    this.worker = worker;
    this.timeout = Number(timeout) || 0;
  }

  push(task) {
    this.#length++;
    if (!this.#isAwaiting && !this.#isPaused) return void this.#process(task, true);
    if (!this.#tail) this.#head = this.#tail = { task, next: null };
    else this.#tail = this.#tail.next = { task, next: null };
  }

  unshift(task) {
    this.#length++;
    if (!this.#isAwaiting && !this.#isPaused) return void this.#process(task, true);
    if (!this.#head) this.#head = this.#tail = { task, next: null };
    else this.#head = { task, next: this.#head };
  }

  pause() {
    this.#isPaused = true;
  }

  resume() {
    this.#isPaused = false;
    this.#process();
  }

  #process(task = this.#head?.task, isImmediate = false) {
    if (!task) return void this.emit('drain');

    this.emit('next');
    if (this.#isAwaiting || this.#isPaused) return;

    this.#isAwaiting = true;
    const progress = { done: false };
    const done = this.#done.bind(this, isImmediate, progress);
    const result = this.worker(task, done);
    if (progress.done /** Called by Worker, retrieve */) return;
    if (isPromise(result)) result.then(...doneWithNextTick(done));
    else if (this.worker.length < 2) return void done();
    if (this.timeout <= 0) return;
    this.#timer = setTimeout(() => {
      this.emit('timeout', new HELM_ERR_QUEUE_TIMEOUT(this.name));
      this.#timer = null;
      done();
    }, this.timeout);
  }

  #done(isImmediate, progress) {
    if (progress.done) return;
    if (this.#timer) clearTimeout(this.#timer);
    if (!isImmediate) {
      if (this.#head === this.#tail) this.#tail = null;
      this.#head = this.#head.next;
    }

    progress.done = !(this.#isAwaiting = false);
    --this.#length, this.#process();
  }
}

function isPromise(s) {
  return s !== null && typeof s === 'object' && typeof s.then === 'function';
}

function doneWithNextTick(done) {
  return [() => process.nextTick(done), e => process.nextTick(done, e)];
}

module.exports = { Queue, doneWithNextTick, isPromise };

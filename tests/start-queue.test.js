'use strict';

const { setTimeout: sleep } = require('node:timers/promises');
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { Helm } = require('..');

const mkApp = () => undefined;
const options = { timeout: 10 };
describe('Start Queue', () => {
  it('Contract', () => {
    const app = new Helm(mkApp(), options);
    assert(typeof app.beforeStart === 'function');
  });

  it('FIFO Order', async () => {
    const app = new Helm(mkApp(), options);
    const result = [];

    app.use(() => {
      result.push(0);
    });

    app.beforeStart((err, _app, next) => {
      assert(!err, 'Error should not be thrown');
      result.push(1);
      next();
    });

    app.beforeStart(err => {
      assert(!err, 'Error should not be thrown');
      result.push(2);
    });

    await app.start(() => {
      result.push(3);
    });

    assert.deepEqual(result, [0, 1, 2, 3]);
  });

  it('Error propagation', async () => {
    const app = new Helm(mkApp(), options);

    app.use(async () => {
      throw new Error('Some delayed error');
    });

    app.beforeStart((err, _app, next) => {
      assert(!!err, 'Error should be thrown');
      next(); // No propagation
    });

    app.beforeStart((err, _app, next) => {
      assert(!err, 'Error should not be thrown');
      next('Stubbed error'); // Propagation of another error
    });

    app.beforeStart(async err => {
      assert(err === 'Stubbed error', 'Error should be thrown');
      await sleep(1000); // Timeout error propagation
    });

    var started = false;
    await app.start(err => {
      started = true;
      assert(!!err, 'Error should be thrown');
      assert(err.name === 'HELM_ERR_QUEUE_TIMEOUT');
    });

    assert(started);
  });

  it('Timeout', async () => {
    const app = new Helm(undefined, { timeout: 10 });
    const result = [];

    // eslint-disable-next-line no-unused-vars
    app.beforeStart((_err, _app, _next) => result.push(1));

    app.beforeStart(err => {
      assert(err.name === 'HELM_ERR_QUEUE_TIMEOUT');
      assert(err.message.includes('START_QUEUE'));
      result.push(2);
    });

    app.beforeStart(err => {
      assert(!err, 'Error should not be thrown');
      result.push(3);
      // eslint-disable-next-line no-unused-vars
      return new Promise(_res => {});
    });

    app.beforeStart(err => {
      result.push(4);
      assert(err.name === 'HELM_ERR_QUEUE_TIMEOUT');
      assert(err.message.includes('START_QUEUE'));
    });

    await app.start(err => {
      if (err) assert(false, 'Error should not be thrown');
      result.push(5);
    });

    assert.deepEqual(result, [1, 2, 3, 4, 5]);
  });
});

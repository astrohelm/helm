'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { Helm } = require('..');

describe('Done plugin parameter', () => {
  it('No done', async () => {
    const app = new Helm();
    const steps = [];

    // eslint-disable-next-line no-unused-vars
    app.use((_app, _opts) => {
      steps.push(1);
    });

    app.beforeStart(err => {
      if (err) assert(false, 'Error should not be thrown');
      steps.push(2);
    });

    await app.start();
    assert.deepEqual(steps, [1, 2]);
  });

  it('Done for async function', async () => {
    const app = new Helm();

    // eslint-disable-next-line no-unused-vars
    app.use(async (_app, _opts, _done) => {});

    await app.start(err => {
      if (err) assert(false, 'Error should not be thrown');
    });
  });

  it('Twice done', async () => {
    const app = new Helm();
    const steps = [];

    app.use((_app, _opts, done) => {
      done();
      done(new Error('BOOM'));
      assert(true, 'No error should be thrown');
      steps.push(1);
    });

    app.beforeStart(err => {
      if (err) assert(false, 'Error should not be thrown');
      steps.push(2);
    });

    await app.start();
    assert.deepEqual(steps, [1, 2]);
  });
});

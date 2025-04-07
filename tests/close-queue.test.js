'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { setTimeout: sleep } = require('node:timers/promises');
const { Helm } = require('..');

const mkApp = () => undefined;
const options = { autostart: false, timeout: 1000 };
describe('Start queue', () => {
  it('Contract', () => {
    const app = new Helm(mkApp(), options);
    assert(typeof app.use === 'function');
    const promiseLike = app.use(async () => {});
    assert(typeof promiseLike.then === 'function');
    assert(typeof promiseLike.catch === 'function');
    var realPromise = promiseLike.then(() => {});
    assert(realPromise instanceof Promise);
    var realPromise = promiseLike.catch(() => {});
    assert(realPromise instanceof Promise);
  });
});

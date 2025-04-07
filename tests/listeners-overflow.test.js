'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { setTimeout: sleep } = require('node:timers/promises');
const { Helm } = require('..');

test('Listeners overflow', async () => {
  const app = new Helm();

  process.on('warning', () => {
    assert(false, 'Warning should not be emitted');
  });

  for (let i = 0; i < 12; ++i) {
    app.on('helm:start', () => {});
  }

  await sleep(500);
});

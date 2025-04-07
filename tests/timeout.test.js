'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { Helm } = require('..');

describe('Plugin queue timeout', () => {
  it('No next call', async () => {
    const app = new Helm(undefined, { timeout: 10 });
    // eslint-disable-next-line no-unused-vars
    app.use((_app, _opts, _next) => {});
    await app.start(err => {
      assert(err.name === 'HELM_ERR_PLUGIN_TIMEOUT');
      assert(err.message.includes('(_app, _opts, _next) => {}'));
    });
  });

  it('No promise resolve', async () => {
    const app = new Helm(undefined, { timeout: 10 });
    // eslint-disable-next-line no-unused-vars
    app.use((_app, _opts, _next) => new Promise(_res => {}));

    await app.start(err => {
      assert(err.name === 'HELM_ERR_PLUGIN_TIMEOUT'); // Propagated
      assert(err.message.includes('(_app, _opts, _next) => new Promise(_res => {})'));
    });
  });
});

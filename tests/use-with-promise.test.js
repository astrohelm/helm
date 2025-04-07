'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { setTimeout: sleep } = require('node:timers/promises');
const { Helm } = require('..');

const mkApp = () => undefined;
const options = { autostart: false, timeout: 1000 };

describe('Promise as plugin', () => {
  it('Correct order', async () => {
    const app = new Helm(mkApp(), options);
    const result = [];

    app.use(app => {
      result.push(1);
      app.use(
        (async () => {
          await sleep(100); // Winchester imitation
          return async app => {
            result.push(2);

            app.use(async () => {
              await sleep(100);
              result.push(3);
            });

            await app.use(() => {
              result.push(4);
            });

            result.push(5);
          };
        })(),
      );
    });

    app.use(() => {
      result.push(6);
    });

    await app.start(err => {
      assert(!err, 'Error should not be thrown');
      result.push(7);
    });

    assert.deepEqual(result, [1, 2, 3, 4, 5, 6, 7]);
  });

  it('Error propagation', async () => {
    const app = new Helm(mkApp(), options);
    const result = [];

    app.use(app => {
      result.push(1);
      app.use(
        (async () => {
          await sleep(100);
          return async app => {
            result.push(2);

            app.use(async () => {
              result.push(3);
              throw Error('Error in plugin');
            });

            try /* Make sure it actually throws */ {
              await app.use(() => {
                result.push('Should not happen (4)');
              });
            } catch (err) {
              result.push(4);
              assert(err.message.includes('Error in plugin'));
            }

            await app // Catch variant
              .use(() => void result.push('Should not happen (5)'))
              .catch(() => void result.push(5));

            app // Non-await variant
              .use(() => void result.push('Should not happen (6.1)'))
              .then(() => void result.push('Should not happen (6.2)'))
              .catch(() => void result.push(6));
          };
        })(),
      );
    });

    app.use(() => {
      result.push('Should not happen (6.3)');
    });

    await app.start(err => {
      assert(!!err, 'Error should be thrown');
      result.push(7);
    });

    assert.deepEqual(result, [1, 2, 3, 4, 5, 6, 7]);
  });
});

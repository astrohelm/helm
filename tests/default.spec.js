'use strict';

const { Helm } = require('../index');

const app = new Helm(undefined, { autostart: false });

(async () => {
  await app.use(first, { name: 'First' });
  console.log('After first and second');
  app.use(third, { name: 'Third' });
})().catch((...args) => {
  console.log('CATCH !', args);
});

app.start(err => {
  if (err) console.log('Start error ((((');
  console.log('All plugins loaded successfully');
});

app.beforeStart((err, _, done) => {
  console.log('Before starting');
  done(err);
});

function first(app, opts) {
  console.log(`${opts.name} !`);
  app.use(second, { name: 'Second' });
}

function second(_, opts, done) {
  console.log(`${opts.name} !`);
  process.nextTick(done, new Error(123));
}

// async/await or Promise support
async function third(_, opts) {
  console.log(`${opts.name} Started !`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log(`${opts.name} Finished !`);
}

# HELM | Backbone of your application

## About

Helm purpose to provide a simple application lifecycle without corresponding race conditions. To
achieve such behavior this library uses Graph-based queue system. This allows to process components
without any doubt of a right order.

## Example

```js
'use strict';

const app = new Helm();

app.use(first, { firstName: 'first' });
app.use(third);

app.start((err) /* Error during boot */ => {
  if (err /* Must be handled somehow */) {
    throw err;
  }

  console.log('Application booted!');
});

function first(app, opts) {
  console.log(`${opts.firstName} !`, opts);
  app.use(second, { secondName: 'Second' });
}

function second(app, opts, done) {
  console.log(`${opts.secondName} !`, opts);
  process.nextTick(cb);
}

// async/await or Promise support
async function third(app, opts) {
  console.log('Third !');
}
```

## API

### new Helm(app, opts, ?done)


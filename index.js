'use strict';

const { formatTree, isNonNullObject, mkPromise, isPromise, doneWithNextTick } = require('./lib/utils');
const { HELM_ERR_ALREADY_PLUGGED, HELM_ERR_MAPPING_OVERRIDE } = require('./lib/errors');
const { HELM_ERR_ALREADY_STARTED, HELM_ERR_ALREADY_CLOSED } = require('./lib/errors');
const { DEFAULT_MAPPINGS, HelmOptions } = require('./lib/options');
const { ERR_INVALID_ARG_TYPE } = require('./lib/errors');
const { kHelmIdentifier } = require('./lib/symbols');
const { events: EE } = require('./lib/polyfills');
const { Queue, Stack } = require('./lib/utils');
const { Plugin } = require('./lib/plugin');

exports.Helm = class Helm extends EE {
  #stack = new Stack();
  #plugins = new Map();
  #isStarted = false;
  #isClosed = false;
  #startPromise;
  #closePromise;
  #error = null; // Error to transfer between start/close callbacks
  #loadPlugins; // Done form Root plugin
  #closeQueue; // LIFO
  #startQueue; // FIFO
  #override;
  #root;
  #opts;
  #app;

  constructor(app, opts) {
    super();
    this.#opts = new HelmOptions(opts);
    this.#override = this.#opts.override;
    this.#app = app || this;
    this.setMaxListeners(0);
    this.#unite();

    const worker = (task, next) => void process.nextTick(task, next);
    this.#startQueue = new Queue('START_QUEUE', this.#opts.startQueueTimeout, worker);
    this.#closeQueue = new Queue('CLOSE_QUEUE', this.#opts.closeQueueTimeout, worker);
    this.#startQueue.on('timeout', (err = null) => void (this.#error = err)); // Passing to next
    this.#closeQueue.on('timeout', (err = null) => void (this.#error = err)); // Passing to next

    // Root callback will be called right within root.inject()
    this.#root = new Plugin(null, this.#opts, (_app, opts, done) => {
      this.#loadPlugins = done; // Done will start to process all children plugins
      if (opts.autostart /** Waiting any `beforeStart` & `start` to happen */) {
        process.nextTick(() => void (this.#startPromise ??= this.#start()));
      }
    });

    var app = this.#override(this.#app, this.#root, this.#opts);
    this.#stack.push(this.#root), this.#root.inject(app);
  }

  async #start(cb) /** Plugins -> Start queue -> Callback */ {
    this.emit('helm:start');
    process.nextTick(this.#loadPlugins); // Waiting any .use & .beforeStart to happen
    await EE.once(this.#root, 'finish'); // Waiting all plugins to finish
    this.emit('helm:plugged');
    this.#stack.pop();

    if (this.#root.error) this.#error = this.#root.error;
    if (!cb && this.#error && this.#startQueue.length === 0) throw this.#error;
    var promise = EE.once(this.#startQueue, 'drain');
    this.#startQueue.resume(), await promise;
    this.#isStarted = true; // Locking

    if (!cb) return this.emit('helm:started'), this.#app;
    var promise = EE.once(this.#startQueue, 'drain');
    this.#registerCallback(this.#startQueue, true, this.#app, cb);
    await promise, this.emit('helm:started');
    return this.#app;
  }

  async #close(cb) /** Current start cb | plugin ?-> Close Queue -> close */ {
    this.emit('helm:close');

    if (this.#startPromise /** If started */) {
      var queue = this.#root.queue;
      if (!queue.isIdle /** Waiting current plugin to finish */) {
        queue.pause();
        var nextPromise = EE.once(queue, 'next');
        var drainPromise = EE.once(queue, 'drain');
        await Promise.race([nextPromise, drainPromise]);
      }

      var queue = this.#startQueue;
      if (!queue.isPaused /** Waiting current start callback to finish */) {
        queue.pause();
        var nextPromise = EE.once(queue, 'next');
        var drainPromise = EE.once(queue, 'drain');
        await Promise.race([nextPromise, drainPromise]);
      }
    }

    var promise = EE.once(this.#closeQueue, 'drain');
    cb && this.#registerCallback(this.#closeQueue, true, this.#app, cb);
    this.#closeQueue.resume(), await promise;
    this.#isClosed = true; // Locking
    this.emit('helm:closed');
    return this.#app;
  }

  #use(plugin, opts) {
    const parent = this.#stack.peek();
    const child = parent.mkChild(plugin, opts);
    this.#plugins.set(child.name, child);
    return child.once('queued', () => void this.#onQueued(child, parent, opts));
  }

  #onQueued(child, parent, opts) {
    /* One of the previous plugins errored, no reason to go further as they may be connected */
    if (this.#error) return void process.nextTick(child.done.bind(child), this.#error);

    var fn = child.fn;
    if (isPromise(fn)) {
      fn.then(v => void this.#onQueued(((child.fn = v), child), parent, opts));
      return void fn.catch(err => void child.done((this.#error = err)));
    }

    if (isNonNullObject(fn) && typeof fn.default === 'function') {
      fn = child.fn = fn.default;
    }

    if (typeof fn !== 'function') {
      var type = Array.isArray(fn) ? 'array' : fn === 'null' ? 'null' : typeof fn;
      this.#error = new ERR_INVALID_ARG_TYPE('plugin', type);
      return void child.done(this.#error);
    }

    try {
      var app = this.#override(parent.app || this.#app, child, opts);
    } catch (overrideError) {
      return void child.done((this.#error = overrideError));
    }

    this.#stack.push(child), child.inject(app);
    child.once('finish', () => {
      if (child.error) this.#error = child.error;
      this.#stack.pop();
    });
  }

  #registerCallback(queue, isPush, app, cb) {
    var finished = false;
    const method = isPush ? queue.push : queue.unshift;
    method.call(queue, next => {
      if (finished) return;
      const done = err => {
        if (finished) return;
        this.#error = err ?? null;
        finished = true;
        next();
      };

      const error = this.#error;
      this.#error = null;
      const result = cb(error, app, done);
      if (isPromise(result)) result.then(...doneWithNextTick(done));
      else if (cb.length === 0) return void done(error);
      else if (cb.length < 3) return void next();
      // Timer is handled by Queue mechanism.
    });

    return app;
  }

  #hasPlugin(name) {
    return this.#plugins.has(name);
  }

  #getPlugin(name) {
    return this.#plugins.get(name);
  }

  #formatTree() {
    return formatTree(this.#root);
  }

  #unite() {
    const helm = this;
    const map = this.#opts.mappings;
    for (const DEFAULT_MAPPING of DEFAULT_MAPPINGS) {
      const mapping = map[DEFAULT_MAPPING] ?? DEFAULT_MAPPING;
      if (mapping in this.#app) throw new HELM_ERR_MAPPING_OVERRIDE(mapping, DEFAULT_MAPPING);
      map[DEFAULT_MAPPING] = mapping;
    }

    this.#app[kHelmIdentifier] = helm;
    this.#app[map.hasPlugin] = name => helm.#hasPlugin(name);
    this.#app[map.getPlugin] = name => helm.#getPlugin(name);
    this.#app[map.formatTree] = () => helm.#formatTree();

    this.#app[map.start] = function (cb) {
      if (cb && typeof cb !== 'function') throw new ERR_INVALID_ARG_TYPE('callback', typeof cb);
      if (cb && helm.#startPromise) throw new HELM_ERR_ALREADY_STARTED();
      return (helm.#startPromise ??= helm.#start(cb));
    };

    this.#app[map.close] = function (cb) {
      if (cb && typeof cb !== 'function') throw new ERR_INVALID_ARG_TYPE('callback', typeof cb);
      if (cb && helm.#closePromise) throw new HELM_ERR_ALREADY_CLOSED();
      return (helm.#closePromise ??= helm.#close(cb));
    };

    this.#app[map.beforeStart] = function (cb) {
      if (helm.#isStarted) throw new HELM_ERR_ALREADY_STARTED();
      if (typeof cb !== 'function') throw new ERR_INVALID_ARG_TYPE('callback', typeof cb);
      return helm.#registerCallback(helm.#startQueue, true, this, cb); // FIFO
    };

    this.#app[map.beforeClose] = function (cb) {
      if (helm.#isClosed) throw new HELM_ERR_ALREADY_CLOSED();
      if (typeof cb !== 'function') throw new ERR_INVALID_ARG_TYPE('callback', typeof cb);
      return helm.#registerCallback(helm.#closeQueue, false, this, cb); // LIFO
    };

    this.#app[map.use] = function (fn, opts = {}) {
      if (!isNonNullObject(opts)) throw new ERR_INVALID_ARG_TYPE('opts', typeof opts);
      if (helm.#stack.length === 0) throw new HELM_ERR_ALREADY_PLUGGED();
      if (isNonNullObject(fn) /** Bundled */) {
        if (typeof fn.default === 'function') fn = fn.default;
        if (typeof fn.default?.then === 'function') fn = fn.default;
      }

      if (!isPromise(fn) && typeof fn !== 'function') {
        const type = Array.isArray(fn) ? 'array' : fn === 'null' ? 'null' : typeof fn;
        throw new ERR_INVALID_ARG_TYPE('plugin', type);
      }

      var plugin = helm.#use(fn, opts);
      const thenHandler = (resolve, reject) => {
        const promise = plugin.promisify();
        return promise.then(() => resolve(this), reject);
      };

      const catchHandler = handler => thenHandler(c => c, handler);
      return mkPromise(this, thenHandler, catchHandler);
    };
  }
};

'use strict';

const { isPromise, doneWithNextTick, Queue } = require('./utils');
const { HELM_ERR_PLUGIN_TIMEOUT } = require('./errors');
const { kHelmPluginMeta } = require('./symbols');
const { events: EE } = require('./polyfills');

/**
 * Root -> mkChild (n) -> inject -> promisify? -> done -> awaitDependencies (children)
 */
module.exports.Plugin = class Plugin extends EE {
  elapsedTime = -1;
  finishedAt = -1;
  pluggedAt = -1;
  startedAt = -1;
  children = [];
  error = null;

  #resolvers = null;
  #timer = null;

  queue = new Queue((child, next) /** Helm calls inject on queued */ => {
    process.nextTick(() => void child.emit('queued'));
    child.once('finish', () => void next());
  });

  constructor(parent, opts, fn) {
    super();

    Object.assign(this, fn[kHelmPluginMeta]);
    this.name ??= getPluginName(fn, opts);
    this.timeout = parent?.timeout ?? opts.pluginQueueTimeout;
    this.id = `${this.name}-${Math.random()}`;
    this.parent = parent;
    this.opts = opts;
    this.fn = fn;

    /* This makes children timeout to trigger earlier than the parent timeout   */
    if (this.parent && this.parent.finishedAt === -1 && this.parent.timeout > 0) {
      const elapsed = Date.now() - this.parent.startedAt;
      this.timeout = this.parent.timeout - (elapsed + 3);
      if (this.timeout <= 0) this.timeout = 1;
    }
  }

  /**
   * @description Injects branch (started with this plugin) into app.
   * @warning Rest of the branch will be injected only when `done` is called. We use this to delay userland plugins.
   */
  inject(app) {
    if (typeof this.opts === 'function') this.opts = this.opts(app);
    this.startedAt = Date.now();
    this.app = app;
    this.emit('start');

    const done = this.done.bind(this);
    const result = this.fn(app, this.opts, done);
    if (this.pluggedAt + this.finishedAt !== -2) return;
    if (isPromise(result)) result.then(...doneWithNextTick(done));
    else if (this.fn.length < 3) return void done();
    if (this.timeout <= 0) return;
    this.#timer = setTimeout(() => {
      done(new HELM_ERR_PLUGIN_TIMEOUT(this.name));
      this.#timer = null;
    }, this.timeout);
  }

  mkChild(fn, opts) {
    const plugin = new Plugin(this, opts, fn);
    this.children.push(plugin), this.queue.push(plugin);
    return plugin;
  }

  /**
   * @description Called when registered with await keyword or with then method.
   */
  promisify() {
    if (this.#resolvers) return this.#resolvers.promise;
    if (this.finishedAt !== -1) {
      if (!this.error) return Promise.resolve(this);
      return Promise.reject(this.error);
    }

    this.#resolvers = Promise.withResolvers();
    if (this.parent?.queue.isPaused) this.parent.queue.resume();
    return this.#resolvers.promise;
  }

  /**
   * @description Called when plugin is injected into app. Witch means it wants to begin processing of children plugins.
   */
  done(err) {
    if (this.pluggedAt + this.finishedAt !== -2) return;
    if (this.#timer) clearTimeout(this.#timer);
    if (err /** Error during injection, retrieve */) {
      this.error = err;
      this.finishedAt = Date.now();
      this.elapsedTime = this.finishedAt - this.startedAt;
      this.#resolvers = (this.#resolvers?.reject(err), null);
      return void queueMicrotask(() => void this.emit('finish'));
    }

    this.pluggedAt = Date.now();
    this.elapsedTime = this.pluggedAt - this.startedAt;
    queueMicrotask(() => this.#awaitChildren());
    this.queue.resume(); // Loading dependencies
  }

  /**
   * @description Awaits all children plugins (Rest of the tree branch) to finish.
   */
  #awaitChildren() {
    const wrap = () => void queueMicrotask(() => this.#awaitChildren());
    if (!this.queue.isIdle) return void this.queue.once('drain', wrap);
    if (this.#resolvers) {
      this.#resolvers.promise.then(wrap, wrap);
      this.#resolvers = (this.#resolvers.resolve(this), null);
      return;
    }

    this.finishedAt = Date.now();
    this.elapsedTime = this.finishedAt - this.startedAt;
    this.emit('finish');
  }
};

function getPluginName(plugin, options) {
  if (plugin[kHelmPluginMeta]?.name) return plugin[kHelmPluginMeta].name;
  if (options.name) return options.name;
  if (plugin.name) return plugin.name;
  return plugin
    .toString()
    .split('\n')
    .slice(0, 2)
    .map(s => s.trim())
    .join(' -- ');
}

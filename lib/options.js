'use strict';

const { ERR_INVALID_ARG_TYPE } = require('./errors');
const { isNonNullObject } = require('./utils');

exports.HelmOptions = function HelmOptions(o = {}) {
  if (!isNonNullObject(o)) throw new ERR_INVALID_ARG_TYPE('opts', typeof o);
  const { override: mod, mappings: map, autostart } = o;
  const timeout = Number(o.timeout) || 0; // Default timeout for every Queue in Helm
  if (mod && typeof mod !== 'function') throw new ERR_INVALID_ARG_TYPE('opts.override', typeof mod);
  if (map && !isNonNullObject(map)) throw new ERR_INVALID_ARG_TYPE('opts.mappings', typeof map);
  this.startQueueTimeout = Number(o.startQueueTimeout) || timeout; // Mills to wait for a ready callback to call `done()`
  this.closeQueueTimeout = Number(o.closeQueueTimeout) || timeout; // Mills to wait for a close callback to call `done()`
  this.pluginQueueTimeout = Number(o.pluginQueueTimeout) || timeout; // Mills to wait for a plugin to call `done()`
  this.mappings = map ? Object.assign({}, map) : {}; // Helm <-> App mappings, injected with helm.#unite()
  this.autostart = autostart !== false; // Whether to automatically call `helm.#start()`
  this.override = mod || override; // Defines custom Helm.#override()
};

exports.DEFAULT_MAPPINGS = [
  'use',
  'start',
  'close',
  'beforeStart',
  'formatTree',
  'hasPlugin',
  'getPlugin',
];

function override(server) {
  return server;
}

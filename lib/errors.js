/* eslint-disable max-len */
'use strict';

const { util } = require('./polyfills');

module.exports = {
  // GLOBAL ERRORS
  ERR_INVALID_ARG_TYPE: mkError(
    'ERR_INVALID_ARG_TYPE',
    `The "%s" argument must be of type function. Received: %s`,
  ),

  // HELM ERRORS
  HELM_ERR_MAPPING_OVERRIDE: mkError(
    'HELM_ERR_MAPPING_OVERRIDE',
    `Mapping '%s' is already defined. Try to specify different mapping option for '%s'`,
  ),

  HELM_ERR_ALREADY_STARTED: mkError(
    'HELM_ERR_ALREADY_STARTED',
    'App has already been started. New start callbacks cannot be added at this point',
  ),

  HELM_ERR_ALREADY_PLUGGED: mkError(
    'HELM_ERR_ALREADY_PLUGGED',
    'Root plugin has already been finished. New plugins cannot be added at this point',
  ),

  HELM_ERR_ALREADY_CLOSED: mkError(
    'HELM_ERR_ALREADY_CLOSED',
    'App has already been closed. New close callbacks cannot be added at this point',
  ),

  HELM_ERR_PLUGIN_TIMEOUT: mkError(
    'HELM_ERR_PLUGIN_TIMEOUT',
    `Plugin did not start in time: '%s'. You may have forgotten to call 'done' function or to resolve a Promise`,
  ),

  HELM_ERR_QUEUE_TIMEOUT: mkError(
    'HELM_ERR_QUEUE_TIMEOUT',
    `Queue didn't finish task in time: '%s'. You may have forgotten to call 'done' function or to resolve a Promise`,
  ),
};

function mkError(name, message, code = 500, Base = Error) {
  if (!name) throw new Error('Nameless errors are not allowed');
  if (!message) throw new Error('Error must contain a message');
  name = name.toUpperCase();

  CustomError.prototype = Object.create(Base.prototype, {
    constructor: {
      value: CustomError,
      configurable: true,
      enumerable: false,
      writable: true,
    },
  });

  CustomError.prototype.toString = toString;
  CustomError.prototype[Symbol.toStringTag] = 'Error';
  return Object.defineProperty(CustomError, 'name', {
    value: name,
    configurable: true,
    enumerable: false,
    writable: false,
  });

  function CustomError(...args) {
    if (!new.target) return new CustomError(...args);
    this.cause = args.at(-1)?.cause;
    this.cause && args.pop();
    this.message = util.format(message, ...args);
    this.name = name;
    this.code = code;

    const { captureStackTrace, stackTraceLimit } = Error;
    if (captureStackTrace && stackTraceLimit !== 0) {
      captureStackTrace(this, CustomError); // Adds stack
    }
  }
}

function toString() {
  // eslint-disable-next-line no-invalid-this
  return `${this.name} [${this.code}]: ${this.message}`;
}

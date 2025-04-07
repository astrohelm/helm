'use strict';

module.exports = {
  formatTree,
  mkPromise,
  ...require('./queue'),
  Stack: require('./stack'),
  isNonNullObject: o => typeof o === 'object' && o !== null,
};

/**
 * @description Formats `Helm` plugin tree into pretty string.
 */
function formatTree({ name, elapsedTime, children, error }, prefix = '') {
  const status = error ? 'ERROR: ' + error : 'OK';
  var result = `${prefix}${name} ${elapsedTime}ms [${status}]\n`;

  for (var i = 0; i < children.length; ++i) {
    var isLast = i === children.length - 1;
    var subPrefix = prefix + (isLast ? '  ' : '│ ');
    var node = children[i];

    result += prefix + isLast ? '└─' : '├─';
    result += node.nodes.length === 0 ? '─ ' : '┬ ';
    result += formatTree(node, subPrefix).slice(prefix.length + 2);
  }

  return result;
}

function mkPromise(ctx, resolver, catcher) {
  return Object.create(ctx, {
    then: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: resolver,
    },
    catch: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: catcher,
    },
  });
}

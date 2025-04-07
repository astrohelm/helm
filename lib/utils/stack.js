'use strict';

/**
 * @description Linked list based stack implementation.
 */
module.exports = class Stack {
  #head = null;
  #length = 0;

  get length() {
    return this.#length;
  }

  push(value) {
    if (!this.#head) this.#head = { value, next: null };
    else this.#head = { value, next: this.#head };
    return ++this.#length;
  }

  pop() {
    if (!this.#head) return this.#head?.value;
    const value = this.#head.value;
    this.#head = this.#head.next;
    this.#length--;
    return value;
  }

  peek() {
    return this.#head?.value;
  }

  clear() {
    this.#head = null;
    this.#length = 0;
  }
};

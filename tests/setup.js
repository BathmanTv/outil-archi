// tests/setup.js — polyfill localStorage for Node 25 (which exposes a broken
// built-in localStorage stub that lacks Storage methods, overriding jsdom's).
class InMemoryStorage {
  constructor() { this._data = {}; }
  get length() { return Object.keys(this._data).length; }
  key(i) { return Object.keys(this._data)[i] ?? null; }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; }
  setItem(k, v) { this._data[String(k)] = String(v); }
  removeItem(k) { delete this._data[k]; }
  clear() { this._data = {}; }
}

globalThis.localStorage = new InMemoryStorage();
globalThis.sessionStorage = new InMemoryStorage();

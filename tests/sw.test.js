// Runs sw.js against a fake service-worker environment.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://example.test';

function boot(fetchImpl) {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    const key = (r) => new URL(typeof r === 'string' ? r : r.url, ORIGIN + '/').pathname;
    return {
      addAll: async (files) => { for (const f of files) m.set(key(f), { body: 'precached ' + f, ok: true, clone() { return this; } }); },
      match: async (r) => m.get(key(r)),
      put: async (r, res) => { m.set(key(r), res); },
    };
  };
  const listeners = {};
  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (k) => stores.delete(k),
    },
    fetch: fetchImpl,
    URL, Promise, setTimeout,
  };
  vm.runInNewContext(source, sandbox);
  const run = async (type, extra = {}) => {
    let waited;
    let responded;
    listeners[type]({ waitUntil: (p) => { waited = p; }, respondWith: (p) => { responded = p; }, ...extra });
    await waited;
    return responded;
  };
  return { stores, run, sandbox };
}
const get = (path) => ({ request: { method: 'GET', url: ORIGIN + path } });
const response = (body) => ({ body, ok: true, clone() { return this; } });

test('every precached file exists in the project', () => {
  const list = /const FILES = \[([\s\S]*?)\];/.exec(source)[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
  assert.ok(list.includes('src/main.js') && list.includes('vendor/three.module.min.js'));
  for (const f of list) {
    if (f === './') continue;
    assert.ok(existsSync(new URL('../' + f, import.meta.url)), f);
  }
  // and every source module is precached
  for (const m of ['rules', 'levelgen', 'sim', 'save', 'input', 'render', 'audio', 'ui', 'main']) {
    assert.ok(list.includes(`src/${m}.js`), m);
  }
});

test('online: the fresh copy is served and cached', async () => {
  const sw = boot(async () => response('fresh'));
  await sw.run('install');
  const res = await sw.run('fetch', get('/src/main.js'));
  assert.equal(res.body, 'fresh');
  const cache = await sw.sandbox.caches.open([...sw.stores.keys()][0]);
  assert.equal((await cache.match('/src/main.js')).body, 'fresh');
});

test('offline: the cached copy is served', async () => {
  const sw = boot(async () => { throw new TypeError('offline'); });
  await sw.run('install');
  const res = await sw.run('fetch', get('/src/main.js'));
  assert.equal(res.body, 'precached src/main.js');
  const page = await sw.run('fetch', get('/'));
  assert.equal(page.body, 'precached ./');
});

test('a hanging network falls back to the cache', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sw = boot(() => new Promise(() => {}));
  sw.sandbox.setTimeout = setTimeout;
  await sw.run('install');
  const pending = sw.run('fetch', get('/style.css'));
  await new Promise((r) => setImmediate(r));
  t.mock.timers.tick(3000);
  assert.equal((await pending).body, 'precached style.css');
});

test('old caches are removed on activate and other origins are left alone', async () => {
  const sw = boot(async () => response('fresh'));
  sw.stores.set('gate-rush-old', new Map());
  await sw.run('install');
  await sw.run('activate');
  assert.deepEqual([...sw.stores.keys()].length, 1);
  assert.equal(await sw.run('fetch', { request: { method: 'GET', url: 'https://elsewhere.test/x.js' } }), undefined);
  assert.equal(await sw.run('fetch', { request: { method: 'POST', url: ORIGIN + '/x' } }), undefined);
});

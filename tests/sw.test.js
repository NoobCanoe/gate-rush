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
    URL, Promise, setTimeout, Request: function Request(url) { this.url = new URL(url, ORIGIN + '/').href; },
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

test('the cached copy is served first, even online', async () => {
  const sw = boot(async () => response('fresh'));
  await sw.run('install');
  const res = await sw.run('fetch', get('/src/main.js'));
  assert.equal(res.body, 'precached src/main.js');
});

test('offline: the cached copy is served', async () => {
  const sw = boot(async () => { throw new TypeError('offline'); });
  await sw.run('install');
  assert.equal((await sw.run('fetch', get('/src/main.js'))).body, 'precached src/main.js');
  assert.equal((await sw.run('fetch', get('/'))).body, 'precached ./');
});

test('a file missing from the cache comes from the network', async () => {
  const sw = boot(async () => response('fresh'));
  await sw.run('install');
  assert.equal((await sw.run('fetch', get('/extra.js'))).body, 'fresh');
});

test('a refresh replaces the whole cache for the next launch', async () => {
  const sw = boot(async () => response('v2'));
  await sw.run('install');
  await sw.run('message', { data: { type: 'refresh' } });
  assert.equal((await sw.run('fetch', get('/src/main.js'))).body, 'v2');
  assert.equal((await sw.run('fetch', get('/style.css'))).body, 'v2');
  assert.equal([...sw.stores.keys()].length, 1);
});

test('a refresh that fails part-way changes nothing', async () => {
  let calls = 0;
  const sw = boot(async () => { calls++; if (calls > 5) throw new TypeError('dropped'); return response('v2'); });
  await sw.run('install');
  await sw.run('message', { data: { type: 'refresh' } });
  assert.ok(calls > 5);
  assert.equal((await sw.run('fetch', get('/src/main.js'))).body, 'precached src/main.js');
  assert.equal((await sw.run('fetch', get('/index.html'))).body, 'precached index.html');
});

test('a refresh that gets an error page changes nothing', async () => {
  const sw = boot(async () => ({ body: '404', ok: false, clone() { return this; } }));
  await sw.run('install');
  await sw.run('message', { data: { type: 'refresh' } });
  assert.equal((await sw.run('fetch', get('/src/main.js'))).body, 'precached src/main.js');
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

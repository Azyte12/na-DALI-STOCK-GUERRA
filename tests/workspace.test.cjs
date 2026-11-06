const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

async function workspace({ failLoad = false } = {}) {
  const seed = JSON.parse(readFileSync('database/sample-data.json', 'utf8'));
  const data = {
    ...seed,
    branches: ['Calapan', 'Pinamalayan', 'Roxas'].map((name, i) => ({
      id: i + 1,
      name,
      location: 'Oriental Mindoro',
    })),
    suppliers: [{ name: 'Mindoro Wholesale' }, { name: 'Everyday Distributors' }],
    user: { name: 'Test Admin', role: 'admin' },
    csrfToken: 'test-token',
  };
  const nodes = new Map(),
    calls = [];
  const node = (key) => {
    if (!nodes.has(key))
      nodes.set(key, {
        textContent: '',
        innerHTML: '',
        value: '',
        hidden: false,
        disabled: false,
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {},
        showModal() {},
        close() {},
      });
    return nodes.get(key);
  };
  let failSave = false;
  const context = vm.createContext({
    document: { querySelector: node, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {} },
    location: { hash: '' },
    crypto: { randomUUID },
    Intl,
    Date,
    console,
    AbortSignal,
    structuredClone,
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    async fetch(path, options) {
      calls.push({ path, options });
      if (path === '/api/workspace')
        return {
          status: failLoad ? 503 : 200,
          ok: !failLoad,
          json: async () => (failLoad ? { error: 'Database unavailable.' } : structuredClone(data)),
        };
      return {
        status: failSave ? 422 : 201,
        ok: !failSave,
        json: async () =>
          failSave ? { error: 'Quantity is invalid.' } : { message: 'Saved to MySQL.' },
      };
    },
  });
  vm.runInContext(readFileSync('public/workspace.js', 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    run: (code) => vm.runInContext(code, context),
    nodes,
    calls,
    setFailSave: () => {
      failSave = true;
    },
  };
}

test('workspace loads API records and filters by branch and product', async () => {
  const app = await workspace();
  assert.equal(app.calls[0].path, '/api/workspace');
  app.run("branch='Roxas';query='coffee';stockFilter='low';current='inventory';render()");
  assert.equal(app.run('filteredProducts().length'), 1);
  app.run("branch='Calapan'");
  assert.equal(app.run('filteredProducts().length'), 0);
  app.run('for(const page of Object.keys(pages)){current=page;render()}');
  assert.equal(app.nodes.get('#profile-name').textContent, 'Test Admin');
});

test('request saves use the API and CSRF token; rejected saves do not change displayed data', async () => {
  const app = await workspace();
  app.run('requestModal(2)');
  await app.run(
    "modalAction(new Map([['productId','2'],['quantity','30'],['supplier','Mindoro Wholesale']]))",
  );
  const call = app.calls.find((c) => c.path === '/api/requests');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers['X-CSRF-Token'], 'test-token');
  assert.equal(JSON.parse(call.options.body).quantity, 30);
  const before = app.run('JSON.stringify(state)');
  app.setFailSave();
  await assert.rejects(app.run("persist('/api/requests',{quantity:-1})"), /Quantity is invalid/);
  assert.equal(app.run('JSON.stringify(state)'), before);
});

test('database failure displays a retry action instead of substituting sample data', async () => {
  const app = await workspace({ failLoad: true });
  assert.match(app.nodes.get('#content').innerHTML, /Unable to load inventory/);
  assert.match(app.nodes.get('#content').innerHTML, /retry-load/);
  assert.equal(app.run('state.products.length'), 0);
});

test('stock editing submits the selected branch inventory count, reason and original count', async () => {
  const app = await workspace();
  const original = app.run('productById(1).stock');
  app.run('adjustStockModal(1)');
  assert.match(app.nodes.get('#modal-body').innerHTML, /Calapan/);
  assert.match(app.nodes.get('#modal-body').innerHTML, /Current stock/);
  await app.run("modalAction(new Map([['stock','3'],['reason','Daily count after sales']]))");
  const call = app.calls.find((c) => c.path === '/api/inventory/1/adjust');
  const body = JSON.parse(call.options.body);
  assert.equal(body.stock, 3);
  assert.equal(body.expectedStock, original);
  assert.equal(body.reason, 'Daily count after sales');
  assert.match(body.adjustmentKey, /^[0-9a-f-]{36}$/);
  assert.equal(call.options.headers['X-CSRF-Token'], 'test-token');
});

test('password hashes verify without the native bcrypt dependency', async () => {
  const { hashPassword, verifyPassword } = await import('../services/passwords.js');
  const hash = await hashPassword('A-test-password-123');
  assert.equal(await verifyPassword('A-test-password-123', hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
  assert.notEqual(await hashPassword('A-test-password-123'), hash);
});

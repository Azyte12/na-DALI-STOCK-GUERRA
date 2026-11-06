const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');

test('MySQL API persists the stock lifecycle, rejects unauthorized changes, and serializes receipts', async () => {
  const { databaseConfig } = await import('../config/env.js');
  const mysql = await import('mysql2/promise');
  const testDatabase = `DALIStock_test_${randomBytes(6).toString('hex')}`;
  const connection = await mysql.createConnection({ host: databaseConfig.host, port: databaseConfig.port, user: databaseConfig.user, password: databaseConfig.password });
  await connection.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  // Set before importing models. This suite never writes to the configured application database.
  databaseConfig.database = testDatabase;
  const m = await import('../models/inventoryModels.js');
  const { hashPassword } = await import('../services/passwords.js');
  let server;
  try {
    await m.sequelize.sync();
    const a = await m.Branch.create({ name: 'Branch A' });
    const b = await m.Branch.create({ name: 'Branch B' });
    await m.Supplier.create({ name: 'Test supplier' });
    const password = 'Test-password-12345';
    const hashed = await hashPassword(password);
    await m.User.bulkCreate([
      { name: 'Admin', email: 'admin@test.local', password: hashed, role: 'admin' },
      { name: 'Staff', email: 'staff@test.local', password: hashed, role: 'staff', branchId: a.id },
      { name: 'Visitor', email: 'visitor@test.local', password: hashed, role: 'visitors', branchId: a.id },
    ]);
    const { startServer } = await import('../index.js');
    server = await startServer(0);
    let base = `http://127.0.0.1:${server.address().port}`;
    async function signIn(email) {
      const page = await fetch(base + '/login');
      const html = await page.text();
      const csrf = /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
      assert.ok(csrf, 'login form has CSRF token');
      const response = await fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: page.headers.get('set-cookie').split(';')[0] }, body: new URLSearchParams({ email, password, _csrf: csrf }) });
      assert.equal(response.status, 302);
      const cookie = response.headers.get('set-cookie').split(';')[0];
      const snapshot = await fetch(base + '/api/workspace', { headers: { Cookie: cookie } });
      assert.equal(snapshot.status, 200);
      const state = await snapshot.json();
      return { cookie, token: state.csrfToken };
    }
    const admin = await signIn('admin@test.local');
    const staff = await signIn('staff@test.local');
    const visitor = await signIn('visitor@test.local');
    async function call(path, body, account = admin, token = account.token) {
      const response = await fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { Cookie: account.cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, data: await response.json() };
    }
    const unauthenticated = await fetch(base + '/api/workspace', { redirect: 'manual' });
    assert.equal(unauthenticated.status, 401);
    const product = { name: 'Rice', sku: 'RICE-1', branch: 'Branch A', stock: 5, reorder: 10, price: 35.5 };
    assert.equal((await call('/inventory', product, admin, 'bad-token')).status, 403);
    assert.equal((await call('/inventory', product, visitor)).status, 403);
    assert.equal((await call('/inventory', { ...product, stock: -1 })).status, 422);
    assert.equal((await call('/inventory', product)).status, 201);
    assert.equal((await call('/inventory', product)).status, 409);
    assert.equal((await call('/inventory', { ...product, branch: 'Branch B' })).status, 201);
    let state = (await call('/workspace')).data;
    assert.equal(state.products.length, 2);
    const inventoryId = state.products.find(p => p.branch === 'Branch A').id;
    const otherInventoryId = state.products.find(p => p.branch === 'Branch B').id;
    const staffState = (await call('/workspace', undefined, staff)).data;
    assert.equal(staffState.products.length, 1);
    assert.equal(staffState.branches.length, 1);
    assert.equal((await call('/requests', { productId: otherInventoryId, quantity: 10, supplier: 'Test supplier' }, staff)).status, 403);
    assert.equal((await call('/requests', { productId: inventoryId, quantity: 10, supplier: 'Test supplier' }, staff)).status, 201);
    state = (await call('/workspace')).data;
    const id = state.requests[0].id;
    assert.equal((await call(`/requests/${id}/order`, {})).status, 409);
    assert.equal((await call(`/requests/${id}/approve`, {}, staff)).status, 403);
    assert.equal((await call(`/requests/${id}/approve`, {})).status, 200);
    assert.equal((await call(`/requests/${id}/order`, {})).status, 200);
    assert.equal((await call(`/requests/${id}/order`, {})).status, 409);
    const receipt = { quantity: 4, receiptKey: randomUUID() };
    assert.equal((await call(`/requests/${id}/receive`, receipt, staff)).status, 200);
    assert.equal((await call(`/requests/${id}/receive`, receipt, staff)).status, 200, 'receipt retry is idempotent');
    state = (await call('/workspace')).data;
    assert.equal(state.products.find(p => p.id === inventoryId).stock, 9);
    assert.equal(state.requests[0].status, 'Partially received');
    assert.equal((await call(`/requests/${id}/receive`, { quantity: 7, receiptKey: randomUUID() }, staff)).status, 422);
    // Two deliveries racing for the final six units: only one can commit.
    const concurrent = await Promise.all([1, 2].map(() => call(`/requests/${id}/receive`, { quantity: 6, receiptKey: randomUUID() }, staff)));
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    state = (await call('/workspace')).data;
    assert.equal(state.products.find(p => p.id === inventoryId).stock, 15);
    assert.equal(state.requests[0].received, 10);
    assert.equal(state.requests[0].status, 'Completed');
    assert.equal(await m.Delivery.count(), 2);
    assert.equal(await m.PurchaseOrder.count(), 1);
    assert.equal(await m.PurchaseOrderItem.count(), 1);
    assert.equal(await m.StockMovement.count({ where: { type: 'Delivery' } }), 2);
    assert.equal(await m.AuditLog.count(), 7);
    // The same session and inventory survive a new HTTP listener.
    await new Promise(resolve => server.close(resolve));
    server = await startServer(0); base = `http://127.0.0.1:${server.address().port}`;
    state = (await call('/workspace')).data;
    assert.equal(state.products.find(p => p.id === inventoryId).stock, 15);
    assert.equal(state.user.name, 'Admin');
    const logout = await fetch(base + '/logout', { method: 'POST', redirect: 'manual', headers: { Cookie: admin.cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: admin.token }) });
    assert.equal(logout.status, 302);
    assert.equal((await call('/workspace')).status, 401);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await m.sequelize.close();
    // Only this randomly named database, created above by this test, is removed.
    assert.match(testDatabase, /^DALIStock_test_[a-f0-9]{12}$/);
    await connection.query(`DROP DATABASE \`${testDatabase}\``);
    await connection.end();
  }
});

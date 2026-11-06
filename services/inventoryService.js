import { Transaction } from 'sequelize';
import { sequelize, Branch, Supplier, Product, BranchInventory, ReplenishmentRequest, RequestItem, PurchaseOrder, PurchaseOrderItem, Delivery, StockMovement, AuditLog } from '../models/inventoryModels.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function integer(value, name, min = 1, max = 100000) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new HttpError(422, `${name} must be a whole number between ${min} and ${max}.`);
  return value;
}
export function text(value, name, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(422, `${name} is required (maximum ${max} characters).`);
  return value.trim();
}
export function scope(user) { return user.role === 'admin' ? {} : { branchId: user.branchId || -1 }; }
export function checkBranch(user, branchId) {
  if (user.role !== 'admin' && user.branchId !== branchId) throw new HttpError(403, 'This branch is outside your account access.');
}
const options = transaction => ({ transaction, lock: transaction.LOCK.UPDATE });
const log = (user, branchId, message, transaction) => AuditLog.create({ userId: user.id, branchId, text: message }, { transaction });
function parseReference(reference) {
  const match = /^REQ-([1-9]\d{0,9})$/.exec(reference);
  if (!match) throw new HttpError(422, 'Invalid request reference.');
  return Number(match[1]);
}

export async function workspaceState(user) {
  return sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, async transaction => {
    const [branches, suppliers, inventory, catalog, requests, items, orders, activity] = await Promise.all([
      Branch.findAll({ where: user.role === 'admin' ? {} : { id: user.branchId || -1 }, order: [['id', 'ASC']], transaction }),
      Supplier.findAll({ order: [['id', 'ASC']], transaction }),
      BranchInventory.findAll({ where: scope(user), order: [['id', 'ASC']], transaction }),
      Product.findAll({ transaction }),
      ReplenishmentRequest.findAll({ where: scope(user), order: [['id', 'DESC']], transaction }),
      RequestItem.findAll({ transaction }),
      PurchaseOrder.findAll({ transaction }),
      AuditLog.findAll({ where: scope(user), order: [['id', 'DESC']], limit: 200, transaction }),
    ]);
    const catalogMap = new Map(catalog.map(p => [p.id, p]));
    const branchMap = new Map(branches.map(b => [b.id, b.name]));
    const supplierMap = new Map(suppliers.map(s => [s.id, s.name]));
    const orderMap = new Map(orders.map(o => [o.requestId, o.id]));
    return {
      user: { id: user.id, name: user.name, role: user.role, branchId: user.branchId },
      branches: branches.map(b => ({ id: b.id, name: b.name, location: b.location })),
      suppliers: suppliers.map(s => ({ id: s.id, name: s.name })),
      products: inventory.map(inv => {
        const p = catalogMap.get(inv.productId);
        return { id: inv.id, catalogId: p.id, sku: p.sku, name: p.name, size: p.size, category: p.category, emoji: p.emoji, price: Number(p.price), branch: branchMap.get(inv.branchId), branchId: inv.branchId, stock: inv.stock, reorder: inv.reorder };
      }),
      requests: requests.map(r => {
        const item = items.find(item => item.requestId === r.id);
        return { id: `REQ-${r.id}`, productId: item.inventoryId, quantity: item.quantity, received: item.received, supplier: supplierMap.get(r.supplierId), status: r.status, poNumber: orderMap.has(r.id) ? `PO-${orderMap.get(r.id)}` : null };
      }),
      activity: activity.map(a => ({ text: a.text, branch: branchMap.get(a.branchId) || 'Workspace', time: a.createdAt.toISOString() })),
    };
  });
}

export async function addInventory(user, input) {
  const name = text(input.name, 'Product name'), sku = text(input.sku, 'SKU', 30).toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(sku)) throw new HttpError(422, 'SKU may contain letters, numbers and hyphens only.');
  const stock = integer(input.stock, 'Opening stock', 0), reorder = integer(input.reorder, 'Reorder level');
  if (typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price < 0 || input.price > 1000000 || Math.abs(input.price * 100 - Math.round(input.price * 100)) > 0.00001) throw new HttpError(422, 'Unit cost must be between 0 and 1,000,000 with at most two decimals.');
  return sequelize.transaction(async transaction => {
    const branch = await Branch.findOne({ where: { name: text(input.branch, 'Branch') }, transaction });
    if (!branch) throw new HttpError(404, 'Branch not found.');
    checkBranch(user, branch.id);
    let product = await Product.findOne({ where: { sku }, transaction });
    if (product && (product.name !== name || Number(product.price) !== input.price)) throw new HttpError(409, 'This SKU already exists. Use its existing product name and unit cost.');
    if (!product) product = await Product.create({ sku, name, price: input.price }, { transaction });
    if (await BranchInventory.findOne({ where: { branchId: branch.id, productId: product.id }, transaction })) throw new HttpError(409, 'This SKU already exists in that branch.');
    const inventory = await BranchInventory.create({ branchId: branch.id, productId: product.id, stock, reorder }, { transaction });
    await StockMovement.create({ inventoryId: inventory.id, quantity: stock, type: 'Opening', userId: user.id }, { transaction });
    await log(user, branch.id, `Added ${name} to branch inventory with ${stock} opening units`, transaction);
    return inventory;
  });
}

export async function createRequest(user, input) {
  const inventoryId = integer(input.productId, 'Product ID', 1, 2147483647), quantity = integer(input.quantity, 'Quantity');
  return sequelize.transaction(async transaction => {
    const inventory = await BranchInventory.findByPk(inventoryId, { transaction });
    if (!inventory) throw new HttpError(404, 'Product inventory not found.');
    checkBranch(user, inventory.branchId);
    const supplier = await Supplier.findOne({ where: { name: text(input.supplier, 'Supplier', 120) }, transaction });
    if (!supplier) throw new HttpError(404, 'Supplier not found.');
    const request = await ReplenishmentRequest.create({ branchId: inventory.branchId, supplierId: supplier.id, createdBy: user.id }, { transaction });
    await RequestItem.create({ requestId: request.id, inventoryId, quantity }, { transaction });
    await log(user, inventory.branchId, `REQ-${request.id} submitted for ${quantity} units`, transaction);
    return request;
  });
}

export async function changeRequest(user, reference, action) {
  const id = parseReference(reference);
  if (!['approve', 'reject', 'order'].includes(action)) throw new HttpError(422, 'Unknown request action.');
  return sequelize.transaction(async transaction => {
    const request = await ReplenishmentRequest.findByPk(id, options(transaction));
    if (!request) throw new HttpError(404, 'Request not found.');
    checkBranch(user, request.branchId);
    const expected = action === 'order' ? 'Approved' : 'Pending approval';
    if (request.status !== expected) throw new HttpError(409, 'This request has changed. Refresh before continuing.');
    if (action === 'order') {
      const item = await RequestItem.findOne({ where: { requestId: id }, transaction });
      const inventory = await BranchInventory.findByPk(item.inventoryId, { transaction });
      const product = await Product.findByPk(inventory.productId, { transaction });
      const order = await PurchaseOrder.create({ requestId: id, supplierId: request.supplierId, createdBy: user.id }, { transaction });
      await PurchaseOrderItem.create({ purchaseOrderId: order.id, requestItemId: item.id, quantity: item.quantity, unitCost: product.price }, { transaction });
      request.status = 'Ordered';
    } else {
      request.status = action === 'approve' ? 'Approved' : 'Rejected';
      request.approvedBy = user.id;
    }
    await request.save({ transaction });
    await log(user, request.branchId, `${reference} ${action === 'order' ? 'converted to a purchase order' : request.status.toLowerCase()}`, transaction);
  });
}

export async function receiveDelivery(user, reference, input) {
  const id = parseReference(reference), quantity = integer(input.quantity, 'Accepted quantity');
  if (typeof input.receiptKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.receiptKey)) throw new HttpError(422, 'A valid receipt key is required.');
  return sequelize.transaction(async transaction => {
    // Request lock serializes receipts and transitions for this order.
    const request = await ReplenishmentRequest.findByPk(id, options(transaction));
    if (!request) throw new HttpError(404, 'Request not found.');
    checkBranch(user, request.branchId);
    const item = await RequestItem.findOne({ where: { requestId: id }, ...options(transaction) });
    const previous = await Delivery.findOne({ where: { receiptKey: input.receiptKey }, transaction });
    if (previous) {
      if (previous.requestItemId !== item.id || previous.quantity !== quantity) throw new HttpError(409, 'Receipt key already belongs to a different delivery.');
      return; // Retrying the same receipt is safe, including after completion.
    }
    if (!['Ordered', 'Partially received'].includes(request.status)) throw new HttpError(409, 'Only an open purchase order can receive goods.');
    if (quantity > item.quantity - item.received) throw new HttpError(422, 'Accepted units exceed the remaining order quantity.');
    const inventory = await BranchInventory.findByPk(item.inventoryId, options(transaction));
    if (inventory.stock + quantity > 2147483647) throw new HttpError(422, 'Stock limit exceeded.');
    const order = await PurchaseOrder.findOne({ where: { requestId: id }, transaction });
    const delivery = await Delivery.create({ purchaseOrderId: order.id, requestItemId: item.id, receivedBy: user.id, quantity, receiptKey: input.receiptKey }, { transaction });
    item.received += quantity; inventory.stock += quantity;
    request.status = item.received === item.quantity ? 'Completed' : 'Partially received';
    await item.save({ transaction }); await inventory.save({ transaction }); await request.save({ transaction });
    await StockMovement.create({ inventoryId: inventory.id, deliveryId: delivery.id, quantity, type: 'Delivery', userId: user.id }, { transaction });
    await log(user, request.branchId, `${reference}: received ${quantity} units (${request.status.toLowerCase()})`, transaction);
  });
}

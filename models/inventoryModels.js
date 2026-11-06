import { DataTypes as D } from 'sequelize';
import { sequelize } from './db.js';
import { User } from './userModel.js';
const required = (type) => ({ type, allowNull: false });
const unsigned = () => ({ type: D.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });
export const Branch = sequelize.define('Branch', {
  name: { ...required(D.STRING(80)), unique: true },
  location: { ...required(D.STRING(160)), defaultValue: 'Oriental Mindoro' },
});
export const Supplier = sequelize.define('Supplier', {
  name: { ...required(D.STRING(120)), unique: true },
});
export const Product = sequelize.define('Product', {
  sku: { ...required(D.STRING(30)), unique: true },
  name: required(D.STRING(80)),
  size: { ...required(D.STRING(80)), defaultValue: 'Each' },
  category: { ...required(D.STRING(80)), defaultValue: 'General' },
  emoji: { ...required(D.STRING(12)), defaultValue: '📦' },
  price: { ...required(D.DECIMAL(12, 2)), defaultValue: 0 },
});
export const BranchInventory = sequelize.define(
  'BranchInventory',
  {
    stock: unsigned(),
    reorder: { ...unsigned(), defaultValue: 20 },
  },
  { indexes: [{ unique: true, fields: ['branchId', 'productId'] }] },
);
export const ReplenishmentRequest = sequelize.define('ReplenishmentRequest', {
  status: {
    ...required(
      D.ENUM(
        'Pending approval',
        'Approved',
        'Rejected',
        'Ordered',
        'Partially received',
        'Completed',
      ),
    ),
    defaultValue: 'Pending approval',
  },
  approvedBy: { type: D.INTEGER, allowNull: true, references: { model: User, key: 'id' } },
});
export const RequestItem = sequelize.define(
  'RequestItem',
  {
    quantity: required(D.INTEGER.UNSIGNED),
    received: unsigned(),
  },
  { indexes: [{ unique: true, fields: ['requestId', 'inventoryId'] }] },
);
export const PurchaseOrder = sequelize.define('PurchaseOrder', {
  requestId: { ...required(D.INTEGER), unique: true },
});
export const PurchaseOrderItem = sequelize.define('PurchaseOrderItem', {
  quantity: required(D.INTEGER.UNSIGNED),
  unitCost: required(D.DECIMAL(12, 2)),
});
export const Delivery = sequelize.define('Delivery', {
  quantity: required(D.INTEGER.UNSIGNED),
  receiptKey: { ...required(D.UUID), unique: true },
});
export const StockMovement = sequelize.define('StockMovement', {
  quantity: required(D.INTEGER),
  type: required(D.ENUM('Opening', 'Delivery', 'Adjustment')),
  reason: { type: D.STRING(200), allowNull: true },
  beforeStock: { type: D.INTEGER.UNSIGNED, allowNull: true },
  afterStock: { type: D.INTEGER.UNSIGNED, allowNull: true },
  adjustmentKey: { type: D.UUID, allowNull: true, unique: true },
});
export const AuditLog = sequelize.define(
  'AuditLog',
  { text: required(D.STRING(500)) },
  { updatedAt: false },
);
export const Session = sequelize.define(
  'Session',
  {
    sid: { type: D.STRING(128), primaryKey: true },
    data: required(D.TEXT('long')),
    expiresAt: required(D.DATE),
  },
  { timestamps: false, indexes: [{ fields: ['expiresAt'] }] },
);
function belongs(model, target, foreignKey, allowNull = false) {
  model.belongsTo(target, {
    foreignKey: { name: foreignKey, allowNull },
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  });
}
belongs(User, Branch, 'branchId', true);
belongs(BranchInventory, Branch, 'branchId');
belongs(BranchInventory, Product, 'productId');
belongs(ReplenishmentRequest, Branch, 'branchId');
belongs(ReplenishmentRequest, Supplier, 'supplierId');
belongs(ReplenishmentRequest, User, 'createdBy');
belongs(RequestItem, ReplenishmentRequest, 'requestId');
belongs(RequestItem, BranchInventory, 'inventoryId');
belongs(PurchaseOrder, ReplenishmentRequest, 'requestId');
belongs(PurchaseOrder, Supplier, 'supplierId');
belongs(PurchaseOrder, User, 'createdBy');
belongs(PurchaseOrderItem, PurchaseOrder, 'purchaseOrderId');
belongs(PurchaseOrderItem, RequestItem, 'requestItemId');
belongs(Delivery, PurchaseOrder, 'purchaseOrderId');
belongs(Delivery, RequestItem, 'requestItemId');
belongs(Delivery, User, 'receivedBy');
belongs(StockMovement, BranchInventory, 'inventoryId');
belongs(StockMovement, Delivery, 'deliveryId', true);
belongs(StockMovement, User, 'userId');
belongs(AuditLog, Branch, 'branchId', true);
belongs(AuditLog, User, 'userId');
export { sequelize, User };

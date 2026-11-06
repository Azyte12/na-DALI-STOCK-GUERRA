import fs from 'node:fs';
import {
  sequelize,
  Branch,
  Supplier,
  Product,
  BranchInventory,
  User,
  StockMovement,
  AuditLog,
} from '../models/inventoryModels.js';
import { hashPassword } from '../services/passwords.js';
const sample = JSON.parse(
  fs.readFileSync(new URL('../database/sample-data.json', import.meta.url), 'utf8'),
);
try {
  const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128)
    throw new Error(
      'Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12–128 characters) in .env before seeding.',
    );
  await sequelize.transaction(async (transaction) => {
    const [admin, created] = await User.findOrCreate({
      where: { email },
      defaults: {
        name: process.env.SEED_ADMIN_NAME || 'Administrator',
        password: await hashPassword(password),
        role: 'admin',
      },
      transaction,
    });
    if (!created && admin.role !== 'admin')
      throw new Error('The seed email belongs to a non-admin account. Choose another email.');
    const branches = new Map();
    for (const name of ['Calapan', 'Pinamalayan', 'Roxas']) {
      const [branch] = await Branch.findOrCreate({ where: { name }, transaction });
      branches.set(name, branch);
    }
    for (const name of ['Mindoro Wholesale', 'Everyday Distributors'])
      await Supplier.findOrCreate({ where: { name }, transaction });
    for (const p of sample.products) {
      const [product] = await Product.findOrCreate({
        where: { sku: p.sku },
        defaults: {
          name: p.name,
          size: p.size,
          category: p.category,
          emoji: p.emoji,
          price: p.price,
        },
        transaction,
      });
      const branchId = branches.get(p.branch).id;
      const [inventory, added] = await BranchInventory.findOrCreate({
        where: { branchId, productId: product.id },
        defaults: { stock: p.stock, reorder: p.reorder },
        transaction,
      });
      if (added) {
        await StockMovement.create(
          { inventoryId: inventory.id, quantity: p.stock, type: 'Opening', userId: admin.id },
          { transaction },
        );
        await AuditLog.create(
          {
            branchId,
            userId: admin.id,
            text: `Sample inventory added: ${p.name} (${p.stock} units)`,
          },
          { transaction },
        );
      }
    }
    console.log('Sample branches, suppliers and inventory are ready. Administrator:', email);
    console.log(
      created
        ? 'Administrator created using your configured password.'
        : 'Existing administrator password was preserved.',
    );
  });
} catch (error) {
  console.error('Seed failed:', error.original?.code || error.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}

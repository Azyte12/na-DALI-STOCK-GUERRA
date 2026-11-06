import mysql from 'mysql2/promise';
import { DataTypes } from 'sequelize';
import { databaseConfig as db } from './config/env.js';
import { sequelize } from './models/inventoryModels.js';
let connection;
try {
  if (!/^[a-zA-Z0-9_]+$/.test(db.database)) throw new Error('DB_NAME must contain only letters, numbers and underscores.');
  connection = await mysql.createConnection({ host: db.host, port: db.port, user: db.user, password: db.password, connectTimeout: 5000 });
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await sequelize.authenticate();
  const qi = sequelize.getQueryInterface(), tables = await qi.showAllTables();
  if (tables.some(table => String(table).toLowerCase() === 'users')) {
    const columns = await qi.describeTable('Users');
    if (!columns.branchId) await qi.addColumn('Users', 'branchId', { type: DataTypes.INTEGER, allowNull: true });
  }
  await sequelize.sync();
  const indexes = await qi.showIndex('Users');
  if (!indexes.some(index => index.unique && index.fields.length === 1 && index.fields[0].attribute === 'email')) {
    await qi.addIndex('Users', ['email'], { unique: true, name: 'users_email_unique' });
  }
  console.log(`Database ${db.database} is ready. Existing records were preserved.`);
} catch (error) {
  console.error('Database setup failed:', error.original?.code || error.code || error.message);
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
  await sequelize.close();
}

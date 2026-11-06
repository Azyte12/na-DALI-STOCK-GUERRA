# DALIStock

Multi-branch inventory and replenishment management built with XianFire, Express, Sequelize and MySQL. The magenta-and-white UI now reads and writes shared database records instead of browser localStorage.

## Local setup

Requirements: Node.js 20.12+ and MySQL 8 (Laragon's MySQL 8.4 is supported).

1. Start MySQL in Laragon.
2. Run `npm install` if dependencies are missing.
3. Copy `.env.example` to `.env` if it does not already exist. Configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.
4. Run `npm run migrate`. It creates the database and missing tables, adds the nullable branch field and unique email index to a legacy Users table, and preserves existing records. Duplicate legacy emails must be resolved before adding the unique index. The database account needs CREATE DATABASE/table permissions for setup.
5. Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (12–128 characters) in `.env`, then run `npm run seed` for sample branches, suppliers, inventory and an administrator. This is optional sample data; the migration alone creates empty tables.
6. Run `npm start` and open http://localhost:3000. Sign in using your seed account.

For this workspace, `.env` was created with `admin@dalistock.local` and a generated password in `SEED_ADMIN_PASSWORD`. The local database and sample inventory have already been created. `.env` is ignored by Git. The seed preserves existing inventory and existing administrator passwords on reruns; changing the seed password is not a password reset.

## Saved records and workflow

- Branches, suppliers and a shared SKU catalog, with separate stock and reorder levels per branch.
- Replenishment requests and request items, approvals/rejections, purchase orders and order items.
- Partial/full deliveries, opening/delivery stock movements, and an audit trail with the acting user.
- User accounts and persistent MySQL sessions. New passwords use Node's built-in scrypt. Legacy bcrypt hashes are supported when the original native bcrypt dependency is installed.

Requests progress from pending approval to approved/rejected, ordered, partially received and completed. Creating a purchase order stores its unit cost at order time. Receiving uses a transaction with row locks to save the delivery, request totals, stock balance, movement and audit entry together. Receipt keys prevent a retry from counting the same delivery twice. The UI still supports one product per request. It does not send orders to suppliers automatically.

Changes become visible to other signed-in browsers when they reload or click **Refresh data**. Database errors are shown; the UI never silently switches to sample/browser data. Old `dalistock-v1` localStorage data is not imported automatically and remains untouched.

## Account access

- `admin`: all branches; inventory creation, approvals, purchase orders, requests and receiving.
- `staff`: requests and receiving for their assigned branch, with read access to that branch.
- `visitors`: read-only access to an assigned branch. Public registration creates this role without branch access.

Administrators currently assign roles/branches directly in MySQL; a user-management screen is not included. For example, after looking up the correct branch ID:

```sql
SELECT id, name FROM Branches;
UPDATE Users SET role = 'staff', branchId = 1 WHERE email = 'staff@example.com';
```

Permissions are reloaded from the database on every API request. Form and API writes require a session CSRF token. Sign out uses POST. Sessions last eight hours and survive an application restart. Expired sessions are deleted when accessed; scheduled cleanup can remove unused expired records.

## Configuration

`models/db.js` reads `.env`; no credentials are hardcoded into application files. Set a strong `SESSION_SECRET` before deployment; production requires it and uses secure cookies. HTTPS must be provided by the deployment environment. Configure Express proxy trust appropriately if deploying behind a trusted TLS reverse proxy. No production deployment was performed.

Migration runs are explicit; login/startup do not create or drop tables. `sequelize.sync()` only creates missing tables, without `force` or `alter`. Future changes to existing schemas should use explicit reviewed migrations and backups.

## Verification

```sh
npm test
npm run test:db
```

Unit/UI tests verify API loading, filters, CSRF headers, failure handling and password hashing. The database integration suite needs a running MySQL server and privileges to create/drop a temporary `DALIStock_test_<random>` database. It verifies login, sessions, branch/role restrictions, request transitions, partial receipts, retries, concurrent receiving and persistence using real MySQL, then removes only its temporary test database. Application records are not modified by that suite. Visual browser testing has not been performed.

## Main files

- `models/inventoryModels.js`: schema and relationships.
- `migrate.js`: safe database/table setup; `scripts/seed.js`: repeatable sample data and admin creation.
- `services/inventoryService.js`: validated transactions and workspace reads.
- `routes/api.js`: authenticated persistence endpoints.
- `public/workspace.js`: dashboard and forms connected to the API.

The schema follows the supplied DALIStock system diagrams. Draft/revision requests, a management/manager role hierarchy, multi-item request forms, user management, supplier communication and historical analytics remain future work. The current `admin` role performs approval duties. Brand colors approximate the magenta identity at https://dali.ph; they are not a published official brand specification.

/* DALIStock workspace. Reads and writes are persisted through the authenticated API. */
const icons = {
  overview: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  inventory: 'm12 3 9 5-9 5-9-5 9-5M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5',
  replenishment: 'M5 4h14v17H5zM9 2h6v4H9zM8 11h8M8 15h5',
  purchasing: 'M3 3h2l3 12h10l3-9H6M9 20h.01M18 20h.01',
  receiving:
    'M3 6h11v12H3zM14 10h4l3 4v4h-7M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  branches: 'M3 10h18M4 10v11h16V10M3 10l2-7h14l2 7M9 21v-7h6v7',
  reports: 'M4 3v18h17M8 16v-4M13 16V8M18 16V5',
  audit: 'M4 5h16v16H4zM8 3v4M16 3v4M8 12h8M8 16h5',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  alert: 'm12 3 10 18H2L12 3M12 9v5M12 17h.01',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
const icon = (name) => /* HTML */ `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="${icons[name] || icons.inventory}" />
  </svg>
`;
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const money = (value) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value);
let state = { products: [], requests: [], activity: [], branches: [], suppliers: [], user: null };
let current = 'overview',
  branch = 'all',
  query = '',
  stockFilter = 'all',
  busy = false;
const $ = (selector) => document.querySelector(selector);
const productById = (id) => state.products.find((p) => p.id === Number(id));
const products = () => state.products.filter((p) => branch === 'all' || p.branch === branch);
const requests = () =>
  state.requests.filter((r) => {
    const p = productById(r.productId);
    return p && (branch === 'all' || p.branch === branch);
  });
const low = (p) => p.stock <= p.reorder;
const status = (p) => (p.stock === 0 ? 'Out of stock' : low(p) ? 'Low stock' : 'In stock');
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
async function api(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) {
    location.href = '/login';
    throw Error('Please sign in again.');
  }
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Unable to complete this change.');
  return result;
}
async function loadWorkspace() {
  state = await api('/api/workspace');
  const choices = state.branches;
  if (branch !== 'all' && !choices.some((b) => b.name === branch)) branch = 'all';
  $('#branch').innerHTML =
    '<option value="all">All accessible branches</option>' +
    choices.map((b) => '<option>' + escapeHTML(b.name) + '</option>').join('');
  $('#branch').value = branch;
  $('#profile-name').textContent = state.user.name;
  $('#profile-role').textContent =
    state.user.role === 'admin'
      ? 'Administrator'
      : state.user.role === 'staff'
        ? 'Branch staff'
        : 'Read-only account';
  const initials = state.user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
  document.querySelectorAll('.avatar').forEach((a) => (a.textContent = initials));
  $('#logout-csrf').value = state.csrfToken;
  $('#new-request').hidden = !canWrite();
  render();
}
function canWrite() {
  return ['admin', 'staff'].includes(state.user?.role);
}
async function persist(path, body) {
  const result = await api(path, body);
  await loadWorkspace();
  toast(result.message);
  return true;
}
function databaseError(error) {
  toast(
    error.name === 'TimeoutError'
      ? 'The connection timed out. Refresh to check whether the change was saved.'
      : error.message || 'Database connection failed.',
  );
}
async function refreshWorkspace() {
  try {
    await loadWorkspace();
  } catch (error) {
    $('#content').innerHTML =
      '<section class="panel database-error"><h2>Unable to load inventory</h2><p>' +
      escapeHTML(error.message || 'Check your connection and try again.') +
      '</p><button class="button primary" id="retry-load">Try again</button></section>';
    databaseError(error);
  }
}
const pages = {
  overview: [
    'Overview',
    'Your inventory, in focus.',
    'Keep your branches stocked and your operations moving.',
  ],
  inventory: [
    'Inventory',
    'Every product, accounted for.',
    'Track stock levels, spot shortages, and keep shelves ready.',
  ],
  replenishment: [
    'Replenishment',
    'Keep the everyday stocked.',
    'From a stock alert to an approved replenishment request.',
  ],
  purchasing: [
    'Purchase orders',
    'A clearer path to purchasing.',
    'Turn approved requests into supplier purchase orders.',
  ],
  receiving: [
    'Receiving',
    'Good things, arriving.',
    'Inspect deliveries and record quantities received at each branch.',
  ],
  branches: [
    'Branches',
    'Connected branches. One view.',
    'See how inventory is doing across your branch network.',
  ],
  reports: [
    'Reports',
    'Turn inventory into insight.',
    'A current snapshot of your stock, requests, and inventory value.',
  ],
  audit: [
    'Activity log',
    'Every movement has a story.',
    'Follow recorded changes across your accessible branches.',
  ],
};
function navigation() {
  let pending = state.requests.filter((r) => r.status === 'Pending approval').length;
  $('#navigation').innerHTML = Object.entries(pages)
    .map(
      ([key, [label]], i) => /* HTML */ `
        ${i === 5 ? '<div class="nav-divider"></div>' : ''}
        <a
          href="#${key}"
          class="nav-item ${current === key ? 'active' : ''}"
          ${current === key ? 'aria-current="page"' : ''}
        >
          ${icon(key)}
          <span>${label}</span>
          ${
            key === 'replenishment' && pending
              ? /* HTML */ `
                  <span class="nav-count">${pending}</span>
                `
              : ''
          }
        </a>
      `,
    )
    .join('');
}
function badge(label) {
  let style = ['In stock', 'Completed', 'Approved'].includes(label)
    ? 'success'
    : ['Out of stock', 'Rejected'].includes(label)
      ? 'danger'
      : ['Ordered', 'Partially received'].includes(label)
        ? 'neutral'
        : '';
  return /* HTML */ `
    <span class="badge ${style}">${escapeHTML(label)}</span>
  `;
}
function statCards() {
  const ps = products(),
    rs = requests();
  return /* HTML */ `
    <div class="stats">
      ${[
        [
          'Tracked products',
          ps.length,
          'inventory',
          `${ps.reduce((s, p) => s + p.stock, 0).toLocaleString()} units on hand`,
          'Across selected branches',
        ],
        [
          'Low-stock alerts',
          ps.filter(low).length,
          'alert',
          `${ps.filter((p) => p.stock === 0).length} out of stock`,
          'Need your attention',
        ],
        [
          'Pending requests',
          rs.filter((r) => r.status === 'Pending approval').length,
          'replenishment',
          'Awaiting approval',
          'Keep replenishment moving',
        ],
        [
          'Inventory value',
          money(ps.reduce((s, p) => s + p.stock * p.price, 0)),
          'reports',
          'At recorded unit cost',
          'Current stock on hand',
        ],
      ]
        .map(
          ([title, value, ico, note, sub], i) => /* HTML */ `
            <article class="stat">
              <div class="stat-top">
                <span>${title}</span>
                <span class="stat-icon">${icon(ico)}</span>
              </div>
              <div class="stat-value">${value}</div>
              <div class="stat-note"><b class="${i === 1 ? 'warning' : ''}">${note}</b></div>
              <div class="stat-note" style="margin-top:6px">${sub}</div>
            </article>
          `,
        )
        .join('')}
    </div>
  `;
}
function productRows(list) {
  return (
    list
      .map(
        (p) => /* HTML */ `
          <tr>
            <td>
              <div class="product-cell">
                <span class="product-icon">${escapeHTML(p.emoji)}</span>
                <div>
                  <strong>${escapeHTML(p.name)}</strong>
                  <small>${escapeHTML(p.sku)} · ${escapeHTML(p.size)}</small>
                </div>
              </div>
            </td>
            <td>${escapeHTML(p.branch)}</td>
            <td>
              <span class="stock-number ${low(p) ? '' : 'normal'}">${p.stock}</span>
              <small>units</small>
            </td>
            <td>${p.reorder} units</td>
            <td>${badge(status(p))}</td>
            <td>
              ${
                canWrite()
                  ? /* HTML */ `
                      <div class="row-actions">
                        <button class="row-action" data-adjust="${p.id}">Edit stock</button>
                        <button class="row-action" data-request="${p.id}">Replenish ↗</button>
                      </div>
                    `
                  : '—'
              }
            </td>
          </tr>
        `,
      )
      .join('') || '<tr><td colspan="6" class="empty">No products match this view.</td></tr>'
  );
}
function inventoryTable(list, title, subtitle, overview = false) {
  return /* HTML */ `
    <section class="panel table-panel">
      <div class="panel-heading">
        <div>
          <h2>${title}</h2>
          <p>${subtitle}</p>
        </div>
        ${
          overview
            ? '<a class="text-button" href="#inventory">View inventory ↗</a>'
            : /* HTML */ `
                <span class="subtle-tag">${list.length} records</span>
              `
        }
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Branch</th>
              <th>On hand</th>
              <th>Reorder level</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="product-rows">${productRows(list)}</tbody>
        </table>
      </div>
      <div class="table-foot">
        <span>
          ${overview ? 'Showing products that need attention' : `${list.length} branch inventory records`}
        </span>
        <span>Quantities in units</span>
      </div>
    </section>
  `;
}
function activityCards() {
  const rows = state.activity.filter((a) => branch === 'all' || a.branch === branch).slice(0, 3);
  return /* HTML */ `
    <section class="panel activity-panel">
      <div class="panel-heading">
        <div>
          <h2>Around your workspace</h2>
          <p>The latest updates, all in one place.</p>
        </div>
        <a class="text-button" href="#audit">All activity ↗</a>
      </div>
      <div class="activity-grid">
        ${
          rows
            .map(
              (a, i) => /* HTML */ `
                <div class="activity-item">
                  <span class="activity-icon">
                    ${icon(['replenishment', 'purchasing', 'check'][i])}
                  </span>
                  <div>
                    <p>${escapeHTML(a.text)}</p>
                    <small>${escapeHTML(a.branch)} · ${timeLabel(a.time)}</small>
                  </div>
                </div>
              `,
            )
            .join('') || '<p class="empty">No activity for this branch yet.</p>'
        }
      </div>
    </section>
  `;
}
function timeLabel(time) {
  return time === 'Sample activity'
    ? time
    : escapeHTML(
        new Date(time).toLocaleString('en-PH', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
      );
}
function overview() {
  const ps = products(),
    rs = requests(),
    healthy = ps.filter((p) => !low(p)).length,
    lowCount = ps.filter((p) => low(p) && p.stock > 0).length,
    out = ps.filter((p) => !p.stock).length,
    total = ps.length || 1;
  return /* HTML */ `
    <div class="welcome-banner">
      <span class="banner-icon">${icon('alert')}</span>
      <div>
        <strong>
          ${ps.filter(low).length ? `${ps.filter(low).length} products could use a little attention.` : 'Your shelves are in good shape.'}
        </strong>
        <p>
          ${ps.filter(low).length ? 'Review low-stock items to stay one step ahead of empty shelves.' : 'No low-stock products in this branch view.'}
        </p>
      </div>
      <button class="text-button" id="review-alerts">
        Review alerts
        <span>→</span>
      </button>
    </div>
    ${statCards()}
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2>A pulse on your inventory</h2>
            <p>Stock health across ${branch === 'all' ? 'all branches' : escapeHTML(branch)}</p>
          </div>
          <span class="subtle-tag">Current snapshot</span>
        </div>
        <div class="health-body">
          <div
            class="donut"
            style="--healthy:${(healthy / total) * 100}%;--available:${((healthy + lowCount) / total) * 100}%"
          >
            <div class="donut-label">
              <b>${Math.round((healthy / total) * 100)}%</b>
              <small>healthy stock</small>
            </div>
          </div>
          <div class="health-legend">
            <div class="legend-row">
              <i></i>
              In stock
              <strong>
                ${healthy}
                <small>products</small>
              </strong>
            </div>
            <div class="legend-row">
              <i></i>
              Low stock
              <strong>
                ${lowCount}
                <small>products</small>
              </strong>
            </div>
            <div class="legend-row">
              <i></i>
              Out of stock
              <strong>
                ${out}
                <small>products</small>
              </strong>
            </div>
          </div>
        </div>
        <div class="health-foot">${icon('check')} Based on saved branch inventory quantities</div>
      </section>
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2>Keep things moving</h2>
            <p>Your replenishment pipeline</p>
          </div>
          ${icon('replenishment')}
        </div>
        <div class="flow-body">
          ${[
            ['Pending approval', 'Ready for a manager’s review', 'replenishment', 'replenishment'],
            ['Approved', 'Ready to create a purchase order', 'purchasing', 'purchasing'],
            ['Ordered', 'Awaiting delivery at the branch', 'receiving', 'receiving'],
          ]
            .map(
              ([s, desc, ico, link]) => /* HTML */ `
                <a href="#${link}" class="flow-row">
                  <span class="flow-icon">${icon(ico)}</span>
                  <div>
                    <strong>${s}</strong>
                    <small>${desc}</small>
                  </div>
                  <b>
                    ${rs.filter((r) => (s === 'Ordered' ? ['Ordered', 'Partially received'].includes(r.status) : r.status === s)).length}
                  </b>
                  <span class="arrow">›</span>
                </a>
              `,
            )
            .join('')}
        </div>
      </section>
    </div>
    ${inventoryTable(ps.filter(low), 'Low stock, high priority', 'A little replenishment today. A fuller shelf tomorrow.', true)}${activityCards()}
  `;
}
function toolbar() {
  return /* HTML */ `
    <div class="toolbar">
      <label class="search-field">
        ${icon('search')}
        <input
          id="search"
          type="search"
          placeholder="Search product or SKU…"
          value="${escapeHTML(query)}"
          aria-label="Search products"
        />
      </label>
      <select id="stock-filter" aria-label="Filter stock status">
        <option value="all" ${stockFilter === 'all' ? 'selected' : ''}>All stock statuses</option>
        <option value="low" ${stockFilter === 'low' ? 'selected' : ''}>Needs replenishment</option>
        <option value="healthy" ${stockFilter === 'healthy' ? 'selected' : ''}>In stock</option>
        <option value="out" ${stockFilter === 'out' ? 'selected' : ''}>Out of stock</option>
      </select>
      ${state.user.role === 'admin' ? '<button class="button" id="add-product">＋ Add product</button>' : ''}
    </div>
  `;
}
function filteredProducts() {
  return products().filter(
    (p) =>
      `${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase()) &&
      (stockFilter === 'all' ||
        (stockFilter === 'low' && low(p)) ||
        (stockFilter === 'healthy' && !low(p)) ||
        (stockFilter === 'out' && p.stock === 0)),
  );
}
function requestTable() {
  let rs = requests();
  if (current === 'purchasing')
    rs = rs.filter((r) =>
      ['Approved', 'Ordered', 'Partially received', 'Completed'].includes(r.status),
    );
  if (current === 'receiving')
    rs = rs.filter((r) => ['Ordered', 'Partially received', 'Completed'].includes(r.status));
  const action = (r) =>
    !canWrite()
      ? '—'
      : state.user.role !== 'admin' && ['Pending approval', 'Approved'].includes(r.status)
        ? 'Administrator action'
        : r.status === 'Pending approval'
          ? /* HTML */ `
              <button class="row-action" data-approve="${r.id}">Approve</button>
              <button class="row-action" data-reject="${r.id}">Reject</button>
            `
          : r.status === 'Approved'
            ? /* HTML */ `
                <button class="row-action" data-order="${r.id}">Create PO ↗</button>
              `
            : ['Ordered', 'Partially received'].includes(r.status)
              ? /* HTML */ `
                  <button class="row-action" data-receive="${r.id}">Receive goods ↗</button>
                `
              : '—';
  return /* HTML */ `
    ${statCards()}
    <section class="panel table-panel">
      <div class="panel-heading">
        <div>
          <h2>${pages[current][0]} records</h2>
          <p>
            ${current === 'receiving' ? 'Record actual accepted units. Partial deliveries remain open.' : 'Follow each request from approval to delivery.'}
          </p>
        </div>
        <span class="subtle-tag">${rs.length} records</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference / product</th>
              <th>Branch</th>
              <th>Quantity</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Next step</th>
            </tr>
          </thead>
          <tbody>
            ${
              rs
                .map((r) => {
                  const p = productById(r.productId);
                  return /* HTML */ `
                    <tr>
                      <td>
                        <div class="product-cell">
                          <div>
                            <strong>
                              ${escapeHTML(current === 'replenishment' ? r.id : r.poNumber || r.id)}
                            </strong>
                            <small>${escapeHTML(p.name)}</small>
                          </div>
                        </div>
                      </td>
                      <td>${escapeHTML(p.branch)}</td>
                      <td>
                        ${r.quantity} units
                        <small style="display:block;margin-top:5px">${r.received} received</small>
                      </td>
                      <td>${escapeHTML(r.supplier)}</td>
                      <td>${badge(r.status)}</td>
                      <td>${action(r)}</td>
                    </tr>
                  `;
                })
                .join('') ||
              '<tr><td colspan="6" class="empty">No records yet. Create a replenishment request to get started.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}
function branchesView() {
  return /* HTML */ `
    <div class="branch-cards">
      ${state.branches
        .map((branchRecord) => {
          const name = branchRecord.name;
          const ps = state.products.filter((p) => p.branch === name);
          return /* HTML */ `
            <article class="panel branch-card">
              <span class="stat-icon">${icon('branches')}</span>
              <h2>${escapeHTML(name)}</h2>
              <p>${escapeHTML(branchRecord.location)}</p>
              <div class="branch-metric">
                <span>Tracked products</span>
                <strong>${ps.length}</strong>
              </div>
              <div class="branch-metric">
                <span>Need replenishment</span>
                <strong>${ps.filter(low).length}</strong>
              </div>
              <div class="branch-metric">
                <span>Inventory value</span>
                <strong>${money(ps.reduce((s, p) => s + p.stock * p.price, 0))}</strong>
              </div>
              <button class="button" data-branch="${escapeHTML(name)}">
                View branch inventory ↗
              </button>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}
function reportsView() {
  const ps = products();
  return /* HTML */ `
    ${statCards()}
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2>Inventory summary</h2>
          <p>Export the current branch selection for your records.</p>
        </div>
        <button class="button" id="export">↓ Export CSV</button>
      </div>
      <div class="report-summary">
        <h3>${branch === 'all' ? 'All branches' : escapeHTML(branch)}</h3>
        <p>
          ${ps.filter(low).length} of ${ps.length} products are at or below their reorder level.
        </p>
        <p>
          ${requests().filter((r) => r.status === 'Completed').length} replenishment requests have
          been completed.
        </p>
        <p>
          Inventory value uses recorded unit costs. This is a current snapshot, not a historical
          sales report.
        </p>
      </div>
    </section>
    ${activityCards()}
  `;
}
function auditView() {
  const rows = state.activity.filter((a) => branch === 'all' || a.branch === branch);
  return /* HTML */ `
    <section class="panel table-panel">
      <div class="panel-heading">
        <div>
          <h2>Workspace activity</h2>
          <p>Database history of requests, approvals, orders, and receiving.</p>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Activity</th>
              <th>Branch</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows
                .map(
                  (a) => /* HTML */ `
                    <tr>
                      <td>${escapeHTML(a.text)}</td>
                      <td>${escapeHTML(a.branch)}</td>
                      <td>${timeLabel(a.time)}</td>
                    </tr>
                  `,
                )
                .join('') ||
              '<tr><td colspan="3" class="empty">No activity for this branch.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}
function render() {
  navigation();
  const [label, title, description] = pages[current];
  $('#breadcrumb').textContent = label;
  $('#page-title').textContent = title;
  $('#page-description').textContent = description;
  $('#content').innerHTML =
    (!canWrite()
      ? '<p class="read-only-note">Read-only access. Ask your administrator to assign a branch and staff permissions.</p>'
      : '') +
    (current === 'overview'
      ? overview()
      : current === 'inventory'
        ? /* HTML */ `
            <p class="inventory-hint">
              Update branch quantities after sales, damage, or a physical count using
              <strong>Edit stock</strong>
              . Delivery quantities are added through Receiving.
            </p>
            ${toolbar()}${inventoryTable(filteredProducts(), 'Branch inventory', 'Everyday essentials, with stock levels you can act on.')}
          `
        : ['replenishment', 'purchasing', 'receiving'].includes(current)
          ? requestTable()
          : current === 'branches'
            ? branchesView()
            : current === 'reports'
              ? reportsView()
              : auditView());
}
let modalAction = null;
function showModal(title, body, submit, action) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML =
    body + '<p id="modal-error" class="modal-error" role="alert" hidden></p>';
  $('#submit-modal').textContent = submit;
  $('#submit-modal').hidden = !action;
  $('#cancel-modal').textContent = action ? 'Cancel' : 'Close';
  modalAction = action;
  $('#modal').showModal();
}
const field = (label, control) => /* HTML */ `
  <label class="form-field">${label}${control}</label>
`;
function requestModal(id) {
  const list = products();
  if (!canWrite()) return toast('Your account has read-only access.');
  if (!list.length) return toast('Add a product to this branch first.');
  if (!state.suppliers.length) return toast('Add suppliers to the database first.');
  showModal(
    'New replenishment request',
    '<p class="form-note">Choose a product and quantity. Requests go to administrator approval before purchasing.</p>' +
      field(
        'Product / branch',
        '<select name="productId">' +
          list
            .map(
              (p) =>
                '<option value="' +
                p.id +
                '" ' +
                (p.id === Number(id) ? 'selected' : '') +
                '>' +
                escapeHTML(p.name) +
                ' · ' +
                escapeHTML(p.branch) +
                '</option>',
            )
            .join('') +
          '</select>',
      ) +
      field(
        'Quantity requested',
        '<input name="quantity" type="number" min="1" max="100000" step="1" value="30" required>',
      ) +
      field(
        'Supplier',
        '<select name="supplier">' +
          state.suppliers.map((s) => '<option>' + escapeHTML(s.name) + '</option>').join('') +
          '</select>',
      ),
    'Submit request',
    (data) =>
      persist('/api/requests', {
        productId: Number(data.get('productId')),
        quantity: Number(data.get('quantity')),
        supplier: data.get('supplier'),
      }),
  );
}
function receiveModal(id) {
  const r = state.requests.find((r) => r.id === id),
    p = productById(r.productId),
    remaining = r.quantity - r.received;
  const receiptKey = crypto.randomUUID();
  showModal(
    'Receive delivery',
    '<p class="form-note">' +
      escapeHTML(p.name) +
      ' · ' +
      escapeHTML(p.branch) +
      '<br>' +
      r.received +
      ' of ' +
      r.quantity +
      ' units received. Only accepted units increase inventory.</p>' +
      field(
        'Accepted units in this delivery',
        '<input name="received" type="number" min="1" max="' +
          remaining +
          '" step="1" value="' +
          remaining +
          '" required>',
      ),
    'Record receipt',
    (data) =>
      persist('/api/requests/' + encodeURIComponent(id) + '/receive', {
        quantity: Number(data.get('received')),
        receiptKey,
      }),
  );
}
function adjustStockModal(id) {
  const p = productById(id);
  if (!p || !canWrite()) return;
  const expectedStock = p.stock,
    adjustmentKey = crypto.randomUUID();
  showModal(
    'Edit branch stock',
    '<p class="form-note">' +
      escapeHTML(p.name) +
      ' · ' +
      escapeHTML(p.sku) +
      '<br><strong>' +
      escapeHTML(p.branch) +
      '</strong></p>' +
      '<p class="stock-count-summary">Current stock: <strong>' +
      p.stock +
      ' units</strong></p>' +
      field(
        'New quantity on hand',
        '<input name="stock" type="number" min="0" max="2147483647" step="1" value="' +
          p.stock +
          '" required>',
      ) +
      field(
        'Reason for adjustment',
        '<textarea name="reason" rows="3" maxlength="200" placeholder="e.g. Daily count after sales, damaged items, or count correction" required></textarea>',
      ) +
      '<p class="form-note">Enter the actual remaining count for this branch. The change and reason will be recorded in Activity log. Use Receiving for purchase-order deliveries.</p>',
    'Save stock count',
    (data) =>
      persist('/api/inventory/' + p.id + '/adjust', {
        stock: Number(data.get('stock')),
        expectedStock,
        reason: data.get('reason'),
        adjustmentKey,
      }),
  );
}
function addProduct() {
  showModal(
    'Add branch inventory',
    field('Product name', '<input name="name" maxlength="80" required>') +
      field(
        'SKU',
        '<input name="sku" pattern="[A-Za-z0-9-]+" maxlength="30" placeholder="DLI-013" required>',
      ) +
      field(
        'Branch',
        '<select name="branch">' +
          state.branches
            .map(
              (b) =>
                '<option ' +
                (branch === b.name ? 'selected' : '') +
                '>' +
                escapeHTML(b.name) +
                '</option>',
            )
            .join('') +
          '</select>',
      ) +
      field(
        'Opening quantity',
        '<input name="stock" type="number" min="0" max="100000" value="0" step="1" required>',
      ) +
      field(
        'Reorder level',
        '<input name="reorder" type="number" min="1" max="100000" value="20" step="1" required>',
      ) +
      field(
        'Unit cost (PHP)',
        '<input name="price" type="number" min="0" max="1000000" step="0.01" value="0" required>',
      ),
    'Add product',
    (data) =>
      persist('/api/inventory', {
        name: data.get('name'),
        sku: data.get('sku'),
        branch: data.get('branch'),
        stock: Number(data.get('stock')),
        reorder: Number(data.get('reorder')),
        price: Number(data.get('price')),
      }),
  );
}
async function transition(id, from, to) {
  if (busy) return;
  busy = true;
  try {
    await persist(
      '/api/requests/' +
        encodeURIComponent(id) +
        '/' +
        { Approved: 'approve', Rejected: 'reject', Ordered: 'order' }[to],
      {},
    );
  } catch (error) {
    databaseError(error);
    await refreshWorkspace();
  } finally {
    busy = false;
  }
}
function exportCSV() {
  const rows = [
    [
      'SKU',
      'Product',
      'Branch',
      'On hand',
      'Reorder level',
      'Unit cost PHP',
      'Stock value PHP',
      'Status',
    ],
    ...products().map((p) => [
      p.sku,
      p.name,
      p.branch,
      p.stock,
      p.reorder,
      p.price,
      p.stock * p.price,
      status(p),
    ]),
  ];
  const cell = (value) =>
    `"${String(value)
      .replace(/^[=+@-]/, "'$&")
      .replace(/"/g, '""')}"`;
  const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `DALIStock-inventory-${branch}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Inventory report exported.');
}
document.addEventListener('click', (event) => {
  const target = event.target.closest('button,[data-branch]');
  if (!target) return;
  const d = target.dataset;
  if (d.request) requestModal(d.request);
  else if (d.adjust) adjustStockModal(d.adjust);
  else if (d.approve) transition(d.approve, 'Pending approval', 'Approved');
  else if (d.reject) transition(d.reject, 'Pending approval', 'Rejected');
  else if (d.order) transition(d.order, 'Approved', 'Ordered');
  else if (d.receive) receiveModal(d.receive);
  else if (d.branch) {
    branch = d.branch;
    $('#branch').value = branch;
    stockFilter = 'all';
    location.hash = 'inventory';
    render();
  } else if (['retry-load', 'refresh-data'].includes(target.id)) refreshWorkspace();
  else if (target.id === 'new-request') requestModal();
  else if (target.id === 'review-alerts' || target.id === 'notifications') {
    stockFilter = 'low';
    location.hash = 'inventory';
    render();
  } else if (target.id === 'add-product') addProduct();
  else if (target.id === 'export') exportCSV();
  else if (['close-modal', 'cancel-modal'].includes(target.id)) $('#modal').close();
  else if (target.id === 'menu-toggle') $('#sidebar').classList.toggle('open');
  else if (target.id === 'guide')
    showModal(
      'Your first stock journey',
      /* HTML */ `
        <p class="form-note">
          Changes are saved to the shared database. Administrators approve requests and create
          orders. Branch staff can request and receive stock for their assigned branch.
        </p>
        ${[
          [
            'Review & update inventory',
            'Use the branch selector to find products. Choose Edit stock to record the remaining quantity after sales, damage, or a physical count.',
          ],
          [
            'Request & approve',
            'Create a replenishment request, then approve it in Replenishment.',
          ],
          [
            'Create a purchase order',
            'Open Purchase orders and create a PO from an approved request. Orders are saved in the database; suppliers are not contacted automatically.',
          ],
          [
            'Receive & review',
            'Record accepted units in Receiving. Inventory increases and Activity log records the change.',
          ],
        ]
          .map(
            ([title, desc], i) => /* HTML */ `
              <div class="guide-step">
                <b>${i + 1}</b>
                <div>
                  <strong>${title}</strong>
                  <p>${desc}</p>
                </div>
              </div>
            `,
          )
          .join('')}
      `,
      '',
      null,
    );
});
$('#modal-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!modalAction || busy) return;
  busy = true;
  $('#submit-modal').disabled = true;
  $('#modal-error').hidden = true;
  try {
    if ((await modalAction(new FormData(event.target))) !== false) $('#modal').close();
  } catch (error) {
    $('#modal-error').textContent = error.message || 'Unable to save. Try again.';
    $('#modal-error').hidden = false;
    databaseError(error);
  } finally {
    busy = false;
    $('#submit-modal').disabled = false;
  }
});
$('#branch').addEventListener('change', (event) => {
  branch = event.target.value;
  render();
});
$('#content').addEventListener('input', (event) => {
  if (event.target.id === 'search') {
    query = event.target.value;
    const list = filteredProducts();
    $('#product-rows').innerHTML = productRows(list);
    $('.table-panel .subtle-tag').textContent = `${list.length} records`;
    $('.table-foot span').textContent = `${list.length} branch inventory records`;
  }
});
$('#content').addEventListener('change', (event) => {
  if (event.target.id === 'stock-filter') {
    stockFilter = event.target.value;
    render();
  }
});
function route() {
  current = Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  $('#sidebar').classList.remove('open');
  if (state.user) render();
}
window.addEventListener('hashchange', route);
$('#today').textContent = new Date().toLocaleDateString('en-PH', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'Asia/Shanghai',
});
route();
$('#content').innerHTML = '<section class="panel empty">Loading saved inventory…</section>';
refreshWorkspace();

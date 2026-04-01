// ============================================================
// EQUIPMENT CHAIN-OF-CUSTODY LEDGER
// Supabase-Connected SPA — Full Application Logic
// ============================================================

const SUPABASE_URL = 'https://hoosoptgumzzzkvyqrlx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_drnwSEIPDB8s1OX1pV_nEQ_Jf05tk9D';

// ── Supabase Client ──
let supabase;
try {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.error('Supabase init error:', e);
}

// ── App State ──
const state = {
  user: null,
  profile: null,
  assets: [],
  custodyLogs: [],
  currentPage: 'dashboard',
  selectedAsset: null,
  filters: { status: 'all', type: 'all', search: '' },
  isLoading: false,
};

// ── Asset Type Icons & Labels ──
const ASSET_ICONS = {
  drone: '🛸',
  radio: '📻',
  vehicle: '🚙',
  weapon: '🎯',
  optics: '🔭',
  medical: '🩺',
  comms: '📡',
  other: '📦',
};

const STATUS_LABELS = {
  available: 'Available',
  checked_out: 'Checked Out',
  maintenance: 'Maintenance',
  decommissioned: 'Decommissioned',
};

const ACTION_LABELS = {
  check_out: 'Checked Out',
  check_in: 'Checked In',
  transfer: 'Transferred',
  maintenance_start: 'Maintenance Started',
  maintenance_end: 'Maintenance Ended',
  registered: 'Registered',
};

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  await checkAuth();
});

function initEventListeners() {
  // Auth tabs
  document.getElementById('tab-login')?.addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tab-register')?.addEventListener('click', () => switchAuthTab('register'));

  // Auth forms
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('register-form')?.addEventListener('submit', handleRegister);

  // Navigation (mobile bottom nav)
  document.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Navigation (sidebar)
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('btn-logout-sidebar')?.addEventListener('click', handleLogout);

  // Search
  document.getElementById('search-assets')?.addEventListener('input', (e) => {
    state.filters.search = e.target.value.toLowerCase();
    renderAssetsList();
  });
}

// ── Auth ──
async function checkAuth() {
  showLoading(true);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      state.user = session.user;
      await loadProfile();
      showApp();
      await loadDashboard();
      setupRealtime();
    } else {
      showAuth();
    }
  } catch (err) {
    console.error('Auth check error:', err);
    showAuth();
  }
  showLoading(false);
}

function switchAuthTab(tab) {
  const loginTab = document.getElementById('tab-login');
  const registerTab = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (tab === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  } else {
    loginTab.classList.remove('active');
    registerTab.classList.add('active');
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn = e.target.querySelector('button[type="submit"]');

  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.user = data.user;
    await loadProfile();
    showApp();
    await loadDashboard();
    setupRealtime();
    showToast('Welcome back, ' + (state.profile?.callsign || state.profile?.full_name || 'Operator'), 'success');
  } catch (err) {
    showToast(err.message || 'Login failed', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Sign In';
}

async function handleRegister(e) {
  e.preventDefault();
  const fullName = document.getElementById('reg-fullname').value;
  const callsign = document.getElementById('reg-callsign').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;
  const btn = e.target.querySelector('button[type="submit"]');

  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, callsign }
      }
    });
    if (error) throw error;

    // Update profile with role
    if (data.user) {
      state.user = data.user;
      // Wait for trigger to create the profile, then update role
      await new Promise(r => setTimeout(r, 1000));
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ role, unit: 'Alpha Unit', callsign })
        .eq('id', data.user.id);

      if (profileErr) console.warn('Profile update error:', profileErr);
      await loadProfile();
      showApp();
      await loadDashboard();
      setupRealtime();
      showToast('Account created! Welcome, ' + (callsign || fullName), 'success');
    } else {
      showToast('Check your email to confirm registration.', 'info');
    }
  } catch (err) {
    showToast(err.message || 'Registration failed', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Create Account';
}

async function handleLogout() {
  await supabase.auth.signOut();
  state.user = null;
  state.profile = null;
  state.assets = [];
  state.custodyLogs = [];
  showAuth();
  showToast('Signed out successfully', 'info');
}

// ── Profile ──
async function loadProfile() {
  if (!state.user) return;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', state.user.id)
      .single();

    if (error) throw error;
    state.profile = data;
    updateUserDisplay();
  } catch (err) {
    console.warn('Profile load error:', err);
    state.profile = {
      id: state.user.id,
      full_name: state.user.user_metadata?.full_name || 'User',
      callsign: state.user.user_metadata?.callsign || null,
      role: 'field_user',
      unit: 'Unassigned'
    };
    updateUserDisplay();
  }
}

function isOfficer() {
  return state.profile?.role === 'commanding_officer';
}

function updateUserDisplay() {
  const p = state.profile;
  if (!p) return;

  const initials = (p.full_name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

  // Sidebar user card
  const sidebarAvatar = document.querySelector('.sidebar .user-avatar');
  const sidebarName = document.querySelector('.sidebar .user-name');
  const sidebarRole = document.querySelector('.sidebar .user-role');
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = p.callsign || p.full_name;
  if (sidebarRole) sidebarRole.textContent = p.role === 'commanding_officer' ? 'Commanding Officer' : 'Field Operator';

  // Mobile header avatar
  const mobileAvatar = document.getElementById('mobile-user-avatar');
  if (mobileAvatar) mobileAvatar.textContent = initials;

  // Show/hide CO-only nav items
  const coItems = document.querySelectorAll('.co-only');
  coItems.forEach(el => {
    el.style.display = isOfficer() ? '' : 'none';
  });
}

// ── Navigation ──
function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
}

function navigateTo(page) {
  state.currentPage = page;

  // Update nav active states
  document.querySelectorAll('.bottom-nav-item, .nav-item[data-page]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  // Hide all pages, show target
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById('page-' + page);
  if (target) {
    target.classList.remove('hidden');
    target.style.animation = 'none';
    target.offsetHeight; // Trigger reflow
    target.style.animation = 'fadeIn 0.3s ease-out';
  }

  // Load page data
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'assets': loadAssets(); break;
    case 'activity': loadActivity(); break;
    case 'profile': renderProfilePage(); break;
  }
}

function showLoading(show) {
  state.isLoading = show;
  const el = document.getElementById('global-loading');
  if (el) el.classList.toggle('hidden', !show);
}

// ── Dashboard ──
async function loadDashboard() {
  try {
    const { data: assets, error } = await supabase
      .from('assets')
      .select('*');

    if (error) throw error;
    state.assets = assets || [];

    const total = state.assets.length;
    const available = state.assets.filter(a => a.status === 'available').length;
    const checked = state.assets.filter(a => a.status === 'checked_out').length;
    const maintenance = state.assets.filter(a => a.status === 'maintenance').length;

    animateCounter('stat-total', total);
    animateCounter('stat-available', available);
    animateCounter('stat-checked', checked);
    animateCounter('stat-maintenance', maintenance);

    // Recent Activity
    const { data: logs } = await supabase
      .from('custody_logs')
      .select('*, asset:assets(name, serial_number), performer:profiles!custody_logs_performed_by_fkey(full_name, callsign)')
      .order('created_at', { ascending: false })
      .limit(5);

    renderRecentActivity(logs || []);

  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;

  let current = 0;
  const duration = 600;
  const step = target / (duration / 16);

  const animate = () => {
    current += step;
    if (current >= target) {
      el.textContent = target;
      return;
    }
    el.textContent = Math.floor(current);
    requestAnimationFrame(animate);
  };

  if (target === 0) {
    el.textContent = '0';
    return;
  }
  animate();
}

function renderRecentActivity(logs) {
  const container = document.getElementById('recent-activity');
  if (!container) return;

  if (logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No Recent Activity</h3>
        <p>Equipment transactions will appear here</p>
      </div>`;
    return;
  }

  container.innerHTML = logs.map(log => `
    <div class="timeline-item">
      <div class="timeline-dot ${log.action}"></div>
      <div class="timeline-content">
        <div class="timeline-action ${log.action}">${ACTION_LABELS[log.action] || log.action}</div>
        <div class="timeline-details">
          <strong>${log.asset?.name || 'Unknown Asset'}</strong>
          ${log.asset?.serial_number ? `<span class="mono" style="opacity:0.6"> • ${log.asset.serial_number}</span>` : ''}
          <br>by ${log.performer?.callsign || log.performer?.full_name || 'Unknown'}
          ${log.location ? ` • 📍 ${log.location}` : ''}
          ${log.notes ? `<br><em style="opacity:0.7">${log.notes}</em>` : ''}
        </div>
        <div class="timeline-time">${formatDate(log.created_at)}</div>
      </div>
    </div>
  `).join('');
}

// ── Assets ──
async function loadAssets() {
  try {
    const { data, error } = await supabase
      .from('assets')
      .select('*, holder:profiles!assets_current_holder_id_fkey(full_name, callsign)')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    state.assets = data || [];
    renderAssetsList();
  } catch (err) {
    console.error('Load assets error:', err);
    showToast('Failed to load assets', 'error');
  }
}

function renderAssetsList() {
  const container = document.getElementById('assets-container');
  if (!container) return;

  let filtered = [...state.assets];

  if (state.filters.status !== 'all') {
    filtered = filtered.filter(a => a.status === state.filters.status);
  }
  if (state.filters.type !== 'all') {
    filtered = filtered.filter(a => a.type === state.filters.type);
  }
  if (state.filters.search) {
    filtered = filtered.filter(a =>
      a.name.toLowerCase().includes(state.filters.search) ||
      a.serial_number.toLowerCase().includes(state.filters.search) ||
      (a.location || '').toLowerCase().includes(state.filters.search)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-icon">🔍</div>
        <h3>No Assets Found</h3>
        <p>${state.assets.length === 0 ? 'No equipment registered yet.' : 'Try adjusting your filters.'}</p>
        ${isOfficer() ? '<button class="btn btn-primary" onclick="openAddAssetModal()">+ Register Equipment</button>' : ''}
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(asset => `
    <div class="asset-card" onclick="viewAssetDetail('${asset.id}')">
      <div class="asset-card-header">
        <div class="asset-type-icon ${asset.type}">${ASSET_ICONS[asset.type] || '📦'}</div>
        <span class="status-badge ${asset.status}">${STATUS_LABELS[asset.status]}</span>
      </div>
      <div class="asset-card-body">
        <h3>${escapeHtml(asset.name)}</h3>
        <div class="serial">${escapeHtml(asset.serial_number)}</div>
      </div>
      <div class="asset-card-meta">
        ${asset.location ? `<span>📍 ${escapeHtml(asset.location)}</span>` : ''}
        ${asset.holder ? `<span>👤 ${escapeHtml(asset.holder.callsign || asset.holder.full_name)}</span>` : ''}
      </div>
      <div class="asset-card-actions">
        ${asset.status === 'available' ? `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();openCheckoutModal('${asset.id}')">Check Out</button>` : ''}
        ${asset.status === 'checked_out' && (asset.current_holder_id === state.user?.id || isOfficer()) ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();handleCheckin('${asset.id}')">Check In</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();viewAssetDetail('${asset.id}')">Details</button>
      </div>
    </div>
  `).join('');
}

function setFilter(type, value) {
  state.filters[type] = value;

  // Update chip states
  if (type === 'status') {
    document.querySelectorAll('.chip[data-status]').forEach(c => {
      c.classList.toggle('active', c.dataset.status === value);
    });
  }
  if (type === 'type') {
    document.querySelectorAll('.chip[data-type]').forEach(c => {
      c.classList.toggle('active', c.dataset.type === value);
    });
  }

  renderAssetsList();
}

// ── Asset Detail ──
async function viewAssetDetail(assetId) {
  state.selectedAsset = state.assets.find(a => a.id === assetId);
  if (!state.selectedAsset) return;

  navigateTo('detail');

  const asset = state.selectedAsset;
  const detailPage = document.getElementById('page-detail');

  // Load custody logs for this asset
  let logs = [];
  try {
    const { data, error } = await supabase
      .from('custody_logs')
      .select('*, performer:profiles!custody_logs_performed_by_fkey(full_name, callsign), receiver:profiles!custody_logs_received_by_fkey(full_name, callsign)')
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false });

    if (!error) logs = data || [];
  } catch (e) {
    console.warn('Logs load error:', e);
  }

  detailPage.innerHTML = `
    <button class="back-btn" onclick="navigateTo('assets')">← Back to Assets</button>

    <div class="detail-header">
      <div class="detail-icon ${asset.type}" style="background:${getTypeColor(asset.type)}">${ASSET_ICONS[asset.type] || '📦'}</div>
      <div class="detail-info">
        <h2>${escapeHtml(asset.name)}</h2>
        <div class="serial">${escapeHtml(asset.serial_number)}</div>
        <span class="status-badge ${asset.status}" style="margin-top:8px;">${STATUS_LABELS[asset.status]}</span>
      </div>
    </div>

    <div class="detail-meta">
      <div class="meta-item">
        <div class="meta-label">Type</div>
        <div class="meta-value">${capitalize(asset.type)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Location</div>
        <div class="meta-value">${asset.location || 'N/A'}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Holder</div>
        <div class="meta-value">${asset.holder?.callsign || asset.holder?.full_name || 'None'}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Last Updated</div>
        <div class="meta-value mono" style="font-size:0.75rem;">${formatDate(asset.updated_at)}</div>
      </div>
    </div>

    ${asset.notes ? `<div class="meta-item" style="margin-bottom:var(--space-lg);"><div class="meta-label">Notes</div><div class="meta-value" style="font-weight:400;font-size:0.875rem;">${escapeHtml(asset.notes)}</div></div>` : ''}

    <div class="detail-actions">
      ${asset.status === 'available' ? `<button class="btn btn-success" onclick="openCheckoutModal('${asset.id}')">⬆ Check Out</button>` : ''}
      ${asset.status === 'checked_out' && (asset.current_holder_id === state.user?.id || isOfficer()) ? `<button class="btn btn-primary" onclick="handleCheckin('${asset.id}')">⬇ Check In</button>` : ''}
      ${isOfficer() ? `<button class="btn btn-ghost" onclick="openEditAssetModal('${asset.id}')">✏️ Edit</button>` : ''}
    </div>

    <div class="section-divider"></div>

    <h3 class="section-title">📋 Chain of Custody</h3>
    <div class="timeline">
      ${logs.length === 0 ? '<p style="color:var(--text-secondary);font-size:0.875rem;">No custody records yet.</p>' :
        logs.map(log => `
          <div class="timeline-item">
            <div class="timeline-dot ${log.action}"></div>
            <div class="timeline-content">
              <div class="timeline-action ${log.action}">${ACTION_LABELS[log.action] || log.action}</div>
              <div class="timeline-details">
                by <strong>${log.performer?.callsign || log.performer?.full_name || 'Unknown'}</strong>
                ${log.receiver ? ` → <strong>${log.receiver.callsign || log.receiver.full_name}</strong>` : ''}
                ${log.location ? ` • 📍 ${escapeHtml(log.location)}` : ''}
                ${log.notes ? `<br><em style="opacity:0.7">${escapeHtml(log.notes)}</em>` : ''}
              </div>
              <div class="timeline-time">${formatDate(log.created_at)}</div>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;
}

// ── Check Out ──
function openCheckoutModal(assetId) {
  const asset = state.assets.find(a => a.id === assetId);
  if (!asset) return;

  const modal = document.getElementById('modal-container');
  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>⬆ Check Out Equipment</h3>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <form id="checkout-form" onsubmit="handleCheckout(event, '${assetId}')">
          <div class="modal-body">
            <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:var(--space-md);display:flex;align-items:center;gap:var(--space-sm);">
              <span style="font-size:1.5rem;">${ASSET_ICONS[asset.type]}</span>
              <div>
                <div style="font-weight:600;">${escapeHtml(asset.name)}</div>
                <div class="mono" style="font-size:0.75rem;color:var(--text-tertiary);">${escapeHtml(asset.serial_number)}</div>
              </div>
            </div>
            <div class="form-group">
              <label for="checkout-location">Location / Grid Ref</label>
              <input type="text" id="checkout-location" class="form-input" placeholder="e.g. Grid 34T KM 1234 5678" required>
            </div>
            <div class="form-group">
              <label for="checkout-notes">Notes (optional)</label>
              <textarea id="checkout-notes" class="form-input" rows="3" placeholder="Mission details, purpose..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-success" style="flex:1;">Confirm Check Out</button>
          </div>
        </form>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function handleCheckout(e, assetId) {
  e.preventDefault();
  const location = document.getElementById('checkout-location').value;
  const notes = document.getElementById('checkout-notes').value;
  const btn = e.target.querySelector('button[type="submit"]');

  btn.disabled = true;
  btn.textContent = 'Processing...';

  try {
    // Update asset
    const { error: assetErr } = await supabase
      .from('assets')
      .update({
        status: 'checked_out',
        current_holder_id: state.user.id,
        location
      })
      .eq('id', assetId);

    if (assetErr) throw assetErr;

    // Create custody log
    const { error: logErr } = await supabase
      .from('custody_logs')
      .insert({
        asset_id: assetId,
        action: 'check_out',
        performed_by: state.user.id,
        location,
        notes
      });

    if (logErr) throw logErr;

    closeModal();
    showToast('Equipment checked out successfully', 'success');
    await loadAssets();
    await loadDashboard();
  } catch (err) {
    showToast(err.message || 'Check-out failed', 'error');
    btn.disabled = false;
    btn.textContent = 'Confirm Check Out';
  }
}

// ── Check In ──
async function handleCheckin(assetId) {
  const asset = state.assets.find(a => a.id === assetId);
  if (!asset) return;

  const modal = document.getElementById('modal-container');
  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>⬇ Check In Equipment</h3>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <form id="checkin-form" onsubmit="confirmCheckin(event, '${assetId}')">
          <div class="modal-body">
            <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:var(--space-md);display:flex;align-items:center;gap:var(--space-sm);">
              <span style="font-size:1.5rem;">${ASSET_ICONS[asset.type]}</span>
              <div>
                <div style="font-weight:600;">${escapeHtml(asset.name)}</div>
                <div class="mono" style="font-size:0.75rem;color:var(--text-tertiary);">${escapeHtml(asset.serial_number)}</div>
              </div>
            </div>
            <div class="form-group">
              <label for="checkin-location">Return Location</label>
              <input type="text" id="checkin-location" class="form-input" placeholder="e.g. FOB Alpha Armory" required>
            </div>
            <div class="form-group">
              <label for="checkin-notes">Condition / Notes</label>
              <textarea id="checkin-notes" class="form-input" rows="3" placeholder="Equipment condition, any damage..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" style="flex:1;">Confirm Check In</button>
          </div>
        </form>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function confirmCheckin(e, assetId) {
  e.preventDefault();
  const location = document.getElementById('checkin-location').value;
  const notes = document.getElementById('checkin-notes').value;
  const btn = e.target.querySelector('button[type="submit"]');

  btn.disabled = true;
  btn.textContent = 'Processing...';

  try {
    const { error: assetErr } = await supabase
      .from('assets')
      .update({
        status: 'available',
        current_holder_id: null,
        location
      })
      .eq('id', assetId);

    if (assetErr) throw assetErr;

    const { error: logErr } = await supabase
      .from('custody_logs')
      .insert({
        asset_id: assetId,
        action: 'check_in',
        performed_by: state.user.id,
        location,
        notes
      });

    if (logErr) throw logErr;

    closeModal();
    showToast('Equipment checked in successfully', 'success');
    await loadAssets();
    await loadDashboard();
  } catch (err) {
    showToast(err.message || 'Check-in failed', 'error');
    btn.disabled = false;
    btn.textContent = 'Confirm Check In';
  }
}

// ── Add Asset (CO only) ──
function openAddAssetModal() {
  if (!isOfficer()) return showToast('Only commanding officers can register equipment', 'warning');

  const modal = document.getElementById('modal-container');
  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>📦 Register New Equipment</h3>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <form id="add-asset-form" onsubmit="handleAddAsset(event)">
          <div class="modal-body">
            <div class="form-group">
              <label for="asset-name">Equipment Name</label>
              <input type="text" id="asset-name" class="form-input" placeholder="e.g. DJI Mavic 3 Enterprise" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="asset-type">Type</label>
                <select id="asset-type" class="form-select" required>
                  <option value="drone">🛸 Drone</option>
                  <option value="radio">📻 Radio</option>
                  <option value="vehicle">🚙 Vehicle</option>
                  <option value="weapon">🎯 Weapon</option>
                  <option value="optics">🔭 Optics</option>
                  <option value="medical">🩺 Medical</option>
                  <option value="comms">📡 Comms</option>
                  <option value="other">📦 Other</option>
                </select>
              </div>
              <div class="form-group">
                <label for="asset-serial">Serial Number</label>
                <input type="text" id="asset-serial" class="form-input" placeholder="e.g. SN-2024-0001" required>
              </div>
            </div>
            <div class="form-group">
              <label for="asset-location">Storage Location</label>
              <input type="text" id="asset-location" class="form-input" placeholder="e.g. FOB Alpha, Locker 7">
            </div>
            <div class="form-group">
              <label for="asset-notes">Notes</label>
              <textarea id="asset-notes" class="form-input" rows="3" placeholder="Description, accessories included..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" style="flex:1;">Register Equipment</button>
          </div>
        </form>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function handleAddAsset(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Registering...';

  try {
    const assetData = {
      name: document.getElementById('asset-name').value,
      type: document.getElementById('asset-type').value,
      serial_number: document.getElementById('asset-serial').value,
      location: document.getElementById('asset-location').value || null,
      notes: document.getElementById('asset-notes').value || null,
      status: 'available',
      created_by: state.user.id,
    };

    const { data, error } = await supabase
      .from('assets')
      .insert(assetData)
      .select()
      .single();

    if (error) throw error;

    // Log registration
    await supabase.from('custody_logs').insert({
      asset_id: data.id,
      action: 'registered',
      performed_by: state.user.id,
      location: assetData.location,
      notes: 'Equipment registered in system'
    });

    closeModal();
    showToast('Equipment registered: ' + assetData.name, 'success');
    await loadAssets();
    await loadDashboard();
  } catch (err) {
    showToast(err.message || 'Registration failed', 'error');
    btn.disabled = false;
    btn.textContent = 'Register Equipment';
  }
}

// ── Edit Asset (CO only) ──
function openEditAssetModal(assetId) {
  if (!isOfficer()) return;
  const asset = state.assets.find(a => a.id === assetId);
  if (!asset) return;

  const modal = document.getElementById('modal-container');
  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>✏️ Edit Equipment</h3>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <form id="edit-asset-form" onsubmit="handleEditAsset(event, '${assetId}')">
          <div class="modal-body">
            <div class="form-group">
              <label for="edit-name">Equipment Name</label>
              <input type="text" id="edit-name" class="form-input" value="${escapeHtml(asset.name)}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="edit-type">Type</label>
                <select id="edit-type" class="form-select">
                  ${Object.keys(ASSET_ICONS).map(t => `<option value="${t}" ${asset.type === t ? 'selected' : ''}>${ASSET_ICONS[t]} ${capitalize(t)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label for="edit-status">Status</label>
                <select id="edit-status" class="form-select">
                  ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${asset.status === k ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label for="edit-location">Location</label>
              <input type="text" id="edit-location" class="form-input" value="${escapeHtml(asset.location || '')}">
            </div>
            <div class="form-group">
              <label for="edit-notes">Notes</label>
              <textarea id="edit-notes" class="form-input" rows="3">${escapeHtml(asset.notes || '')}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" style="flex:1;">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function handleEditAsset(e, assetId) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const { error } = await supabase
      .from('assets')
      .update({
        name: document.getElementById('edit-name').value,
        type: document.getElementById('edit-type').value,
        status: document.getElementById('edit-status').value,
        location: document.getElementById('edit-location').value || null,
        notes: document.getElementById('edit-notes').value || null,
      })
      .eq('id', assetId);

    if (error) throw error;

    closeModal();
    showToast('Equipment updated', 'success');
    await loadAssets();
    viewAssetDetail(assetId);
  } catch (err) {
    showToast(err.message || 'Update failed', 'error');
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

// ── Activity Log ──
async function loadActivity() {
  const container = document.getElementById('activity-timeline');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading activity...</p></div>';

  try {
    const { data: logs, error } = await supabase
      .from('custody_logs')
      .select('*, asset:assets(name, serial_number, type), performer:profiles!custody_logs_performed_by_fkey(full_name, callsign), receiver:profiles!custody_logs_received_by_fkey(full_name, callsign)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    if (!logs || logs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>No Activity Yet</h3>
          <p>Equipment transactions will appear here as a full audit trail</p>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="timeline">` + logs.map(log => `
      <div class="timeline-item">
        <div class="timeline-dot ${log.action}"></div>
        <div class="timeline-content">
          <div class="timeline-action ${log.action}">${ACTION_LABELS[log.action] || log.action}</div>
          <div class="timeline-details">
            ${log.asset ? `<strong style="cursor:pointer;" onclick="viewAssetDetail('${log.asset_id}')">${ASSET_ICONS[log.asset?.type] || '📦'} ${escapeHtml(log.asset.name)}</strong> <span class="mono" style="opacity:0.5;font-size:0.7rem;">${escapeHtml(log.asset.serial_number)}</span>` : ''}
            <br>by <strong>${log.performer?.callsign || log.performer?.full_name || 'Unknown'}</strong>
            ${log.receiver ? ` → <strong>${log.receiver.callsign || log.receiver.full_name}</strong>` : ''}
            ${log.location ? ` • 📍 ${escapeHtml(log.location)}` : ''}
            ${log.notes ? `<br><em style="opacity:0.6;font-size:0.8rem;">${escapeHtml(log.notes)}</em>` : ''}
          </div>
          <div class="timeline-time">${formatDate(log.created_at)}</div>
        </div>
      </div>
    `).join('') + `</div>`;
  } catch (err) {
    console.error('Activity load error:', err);
    container.innerHTML = '<div class="empty-state"><h3>Error loading activity</h3></div>';
  }
}

// ── Profile Page ──
function renderProfilePage() {
  const container = document.getElementById('profile-content');
  if (!container || !state.profile) return;

  const p = state.profile;
  const initials = (p.full_name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

  container.innerHTML = `
    <div class="profile-card">
      <div class="profile-avatar-large">${initials}</div>
      <h3>${escapeHtml(p.full_name)}</h3>
      ${p.callsign ? `<p style="color:var(--text-secondary);font-size:0.875rem;">Callsign: <strong>${escapeHtml(p.callsign)}</strong></p>` : ''}
      <div class="profile-role-badge ${p.role}">${p.role === 'commanding_officer' ? '⭐ Commanding Officer' : '🎖️ Field Operator'}</div>
      <p style="color:var(--text-tertiary);font-size:0.8125rem;margin-top:8px;">Unit: ${escapeHtml(p.unit || 'Unassigned')}</p>
    </div>

    <form class="profile-form" onsubmit="updateProfile(event)">
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" id="profile-name" class="form-input" value="${escapeHtml(p.full_name)}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Callsign</label>
          <input type="text" id="profile-callsign" class="form-input" value="${escapeHtml(p.callsign || '')}">
        </div>
        <div class="form-group">
          <label>Unit</label>
          <input type="text" id="profile-unit" class="form-input" value="${escapeHtml(p.unit || '')}">
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Save Profile</button>
    </form>

    <div class="section-divider"></div>
    <button class="btn btn-danger btn-full" onclick="handleLogout()">Sign Out</button>
  `;
}

async function updateProfile(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: document.getElementById('profile-name').value,
        callsign: document.getElementById('profile-callsign').value || null,
        unit: document.getElementById('profile-unit').value || 'Unassigned',
      })
      .eq('id', state.user.id);

    if (error) throw error;

    await loadProfile();
    showToast('Profile updated', 'success');
    renderProfilePage();
  } catch (err) {
    showToast(err.message || 'Update failed', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Save Profile';
}

// ── Realtime ──
function setupRealtime() {
  supabase
    .channel('asset-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, (payload) => {
      console.log('Asset change:', payload);
      if (state.currentPage === 'dashboard') loadDashboard();
      if (state.currentPage === 'assets') loadAssets();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'custody_logs' }, (payload) => {
      console.log('New custody log:', payload);
      if (state.currentPage === 'activity') loadActivity();
      if (state.currentPage === 'dashboard') loadDashboard();
    })
    .subscribe();
}

// ── Modal ──
function closeModal(e) {
  if (e && e.target && !e.target.classList.contains('modal-overlay')) return;
  const modal = document.getElementById('modal-container');
  modal.classList.add('hidden');
  modal.innerHTML = '';
}

// ── Toast ──
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-dismiss" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Helpers ──
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getTypeColor(type) {
  const colors = {
    drone: 'rgba(59,130,246,0.15)',
    radio: 'rgba(245,158,11,0.15)',
    vehicle: 'rgba(34,197,94,0.15)',
    weapon: 'rgba(239,68,68,0.15)',
    optics: 'rgba(139,92,246,0.15)',
    medical: 'rgba(236,72,153,0.15)',
    comms: 'rgba(6,182,212,0.15)',
    other: 'rgba(148,163,184,0.15)',
  };
  return colors[type] || colors.other;
}

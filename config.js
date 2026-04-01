// ============================================================
// FIELDVAULT — Shared Configuration
// ============================================================

const SUPABASE_URL = 'https://hoosoptgumzzzkvyqrlx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhvb3NvcHRndW16enprdnlxcmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Nzg3NjMsImV4cCI6MjA5MDM1NDc2M30.Au8HFFbKet6sXBmUv_pj6jXLATlR5E2W12AKRmwKyFU';

let supabase;
let supabaseReady = false;

try {
  if (window.supabase && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseReady = true;
    console.log('✅ Supabase client initialized');
  } else {
    console.error('❌ Supabase JS library not loaded');
  }
} catch (e) {
  console.error('❌ Supabase init failed:', e.message);
}

// ── Asset Type Icons ──
const ASSET_ICONS = {
  drone: '🛸', radio: '📻', vehicle: '🚙', weapon: '🎯',
  optics: '🔭', medical: '🩺', comms: '📡', other: '📦',
};

const STATUS_LABELS = {
  available: 'Available', checked_out: 'Checked Out',
  maintenance: 'Maintenance', decommissioned: 'Decommissioned',
};

const ACTION_LABELS = {
  check_out: 'Checked Out', check_in: 'Checked In',
  transfer: 'Transferred', maintenance_start: 'Maintenance Started',
  maintenance_end: 'Maintenance Ended', registered: 'Registered',
};

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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return alert(message);
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span><span class="toast-message">' + escapeHtml(message) + '</span><button class="toast-dismiss" onclick="this.parentElement.remove()">✕</button>';
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = 'all 0.3s ease'; setTimeout(() => toast.remove(), 300); }, 4000);
}

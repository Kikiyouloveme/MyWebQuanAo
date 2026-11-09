/** MongoDB repository facade. See mongo-store.js for the async request boundary. */
const crypto = require('crypto');
const store = require('./mongo-store');
const SCHEMA_VERSION = 5;
const load = store.load;
// Changes are staged within db.run(), validated and persisted before HTTP response.
const save = () => { load(); };
const saveNow = save;
// This is a synchronous business operation, NOT a standalone MongoDB transaction.
function transaction(fn) { const result = fn(load()); save(); return result; }
const makeSku = (productId, color, size) =>
  `${String(productId).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}-${String(color).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'STD'}-${String(size).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'OS'}`;

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

/* ---------------- repository ---------------- */

const users = {
  all: () => load().users,
  byId: (id) => load().users.find((u) => u.id === id) || null,
  byEmail: (email) => load().users.find((u) => u.email === String(email || '').toLowerCase().trim()) || null,
  insert: (u) => { load().users.push(u); save(); return u; },
};

const products = {
  all: () => load().products,
  byId: (id) => load().products.find((p) => p.id === id) || null,
  active: () => load().products.filter((p) => p.active !== false),
  insert: (p) => { load().products.unshift(p); save(); return p; },
  remove: (id) => {
    const d = load();
    const i = d.products.findIndex((p) => p.id === id);
    if (i < 0) return false;
    d.products.splice(i, 1); save(); return true;
  },
  /** Tìm biến thể theo màu + size trong một sản phẩm */
  findVariant: (product, color, size) =>
    (product.variants || []).find(
      (v) => String(v.color) === String(color) && String(v.size) === String(size)
    ) || null,
  variantById: (product, variantId) => (product.variants || []).find((v) => v.id === variantId) || null,
};

const orders = {
  all: () => load().orders,
  byId: (id) => load().orders.find((o) => o.id === id) || null,
  byUser: (userId) => load().orders.filter((o) => o.userId === userId),
  insert: (o) => { load().orders.unshift(o); saveNow(); return o; },
  nextId: () => 'DH' + (++load().counters.order),
};

const vouchers = {
  all: () => load().vouchers,
  byId: (id) => load().vouchers.find((v) => v.id === id) || null,
  byCode: (code) => {
    const c = String(code || '').trim().toUpperCase();
    return load().vouchers.find((v) => v.code.toUpperCase() === c) || null;
  },
  insert: (v) => { load().vouchers.unshift(v); save(); return v; },
  remove: (id) => {
    const d = load();
    const i = d.vouchers.findIndex((v) => v.id === id);
    if (i < 0) return false;
    d.vouchers.splice(i, 1); save(); return true;
  },
};

const returns = {
  all: () => load().returns,
  byId: (id) => load().returns.find((r) => r.id === id) || null,
  byOrder: (orderId) => load().returns.filter((r) => r.orderId === orderId),
  byUser: (userId) => load().returns.filter((r) => r.userId === userId),
  insert: (r) => { load().returns.unshift(r); saveNow(); return r; },
  nextId: () => 'RT' + (++load().counters.return),
};

/** OTP dùng cho quên mật khẩu & xác minh email. Chỉ lưu HASH, không lưu mã gốc. */
const otps = {
  all: () => load().otps,
  find: (email, purpose) => {
    const e = String(email || '').toLowerCase();
    return load().otps.find((o) => o.email === e && o.purpose === purpose) || null;
  },
  put: (rec) => {
    const d = load();
    const i = d.otps.findIndex((o) => o.email === rec.email && o.purpose === rec.purpose);
    if (i >= 0) d.otps[i] = rec; else d.otps.push(rec);
    saveNow();
    return rec;
  },
  remove: (email, purpose) => {
    const d = load();
    const e = String(email || '').toLowerCase();
    const i = d.otps.findIndex((o) => o.email === e && o.purpose === purpose);
    if (i >= 0) { d.otps.splice(i, 1); saveNow(); }
  },
  /** Dọn OTP đã hết hạn — gọi định kỳ để bảng không phình */
  purgeExpired: () => {
    const d = load();
    const now = Date.now();
    const before = d.otps.length;
    d.otps = d.otps.filter((o) => o.expiresAt > now);
    if (d.otps.length !== before) save();
  },
};

const emails = {
  all: () => load().emails || [],
  byId: (id) => (load().emails || []).find((e) => e.id === id) || null,
  insert: (rec) => {
    const d = load();
    if (!Array.isArray(d.emails)) d.emails = [];
    d.emails.unshift(rec);
    d.emails = d.emails.slice(0, 200);
    // Ghi ngay thay vì gom lại: đây là bằng chứng đã gửi email cho khách, mất đi
    // khi máy chủ dừng đột ngột sẽ không tra cứu lại được.
    saveNow();
    return rec;
  },
};

/** Tin nhắn liên hệ từ khách gửi qua trang Liên hệ */
const messages = {
  all: () => load().messages || [],
  byId: (id) => (load().messages || []).find((m) => m.id === id) || null,
  insert: (msg) => {
    const d = load();
    if (!Array.isArray(d.messages)) d.messages = [];
    d.messages.unshift(msg);
    d.messages = d.messages.slice(0, 500);
    saveNow();
    return msg;
  },
};

module.exports = {
  load, save, saveNow, uid, transaction, makeSku,
  users, products, orders, vouchers, returns, otps, emails, messages,
  SCHEMA_VERSION, connect: store.connect, close: store.close, run: store.run,
  middleware: store.middleware, track: store.track, status: store.status, models: store.models,
};

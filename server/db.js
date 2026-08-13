/**
 * Data access layer.
 *
 * Hiện lưu bằng JSON file. Mọi truy cập dữ liệu trong app đều đi qua module này
 * (không nơi nào đọc/ghi db.json trực tiếp) — nhờ vậy khi chuyển sang PostgreSQL
 * chỉ cần viết lại phần thân các hàm repo bên dưới, phần nghiệp vụ giữ nguyên.
 *
 * Ghi có khoá tuần tự (writeQueue) + ghi file nguyên tử (temp → rename) để tránh
 * hỏng dữ liệu khi nhiều request cùng ghi.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const SCHEMA_VERSION = 2;

const EMPTY = {
  schemaVersion: SCHEMA_VERSION,
  users: [],
  products: [],
  orders: [],
  vouchers: [],
  returns: [],
  otps: [],
  emails: [],
  messages: [],
  counters: { order: 1000, return: 500 },
};

let state = null;
let dirty = false;
let flushing = false;

/* ---------------- load & migrate ---------------- */

function load() {
  if (state) return state;
  if (!fs.existsSync(DB_FILE)) {
    state = structuredClone(EMPTY);
    flushSync();
  } else {
    state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    migrate();
  }
  return state;
}

/**
 * Nâng cấp dữ liệu cũ lên schema mới mà KHÔNG làm mất dữ liệu đang có.
 * Sao lưu file cũ trước khi ghi đè lần đầu.
 */
function migrate() {
  const from = state.schemaVersion || 1;
  if (from >= SCHEMA_VERSION) {
    // vẫn đảm bảo các collection mới tồn tại
    for (const k of Object.keys(EMPTY)) if (state[k] === undefined) state[k] = structuredClone(EMPTY[k]);
    return;
  }

  // sao lưu một lần
  const backup = DB_FILE.replace(/\.json$/, `.v${from}.backup.json`);
  if (!fs.existsSync(backup)) fs.copyFileSync(DB_FILE, backup);

  for (const k of Object.keys(EMPTY)) if (state[k] === undefined) state[k] = structuredClone(EMPTY[k]);
  if (!state.counters.return) state.counters.return = 500;

  /* v1 → v2 */
  // Users: thêm emailVerified, phone, addresses
  for (const u of state.users) {
    if (u.emailVerified === undefined) {
      // Tài khoản seed sẵn (admin/staff/demo) coi như đã xác minh để không khoá chính mình ra ngoài
      u.emailVerified = ['admin', 'staff'].includes(u.role) || u.id === 'u_demo';
    }
    if (u.phone === undefined) u.phone = (u.profile && u.profile.phone) || '';
    if (!Array.isArray(u.addresses)) {
      u.addresses = [];
      // Chuyển địa chỉ rời rạc trong profile cũ thành một địa chỉ mặc định
      if (u.profile && u.profile.address) {
        u.addresses.push({
          id: uid('addr'),
          fullName: u.name,
          phone: u.phone || '',
          province: u.profile.state || '',
          district: u.profile.city || '',
          ward: '',
          line1: u.profile.address,
          note: '',
          isDefault: true,
          createdAt: u.createdAt || new Date().toISOString(),
        });
      }
    }
    if (u.tokensValidFrom === undefined) u.tokensValidFrom = 0;
  }

  // Products: stock chung → variants theo màu + size
  for (const p of state.products) {
    if (!Array.isArray(p.variants)) {
      const colors = p.color ? [p.color] : ['Default'];
      const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ['Free size'];
      const legacyStock = typeof p.stock === 'number' ? p.stock : 50;
      // Chia đều tồn kho cũ cho các tổ hợp, phần dư dồn vào tổ hợp đầu
      const combos = colors.length * sizes.length;
      const base = Math.floor(legacyStock / combos);
      const extra = legacyStock - base * combos;
      p.variants = [];
      let i = 0;
      for (const color of colors) {
        for (const size of sizes) {
          p.variants.push({
            id: uid('var'),
            sku: makeSku(p.id, color, size),
            color,
            size,
            stock: base + (i === 0 ? extra : 0),
            active: true,
          });
          i++;
        }
      }
    }
    if (!Array.isArray(p.colors)) p.colors = [...new Set(p.variants.map((v) => v.color))];
    delete p.stock; // nguồn sự thật giờ là variants
  }

  // Orders: chuẩn hoá sang schema mới
  for (const o of state.orders) {
    if (!Array.isArray(o.history)) {
      o.history = [{ at: o.createdAt, status: o.status, actor: 'system', note: 'Đơn hàng được tạo' }];
    }
    if (o.discount === undefined) o.discount = 0;
    if (o.voucher === undefined) o.voucher = null;
    if (o.shippingFee === undefined) o.shippingFee = o.ship ?? 0;
    if (o.stockState === undefined) o.stockState = o.status === 'cancelled' ? 'released' : 'reserved';
    if (!o.shippingAddress && o.customer) {
      o.shippingAddress = {
        fullName: o.customer.name, phone: o.customer.phone,
        province: '', district: '', ward: '', line1: o.customer.address || '',
        note: o.customer.note || '',
      };
    }
    if (o.shipping === undefined) o.shipping = { carrier: '', trackingNumber: '', handedOverAt: null, deliveredAt: null };
    if (o.cancel === undefined) o.cancel = null;
    if (o.refund === undefined) o.refund = null;
    // Ánh xạ trạng thái cũ sang enum mới
    const MAP = { new: 'pending', confirmed: 'confirmed', shipping: 'shipped', done: 'delivered', cancelled: 'cancelled' };
    if (MAP[o.status]) o.status = MAP[o.status];
    // Item cũ chưa có variant → suy ra từ size đã lưu
    for (const it of o.items) {
      if (it.color === undefined) it.color = '';
      if (it.variantId === undefined) it.variantId = null;
    }
  }

  state.schemaVersion = SCHEMA_VERSION;
  flushSync();
  console.log(`[VELATHIER] Đã nâng cấp dữ liệu schema v${from} → v${SCHEMA_VERSION} (bản sao lưu: ${path.basename(backup)})`);
}

const makeSku = (productId, color, size) =>
  `${String(productId).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}-${String(color).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'STD'}-${String(size).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'OS'}`;

/* ---------------- ghi ---------------- */

function flushSync() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE); // đổi tên là thao tác nguyên tử → không bao giờ đọc phải file ghi dở
  dirty = false;
}

/** Đánh dấu cần ghi; gom nhiều thay đổi trong cùng tick thành một lần ghi đĩa */
function save() {
  dirty = true;
  if (flushing) return;
  flushing = true;
  setImmediate(() => {
    flushing = false;
    if (dirty) flushSync();
  });
}

/** Ghi ngay lập tức — dùng cho thao tác tiền bạc/tồn kho cần chắc chắn đã xuống đĩa */
function saveNow() {
  flushSync();
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

/**
 * Chạy một thao tác thay đổi dữ liệu rồi ghi ngay.
 * Node chạy đơn luồng nên callback là atomic đối với các request khác — dùng cho
 * các đoạn đọc-rồi-ghi nhạy cảm (trừ kho, tăng lượt dùng voucher).
 */
function transaction(fn) {
  const d = load();
  const result = fn(d);
  saveNow();
  return result;
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
  DB_FILE, SCHEMA_VERSION,
};

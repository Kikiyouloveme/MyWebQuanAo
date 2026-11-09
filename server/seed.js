/**
 * Tạo dữ liệu khởi tạo cho VELATHIER.
 * Chạy: npm run seed (chỉ tạo khi database trống)
 */
require('./config');
const bcrypt = require('bcryptjs');
const db = require('./db');

const ROUNDS = 12;
const now = () => new Date().toISOString();

/**
 * Dựng sản phẩm kèm biến thể: mỗi tổ hợp màu × size có tồn kho riêng.
 * @param {object} spec
 * @param {Array<{color: string, stock: Record<string, number>}>} spec.colorways
 */
function product({ id, title, price, cat, colorways, compareAtPrice = null, badge = null, tags = [], desc }) {
  const variants = [];
  for (const cw of colorways) {
    for (const [size, stock] of Object.entries(cw.stock)) {
      variants.push({
        id: db.uid('var'),
        sku: db.makeSku(id, cw.color, size),
        color: cw.color,
        size,
        stock,
        active: true,
      });
    }
  }
  return {
    id, title, price, compareAtPrice, cat, badge, tags, desc,
    variants,
    colors: colorways.map((c) => c.color),
    sizes: [...new Set(variants.map((v) => v.size))],
    img: `/assets/img/p/${id}.svg`,
    img2: `/assets/img/p/${id}b.svg`,
    active: true,
    createdAt: now(),
  };
}

const APPAREL = { S: 12, M: 18, L: 15, XL: 8 };
const APPAREL_XXL = { S: 10, M: 16, L: 14, XL: 9, XXL: 5 };
const PANTS = { 28: 8, 30: 14, 32: 12, 34: 7, 36: 4 };

const products = [
  product({
    id: 'tee-boxy-01', title: 'Áo Thun Boxy Signature Stamp', price: 320000, cat: 'tops',
    badge: 'Mới', tags: ['womens', 'summer'],
    desc: 'Áo thun form boxy, cotton compact 240gsm không xù. In lụa signature ở ngực trái, cổ bo dày giữ phom qua nhiều lần giặt.',
    colorways: [
      { color: 'Kem', stock: APPAREL },
      { color: 'Đen', stock: APPAREL },
      { color: 'Xanh rêu', stock: { S: 6, M: 9, L: 7, XL: 0 } },
    ],
  }),
  product({
    id: 'tee-heavy-02', title: 'Áo Thun Heavyweight Tonal Logo', price: 350000, cat: 'tops',
    desc: 'Cotton 280gsm dày dặn, đứng phom. Logo thêu tonal cùng tông, đường may đôi ở vai và gấu tăng độ bền.',
    colorways: [
      { color: 'Đen', stock: APPAREL_XXL },
      { color: 'Trắng', stock: APPAREL_XXL },
    ],
  }),
  product({
    id: 'shirt-flannel-03', title: 'Sơ Mi Khoác Flannel Kẻ Chìm', price: 520000, cat: 'tops',
    compareAtPrice: 650000, badge: 'Mới', tags: ['sale'],
    desc: 'Sơ mi khoác chất flannel dệt caro chìm, mềm và ấm. Hai túi ngực có nắp, cúc kim loại phủ mờ.',
    colorways: [
      { color: 'Nâu đất', stock: { M: 9, L: 11, XL: 6 } },
      { color: 'Xanh navy', stock: { M: 7, L: 8, XL: 4 } },
    ],
  }),
  product({
    id: 'hoodie-mono-04', title: 'Áo Hoodie Mono Dập Nổi', price: 650000, cat: 'outerwear',
    compareAtPrice: 790000, badge: 'Bán chạy', tags: ['sale'],
    desc: 'Hoodie nỉ bông 380gsm, lót lông cừu mềm. Logo dập nổi ở ngực, mũ hai lớp có dây rút bọc kim loại.',
    colorways: [
      { color: 'Đen', stock: APPAREL },
      { color: 'Xám tiêu', stock: APPAREL },
      { color: 'Kem', stock: { S: 4, M: 6, L: 5, XL: 2 } },
    ],
  }),
  product({
    id: 'jacket-coach-05', title: 'Áo Khoác Coach Ripstop', price: 780000, cat: 'outerwear',
    tags: ['summer'],
    desc: 'Áo khoác coach vải ripstop chống nước nhẹ, cản gió tốt. Cúc bấm toàn thân, lót lưới thoáng khí.',
    colorways: [
      { color: 'Xanh olive', stock: { M: 8, L: 10, XL: 5 } },
      { color: 'Đen', stock: { M: 6, L: 9, XL: 4 } },
    ],
  }),
  product({
    id: 'varsity-06', title: 'Áo Khoác Varsity Phối Hai Tông', price: 1150000, cat: 'outerwear',
    badge: 'Mới',
    desc: 'Varsity phối hai tông, thân nỉ dày và tay da PU. Bo cổ tay dệt kim, cúc bấm đồng nguyên khối.',
    colorways: [
      { color: 'Kem / Đen', stock: { S: 4, M: 7, L: 5 } },
      { color: 'Navy / Trắng', stock: { S: 3, M: 5, L: 4 } },
    ],
  }),
  product({
    id: 'pants-wide-07', title: 'Quần Ống Rộng Xếp Ly Đôi', price: 540000, cat: 'bottoms',
    tags: ['womens'],
    desc: 'Quần ống rộng xếp ly đôi, vải tici đứng form ít nhăn. Cạp lưng có chun sau tăng thoải mái khi ngồi lâu.',
    colorways: [
      { color: 'Đen', stock: PANTS },
      { color: 'Be', stock: { 28: 5, 30: 9, 32: 8, 34: 4, 36: 2 } },
    ],
  }),
  product({
    id: 'pants-cargo-08', title: 'Quần Cargo Túi Hộp Cúc Bấm', price: 590000, cat: 'bottoms',
    compareAtPrice: 690000, badge: 'Bán chạy', tags: ['sale'],
    desc: 'Cargo dáng straight, túi hộp có nắp cúc bấm. Vải cotton twill dày, phần gối gia cố tăng độ bền.',
    colorways: [
      { color: 'Xanh olive', stock: PANTS },
      { color: 'Đen', stock: PANTS },
    ],
  }),
  product({
    id: 'shorts-sweat-09', title: 'Quần Short Nỉ Gấu Cắt Raw', price: 330000, cat: 'bottoms',
    compareAtPrice: 390000, tags: ['summer', 'sale'],
    desc: 'Quần short nỉ chân cua, gấu cắt raw không viền. Cạp chun kèm dây rút, hai túi dọc sâu.',
    colorways: [
      { color: 'Xám tiêu', stock: APPAREL },
      { color: 'Đen', stock: APPAREL },
    ],
  }),
  product({
    id: 'cap-6panel-10', title: 'Mũ 6 Panel Khóa Kim Loại', price: 260000, cat: 'accessories',
    tags: ['summer'],
    desc: 'Mũ 6 mảnh phom cổ điển, khóa kim loại điều chỉnh. Lưỡi trai cong sẵn, lót thấm hút mồ hôi.',
    colorways: [
      { color: 'Đen', stock: { 'Free size': 30 } },
      { color: 'Kem', stock: { 'Free size': 22 } },
      { color: 'Xanh olive', stock: { 'Free size': 0 } },
    ],
  }),
  product({
    id: 'tote-canvas-11', title: 'Túi Tote Canvas 16oz', price: 240000, cat: 'accessories',
    badge: 'Mới', tags: ['womens', 'summer'],
    desc: 'Túi tote canvas 16oz dày, đứng dáng. Quai bản rộng may gia cố chữ X, có túi trong đựng điện thoại.',
    colorways: [
      { color: 'Kem', stock: { 'Free size': 40 } },
      { color: 'Đen', stock: { 'Free size': 35 } },
    ],
  }),
  product({
    id: 'socks-crew-12', title: 'Tất Cổ Trung 2 Đôi', price: 120000, cat: 'accessories',
    tags: ['womens'],
    desc: 'Set 2 đôi tất cổ trung, cotton pha spandex ôm chân. Gân dệt logo ở cổ, đế tăng cường chống mài mòn.',
    colorways: [
      { color: 'Đen / Trắng', stock: { '39-42': 50, '43-46': 40 } },
    ],
  }),
];

const users = [
  {
    id: 'u_admin', name: 'Quản trị viên', email: 'admin@velathier.vn',
    phone: '0901000001', pass: bcrypt.hashSync('admin123', ROUNDS),
    role: 'admin', emailVerified: true, avatarId: 3, addresses: [], tokensValidFrom: Date.now(), createdAt: now(),
  },
  {
    id: 'u_staff', name: 'Nhân viên bán hàng', email: 'staff@velathier.vn',
    phone: '0901000002', pass: bcrypt.hashSync('staff123', ROUNDS),
    role: 'staff', emailVerified: true, avatarId: 2, addresses: [], tokensValidFrom: Date.now(), createdAt: now(),
  },
  {
    id: 'u_demo', name: 'Khách Thử Nghiệm', email: 'khach@velathier.vn',
    phone: '0901000003', pass: bcrypt.hashSync('khach123', ROUNDS),
    role: 'customer', emailVerified: true, avatarId: 1, tokensValidFrom: Date.now(), createdAt: now(),
    addresses: [{
      id: db.uid('addr'), fullName: 'Khách Thử Nghiệm', phone: '0901000003',
      province: 'TP. Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé',
      line1: '12 Nguyễn Huệ', note: '', isDefault: true, createdAt: now(),
    }],
  },
];

const inOneMonth = new Date(Date.now() + 30 * 86400000).toISOString();
const inThreeMonths = new Date(Date.now() + 90 * 86400000).toISOString();

const vouchers = [
  {
    id: db.uid('vc'), code: 'WELCOME10', percentage: 10,
    description: 'Giảm 10% cho đơn hàng đầu tiên',
    minOrderValue: 0, maxDiscount: 150000,
    usageLimit: null, perUserLimit: 1,
    active: true, public: true,
    startsAt: null, expiresAt: inThreeMonths,
    usedCount: 0, usedBy: [], createdAt: now(),
  },
  {
    id: db.uid('vc'), code: 'FREESHIP', percentage: 5,
    description: 'Giảm 5% cho đơn từ 500.000₫',
    minOrderValue: 500000, maxDiscount: 100000,
    usageLimit: 500, perUserLimit: 2,
    active: true, public: true,
    startsAt: null, expiresAt: inOneMonth,
    usedCount: 0, usedBy: [], createdAt: now(),
  },
  {
    id: db.uid('vc'), code: 'SALE20', percentage: 20,
    description: 'Giảm 20% cho đơn từ 1.000.000₫',
    minOrderValue: 1000000, maxDiscount: 400000,
    usageLimit: 100, perUserLimit: 1,
    active: true, public: true,
    startsAt: null, expiresAt: inOneMonth,
    usedCount: 0, usedBy: [], createdAt: now(),
  },
];

/* ---------------- ghi dữ liệu ---------------- */

async function seed() {
await db.connect();
await db.run(() => {
const data = db.load();
if (Object.keys(db.models).filter((key) => key !== 'metadata').some((key) => data[key].length)) {
  throw new Error('Database đã có dữ liệu. Seed bị hủy để bảo toàn dữ liệu; hãy chọn database trống trong MONGO_URI.');
}
data.schemaVersion = db.SCHEMA_VERSION;
data.products = products;
data.users = users;
data.vouchers = vouchers;
data.orders = [];
data.returns = [];
data.otps = [];
data.emails = [];
data.counters = { order: 1000, return: 500 };
db.saveNow();
});

const totalStock = products.reduce((s, p) => s + p.variants.reduce((t, v) => t + v.stock, 0), 0);
const totalVariants = products.reduce((s, p) => s + p.variants.length, 0);

console.log(`\nĐã tạo dữ liệu khởi tạo:`);
console.log(`  ${products.length} sản phẩm · ${totalVariants} phiên bản · ${totalStock} sản phẩm trong kho`);
console.log(`  ${vouchers.length} mã giảm giá: ${vouchers.map((v) => v.code).join(', ')}`);
console.log(`  ${users.length} tài khoản:`);
console.log(`    Admin  admin@velathier.vn / admin123`);
console.log(`    Staff  staff@velathier.vn / staff123`);
console.log(`    Khách  khach@velathier.vn / khach123\n`);

}
seed().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());

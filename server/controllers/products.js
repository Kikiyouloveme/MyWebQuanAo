/**
 * Sản phẩm — API công khai để duyệt/mua và API quản trị để CRUD biến thể.
 * Tồn kho nằm ở từng biến thể (màu + size), không còn trường `stock` chung.
 */

const db = require('../db');
const inventory = require('../inventory');
const { v, badRequest, notFound } = require('../security');

const CATEGORIES = ['tops', 'bottoms', 'outerwear', 'accessories'];

/** Thêm thông tin tồn kho tổng hợp để client hiển thị mà không lộ dữ liệu nội bộ */
function decorate(product) {
  const variants = (product.variants || []).filter((x) => x.active !== false);
  return {
    ...product,
    variants,
    colors: [...new Set(variants.map((x) => x.color))],
    sizes: [...new Set(variants.map((x) => x.size))],
    totalStock: inventory.totalStock(product),
    inStock: inventory.totalStock(product) > 0,
  };
}

/* ==================== CÔNG KHAI ==================== */

const get = async (req, res) => {
  const { cat, tag, q, sort, limit } = req.query;
  let list = await db.models.products.find({active:{$ne:false}}).select('-_id -__v').lean();

  if (cat && cat !== 'all') list = list.filter((p) => p.cat === cat);
  if (tag) list = list.filter((p) => Array.isArray(p.tags) && p.tags.includes(String(tag)));
  if (q) {
    const needle = String(q).toLowerCase().slice(0, 80);
    list = list.filter((p) =>
      p.title.toLowerCase().includes(needle) || (p.desc || '').toLowerCase().includes(needle)
    );
  }

  if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
  else if (sort === 'newest') list = [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const max = limit ? Math.min(Number(limit) || 0, 100) : 0;
  res.set('Cache-Control', 'public, max-age=30');
  res.json((max ? list.slice(0, max) : list).map(decorate));
};

const getId = async (req, res) => {
  const product = await db.models.products.findOne({id:req.params.id,active:{$ne:false}}).select('-_id -__v').lean();
  if (!product || product.active === false) throw notFound('Không tìm thấy sản phẩm');
  res.set('Cache-Control', 'public, max-age=30');
  res.json(decorate(product));
};

/* ==================== QUẢN TRỊ ==================== */

/** Danh sách đầy đủ cho admin — gồm cả sản phẩm đã ẩn và biến thể ngừng bán */
const getAdminAll = async (_req, res) => {
  res.json(db.products.all().map((p) => ({ ...p, totalStock: inventory.totalStock(p) })));
};

/** Chuẩn hoá danh sách biến thể gửi lên từ form admin */
function readVariants(input, productId, existing = []) {
  if (!Array.isArray(input) || !input.length) {
    throw badRequest('Sản phẩm phải có ít nhất một phiên bản (màu + size)');
  }
  if (input.length > 60) throw badRequest('Tối đa 60 phiên bản cho mỗi sản phẩm');

  const seen = new Set();
  return input.map((raw) => {
    const color = v.str(raw.color, 'màu sắc', { min: 1, max: 40 });
    const size = v.str(raw.size, 'size', { min: 1, max: 20 });
    const key = `${color}|${size}`.toLowerCase();
    if (seen.has(key)) throw badRequest(`Trùng phiên bản: ${color} / ${size}`);
    seen.add(key);

    // Giữ nguyên id của biến thể đã tồn tại để đơn hàng cũ không mất liên kết
    const prior = existing.find((e) => e.id === raw.id)
      || existing.find((e) => e.color === color && e.size === size);

    return {
      id: prior ? prior.id : db.uid('var'),
      sku: v.str(raw.sku, 'SKU', { required: false, max: 40 }) || db.makeSku(productId, color, size),
      color,
      size,
      stock: v.int(raw.stock ?? 0, 'tồn kho', { min: 0, max: 100000 }),
      active: raw.active !== false,
    };
  });
}

function readProductBody(body, productId, existingVariants = []) {
  const data = {
    title: v.str(body.title, 'tên sản phẩm', { min: 2, max: 200 }),
    price: v.int(body.price, 'giá', { min: 1000, max: 500000000 }),
    cat: v.oneOf(body.cat || 'tops', CATEGORIES, 'danh mục'),
    desc: v.str(body.desc, 'mô tả', { required: false, max: 4000 }),
    badge: v.str(body.badge, 'nhãn', { required: false, max: 30 }) || null,
    tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 10) : [],
    active: body.active !== false,
  };

  if (body.compareAtPrice) {
    data.compareAtPrice = v.int(body.compareAtPrice, 'giá gốc', { min: 1000, max: 500000000 });
    if (data.compareAtPrice <= data.price) throw badRequest('Giá gốc phải lớn hơn giá bán');
  } else {
    data.compareAtPrice = null;
  }

  data.variants = readVariants(body.variants, productId, existingVariants);
  data.colors = [...new Set(data.variants.map((x) => x.color))];
  data.sizes = [...new Set(data.variants.map((x) => x.size))];
  return data;
}

const post = async (req, res) => {
  const id = db.uid('p');
  const data = readProductBody(req.body, id);
  const product = {
    id,
    ...data,
    img: v.str(req.body.img, 'ảnh', { required: false, max: 300 }) || '/assets/img/p/placeholder.svg',
    img2: v.str(req.body.img2, 'ảnh phụ', { required: false, max: 300 }) || req.body.img || '/assets/img/p/placeholder.svg',
    createdAt: new Date().toISOString(),
  };
  db.products.insert(product);
  res.status(201).json(product);
};

const putId = async (req, res) => {
  const product = db.products.byId(req.params.id);
  if (!product) throw notFound('Không tìm thấy sản phẩm');

  const data = readProductBody(req.body, product.id, product.variants || []);
  db.transaction(() => {
    Object.assign(product, data, { updatedAt: new Date().toISOString() });
    if (req.body.img) product.img = String(req.body.img).slice(0, 300);
    if (req.body.img2) product.img2 = String(req.body.img2).slice(0, 300);
  });

  res.json(product);
};

/** Cập nhật nhanh tồn kho một biến thể — dùng cho bảng kho ở admin */
const putIdVariantsVariantIdStock = async (req, res) => {
  const product = db.products.byId(req.params.id);
  if (!product) throw notFound('Không tìm thấy sản phẩm');
  const variant = db.products.variantById(product, req.params.variantId);
  if (!variant) throw notFound('Không tìm thấy phiên bản');

  const stock = v.int(req.body.stock, 'tồn kho', { min: 0, max: 100000 });
  db.transaction(() => { variant.stock = stock; product.updatedAt = new Date().toISOString(); });
  res.json(variant);
};

const deleteId = async (req, res) => {
  const product = db.products.byId(req.params.id);
  if (!product) throw notFound('Không tìm thấy sản phẩm');

  // Sản phẩm đã từng được đặt thì ẩn đi thay vì xoá — giữ toàn vẹn dữ liệu đơn hàng cũ
  const referenced = db.orders.all().some((o) => o.items.some((i) => i.productId === product.id));
  if (referenced) {
    db.transaction(() => { product.active = false; product.updatedAt = new Date().toISOString(); });
    return res.json({ ok: true, archived: true, message: 'Sản phẩm đã có trong đơn hàng nên được ẩn thay vì xoá' });
  }

  db.products.remove(product.id);
  res.json({ ok: true, archived: false });
};

module.exports = { get, getId, getAdminAll, post, putId, putIdVariantsVariantIdStock, deleteId, decorate, CATEGORIES };

/**
 * Mã giảm giá — chỉ giảm theo phần trăm, tối đa 1 mã mỗi đơn.
 * Số tiền giảm luôn do server tính (xem pricing.js), client không tự quyết định.
 */

const db = require('../db');
const pricing = require('../pricing');
const { v, badRequest, notFound, conflict } = require('../security');

/** Bản rút gọn cho khách — không lộ số lượt đã dùng của người khác */
const publicVoucher = (voucher, discount) => ({
  code: voucher.code,
  percentage: voucher.percentage,
  maxDiscount: voucher.maxDiscount || null,
  minOrderValue: voucher.minOrderValue || 0,
  description: voucher.description || '',
  discount,
});

/* ==================== KHÁCH HÀNG ==================== */

/**
 * Kiểm tra mã với giá trị đơn hiện tại.
 * Nhận subtotal do client gửi CHỈ để xem trước — khi đặt hàng thật, server tính lại
 * từ giỏ hàng nên khách không thể lợi dụng con số này.
 */
const postValidate = async (req, res) => {
  const code = v.code(req.body.code);
  const subtotal = v.int(req.body.subtotal ?? 0, 'giá trị đơn hàng', { min: 0 });

  const result = pricing.validateVoucher(code, subtotal, req.user.id);
  if (!result.ok) {
    return res.status(400).json({
      error: result.message,
      reason: result.reason,
      shortBy: result.shortBy || 0,
    });
  }

  res.json({ ok: true, voucher: publicVoucher(result.voucher, result.discount) });
};

/** Mã đang chạy — hiển thị gợi ý ở trang giỏ hàng/checkout */
const getAvailable = async (_req, res) => {
  const now = Date.now();
  const list = db.vouchers.all()
    .filter((x) =>
      x.active
      && x.public !== false
      && (!x.startsAt || now >= new Date(x.startsAt).getTime())
      && (!x.expiresAt || now <= new Date(x.expiresAt).getTime())
      && (!x.usageLimit || (x.usedCount || 0) < x.usageLimit)
    )
    .map((x) => ({
      code: x.code,
      percentage: x.percentage,
      minOrderValue: x.minOrderValue || 0,
      maxDiscount: x.maxDiscount || null,
      description: x.description || '',
      expiresAt: x.expiresAt || null,
    }));
  res.json(list);
};

/* ==================== QUẢN TRỊ ==================== */

const get = async (_req, res) => {
  res.json(db.vouchers.all().map((x) => ({ ...x, usedBy: undefined, usedByCount: (x.usedBy || []).length })));
};

function readVoucherBody(body) {
  const percentage = v.int(body.percentage, 'phần trăm giảm', { min: 1, max: 100 });
  const data = {
    percentage,
    description: v.str(body.description, 'mô tả', { required: false, max: 200 }),
    minOrderValue: body.minOrderValue ? v.int(body.minOrderValue, 'giá trị đơn tối thiểu', { min: 0 }) : 0,
    maxDiscount: body.maxDiscount ? v.int(body.maxDiscount, 'mức giảm tối đa', { min: 1000 }) : null,
    usageLimit: body.usageLimit ? v.int(body.usageLimit, 'tổng lượt dùng', { min: 1 }) : null,
    perUserLimit: body.perUserLimit ? v.int(body.perUserLimit, 'lượt dùng mỗi khách', { min: 1 }) : 1,
    active: body.active !== false,
    public: body.public !== false,
    startsAt: body.startsAt ? new Date(body.startsAt).toISOString() : null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt).toISOString() : null,
  };

  if (data.startsAt && data.expiresAt && new Date(data.startsAt) >= new Date(data.expiresAt)) {
    throw badRequest('Ngày bắt đầu phải trước ngày hết hạn');
  }
  return data;
}

const post = async (req, res) => {
  const code = v.code(req.body.code);
  if (db.vouchers.byCode(code)) throw conflict('Mã giảm giá này đã tồn tại');

  const voucher = {
    id: db.uid('vc'),
    code,
    ...readVoucherBody(req.body),
    usedCount: 0,
    usedBy: [],
    createdAt: new Date().toISOString(),
  };
  db.vouchers.insert(voucher);
  res.status(201).json(voucher);
};

const putId = async (req, res) => {
  const voucher = db.vouchers.byId(req.params.id);
  if (!voucher) throw notFound('Không tìm thấy mã giảm giá');

  const data = readVoucherBody(req.body);
  db.transaction(() => {
    Object.assign(voucher, data, { updatedAt: new Date().toISOString() });
    // Mã đã phát ra ngoài thì không cho đổi — tránh đơn cũ tham chiếu sai
  });
  res.json(voucher);
};

const deleteId = async (req, res) => {
  const voucher = db.vouchers.byId(req.params.id);
  if (!voucher) throw notFound('Không tìm thấy mã giảm giá');

  // Mã đã được dùng thì chỉ tắt, không xoá — đơn cũ vẫn cần tra cứu được
  if ((voucher.usedCount || 0) > 0) {
    db.transaction(() => { voucher.active = false; });
    return res.json({ ok: true, deactivated: true, message: 'Mã đã được sử dụng nên chỉ được tắt, không xoá' });
  }

  db.vouchers.remove(voucher.id);
  res.json({ ok: true, deactivated: false });
};

module.exports = { postValidate, getAvailable, get, post, putId, deleteId, };

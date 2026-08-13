/**
 * Đơn hàng — tạo, xem, hủy.
 *
 * Nguyên tắc:
 *  - Bắt buộc đăng nhập + đã xác minh email mới được đặt hàng.
 *  - Mọi con số tiền do server tính lại từ database, không tin client.
 *  - Khách chỉ xem được đơn của chính mình; admin/staff xem được tất cả.
 */
const express = require('express');
const db = require('../db');
const pricing = require('../pricing');
const inventory = require('../inventory');
const mailer = require('../mailer');
const config = require('../config');
const {
  v, wrap, requireAuth, requireVerified, requireStaff, limiters,
  badRequest, forbidden, notFound,
} = require('../security');

const router = express.Router();

/** Vòng đời trạng thái đơn hàng */
const STATUS = {
  PENDING: 'pending',              // vừa tạo, chờ thanh toán / xác nhận
  CONFIRMED: 'confirmed',          // đã thanh toán hoặc shop đã xác nhận (COD)
  PROCESSING: 'processing',        // đang soạn hàng
  READY_TO_SHIP: 'ready_to_ship',  // đóng gói xong, chờ bàn giao
  SHIPPED: 'shipped',              // đã bàn giao đơn vị vận chuyển
  DELIVERED: 'delivered',          // giao thành công
  CANCELLED: 'cancelled',
  RETURN_REQUESTED: 'return_requested',
  RETURN_APPROVED: 'return_approved',
  RETURN_REJECTED: 'return_rejected',
  RETURNING: 'returning',
  RETURNED: 'returned',
  REFUND_PENDING: 'refund_pending',
  REFUNDED: 'refunded',
};

/** Khách được tự hủy cho tới trước khi đơn được bàn giao cho đơn vị vận chuyển */
const CUSTOMER_CANCELLABLE = [STATUS.PENDING, STATUS.CONFIRMED, STATUS.PROCESSING, STATUS.READY_TO_SHIP];

/** Trạng thái mà việc trừ kho cần được hoàn lại */
const RELEASES_STOCK = [STATUS.CANCELLED];

const ALL_STATUSES = Object.values(STATUS);

/**
 * Máy trạng thái đơn hàng — chỉ những bước chuyển liệt kê ở đây mới hợp lệ.
 *
 * Mục đích: chặn việc nhảy cóc trạng thái (ví dụ pending → delivered để né bước
 * thanh toán, hay confirmed → refunded để né quy trình đổi/trả). Trước đây API
 * quản trị nhận bất kỳ trạng thái nào nên có thể đặt tùy ý.
 *
 * Các bước chuyển do quy trình riêng đảm nhiệm (hủy đơn, thanh toán, đổi/trả)
 * KHÔNG nằm ở đây — chúng gọi applyTransition với cờ `internal`.
 */
const TRANSITIONS = {
  [STATUS.PENDING]:        [STATUS.CONFIRMED, STATUS.PROCESSING, STATUS.CANCELLED],
  [STATUS.CONFIRMED]:      [STATUS.PROCESSING, STATUS.READY_TO_SHIP, STATUS.CANCELLED],
  [STATUS.PROCESSING]:     [STATUS.READY_TO_SHIP, STATUS.CANCELLED],
  [STATUS.READY_TO_SHIP]:  [STATUS.SHIPPED, STATUS.CANCELLED],
  [STATUS.SHIPPED]:        [STATUS.DELIVERED],
  [STATUS.DELIVERED]:      [STATUS.RETURN_REQUESTED],
  [STATUS.RETURN_REQUESTED]: [STATUS.RETURN_APPROVED, STATUS.RETURN_REJECTED],
  [STATUS.RETURN_APPROVED]:  [STATUS.RETURNING, STATUS.RETURNED],
  [STATUS.RETURNING]:      [STATUS.RETURNED],
  [STATUS.RETURNED]:       [STATUS.REFUND_PENDING, STATUS.REFUNDED],
  [STATUS.REFUND_PENDING]: [STATUS.REFUNDED],
  // Trạng thái kết thúc — không đi tiếp được nữa
  [STATUS.RETURN_REJECTED]: [STATUS.DELIVERED],
  [STATUS.CANCELLED]:      [],
  [STATUS.REFUNDED]:       [],
};

/** Trạng thái mà đơn coi như đã đóng, không cho thao tác nghiệp vụ tiếp */
const TERMINAL_STATUSES = [STATUS.CANCELLED, STATUS.REFUNDED];

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

/** Danh sách bước tiếp theo hợp lệ — dùng để đổ dropdown ở giao diện quản trị */
const nextStatuses = (from) => TRANSITIONS[from] || [];

/**
 * Đổi trạng thái đơn hàng qua máy trạng thái.
 * @param {object} order
 * @param {string} to trạng thái đích
 * @param {object} opts
 * @param {boolean} opts.internal bỏ qua kiểm tra khi quy trình chuyên biệt gọi (hủy đơn, thanh toán, đổi/trả)
 */
function applyTransition(order, to, { internal = false } = {}) {
  if (order.status === to) return false;
  if (!internal && !canTransition(order.status, to)) {
    throw badRequest(
      `Không thể chuyển đơn hàng từ "${order.status}" sang "${to}". ` +
      `Bước hợp lệ tiếp theo: ${nextStatuses(order.status).join(', ') || 'không còn bước nào'}.`
    );
  }
  order.status = to;
  return true;
}

/** Ghi một mốc vào lịch sử đơn hàng */
function addHistory(order, { status, actor, actorId, note, visibleToCustomer = true }) {
  if (!Array.isArray(order.history)) order.history = [];
  order.history.push({
    at: new Date().toISOString(),
    status: status || order.status,
    actor,          // 'customer' | 'staff' | 'admin' | 'system'
    actorId: actorId || null,
    note: note || '',
    visibleToCustomer,
  });
}

/** Khách chỉ thấy các mốc được phép; admin thấy đầy đủ */
function viewFor(order, user) {
  const isStaff = user && ['admin', 'staff'].includes(user.role);
  if (isStaff) return order;

  const { refund, ...rest } = order;
  return {
    ...rest,
    history: (order.history || []).filter((h) => h.visibleToCustomer !== false),
    // Khách chỉ cần biết trạng thái hoàn tiền, không cần thông tin nội bộ
    refund: refund ? { status: refund.status, amount: refund.amount, method: refund.method, refundedAt: refund.refundedAt || null } : null,
  };
}

/** Lấy đơn và kiểm tra quyền truy cập — dùng chung cho mọi route theo :id */
function getAuthorizedOrder(req) {
  const order = db.orders.byId(req.params.id);
  // Trả 404 (không phải 403) khi không có quyền, để không tiết lộ mã đơn nào có thật
  if (!order) throw notFound('Không tìm thấy đơn hàng');
  const isStaff = ['admin', 'staff'].includes(req.user.role);
  if (!isStaff && order.userId !== req.user.id) throw notFound('Không tìm thấy đơn hàng');
  return order;
}

/* ==================== BÁO GIÁ (xem trước khi đặt) ==================== */

/**
 * Tính thử tổng tiền cho giỏ hàng hiện tại — checkout gọi để hiển thị.
 * Không tạo đơn, không trừ kho. Vẫn tính hoàn toàn ở server.
 */
router.post('/quote', requireAuth, wrap(async (req, res) => {
  const { lines, subtotal } = pricing.buildLines(req.body.items);
  const totals = pricing.computeTotals(subtotal, req.body.voucherCode, req.user.id);

  res.json({
    items: lines,
    subtotal: totals.subtotal,
    discount: totals.discount,
    discountedSubtotal: totals.discountedSubtotal,
    shippingFee: totals.shippingFee,
    total: totals.total,
    voucher: totals.voucher,
    voucherError: totals.voucherError ? totals.voucherError.message : null,
    freeShipping: totals.freeShipping,
    freeShippingShortBy: totals.freeShippingShortBy,
    freeShippingThreshold: config.shipping.freeThreshold,
  });
}));

/* ==================== TẠO ĐƠN ==================== */

router.post('/', requireVerified, limiters.write, wrap(async (req, res) => {
  const payMethod = v.oneOf(req.body.payMethod || 'cod', ['cod', 'vnpay'], 'phương thức thanh toán');

  // Cổng thanh toán không khả dụng thì từ chối ngay, không tạo đơn treo
  if (payMethod === 'vnpay' && !config.features.vnpayEnabled) {
    throw badRequest('Thanh toán trực tuyến hiện không khả dụng. Vui lòng chọn thanh toán khi nhận hàng.');
  }

  // Địa chỉ giao hàng: chọn từ sổ địa chỉ hoặc nhập trực tiếp
  let shippingAddress;
  if (req.body.addressId) {
    const saved = (req.user.addresses || []).find((a) => a.id === req.body.addressId);
    if (!saved) throw badRequest('Địa chỉ giao hàng không hợp lệ');
    shippingAddress = { ...saved };
    delete shippingAddress.isDefault;
  } else {
    const a = req.body.address || {};
    shippingAddress = {
      fullName: v.str(a.fullName, 'họ tên người nhận', { min: 2, max: 80 }),
      phone: v.phone(a.phone),
      province: v.str(a.province, 'Tỉnh/Thành phố', { max: 100 }),
      district: v.str(a.district, 'Quận/Huyện', { max: 100 }),
      ward: v.str(a.ward, 'Phường/Xã', { max: 100 }),
      line1: v.str(a.line1, 'địa chỉ chi tiết', { min: 3, max: 200 }),
      note: v.str(a.note, 'ghi chú', { required: false, max: 200 }),
    };
  }

  // Server dựng lại dòng hàng và tính tiền — bỏ qua hoàn toàn số liệu client gửi lên
  const { lines, subtotal } = pricing.buildLines(req.body.items);
  const totals = pricing.computeTotals(subtotal, req.body.voucherCode, req.user.id);

  // Client gửi voucher không dùng được thì báo lỗi rõ ràng thay vì âm thầm bỏ qua
  if (req.body.voucherCode && totals.voucherError) throw badRequest(totals.voucherError.message);

  const order = {
    id: db.orders.nextId(),
    userId: req.user.id,
    customerEmail: req.user.email,
    items: lines,
    shippingAddress,
    subtotal: totals.subtotal,
    discount: totals.discount,
    voucher: totals.voucher,
    shippingFee: totals.shippingFee,
    total: totals.total,
    payMethod,
    payStatus: 'pending',
    status: STATUS.PENDING,
    stockState: 'none',
    payment: null,
    shipping: { carrier: '', trackingNumber: '', handedOverAt: null, deliveredAt: null },
    cancel: null,
    refund: null,
    history: [],
    createdAt: new Date().toISOString(),
  };

  addHistory(order, { status: STATUS.PENDING, actor: 'customer', actorId: req.user.id, note: 'Đơn hàng được tạo' });

  // Trừ kho ngay khi tạo đơn (giữ hàng cho khách). Nếu không đủ hàng sẽ throw ở đây
  // và đơn chưa được lưu → không phát sinh đơn rác.
  inventory.reserve(order);

  // Ghi nhận lượt dùng voucher — làm sau khi giữ hàng thành công
  if (totals.voucher) {
    db.transaction(() => {
      const voucher = db.vouchers.byId(totals.voucher.id);
      if (voucher) {
        voucher.usedCount = (voucher.usedCount || 0) + 1;
        if (!Array.isArray(voucher.usedBy)) voucher.usedBy = [];
        voucher.usedBy.push(req.user.id);
      }
    });
  }

  db.orders.insert(order);
  mailer.send(req.user.email, 'orderPlaced', order);

  res.status(201).json(viewFor(order, req.user));
}));

/* ==================== XEM ĐƠN ==================== */

router.get('/mine', requireAuth, wrap(async (req, res) => {
  const list = db.orders.byUser(req.user.id).map((o) => viewFor(o, req.user));
  res.json(list);
}));

router.get('/:id', requireAuth, wrap(async (req, res) => {
  const order = getAuthorizedOrder(req);
  res.json(viewFor(order, req.user));
}));

/* ==================== HỦY ĐƠN ==================== */

router.post('/:id/cancel', requireAuth, limiters.write, wrap(async (req, res) => {
  const order = getAuthorizedOrder(req);
  const isStaff = ['admin', 'staff'].includes(req.user.role);
  const reason = v.str(req.body.reason, 'lý do hủy', { min: 3, max: 300 });

  if (order.status === STATUS.CANCELLED) throw badRequest('Đơn hàng đã được hủy trước đó');

  // Khách chỉ được hủy trước khi hàng bàn giao cho đơn vị vận chuyển. Admin linh hoạt hơn.
  if (!isStaff && !CUSTOMER_CANCELLABLE.includes(order.status)) {
    throw forbidden('Đơn hàng đã được bàn giao cho đơn vị vận chuyển nên không thể tự hủy. Vui lòng liên hệ cửa hàng để được hỗ trợ.');
  }
  if (isStaff && [STATUS.DELIVERED, STATUS.RETURNED, STATUS.REFUNDED].includes(order.status)) {
    throw badRequest('Không thể hủy đơn đã giao thành công. Hãy dùng quy trình đổi/trả hàng.');
  }

  db.transaction(() => {
    order.status = STATUS.CANCELLED;
    order.cancel = {
      reason,
      by: isStaff ? req.user.role : 'customer',
      byId: req.user.id,
      at: new Date().toISOString(),
    };
    addHistory(order, {
      status: STATUS.CANCELLED,
      actor: isStaff ? req.user.role : 'customer',
      actorId: req.user.id,
      note: `Hủy đơn: ${reason}`,
    });
  });

  // Hoàn kho — idempotent, gọi lại không cộng kho hai lần
  inventory.release(order, 'Đơn hàng bị hủy');

  // Trả lại lượt dùng voucher
  if (order.voucher) {
    db.transaction(() => {
      const voucher = db.vouchers.byId(order.voucher.id);
      if (voucher && voucher.usedCount > 0) {
        voucher.usedCount -= 1;
        const i = (voucher.usedBy || []).indexOf(order.userId);
        if (i >= 0) voucher.usedBy.splice(i, 1);
      }
    });
  }

  // Đơn đã thanh toán thì cần hoàn tiền — đánh dấu chờ xử lý
  if (order.payStatus === 'paid') {
    db.transaction(() => {
      order.refund = {
        status: 'pending',
        amount: order.total,
        method: order.payMethod === 'vnpay' ? 'vnpay' : 'bank_transfer',
        reason: 'Hoàn tiền do hủy đơn',
        requestedAt: new Date().toISOString(),
      };
      order.status = STATUS.REFUND_PENDING;
      addHistory(order, { status: STATUS.REFUND_PENDING, actor: 'system', note: 'Đơn đã thanh toán — chờ hoàn tiền' });
    });
  }

  db.saveNow();
  mailer.send(order.customerEmail, 'orderCancelled', order);
  res.json(viewFor(order, req.user));
}));

module.exports = {
  router, STATUS, ALL_STATUSES, CUSTOMER_CANCELLABLE, RELEASES_STOCK,
  TRANSITIONS, TERMINAL_STATUSES, canTransition, nextStatuses, applyTransition,
  addHistory, viewFor, getAuthorizedOrder,
};

/**
 * Quản trị — đơn hàng, khách hàng, thống kê, hộp thư.
 * Sản phẩm / voucher / đổi-trả nằm ở các router riêng.
 */
const express = require('express');
const db = require('../db');
const config = require('../config');
const mailer = require('../mailer');
const vnpay = require('../vnpay');
const inventory = require('../inventory');
const pricing = require('../pricing');
const { processRefund } = require('./returns');
const {
  v, wrap, requireStaff, requireAdmin, limiters, badRequest, notFound,
} = require('../security');
const {
  STATUS, ALL_STATUSES, TERMINAL_STATUSES, canTransition, nextStatuses, addHistory,
} = require('./orders');
const { publicUser } = require('./auth');

const router = express.Router();

/**
 * Doanh thu = tiền thực sự đã thu và CHƯA hoàn lại.
 *
 * Không dựa vào danh sách trạng thái vì dễ sai ở hai tình huống:
 *  - Yêu cầu trả hàng bị TỪ CHỐI: khách giữ hàng, shop giữ tiền → vẫn là doanh thu,
 *    nhưng trạng thái đơn lúc đó là return_rejected nên trước đây bị loại nhầm.
 *  - Hoàn tiền MỘT PHẦN: trước đây loại cả đơn, giờ chỉ trừ đúng phần đã hoàn.
 *
 * Đơn đã hủy không tính dù từng thanh toán (tiền sẽ được hoàn hoặc đã hoàn).
 */
function netRevenue(order) {
  if (order.payStatus !== 'paid') return 0;
  if (order.status === STATUS.CANCELLED) return 0;
  const collected = Number(order.total) || 0;
  const refunded = Number(order.refundedTotal) || 0;
  return Math.max(0, collected - refunded);
}

const isRevenue = (o) => netRevenue(o) > 0;

/* ==================== THỐNG KÊ ==================== */

router.get('/stats', requireStaff, wrap(async (_req, res) => {
  const orders = db.orders.all();
  const products = db.products.all();
  const returns = db.returns.all();

  const revenueOrders = orders.filter(isRevenue);
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const start30d = Date.now() - 30 * 86400000;

  // Doanh thu 30 ngày gần nhất, gộp theo ngày — dùng vẽ biểu đồ
  const dailyMap = new Map();
  for (const o of revenueOrders) {
    const t = new Date(o.createdAt).getTime();
    if (t < start30d) continue;
    const day = o.createdAt.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) || 0) + netRevenue(o));
  }
  const daily = [...dailyMap.entries()].sort().map(([date, revenue]) => ({ date, revenue }));

  // Sản phẩm bán chạy — trừ đi phần khách đã trả lại và đã được hoàn tiền
  const returnedQty = new Map();
  for (const ret of returns) {
    // Chỉ trừ khi hàng đã thực sự quay về kho; yêu cầu bị từ chối thì khách vẫn giữ hàng
    if (!['received', 'completed'].includes(ret.status)) continue;
    for (const item of ret.items) {
      returnedQty.set(item.variantId, (returnedQty.get(item.variantId) || 0) + item.qty);
    }
  }

  const sold = new Map();
  for (const o of revenueOrders) {
    for (const item of o.items) {
      const cur = sold.get(item.productId) || { title: item.title, qty: 0, revenue: 0 };
      const returned = Math.min(item.qty, returnedQty.get(item.variantId) || 0);
      const netQty = Math.max(0, item.qty - returned);
      cur.qty += netQty;
      // Tính theo số tiền THỰC thu cho phần hàng còn giữ lại — dùng đúng cách phân bổ
      // voucher như khi hoàn tiền, để tổng doanh thu theo sản phẩm khớp với doanh thu
      // chung thay vì bị thổi lên bằng giá niêm yết.
      cur.revenue += pricing.refundableAmount(o, [{ price: item.price, qty: netQty }]);
      sold.set(item.productId, cur);
    }
  }
  const topProducts = [...sold.entries()]
    .map(([id, x]) => ({ id, ...x }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const lowStock = products
    .filter((p) => p.active !== false && inventory.isLowStock(p))
    .map((p) => ({ id: p.id, title: p.title, totalStock: inventory.totalStock(p) }))
    .sort((a, b) => a.totalStock - b.totalStock)
    .slice(0, 10);

  res.json({
    products: products.length,
    activeProducts: products.filter((p) => p.active !== false).length,
    users: db.users.all().length,
    verifiedUsers: db.users.all().filter((u) => u.emailVerified).length,
    orders: orders.length,
    ordersToday: orders.filter((o) => new Date(o.createdAt) >= startOfToday).length,
    pendingOrders: orders.filter((o) => [STATUS.PENDING, STATUS.CONFIRMED, STATUS.PROCESSING].includes(o.status)).length,
    cancelledOrders: orders.filter((o) => o.status === STATUS.CANCELLED).length,
    // Tiền thực thu đã trừ phần hoàn — hoàn một phần chỉ trừ đúng phần đó
    revenue: revenueOrders.reduce((s, o) => s + netRevenue(o), 0),
    revenueToday: revenueOrders
      .filter((o) => new Date(o.createdAt) >= startOfToday)
      .reduce((s, o) => s + netRevenue(o), 0),
    // Tổng đã hoàn, cộng dồn qua nhiều lần hoàn của cùng một đơn
    refunded: orders.reduce((s, o) => s + (Number(o.refundedTotal) || 0), 0),
    // Khoản đã duyệt hoàn nhưng chưa chuyển tiền xong
    refundPending: orders
      .filter((o) => o.refund && o.refund.status !== 'refunded')
      .reduce((s, o) => s + (Number(o.refund.amount) || 0), 0),
    pendingReturns: returns.filter((r) => r.status === 'pending').length,
    rejectedReturns: returns.filter((r) => r.status === 'rejected').length,
    totalReturns: returns.length,
    vouchers: db.vouchers.all().filter((x) => x.active).length,
    lowStockCount: lowStock.length,
    lowStock,
    topProducts,
    daily,
    emails: db.emails.all().length,
    mailMode: mailer.isLive() ? 'smtp' : 'outbox',
    vnpayMode: vnpay.isLive() ? 'live' : 'sandbox',
  });
}));

/* ==================== ĐƠN HÀNG ==================== */

router.get('/orders', requireStaff, wrap(async (req, res) => {
  const { status, payStatus, q, limit } = req.query;
  let list = db.orders.all();

  if (status) list = list.filter((o) => o.status === status);
  if (payStatus) list = list.filter((o) => o.payStatus === payStatus);
  if (q) {
    const needle = String(q).toLowerCase().slice(0, 60);
    list = list.filter((o) =>
      o.id.toLowerCase().includes(needle)
      || (o.customerEmail || '').toLowerCase().includes(needle)
      || (o.shippingAddress?.fullName || '').toLowerCase().includes(needle)
      || (o.shippingAddress?.phone || '').includes(needle)
      || (o.shipping?.trackingNumber || '').toLowerCase().includes(needle)
    );
  }

  res.json(limit ? list.slice(0, Math.min(Number(limit) || 50, 500)) : list);
}));

router.get('/orders/:id', requireStaff, wrap(async (req, res) => {
  const order = db.orders.byId(req.params.id);
  if (!order) throw notFound('Không tìm thấy đơn hàng');
  res.json({
    ...order,
    returns: db.returns.byOrder(order.id),
    // Giao diện chỉ hiển thị đúng những bước server chấp nhận, thay vì liệt kê tất cả
    allowedTransitions: nextStatuses(order.status).filter((s) => !STATUS_REQUIRES_DEDICATED_API[s]),
  });
}));

/**
 * Cập nhật trạng thái đơn — bắt buộc đi theo máy trạng thái.
 * Các bước có tác dụng phụ về tiền/kho (hủy, hoàn tiền, đổi/trả) phải dùng API riêng
 * để đảm bảo hoàn kho, hoàn lượt voucher và gọi cổng thanh toán đúng quy trình.
 */
const STATUS_REQUIRES_DEDICATED_API = {
  [STATUS.CANCELLED]: 'Dùng chức năng Hủy đơn để đảm bảo hoàn kho và hoàn lượt voucher',
  [STATUS.REFUNDED]: 'Dùng chức năng Hoàn tiền để ghi nhận giao dịch hoàn tiền thực tế',
  [STATUS.REFUND_PENDING]: 'Trạng thái này do quy trình hoàn tiền tự đặt',
  [STATUS.RETURN_REQUESTED]: 'Trạng thái này do khách tạo yêu cầu đổi/trả',
  [STATUS.RETURN_APPROVED]: 'Dùng màn hình Đổi/Trả để duyệt yêu cầu',
  [STATUS.RETURN_REJECTED]: 'Dùng màn hình Đổi/Trả để từ chối yêu cầu',
  [STATUS.RETURNED]: 'Dùng màn hình Đổi/Trả để xác nhận đã nhận lại hàng',
};

router.put('/orders/:id/status', requireStaff, limiters.write, wrap(async (req, res) => {
  const order = db.orders.byId(req.params.id);
  if (!order) throw notFound('Không tìm thấy đơn hàng');

  const status = v.oneOf(req.body.status, ALL_STATUSES, 'trạng thái');
  const note = v.str(req.body.note, 'ghi chú', { required: false, max: 300 });

  if (status === order.status) return res.json(order);
  if (TERMINAL_STATUSES.includes(order.status)) {
    throw badRequest(`Đơn ở trạng thái "${order.status}" đã kết thúc, không thể đổi trạng thái.`);
  }
  if (STATUS_REQUIRES_DEDICATED_API[status]) {
    throw badRequest(STATUS_REQUIRES_DEDICATED_API[status]);
  }
  // Chỉ cho đi đúng bước kế tiếp — chặn nhảy cóc kiểu pending → delivered
  if (!canTransition(order.status, status)) {
    throw badRequest(
      `Không thể chuyển từ "${order.status}" sang "${status}". ` +
      `Bước hợp lệ tiếp theo: ${nextStatuses(order.status).join(', ') || 'không còn bước nào'}.`
    );
  }
  // Không cho đánh dấu đã giao khi đơn thanh toán online chưa nhận được tiền
  if (status === STATUS.DELIVERED && order.payMethod === 'vnpay' && order.payStatus !== 'paid') {
    throw badRequest('Đơn thanh toán VNPay chưa nhận được tiền nên không thể đánh dấu đã giao.');
  }

  db.transaction(() => {
    order.status = status;

    // Bàn giao vận chuyển → chốt mốc thời gian, sau mốc này khách không tự hủy được
    if (status === STATUS.SHIPPED && !order.shipping.handedOverAt) {
      order.shipping.handedOverAt = new Date().toISOString();
    }
    // Giao thành công → bắt đầu đếm 7 ngày đổi/trả; COD coi như đã thu tiền
    if (status === STATUS.DELIVERED) {
      order.shipping.deliveredAt = new Date().toISOString();
      if (order.payMethod === 'cod' && order.payStatus !== 'paid') {
        order.payStatus = 'paid';
        order.payment = {
          ...(order.payment || {}),
          gateway: 'cod',
          amount: order.total,
          processedAt: new Date().toISOString(),
        };
      }
    }

    addHistory(order, { status, actor: req.user.role, actorId: req.user.id, note: note || `Chuyển trạng thái sang ${status}` });
  });

  mailer.send(order.customerEmail, 'orderStatus', order);
  res.json(order);
}));

/** Cập nhật thông tin vận chuyển */
router.put('/orders/:id/shipping', requireStaff, limiters.write, wrap(async (req, res) => {
  const order = db.orders.byId(req.params.id);
  if (!order) throw notFound('Không tìm thấy đơn hàng');

  const carrier = v.str(req.body.carrier, 'đơn vị vận chuyển', { required: false, max: 60 });
  const trackingNumber = v.str(req.body.trackingNumber, 'mã vận đơn', { required: false, max: 60 });

  db.transaction(() => {
    order.shipping = { ...order.shipping, carrier, trackingNumber };
    if (req.body.handedOverAt) order.shipping.handedOverAt = new Date(req.body.handedOverAt).toISOString();
    addHistory(order, {
      status: order.status,
      actor: req.user.role,
      actorId: req.user.id,
      note: `Cập nhật vận chuyển: ${carrier || 'chưa rõ'}${trackingNumber ? ` — mã ${trackingNumber}` : ''}`,
    });
  });

  if (trackingNumber) mailer.send(order.customerEmail, 'orderStatus', order);
  res.json(order);
}));

/**
 * Ghi nhận hoàn tiền cho đơn bị hủy (không qua quy trình đổi/trả).
 * Dùng chung processRefund nên cũng tuân thủ nguyên tắc: chỉ đánh dấu đã hoàn khi
 * tiền thực sự đã được hoàn qua cổng hoặc đã có mã giao dịch chuyển khoản.
 */
router.post('/orders/:id/refund', requireStaff, limiters.write, wrap(async (req, res) => {
  const order = db.orders.byId(req.params.id);
  if (!order) throw notFound('Không tìm thấy đơn hàng');
  if (order.payStatus !== 'paid') throw badRequest('Đơn hàng chưa thanh toán nên không có gì để hoàn');

  const ceiling = pricing.remainingRefundable(order);
  if (ceiling <= 0) throw badRequest('Đơn hàng này đã được hoàn hết số tiền có thể hoàn');

  const amount = v.int(req.body.amount ?? ceiling, 'số tiền hoàn', { min: 1000, max: ceiling });
  const method = order.payMethod === 'vnpay' ? 'vnpay' : 'bank_transfer';

  const refund = await processRefund({
    order, ret: null, amount, method,
    reference: req.body.reference,
    note: req.body.note,
    actor: req.user,
    ip: req.ip,
  });

  res.json({ ok: true, refund });
}));

/* ==================== KHÁCH HÀNG ==================== */

router.get('/users', requireAdmin, wrap(async (req, res) => {
  const { q } = req.query;
  let list = db.users.all();
  if (q) {
    const needle = String(q).toLowerCase().slice(0, 60);
    list = list.filter((u) => u.email.includes(needle) || u.name.toLowerCase().includes(needle));
  }
  const orders = db.orders.all();
  res.json(list.map((u) => {
    const own = orders.filter((o) => o.userId === u.id);
    return {
      ...publicUser(u),
      orderCount: own.length,
      totalSpent: own.filter(isRevenue).reduce((s, o) => s + o.total, 0),
    };
  }));
}));

router.get('/users/:id', requireAdmin, wrap(async (req, res) => {
  const user = db.users.byId(req.params.id);
  if (!user) throw notFound('Không tìm thấy khách hàng');
  res.json({ ...publicUser(user), orders: db.orders.byUser(user.id) });
}));

router.put('/users/:id/role', requireAdmin, limiters.write, wrap(async (req, res) => {
  const role = v.oneOf(req.body.role, ['admin', 'staff', 'customer'], 'vai trò');
  const user = db.users.byId(req.params.id);
  if (!user) throw notFound('Không tìm thấy khách hàng');
  if (user.id === req.user.id) throw badRequest('Không thể tự đổi vai trò của chính mình');

  db.transaction(() => { user.role = role; user.updatedAt = new Date().toISOString(); });
  res.json(publicUser(user));
}));

/* ==================== HỘP THƯ ==================== */

router.get('/emails', requireStaff, wrap(async (_req, res) => {
  res.json(db.emails.all().map(({ html, ...rest }) => ({
    ...rest,
    sensitive: mailer.SENSITIVE_TEMPLATES.has(rest.template),
  })));
}));

/**
 * Xem nội dung email.
 *
 * Email chứa mã OTP (xác minh email / đặt lại mật khẩu) KHÔNG được trả nội dung —
 * nhân viên đọc được mã là chiếm được tài khoản khách hàng. Chặn ở cả tầng lưu trữ
 * (mailer không ghi html) lẫn tầng API này, để dữ liệu cũ còn sót cũng không lộ.
 */
router.get('/emails/:id', requireStaff, wrap(async (req, res) => {
  const mail = db.emails.byId(req.params.id);
  if (!mail) throw notFound('Không tìm thấy email');

  const sensitive = mailer.SENSITIVE_TEMPLATES.has(mail.template);

  // Email chứa mã OTP KHÔNG BAO GIỜ được trả nội dung qua API — kể cả ở môi trường
  // phát triển và kể cả cho admin. Nhân viên đọc được mã xác minh của khách là có
  // thể chiếm tài khoản khách. Ở dev, nội dung vẫn được lưu trong db.json để lập
  // trình viên tự tra khi cần, nhưng phải qua file chứ không qua API.
  if (sensitive) {
    const { html, ...rest } = mail;
    return res.json({
      ...rest,
      sensitive: true,
      html: null,
      redactedReason: 'Email chứa mã xác minh nên nội dung không được hiển thị vì lý do bảo mật.',
    });
  }

  res.json({ ...mail, sensitive });
}));

module.exports = { router };

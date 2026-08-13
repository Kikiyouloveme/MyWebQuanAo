/**
 * Thanh toán VNPay.
 *
 * QUAN TRỌNG: không có API nào cho phép client tự đánh dấu đơn là đã thanh toán.
 * Trạng thái `paid` CHỈ được đặt từ trong file này, sau khi chữ ký HMAC-SHA512 của
 * VNPay được xác thực và số tiền khớp với đơn hàng.
 */
const express = require('express');
const db = require('../db');
const vnpay = require('../vnpay');
const mailer = require('../mailer');
const inventory = require('../inventory');
const config = require('../config');
const lifecycle = require('../payment-lifecycle');
const { wrap, requireAuth, limiters, badRequest, notFound, forbidden } = require('../security');
const { STATUS, addHistory } = require('./orders');

const router = express.Router();

/**
 * Áp dụng kết quả thanh toán vào đơn hàng.
 *
 * IDEMPOTENT và phân biệt được callback thuộc lần thử nào — xem chi tiết quy tắc
 * ở đầu file payment-lifecycle.js.
 *
 * @returns {'unknown_txn'|'already_paid'|'paid'|'paid_needs_attention'|'failed'|'stale'|'amount_mismatch'}
 */
function applyPaymentResult(order, result, source) {
  const attempt = lifecycle.findAttempt(order, result.txnRef);

  // Mã giao dịch không thuộc đơn này → không đụng vào đơn
  if (!attempt) {
    db.transaction(() => {
      addHistory(order, {
        status: order.status,
        actor: 'system',
        note: `Bỏ qua callback với mã giao dịch lạ: ${result.txnRef}`,
        visibleToCustomer: false,
      });
    });
    return 'unknown_txn';
  }

  // Đơn đã thanh toán rồi → không ghi nhận lần hai
  if (order.payStatus === 'paid') return 'already_paid';

  // Số tiền phải khớp tuyệt đối với tổng đơn do server tính
  if (result.success && Math.round(result.amount) !== Math.round(order.total)) {
    db.transaction(() => {
      attempt.status = lifecycle.ATTEMPT.FAILED;
      attempt.closedAt = new Date().toISOString();
      addHistory(order, {
        status: order.status,
        actor: 'system',
        note: `Cảnh báo: số tiền VNPay (${result.amount}) không khớp tổng đơn (${order.total})`,
        visibleToCustomer: false,
      });
    });
    return 'amount_mismatch';
  }

  const isActive = order.payment?.activeTxnRef === result.txnRef;
  const paymentInfo = {
    transactionNo: result.transactionNo,
    bankCode: result.bankCode,
    code: result.code,
    message: vnpay.RESPONSE_MESSAGES[result.code] || 'Không xác định',
    amount: result.amount,
    processedAt: new Date().toISOString(),
    source,
  };

  /* ---------- Thanh toán thành công ---------- */
  if (result.success) {
    // Tiền đã bị trừ của khách nên phải ghi nhận, kể cả khi lần thử này đã hết hạn
    // hoặc đơn đã bị hủy tự động trước đó.
    const wasCancelled = order.status === STATUS.CANCELLED;
    let restocked = true;
    if (order.stockState !== 'reserved') {
      try { inventory.reserve(order); }
      catch { restocked = false; } // hết hàng — cần người xử lý thủ công
    }

    db.transaction(() => {
      attempt.status = lifecycle.ATTEMPT.SUCCESS;
      attempt.closedAt = paymentInfo.processedAt;
      Object.assign(order.payment, paymentInfo);
      order.payStatus = 'paid';
      order.status = STATUS.CONFIRMED;
      order.cancel = null;
      // Đơn được thanh toán sau khi hết hạn thì lượt voucher đã bị trả lại
      if (order.voucherReleased && order.voucher) {
        const voucher = db.vouchers.byId(order.voucher.id);
        if (voucher) {
          voucher.usedCount = (voucher.usedCount || 0) + 1;
          if (!Array.isArray(voucher.usedBy)) voucher.usedBy = [];
          voucher.usedBy.push(order.userId);
        }
        order.voucherReleased = false;
      }
      addHistory(order, {
        status: STATUS.CONFIRMED,
        actor: 'system',
        note: `Thanh toán VNPay thành công (GD ${result.transactionNo})`,
      });
      if (wasCancelled || !restocked) {
        order.needsAttention = true;
        order.attentionNote = !restocked
          ? 'Đã nhận tiền nhưng không đủ hàng để giữ lại — cần liên hệ khách để xử lý.'
          : 'Đơn đã bị hủy do hết hạn nhưng khách vẫn thanh toán — cần xác nhận lại với khách.';
        addHistory(order, {
          status: STATUS.CONFIRMED,
          actor: 'system',
          note: order.attentionNote,
          visibleToCustomer: false,
        });
      }
    });

    mailer.send(order.customerEmail, 'paymentSuccess', order);
    return (wasCancelled || !restocked) ? 'paid_needs_attention' : 'paid';
  }

  /* ---------- Thanh toán thất bại ---------- */
  // Callback thất bại của lần thử CŨ không được đụng vào đơn, vì có thể đang có
  // lần thử mới hợp lệ đang chờ kết quả.
  if (!isActive) {
    db.transaction(() => {
      attempt.status = lifecycle.ATTEMPT.FAILED;
      attempt.closedAt = paymentInfo.processedAt;
      attempt.code = result.code;
      addHistory(order, {
        status: order.status,
        actor: 'system',
        note: `Bỏ qua kết quả thất bại của lần thử cũ (${result.txnRef}): ${paymentInfo.message}`,
        visibleToCustomer: false,
      });
    });
    return 'stale';
  }

  db.transaction(() => {
    attempt.status = lifecycle.ATTEMPT.FAILED;
    attempt.closedAt = paymentInfo.processedAt;
    attempt.code = result.code;
    Object.assign(order.payment, paymentInfo);
    order.payStatus = 'failed';
    addHistory(order, {
      status: order.status,
      actor: 'system',
      note: `Thanh toán thất bại: ${paymentInfo.message}`,
    });
  });
  // Thanh toán hỏng thì trả hàng về kho — khách vẫn có thể thanh toán lại,
  // lúc đó hệ thống sẽ giữ hàng lại nếu còn.
  inventory.release(order, 'Thanh toán thất bại');
  mailer.send(order.customerEmail, 'paymentFailed', order, paymentInfo.message);
  return 'failed';
}

/* ==================== TẠO LINK THANH TOÁN ==================== */

router.post('/vnpay/create', requireAuth, limiters.write, wrap(async (req, res) => {
  const order = db.orders.byId(req.body.orderId);
  if (!order) throw notFound('Không tìm thấy đơn hàng');

  // Chỉ chủ đơn (hoặc nhân viên) mới tạo được link thanh toán
  const isStaff = ['admin', 'staff'].includes(req.user.role);
  if (!isStaff && order.userId !== req.user.id) throw notFound('Không tìm thấy đơn hàng');

  // Production thiếu credential → tắt hẳn, không đưa khách sang cổng giả lập
  if (!config.features.vnpayEnabled) {
    throw forbidden('Thanh toán trực tuyến hiện không khả dụng. Vui lòng chọn thanh toán khi nhận hàng.');
  }

  // Quét hết hạn trước khi xử lý để không tạo link cho đơn lẽ ra đã bị hủy
  lifecycle.expireOrder(order, addHistory, STATUS);

  if (order.payStatus === 'paid') throw badRequest('Đơn hàng này đã được thanh toán');
  if (order.status === STATUS.CANCELLED) {
    throw badRequest(
      order.cancel?.by === 'system'
        ? 'Đơn hàng đã bị hủy do quá hạn thanh toán. Vui lòng đặt đơn mới.'
        : 'Đơn hàng đã bị hủy'
    );
  }
  if (order.payMethod !== 'vnpay') throw badRequest('Đơn hàng này không dùng phương thức VNPay');

  // Thanh toán lại sau khi thất bại: cần giữ hàng lại trước khi cho ra cổng
  if (order.stockState !== 'reserved') inventory.reserve(order);

  const { url, live, txnRef } = vnpay.createPaymentUrl(order, req.ip, req.body.bankCode);
  db.transaction(() => { lifecycle.registerAttempt(order, { txnRef, live }); });

  res.json({ url, live, expiresInMinutes: config.payment.attemptTtlMinutes });
}));

/* ==================== CỔNG GIẢ LẬP (chỉ ngoài production) ==================== */

router.get('/vnpay/sandbox', wrap(async (req, res) => {
  // Ở production tuyệt đối không có cổng giả lập, kể cả khi thiếu credential
  if (!config.features.vnpaySandboxPage) throw notFound('Không khả dụng');

  const q = req.query;
  const amount = (Number(q.vnp_Amount || 0) / 100).toLocaleString('vi-VN') + '₫';
  const orderId = String(q.vnp_TxnRef || '').split('-')[0];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const makeUrl = (code) => '/api/payment/vnpay/return?' + vnpay.buildReturnQuery({
    vnp_Amount: q.vnp_Amount,
    vnp_BankCode: 'NCB',
    vnp_BankTranNo: 'VNP' + Date.now().toString().slice(-8),
    vnp_CardType: 'ATM',
    vnp_OrderInfo: q.vnp_OrderInfo,
    vnp_PayDate: vnpay.vnpDate(),
    vnp_ResponseCode: code,
    vnp_TmnCode: q.vnp_TmnCode,
    vnp_TransactionNo: String(Math.floor(Math.random() * 9e7) + 1e7),
    vnp_TransactionStatus: code,
    vnp_TxnRef: q.vnp_TxnRef,
  });

  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cổng thanh toán thử nghiệm — VELATHIER</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f1ea;
       font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1816;padding:20px}
  .box{width:100%;max-width:420px;background:#fff;border:1px solid #d9d3c6;border-radius:8px;padding:28px;text-align:center}
  .tag{display:inline-block;background:#c14d21;color:#fff;font-size:11px;font-weight:700;
       letter-spacing:.16em;text-transform:uppercase;padding:5px 12px;border-radius:4px;margin-bottom:16px}
  h1{font-size:18px;margin:0 0 6px}.amt{font-size:32px;font-weight:700;margin:10px 0 2px}
  p{color:#6d675d;font-size:13px;margin:4px 0 0;line-height:1.6}
  a{display:block;padding:14px;margin-top:10px;text-decoration:none;font-weight:700;font-size:13px;
    letter-spacing:.1em;text-transform:uppercase;border:1px solid #1a1816;border-radius:4px}
  .ok{background:#1a1816;color:#f4f1ea}.no{background:transparent;color:#1a1816}
  .hint{margin-top:18px;font-size:11px;color:#8a847a;line-height:1.6}
</style></head><body>
<div class="box">
  <span class="tag">Môi trường thử nghiệm</span>
  <h1>Đơn hàng ${esc(orderId)}</h1>
  <div class="amt">${esc(amount)}</div>
  <p>Chọn kết quả để mô phỏng phản hồi từ cổng thanh toán. Chữ ký HMAC-SHA512 được tạo và xác thực đúng như môi trường thật.</p>
  <a class="ok" href="${makeUrl('00')}">Thanh toán thành công</a>
  <a class="no" href="${makeUrl('24')}">Hủy giao dịch</a>
  <a class="no" href="${makeUrl('51')}">Tài khoản không đủ số dư</a>
  <div class="hint">Đặt VNP_TMN_CODE và VNP_HASH_SECRET trong .env để chuyển sang cổng VNPay thật.</div>
</div></body></html>`);
}));

/* ==================== RETURN URL ==================== */

/** VNPay chuyển trình duyệt khách về đây sau khi thanh toán */
router.get('/vnpay/return', wrap(async (req, res) => {
  const result = vnpay.verifyReturn(req.query);

  if (!result.valid) return res.redirect(`/payment/${result.orderId || 'unknown'}?vnp=invalid`);

  const order = db.orders.byId(result.orderId);
  if (!order) return res.redirect('/payment/unknown?vnp=notfound');

  const outcome = applyPaymentResult(order, result, 'return_url');

  const state =
    outcome === 'amount_mismatch' || outcome === 'unknown_txn' ? 'invalid'
    : outcome === 'stale' ? 'stale'
    : order.payStatus;
  res.redirect(`/payment/${order.id}?vnp=${state}&code=${result.code}`);
}));

/* ==================== IPN ==================== */

/**
 * VNPay gọi server-to-server — nguồn xác nhận đáng tin cậy nhất vì không đi qua
 * trình duyệt khách. Phải trả đúng định dạng { RspCode, Message } theo tài liệu VNPay.
 */
router.get('/vnpay/ipn', wrap(async (req, res) => {
  const result = vnpay.verifyReturn(req.query);
  if (!result.valid) return res.json({ RspCode: '97', Message: 'Invalid signature' });

  const order = db.orders.byId(result.orderId);
  if (!order) return res.json({ RspCode: '01', Message: 'Order not found' });
  if (Math.round(result.amount) !== Math.round(order.total)) {
    return res.json({ RspCode: '04', Message: 'Invalid amount' });
  }
  // Mã giao dịch không thuộc đơn này → báo không tìm thấy, không đụng vào đơn
  if (!lifecycle.findAttempt(order, result.txnRef)) {
    return res.json({ RspCode: '01', Message: 'Transaction not found' });
  }
  if (order.payStatus === 'paid') return res.json({ RspCode: '02', Message: 'Order already confirmed' });

  applyPaymentResult(order, result, 'ipn');
  res.json({ RspCode: '00', Message: 'Confirm Success' });
}));

/* ==================== THÔNG TIN CẤU HÌNH ==================== */

router.get('/config', wrap(async (_req, res) => {
  res.json({
    // Giao diện dùng cờ này để ẩn hẳn lựa chọn VNPay khi cổng không khả dụng
    vnpayEnabled: config.features.vnpayEnabled,
    vnpayLive: vnpay.isLive(),
    codEnabled: true,
    shippingFee: config.shipping.flatFee,
    freeShippingThreshold: config.shipping.freeThreshold,
    paymentTtlMinutes: config.payment.attemptTtlMinutes,
  });
}));

module.exports = { router, applyPaymentResult };

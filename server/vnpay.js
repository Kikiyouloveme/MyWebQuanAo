/**
 * VNPay integration (chuẩn cổng thanh toán VNPay 2.1.0).
 *
 * Cấu hình qua biến môi trường (file .env hoặc set trực tiếp):
 *   VNP_TMN_CODE     — Terminal ID / Mã website merchant
 *   VNP_HASH_SECRET  — Secret key HMAC-SHA512
 *   VNP_URL          — mặc định sandbox
 *   PUBLIC_URL       — origin công khai để VNPay callback về (mặc định http://localhost:5173)
 *
 * Khi CHƯA cấu hình TMN_CODE/HASH_SECRET, hệ thống tự chuyển sang chế độ
 * "sandbox nội bộ" (trang giả lập) để vẫn demo được đủ luồng — chữ ký vẫn được
 * ký và verify bằng đúng thuật toán thật, chỉ khác là không gọi ra server VNPay.
 */
const crypto = require('crypto');
const querystring = require('querystring');
require('./config'); // đảm bảo .env đã được nạp trước khi đọc process.env bên dưới

const CFG = {
  tmnCode: process.env.VNP_TMN_CODE || '',
  hashSecret: process.env.VNP_HASH_SECRET || 'VELATHIER_LOCAL_SANDBOX_SECRET',
  vnpUrl: process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, ''),
};

/** Đã có credential thật của VNPay chưa? */
const isLive = () => Boolean(process.env.VNP_TMN_CODE && process.env.VNP_HASH_SECRET);

/** yyyyMMddHHmmss theo giờ VN (GMT+7) */
function vnpDate(d = new Date()) {
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return (
    vn.getUTCFullYear() +
    p(vn.getUTCMonth() + 1) +
    p(vn.getUTCDate()) +
    p(vn.getUTCHours()) +
    p(vn.getUTCMinutes()) +
    p(vn.getUTCSeconds())
  );
}

/** Sắp xếp key A→Z và encode giá trị theo đúng chuẩn VNPay (space → '+') */
function sortObject(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = encodeURIComponent(String(obj[key])).replace(/%20/g, '+');
  }
  return out;
}

function signParams(params) {
  const sorted = sortObject(params);
  const signData = querystring.stringify(sorted, undefined, undefined, { encodeURIComponent: (s) => s });
  const hash = crypto
    .createHmac('sha512', CFG.hashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');
  return { sorted, hash };
}

/**
 * Tạo URL thanh toán cho một đơn hàng.
 * @returns {{ url: string, live: boolean, txnRef: string }}
 */
function createPaymentUrl(order, ipAddr = '127.0.0.1', bankCode = '') {
  // vnp_TxnRef phải duy nhất theo từng lần thanh toán → thêm timestamp
  const txnRef = `${order.id}-${Date.now().toString().slice(-6)}`;

  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: CFG.tmnCode || 'VELALOCAL',
    vnp_Amount: Math.round(order.total) * 100, // VNPay tính theo đơn vị xu
    vnp_CreateDate: vnpDate(),
    vnp_CurrCode: 'VND',
    vnp_IpAddr: ipAddr,
    vnp_Locale: 'vn',
    vnp_OrderInfo: `Thanh toan don hang ${order.id}`,
    vnp_OrderType: 'fashion',
    vnp_ReturnUrl: `${CFG.publicUrl}/api/payment/vnpay/return`,
    vnp_TxnRef: txnRef,
  };
  if (bankCode) params.vnp_BankCode = bankCode;

  const { sorted, hash } = signParams(params);
  const query = querystring.stringify(
    { ...sorted, vnp_SecureHash: hash },
    undefined,
    undefined,
    { encodeURIComponent: (s) => s }
  );

  // Live: đẩy sang cổng VNPay. Local: đẩy sang trang giả lập của chính app.
  const base = isLive() ? CFG.vnpUrl : `${CFG.publicUrl}/api/payment/vnpay/sandbox`;
  return { url: `${base}?${query}`, live: isLive(), txnRef };
}

/**
 * Xác thực chữ ký của dữ liệu VNPay trả về (Return URL hoặc IPN).
 * @returns {{ valid: boolean, success: boolean, orderId: string, amount: number, code: string }}
 */
function verifyReturn(query) {
  const data = { ...query };
  const received = data.vnp_SecureHash;
  delete data.vnp_SecureHash;
  delete data.vnp_SecureHashType;

  const { hash } = signParams(data);
  const valid = Boolean(received) && hash === received;

  return {
    valid,
    success: valid && data.vnp_ResponseCode === '00' && data.vnp_TransactionStatus === '00',
    orderId: String(data.vnp_TxnRef || '').split('-')[0],
    txnRef: String(data.vnp_TxnRef || ''),
    amount: Number(data.vnp_Amount || 0) / 100,
    code: String(data.vnp_ResponseCode || ''),
    bankCode: String(data.vnp_BankCode || ''),
    transactionNo: String(data.vnp_TransactionNo || ''),
  };
}

/** Ký một bộ params bất kỳ — dùng cho trang sandbox nội bộ mô phỏng VNPay trả về */
function buildReturnQuery(params) {
  const { sorted, hash } = signParams(params);
  return querystring.stringify({ ...sorted, vnp_SecureHash: hash }, undefined, undefined, {
    encodeURIComponent: (s) => s,
  });
}

/** Mã lỗi VNPay → mô tả tiếng Việt */
const RESPONSE_MESSAGES = {
  '00': 'Giao dịch thành công',
  '07': 'Giao dịch bị nghi ngờ gian lận',
  '09': 'Thẻ/Tài khoản chưa đăng ký InternetBanking',
  '10': 'Xác thực thông tin thẻ không đúng quá 3 lần',
  '11': 'Đã hết hạn chờ thanh toán',
  '12': 'Thẻ/Tài khoản bị khóa',
  '13': 'Sai mật khẩu xác thực (OTP)',
  '24': 'Khách hàng hủy giao dịch',
  '51': 'Tài khoản không đủ số dư',
  '65': 'Tài khoản vượt hạn mức giao dịch trong ngày',
  '75': 'Ngân hàng thanh toán đang bảo trì',
  '79': 'Sai mật khẩu thanh toán quá số lần quy định',
  '99': 'Lỗi không xác định',
};

/**
 * Hoàn tiền về nguồn thanh toán qua API của VNPay (vnp_Command = refund).
 * Chỉ gọi được khi đã cấu hình credential thật; ở chế độ sandbox nội bộ thì
 * trả về lỗi rõ ràng để Admin xử lý hoàn tiền thủ công thay vì giả vờ thành công.
 *
 * @returns {Promise<{ok: boolean, message: string, transactionNo?: string}>}
 */
async function refund({ order, amount, transactionNo, transactionDate, createdBy, ip }) {
  if (!isLive()) {
    return { ok: false, message: 'Chưa cấu hình VNPay thật nên không thể gọi API hoàn tiền tự động' };
  }
  if (!transactionNo) {
    return { ok: false, message: 'Đơn hàng không có mã giao dịch VNPay để hoàn' };
  }

  const requestId = `${order.id}-RF-${Date.now().toString().slice(-6)}`;
  const createDate = vnpDate();
  const payDate = transactionDate ? vnpDate(new Date(transactionDate)) : createDate;
  const orderInfo = `Hoan tien don hang ${order.id}`;
  // Hoàn toàn phần (02) hay toàn bộ (03) theo tài liệu VNPay
  const transactionType = amount >= order.total ? '02' : '03';

  const data = [
    requestId, '2.1.0', 'refund', CFG.tmnCode, transactionType, order.id,
    Math.round(amount) * 100, transactionNo, payDate, createdBy || 'system',
    createDate, ip || '127.0.0.1', orderInfo,
  ].join('|');

  const secureHash = crypto.createHmac('sha512', CFG.hashSecret).update(Buffer.from(data, 'utf-8')).digest('hex');

  const body = {
    vnp_RequestId: requestId,
    vnp_Version: '2.1.0',
    vnp_Command: 'refund',
    vnp_TmnCode: CFG.tmnCode,
    vnp_TransactionType: transactionType,
    vnp_TxnRef: order.id,
    vnp_Amount: Math.round(amount) * 100,
    vnp_OrderInfo: orderInfo,
    vnp_TransactionNo: transactionNo,
    vnp_TransactionDate: payDate,
    vnp_CreateBy: createdBy || 'system',
    vnp_CreateDate: createDate,
    vnp_IpAddr: ip || '127.0.0.1',
    vnp_SecureHash: secureHash,
  };

  try {
    const endpoint = process.env.VNP_API_URL || 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const result = await response.json();
    if (result.vnp_ResponseCode === '00') {
      return { ok: true, message: 'Hoàn tiền thành công', transactionNo: result.vnp_TransactionNo };
    }
    return {
      ok: false,
      message: REFUND_MESSAGES[result.vnp_ResponseCode] || result.vnp_Message || `Mã lỗi ${result.vnp_ResponseCode}`,
    };
  } catch (e) {
    return { ok: false, message: e.name === 'AbortError' ? 'VNPay không phản hồi (hết thời gian chờ)' : e.message };
  }
}

/** Mã phản hồi riêng của API hoàn tiền */
const REFUND_MESSAGES = {
  '02': 'Mã định danh merchant không hợp lệ',
  '03': 'Dữ liệu gửi sang không đúng định dạng',
  '91': 'Không tìm thấy giao dịch cần hoàn',
  '93': 'Số tiền hoàn lớn hơn số tiền đã thanh toán',
  '94': 'Giao dịch đã được gửi yêu cầu hoàn trước đó và đang xử lý',
  '95': 'Giao dịch này không thành công nên không thể hoàn',
  '97': 'Chữ ký không hợp lệ',
  '99': 'Lỗi không xác định từ cổng thanh toán',
};

module.exports = {
  CFG,
  isLive,
  createPaymentUrl,
  verifyReturn,
  buildReturnQuery,
  vnpDate,
  refund,
  RESPONSE_MESSAGES,
  REFUND_MESSAGES,
};

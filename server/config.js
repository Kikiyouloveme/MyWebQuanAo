/**
 * Nạp và kiểm tra biến môi trường.
 * Phải được require ĐẦU TIÊN trong server.js — trước mọi module đọc process.env.
 */
const path = require('path');
const fs = require('fs');

// Nạp .env ở thư mục gốc dự án (nếu có)
const ENV_PATH = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: ENV_PATH });

const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_JWT_SECRET = 'velathier-dev-only-secret-do-not-use-in-production';

/** Biến bắt buộc khi chạy production — thiếu là dừng server ngay, không chạy với secret mặc định */
const REQUIRED_IN_PROD = ['JWT_SECRET', 'PUBLIC_URL'];

/**
 * Cờ bật/tắt tính năng theo cấu hình thực tế.
 *
 * Ở production, thiếu hạ tầng thì phải TẮT hẳn chức năng phụ thuộc nó và báo lỗi
 * rõ ràng — tuyệt đối không chạy chế độ giả lập rồi báo cho khách là thành công.
 * Ở môi trường phát triển vẫn cho chạy giả lập để test được toàn bộ luồng.
 */
const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const vnpayConfigured = Boolean(process.env.VNP_TMN_CODE && process.env.VNP_HASH_SECRET);
/** VietQR POS: cần BIN ngân hàng 6 số + số tài khoản nhận tiền */
const vietqrConfigured = Boolean(
  /^\d{6}$/.test((process.env.VIETQR_BANK_BIN || '').trim()) &&
  /^[A-Za-z0-9]{6,19}$/.test((process.env.VIETQR_ACCOUNT_NO || '').trim())
);

const features = {
  smtpConfigured,
  vnpayConfigured,
  /** Email có tới được hộp thư thật không — quyết định OTP có dùng được không */
  emailDeliverable: smtpConfigured,
  /** Chức năng cần OTP qua email (đăng ký, quên mật khẩu) có khả dụng không */
  otpFlowsEnabled: smtpConfigured || !IS_PROD,
  /** Có nhận được tiền qua VNPay không */
  vnpayEnabled: vnpayConfigured || !IS_PROD,
  /** VietQR POS: sinh mã QR chuyển khoản tại quầy. Bật khi đã khai báo tài khoản nhận. */
  vietqrEnabled: vietqrConfigured,
  vietqrConfigured,
  /** Cổng giả lập nội bộ chỉ tồn tại ngoài production */
  vnpaySandboxPage: !vnpayConfigured && !IS_PROD,
  /** Có gọi được API hoàn tiền tự động của VNPay không */
  // Provider refund ACK cannot be atomically committed with our DB. Opt in only after live qualification.
  vnpayRefundEnabled: vnpayConfigured && process.env.VNP_REFUND_AUTOMATION_ENABLED === '1',
  /** Chỉ lưu nội dung email chứa OTP khi KHÔNG phải production, để test đọc được */
  storeSensitiveEmailBody: !IS_PROD,
};

const errors = [];
const warnings = [];

if (IS_PROD) {
  if (!/^https:\/\//.test(process.env.PUBLIC_URL || '')) errors.push('PUBLIC_URL production phải dùng HTTPS');
  if ((process.env.OUTBOX_ENCRYPTION_KEY || '').length < 32) errors.push('Thiếu OUTBOX_ENCRYPTION_KEY tối thiểu 32 ký tự');
  if(process.env.PRIVATE_STORAGE_PROVIDER!=='s3'||!process.env.PRIVATE_STORAGE_BUCKET)errors.push('Production yêu cầu private S3 bucket; local adapter chỉ dùng development');
  if ((process.env.TRUST_PROXY||'').split(',').some(value=>['true','1','0.0.0.0/0','::/0'].includes(value.trim()))) errors.push('TRUST_PROXY phải chỉ định reverse proxy đáng tin cậy, không tin toàn Internet');
  for (const key of REQUIRED_IN_PROD) {
    if (!process.env[key]) errors.push(`Thiếu biến môi trường bắt buộc: ${key}`);
  }
  if (process.env.JWT_SECRET === DEV_JWT_SECRET || (process.env.JWT_SECRET || '').length < 32) {
    errors.push('JWT_SECRET phải là chuỗi ngẫu nhiên tối thiểu 32 ký tự khi chạy production');
  }
  if (!smtpConfigured) {
    warnings.push('SMTP chưa cấu hình — ĐĂNG KÝ và QUÊN MẬT KHẨU bị tắt vì không gửi được mã OTP tới khách.');
  }
  if (!vnpayConfigured) {
    warnings.push('VNPay chưa cấu hình — phương thức thanh toán VNPay bị tắt, chỉ còn COD.');
  }
} else if (!fs.existsSync(ENV_PATH)) {
  warnings.push('Chưa có file .env — đang dùng giá trị mặc định cho môi trường phát triển. Sao chép .env.example thành .env để cấu hình.');
}

if (errors.length) {
  console.error('\n[VELATHIER] Không thể khởi động do lỗi cấu hình:');
  errors.forEach((e) => console.error('  ✗ ' + e));
  console.error('\nXem .env.example để biết các biến cần thiết.\n');
  process.exit(1);
}
warnings.forEach((w) => console.warn('[VELATHIER] Cảnh báo: ' + w));

const config = {
  isProd: IS_PROD,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/velathier',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),
  port: Number(process.env.PORT || 5173),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5173}`).replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  features,

  /* Quy tắc nghiệp vụ — tập trung một chỗ để không rải magic number khắp code */
  shipping: {
    flatFee: Number(process.env.SHIPPING_FLAT_FEE || 40000),
    freeThreshold: Number(process.env.SHIPPING_FREE_THRESHOLD || 750000),
  },
  otp: {
    ttlMinutes: 10,
    length: 6,
    maxAttempts: 5,
    resendCooldownSeconds: 60,
  },
  returnWindowDays: 7,
  payment: {
    /** Thời hạn của một lần thử thanh toán VNPay. Quá hạn thì trả hàng về kho. */
    attemptTtlMinutes: Number(process.env.PAYMENT_ATTEMPT_TTL_MINUTES || 15),
    /** Số lần thử thanh toán tối đa cho một đơn */
    maxAttempts: 10,
    /** VietQR POS: mã QR hết hạn sau bao nhiêu phút */
    vietqrTtlMinutes: Number(process.env.VIETQR_TTL_MINUTES || 15),
  },
};

module.exports = config;

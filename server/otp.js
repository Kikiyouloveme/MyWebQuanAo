/**
 * OTP 6 chữ số cho: quên mật khẩu và xác minh email.
 *
 * Nguyên tắc bảo mật:
 *  - Chỉ lưu HASH (SHA-256 + salt riêng mỗi mã), không bao giờ lưu mã gốc.
 *  - Hết hạn sau 10 phút.
 *  - Gửi mã mới sẽ vô hiệu hoá mã cũ (ghi đè bản ghi).
 *  - Giới hạn số lần nhập sai; vượt ngưỡng thì huỷ mã, bắt yêu cầu lại.
 *  - Mã dùng một lần: xác minh đúng là xoá ngay (đổi thành reset ticket nếu cần).
 *  - So sánh bằng timingSafeEqual để tránh dò theo thời gian phản hồi.
 *  - KHÔNG log mã ra console ở production.
 */
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');
const { badRequest } = require('./security');

const PURPOSE = {
  RESET_PASSWORD: 'reset_password',
  VERIFY_EMAIL: 'verify_email',
};

const hash = (code, salt) => crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');

/** Sinh mã 6 số bằng nguồn ngẫu nhiên an toàn (không dùng Math.random) */
function generateCode() {
  const max = 10 ** config.otp.length;
  return String(crypto.randomInt(0, max)).padStart(config.otp.length, '0');
}

/**
 * Tạo (hoặc thay thế) OTP cho email + mục đích.
 * @returns {{code: string, expiresAt: number} | {cooldown: number}}
 */
function issue(email, purpose) {
  const e = String(email).toLowerCase();
  const existing = db.otps.find(e, purpose);

  // Chống spam gửi lại
  if (existing && existing.lastSentAt) {
    const elapsed = (Date.now() - existing.lastSentAt) / 1000;
    if (elapsed < config.otp.resendCooldownSeconds) {
      return { cooldown: Math.ceil(config.otp.resendCooldownSeconds - elapsed) };
    }
  }

  const code = generateCode();
  const salt = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + config.otp.ttlMinutes * 60 * 1000;

  db.otps.put({
    email: e,
    purpose,
    salt,
    codeHash: hash(code, salt),
    expiresAt,
    attempts: 0,
    lastSentAt: Date.now(),
    // Vé xác nhận đã verify — cấp sau khi nhập đúng OTP, dùng cho bước đặt mật khẩu mới
    ticket: null,
    ticketExpiresAt: 0,
  });

  // In mã ra console CHỈ khi đang phát triển VÀ chưa cấu hình SMTP — lúc đó không có
  // cách nào khác để lấy mã mà thử luồng. Có SMTP thật thì mã đi qua email, không in.
  // Ở production tuyệt đối không in để mã không lọt vào log hệ thống.
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
  if (!config.isProd && !smtpConfigured) {
    console.log(`[dev] OTP ${purpose} cho ${e}: ${code} (hết hạn sau ${config.otp.ttlMinutes} phút)`);
  }

  return { code, expiresAt };
}

/**
 * Kiểm tra OTP người dùng nhập.
 * Đúng → xoá mã, cấp "ticket" một lần dùng cho bước tiếp theo.
 * @returns {{ok: true, ticket: string} | {ok: false, message: string}}
 */
function verify(email, purpose, inputCode) {
  const e = String(email).toLowerCase();
  const rec = db.otps.find(e, purpose);

  if (!rec) return { ok: false, message: 'Mã xác minh không tồn tại hoặc đã được sử dụng. Vui lòng yêu cầu mã mới.' };

  if (Date.now() > rec.expiresAt) {
    db.otps.remove(e, purpose);
    return { ok: false, message: 'Mã xác minh đã hết hạn. Vui lòng yêu cầu mã mới.' };
  }

  if (rec.attempts >= config.otp.maxAttempts) {
    db.otps.remove(e, purpose);
    return { ok: false, message: 'Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã mới.' };
  }

  const input = String(inputCode || '').replace(/\D/g, '');
  const candidate = hash(input, rec.salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(rec.codeHash, 'hex');
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    rec.attempts += 1;
    db.otps.put(rec);
    const left = config.otp.maxAttempts - rec.attempts;
    return {
      ok: false,
      message: left > 0
        ? `Mã xác minh không đúng. Bạn còn ${left} lần thử.`
        : 'Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã mới.',
    };
  }

  // Đúng mã: cấp vé một lần, hiệu lực ngắn, cho bước đặt mật khẩu mới
  const ticket = crypto.randomBytes(32).toString('hex');
  db.otps.put({
    ...rec,
    codeHash: null,      // mã gốc không còn dùng lại được
    attempts: 0,
    ticket: crypto.createHash('sha256').update(ticket).digest('hex'),
    ticketExpiresAt: Date.now() + 10 * 60 * 1000,
  });

  return { ok: true, ticket };
}

/**
 * Xác thực vé ở bước cuối (đặt mật khẩu mới).
 * Ngăn việc gọi thẳng API reset mà bỏ qua bước nhập OTP.
 */
function consumeTicket(email, purpose, ticket) {
  const e = String(email).toLowerCase();
  const rec = db.otps.find(e, purpose);
  if (!rec || !rec.ticket) throw badRequest('Bạn cần xác minh mã OTP trước khi đặt lại mật khẩu');
  if (Date.now() > rec.ticketExpiresAt) {
    db.otps.remove(e, purpose);
    throw badRequest('Phiên xác minh đã hết hạn. Vui lòng thực hiện lại từ đầu.');
  }

  const given = crypto.createHash('sha256').update(String(ticket || '')).digest('hex');
  const a = Buffer.from(given, 'hex');
  const b = Buffer.from(rec.ticket, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw badRequest('Phiên xác minh không hợp lệ');
  }

  db.otps.remove(e, purpose); // dùng một lần
  return true;
}

/** Dọn OTP hết hạn — chạy định kỳ */
function purge() {
  db.otps.purgeExpired();
}

module.exports = { PURPOSE, issue, verify, consumeTicket, purge };

/**
 * Xác thực & tài khoản: đăng ký, đăng nhập, xác minh email, quên mật khẩu (OTP),
 * hồ sơ cá nhân, đổi mật khẩu và sổ địa chỉ.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const mailer = require('../mailer');
const otpService = require('../otp');
const config = require('../config');
const {
  v, wrap, sign, requireAuth, limiters,
  badRequest, notFound, conflict, HttpError,
} = require('../security');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

/** Dữ liệu user trả ra ngoài — KHÔNG bao giờ chứa hash mật khẩu hay dữ liệu nhạy cảm */
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone || '',
  role: u.role,
  emailVerified: !!u.emailVerified,
  addresses: u.addresses || [],
  createdAt: u.createdAt,
});

/* ==================== ĐĂNG KÝ / ĐĂNG NHẬP ==================== */

/**
 * Chức năng cần gửi được OTP tới hộp thư khách. Ở production mà chưa cấu hình SMTP
 * thì phải TỪ CHỐI thẳng — nếu vẫn cho đăng ký, khách sẽ có tài khoản không bao giờ
 * xác minh được email và không đặt hàng được.
 */
function requireEmailDelivery() {
  if (!config.features.otpFlowsEnabled) {
    throw new HttpError(
      503,
      'Hệ thống gửi email đang tạm ngưng nên chưa thể thực hiện thao tác này. Vui lòng liên hệ cửa hàng để được hỗ trợ.',
      'EMAIL_SERVICE_UNAVAILABLE'
    );
  }
}

router.post('/register', limiters.register, wrap(async (req, res) => {
  requireEmailDelivery();
  const name = v.str(req.body.name, 'họ tên', { min: 2, max: 80 });
  const email = v.email(req.body.email);
  const password = v.password(req.body.password);
  const phone = v.phone(req.body.phone, { required: false });

  if (db.users.byEmail(email)) throw conflict('Email này đã được đăng ký');

  const user = {
    id: db.uid('u'),
    name,
    email,
    phone,
    pass: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role: 'customer',
    emailVerified: false,
    addresses: [],
    tokensValidFrom: Date.now(),
    createdAt: new Date().toISOString(),
  };

  // Địa chỉ nhập sẵn lúc đăng ký (tuỳ chọn) → lưu thành địa chỉ mặc định
  const addr = req.body.address;
  if (addr && typeof addr === 'object' && addr.line1) {
    user.addresses.push({
      id: db.uid('addr'),
      fullName: name,
      phone: phone || '',
      province: String(addr.province || '').slice(0, 100),
      district: String(addr.district || '').slice(0, 100),
      ward: String(addr.ward || '').slice(0, 100),
      line1: String(addr.line1).slice(0, 200),
      note: '',
      isDefault: true,
      createdAt: new Date().toISOString(),
    });
  }

  db.users.insert(user);

  // Gửi ngay mã xác minh email
  const issued = otpService.issue(email, otpService.PURPOSE.VERIFY_EMAIL);
  if (issued.code) mailer.send(email, 'verifyEmail', publicUser(user), issued.code);
  mailer.send(email, 'welcome', publicUser(user));

  res.status(201).json({ token: sign(user), user: publicUser(user) });
}));

router.post('/login', limiters.login, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.users.byEmail(email);

  // So sánh cả khi không tìm thấy user để thời gian phản hồi không tiết lộ email có tồn tại
  const hash = user ? user.pass : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid';
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) throw badRequest('Email hoặc mật khẩu không đúng');

  res.json({ token: sign(user), user: publicUser(user) });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  res.json(publicUser(req.user));
}));

/* ==================== XÁC MINH EMAIL ==================== */

/** Gửi (lại) mã xác minh email cho tài khoản đang đăng nhập */
router.post('/verify-email/send', requireAuth, limiters.otpRequest, wrap(async (req, res) => {
  if (req.user.emailVerified) return res.json({ ok: true, alreadyVerified: true });
  requireEmailDelivery();

  const issued = otpService.issue(req.user.email, otpService.PURPOSE.VERIFY_EMAIL);
  if (issued.cooldown) {
    return res.status(429).json({
      error: `Vui lòng đợi ${issued.cooldown} giây trước khi yêu cầu mã mới`,
      cooldown: issued.cooldown,
    });
  }
  await mailer.send(req.user.email, 'verifyEmail', publicUser(req.user), issued.code);
  res.json({ ok: true, expiresAt: issued.expiresAt });
}));

/** Nhập mã để xác minh email */
router.post('/verify-email/confirm', requireAuth, limiters.otpVerify, wrap(async (req, res) => {
  if (req.user.emailVerified) return res.json({ ok: true, user: publicUser(req.user) });

  const result = otpService.verify(req.user.email, otpService.PURPOSE.VERIFY_EMAIL, req.body.code);
  if (!result.ok) throw badRequest(result.message);

  db.transaction(() => { req.user.emailVerified = true; req.user.verifiedAt = new Date().toISOString(); });
  db.otps.remove(req.user.email, otpService.PURPOSE.VERIFY_EMAIL);

  res.json({ ok: true, user: publicUser(req.user) });
}));

/* ==================== QUÊN MẬT KHẨU (OTP 3 BƯỚC) ==================== */

/**
 * Bước 1 — yêu cầu mã.
 * Luôn trả về cùng một thông điệp dù email có tồn tại hay không, để không cho phép
 * dò xem địa chỉ nào đã đăng ký (user enumeration).
 */
router.post('/forgot-password', limiters.otpRequest, wrap(async (req, res) => {
  requireEmailDelivery();
  const email = v.email(req.body.email);
  const user = db.users.byEmail(email);
  const genericMessage = 'Nếu email này đã được đăng ký, mã xác minh đã được gửi tới hộp thư của bạn.';

  if (user) {
    const issued = otpService.issue(email, otpService.PURPOSE.RESET_PASSWORD);
    if (issued.cooldown) {
      return res.json({ ok: true, message: genericMessage, cooldown: issued.cooldown });
    }
    await mailer.send(email, 'resetPassword', publicUser(user), issued.code);
  }

  res.json({ ok: true, message: genericMessage, ttlMinutes: config.otp.ttlMinutes });
}));

/** Bước 2 — xác minh mã, nhận vé (ticket) cho bước 3 */
router.post('/forgot-password/verify', limiters.otpVerify, wrap(async (req, res) => {
  const email = v.email(req.body.email);
  const code = String(req.body.code || '').replace(/\D/g, '');
  if (code.length !== config.otp.length) throw badRequest(`Mã xác minh phải gồm ${config.otp.length} chữ số`);

  const result = otpService.verify(email, otpService.PURPOSE.RESET_PASSWORD, code);
  if (!result.ok) throw badRequest(result.message);

  res.json({ ok: true, ticket: result.ticket });
}));

/**
 * Bước 3 — đặt mật khẩu mới.
 * Bắt buộc phải có ticket hợp lệ từ bước 2 → không thể gọi thẳng API này để bỏ qua OTP.
 */
router.post('/forgot-password/reset', limiters.otpVerify, wrap(async (req, res) => {
  const email = v.email(req.body.email);
  const password = v.password(req.body.password);
  const confirm = String(req.body.confirmPassword || '');
  if (password !== confirm) throw badRequest('Mật khẩu nhập lại không khớp');

  otpService.consumeTicket(email, otpService.PURPOSE.RESET_PASSWORD, req.body.ticket);

  const user = db.users.byEmail(email);
  if (!user) throw notFound('Không tìm thấy tài khoản');

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  db.transaction(() => {
    user.pass = hash;
    // Vô hiệu hoá mọi token đã phát hành trước thời điểm này
    user.tokensValidFrom = Date.now();
    user.passwordChangedAt = new Date().toISOString();
  });

  mailer.send(user.email, 'passwordChanged', publicUser(user));
  res.json({ ok: true, message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.' });
}));

/* ==================== HỒ SƠ ==================== */

router.put('/profile', requireAuth, limiters.write, wrap(async (req, res) => {
  const name = v.str(req.body.name, 'họ tên', { min: 2, max: 80 });
  const phone = v.phone(req.body.phone, { required: false });

  db.transaction(() => {
    req.user.name = name;
    req.user.phone = phone;
    req.user.updatedAt = new Date().toISOString();
  });
  // Cố tình KHÔNG cho sửa: email, role, emailVerified — tránh leo thang đặc quyền
  res.json(publicUser(req.user));
}));

router.put('/password', requireAuth, limiters.write, wrap(async (req, res) => {
  const current = String(req.body.currentPassword || '');
  const password = v.password(req.body.newPassword);
  const confirm = String(req.body.confirmPassword || '');

  if (!(await bcrypt.compare(current, req.user.pass))) throw badRequest('Mật khẩu hiện tại không đúng');
  if (password !== confirm) throw badRequest('Mật khẩu nhập lại không khớp');
  if (current === password) throw badRequest('Mật khẩu mới phải khác mật khẩu hiện tại');

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  db.transaction(() => {
    req.user.pass = hash;
    req.user.tokensValidFrom = Date.now();
    req.user.passwordChangedAt = new Date().toISOString();
  });

  mailer.send(req.user.email, 'passwordChanged', publicUser(req.user));
  // Token cũ vừa bị vô hiệu → cấp token mới để người dùng không bị đăng xuất đột ngột
  res.json({ ok: true, token: sign(req.user) });
}));

/* ==================== SỔ ĐỊA CHỈ ==================== */

function readAddress(body) {
  return {
    fullName: v.str(body.fullName, 'họ tên người nhận', { min: 2, max: 80 }),
    phone: v.phone(body.phone),
    province: v.str(body.province, 'Tỉnh/Thành phố', { max: 100 }),
    district: v.str(body.district, 'Quận/Huyện', { max: 100 }),
    ward: v.str(body.ward, 'Phường/Xã', { max: 100 }),
    line1: v.str(body.line1, 'địa chỉ chi tiết', { min: 3, max: 200 }),
    note: v.str(body.note, 'ghi chú', { required: false, max: 200 }),
  };
}

router.get('/addresses', requireAuth, wrap(async (req, res) => {
  res.json(req.user.addresses || []);
}));

router.post('/addresses', requireAuth, limiters.write, wrap(async (req, res) => {
  const data = readAddress(req.body);
  if ((req.user.addresses || []).length >= 20) throw badRequest('Bạn chỉ có thể lưu tối đa 20 địa chỉ');

  const address = {
    id: db.uid('addr'),
    ...data,
    isDefault: !!req.body.isDefault || (req.user.addresses || []).length === 0,
    createdAt: new Date().toISOString(),
  };

  db.transaction(() => {
    if (!Array.isArray(req.user.addresses)) req.user.addresses = [];
    if (address.isDefault) req.user.addresses.forEach((a) => { a.isDefault = false; });
    req.user.addresses.push(address);
  });

  res.status(201).json(address);
}));

router.put('/addresses/:id', requireAuth, limiters.write, wrap(async (req, res) => {
  const address = (req.user.addresses || []).find((a) => a.id === req.params.id);
  if (!address) throw notFound('Không tìm thấy địa chỉ');
  const data = readAddress(req.body);

  db.transaction(() => {
    Object.assign(address, data, { updatedAt: new Date().toISOString() });
    if (req.body.isDefault) {
      req.user.addresses.forEach((a) => { a.isDefault = a.id === address.id; });
    }
  });

  res.json(address);
}));

router.delete('/addresses/:id', requireAuth, limiters.write, wrap(async (req, res) => {
  const list = req.user.addresses || [];
  const index = list.findIndex((a) => a.id === req.params.id);
  if (index < 0) throw notFound('Không tìm thấy địa chỉ');

  db.transaction(() => {
    const [removed] = list.splice(index, 1);
    // Xoá địa chỉ mặc định → đặt địa chỉ đầu tiên còn lại làm mặc định
    if (removed.isDefault && list.length) list[0].isDefault = true;
  });

  res.json({ ok: true });
}));

router.put('/addresses/:id/default', requireAuth, limiters.write, wrap(async (req, res) => {
  const list = req.user.addresses || [];
  if (!list.some((a) => a.id === req.params.id)) throw notFound('Không tìm thấy địa chỉ');
  db.transaction(() => { list.forEach((a) => { a.isDefault = a.id === req.params.id; }); });
  res.json(list);
}));

module.exports = { router, publicUser };

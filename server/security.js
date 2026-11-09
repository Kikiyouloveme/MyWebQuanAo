/**
 * Bảo mật dùng chung: security headers, rate limit, xác thực JWT, phân quyền,
 * validate/sanitize input và xử lý lỗi thống nhất.
 */
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const config = require('./config');
const db = require('./db');

/* ---------------- headers ---------------- */

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Vite build nhúng style inline; font lấy từ Google Fonts
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],       // preview email trong admin dùng iframe srcdoc
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", 'https://sandbox.vnpayment.vn', 'https://vnpayment.vn'],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  // Cho phép trình duyệt tải ảnh sản phẩm từ cùng origin khi nhúng
  crossOriginResourcePolicy: { policy: 'same-site' },
});

/* ---------------- rate limit ---------------- */

/**
 * Cho phép tắt rate limit khi chạy bộ kiểm thử tự động — nếu không, chính bộ test
 * sẽ tự làm mình bị chặn. Cờ này bị BỎ QUA hoàn toàn ở production để không ai
 * vô hiệu hoá được lớp bảo vệ bằng biến môi trường.
 */
const RATE_LIMIT_DISABLED = !config.isProd && process.env.DISABLE_RATE_LIMIT === '1';
if (RATE_LIMIT_DISABLED) {
  console.warn('[VELATHIER] Cảnh báo: rate limit đang TẮT (chỉ dành cho kiểm thử).');
}

const makeLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => RATE_LIMIT_DISABLED,
    // Đếm theo danh tính cụ thể nhất có được, để một người không khoá được người khác:
    //   1. Tài khoản đang đăng nhập (chính xác nhất)
    //   2. Email gửi trong body (các luồng chưa đăng nhập: login, quên mật khẩu)
    //   3. Chỉ IP (phần còn lại)
    // ipKeyGenerator chuẩn hoá IPv6 về /64 — nếu tự ghép req.ip, người dùng IPv6
    // chỉ cần đổi địa chỉ trong cùng dải là vượt được giới hạn.
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip);
      if (req.user?.id) return `${ip}|u:${req.user.id}`;
      const email = String(req.body?.email || '').toLowerCase().trim();
      return email ? `${ip}|e:${email}` : ip;
    },
    handler: (_req, res) => res.status(429).json({ error: message }),
  });

const limiters = {
  printUpload: makeLimiter(60*1000,20,'Bạn đã tải quá nhiều ảnh. Vui lòng đợi một phút.'),
  /** Đăng nhập: 10 lần / 15 phút */
  login: makeLimiter(15 * 60 * 1000, 10, 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.'),
  /** Đăng ký: 5 tài khoản / giờ / IP */
  register: makeLimiter(60 * 60 * 1000, 5, 'Bạn đã tạo quá nhiều tài khoản. Vui lòng thử lại sau.'),
  /** Yêu cầu OTP: 5 lần / 15 phút */
  otpRequest: makeLimiter(15 * 60 * 1000, 5, 'Bạn đã yêu cầu mã xác minh quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.'),
  /** Nhập OTP: 10 lần / 15 phút */
  otpVerify: makeLimiter(15 * 60 * 1000, 10, 'Bạn đã nhập sai quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.'),
  /**
   * API ghi dữ liệu nói chung. Nới rộng hơn các endpoint xác thực vì nhân viên
   * xử lý đơn hàng thao tác liên tục; các endpoint nhạy cảm đã có giới hạn riêng.
   */
  write: makeLimiter(60 * 1000, 240, 'Bạn thao tác quá nhanh. Vui lòng thử lại sau giây lát.'),
};

/* ---------------- lỗi có mã HTTP ---------------- */

/**
 * Lỗi do chính mình chủ động ném ra — nội dung thông báo đã được soạn để hiển thị
 * cho người dùng nên an toàn, không cần che ở production.
 * Lỗi ngoài dự kiến (bug, thư viện ném ra) KHÔNG phải HttpError nên vẫn bị che.
 */
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}
const badRequest = (m, code) => new HttpError(400, m, code);
const unauthorized = (m = 'Bạn cần đăng nhập để tiếp tục') => new HttpError(401, m);
const forbidden = (m = 'Bạn không có quyền thực hiện thao tác này') => new HttpError(403, m);
const notFound = (m = 'Không tìm thấy dữ liệu') => new HttpError(404, m);
const conflict = (m) => new HttpError(409, m);

/** Bọc handler async để lỗi throw ra được chuyển tới errorHandler thay vì treo request */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Handler lỗi cuối chuỗi — không bao giờ để lộ stack trace ra ngoài production */
function errorHandler(err, _req, res, _next) {
  const status = err.code === 11000 ? 409 : ['ValidationError', 'CastError'].includes(err.name) ? 400 : err.status || 500;
  if (err.code === 11000) err.message = 'Dữ liệu bị trùng (email, mã sản phẩm hoặc mã voucher).';
  if (status >= 500) {
    console.error('[VELATHIER] Lỗi máy chủ:', err);
  }

  // Chỉ che thông báo của lỗi NGOÀI dự kiến — chúng có thể lộ chi tiết nội bộ.
  // Lỗi mình chủ động ném (HttpError) đã có thông báo soạn sẵn cho người dùng,
  // che đi sẽ khiến khách không biết vì sao thao tác thất bại.
  const shouldMask = status >= 500 && config.isProd && !err.expose;

  const body = {
    error: shouldMask
      ? 'Đã xảy ra lỗi phía máy chủ. Vui lòng thử lại sau.'
      : err.message || 'Lỗi không xác định',
  };
  if (err.code) body.code = err.code;
  if (!config.isProd && status >= 500) body.stack = err.stack;
  res.status(status).json(body);
}

/* ---------------- xác thực & phân quyền ---------------- */

function sign(user) {
  return jwt.sign(
    { id: user.id, role: user.role, v: user.tokensValidFrom || 0 },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/**
 * Giải mã token và trả về user tương ứng, hoặc null.
 * Tách riêng khỏi middleware để các middleware bên dưới không phải lồng callback
 * (lồng nhau khiến lỗi 401 bị nuốt và biến thành 500).
 */
function resolveUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = db.users.byId(payload.id);
    // Token phát hành trước lần đổi mật khẩu gần nhất bị coi là hết hiệu lực
    if (user && !(config.isProd && (['u_demo','u_staff','u_admin'].includes(user.id) || user.disabled)) && (payload.v || 0) >= (user.tokensValidFrom || 0)) return user;
  } catch { /* token hỏng/hết hạn → coi như khách */ }
  return null;
}

/** Đọc token nếu có, không bắt buộc. Gắn req.user hoặc null. */
function optionalAuth(req, _res, next) {
  req.user = resolveUser(req);
  next();
}

/** Bắt buộc đăng nhập */
function requireAuth(req, _res, next) {
  req.user = resolveUser(req);
  if (!req.user) return next(unauthorized('Phiên đăng nhập không hợp lệ hoặc đã hết hạn'));
  next();
}

/** Bắt buộc đã xác minh email — dùng cho đặt hàng */
function requireVerified(req, _res, next) {
  req.user = resolveUser(req);
  if (!req.user) return next(unauthorized('Bạn cần đăng nhập để đặt hàng'));
  if (!req.user.emailVerified) {
    return next(new HttpError(403, 'Bạn cần xác minh email trước khi đặt hàng', 'EMAIL_NOT_VERIFIED'));
  }
  next();
}

/** Bắt buộc thuộc một trong các vai trò */
const requireRole = (...roles) => (req, _res, next) => {
  req.user = resolveUser(req);
  if (!req.user) return next(unauthorized('Phiên đăng nhập không hợp lệ hoặc đã hết hạn'));
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};

const requireStaff = requireRole('admin', 'staff');
const requireAdmin = requireRole('admin');

/* ---------------- validate & sanitize ---------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Số điện thoại Việt Nam: 0xxxxxxxxx hoặc +84xxxxxxxxx
const PHONE_RE = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

const v = {
  str(value, field, { min = 0, max = 500, required = true } = {}) {
    const s = typeof value === 'string' ? value.trim() : '';
    if (!s) {
      if (required) throw badRequest(`Vui lòng nhập ${field}`);
      return '';
    }
    if (s.length < min) throw badRequest(`${field} phải có ít nhất ${min} ký tự`);
    if (s.length > max) throw badRequest(`${field} không được quá ${max} ký tự`);
    return s;
  },
  email(value) {
    const e = String(value || '').trim().toLowerCase();
    if (!e) throw badRequest('Vui lòng nhập email');
    if (!EMAIL_RE.test(e) || e.length > 254) throw badRequest('Email không hợp lệ');
    return e;
  },
  phone(value, { required = true } = {}) {
    const p = String(value || '').replace(/[\s.-]/g, '');
    if (!p) {
      if (required) throw badRequest('Vui lòng nhập số điện thoại');
      return '';
    }
    if (!PHONE_RE.test(p)) throw badRequest('Số điện thoại không hợp lệ (ví dụ: 0901234567)');
    return p;
  },
  password(value) {
    const p = String(value || '');
    if (p.length < 8) throw badRequest('Mật khẩu phải có ít nhất 8 ký tự');
    if (p.length > 72) throw badRequest('Mật khẩu không được quá 72 ký tự'); // giới hạn của bcrypt
    if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) throw badRequest('Mật khẩu phải gồm cả chữ và số');
    return p;
  },
  int(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) throw badRequest(`${field} phải là số nguyên`);
    if (n < min || n > max) throw badRequest(`${field} phải nằm trong khoảng ${min}–${max}`);
    return n;
  },
  oneOf(value, allowed, field) {
    if (!allowed.includes(value)) throw badRequest(`${field} không hợp lệ`);
    return value;
  },
  /** Chỉ giữ ký tự an toàn cho mã voucher */
  code(value) {
    const c = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!c) throw badRequest('Mã giảm giá không hợp lệ');
    if (c.length > 32) throw badRequest('Mã giảm giá quá dài');
    return c;
  },
};

module.exports = {
  securityHeaders, limiters, RATE_LIMIT_DISABLED,
  HttpError, badRequest, unauthorized, forbidden, notFound, conflict,
  wrap, errorHandler,
  sign, optionalAuth, requireAuth, requireVerified, requireRole, requireStaff, requireAdmin,
  v,
};

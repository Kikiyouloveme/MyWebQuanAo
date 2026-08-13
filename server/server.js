/**
 * VELATHIER — máy chủ ứng dụng.
 * Express + JWT + VNPay + email. Phục vụ cả REST API và bản build React (SPA).
 */
const config = require('./config'); // PHẢI đứng đầu — nạp .env trước mọi module khác
const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const multer = require('multer');

const db = require('./db');
const mailer = require('./mailer');
const vnpay = require('./vnpay');
const otpService = require('./otp');
const { securityHeaders, errorHandler, wrap, requireStaff, limiters, badRequest, RATE_LIMIT_DISABLED } = require('./security');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const voucherRoutes = require('./routes/vouchers');
const returnRoutes = require('./routes/returns');
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');

const app = express();
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'client', 'dist');

/* ==================== MIDDLEWARE NỀN ==================== */

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/* ==================== TÀI NGUYÊN TĨNH ==================== */

// Bundle Vite có hash trong tên → cache vĩnh viễn
if (fs.existsSync(DIST)) {
  app.use('/assets', express.static(path.join(DIST, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(DIST, {
    index: false,
    // index.html không được cache: nó trỏ tới bundle có hash, cache lại sẽ khiến
    // trình duyệt xin file đã bị xoá sau khi build lại → trang trắng.
    setHeaders: (res, filePath) => {
      res.setHeader('Cache-Control', filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=3600');
    },
  }));
}
// Ảnh sản phẩm và ảnh khách tải lên
app.use('/assets', express.static(path.join(ROOT, 'assets'), { maxAge: '30d' }));

// Asset không tồn tại phải trả 404 thật — nếu để rơi xuống SPA fallback, trình duyệt
// sẽ nhận HTML cho request .js → sai MIME type → trang trắng khó lần ra nguyên nhân.
app.use('/assets', (_req, res) => res.status(404).type('text/plain').send('Not found'));

/* ==================== UPLOAD ẢNH SẢN PHẨM ==================== */

const UPLOAD_DIR = path.join(ROOT, 'assets', 'img', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const uploadProduct = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg' }[file.mimetype] || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.mimetype)) {
      return cb(badRequest('Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc SVG (tối đa 5MB)'));
    }
    cb(null, true);
  },
});

app.post('/api/upload', requireStaff, limiters.write, uploadProduct.single('image'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('Chưa chọn file ảnh hợp lệ');
  res.json({ url: '/assets/img/uploads/' + req.file.filename });
}));

/* ==================== API ==================== */

app.use('/api/auth', authRoutes.router);
app.use('/api/products', productRoutes.router);
app.use('/api/orders', orderRoutes.router);
app.use('/api/payment', paymentRoutes.router);
app.use('/api/vouchers', voucherRoutes.router);
app.use('/api/returns', returnRoutes.router);
app.use('/api/contact', contactRoutes.router);
app.use('/api/admin', adminRoutes.router);

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  schemaVersion: db.SCHEMA_VERSION,
  vnpay: vnpay.isLive() ? 'live' : 'sandbox',
  mail: mailer.isLive() ? 'smtp' : 'outbox',
  rateLimit: RATE_LIMIT_DISABLED ? 'off' : 'on',
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'API không tồn tại' }));

/* ==================== SEO ==================== */

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\n` +
    ['/admin', '/checkout', '/account', '/orders', '/login', '/register', '/forgot-password', '/payment']
      .map((p) => `Disallow: ${p}`).join('\n') +
    `\n\nSitemap: ${config.publicUrl}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', (_req, res) => {
  const urls = [
    { loc: '/', priority: '1.0', freq: 'daily' },
    { loc: '/shop', priority: '0.9', freq: 'daily' },
    { loc: '/about', priority: '0.5', freq: 'monthly' },
    { loc: '/contact', priority: '0.5', freq: 'monthly' },
    { loc: '/news', priority: '0.6', freq: 'weekly' },
    ...productRoutes.CATEGORIES.map((c) => ({ loc: `/shop?cat=${c}`, priority: '0.7', freq: 'weekly' })),
    ...db.products.active().map((p) => ({ loc: `/product/${p.id}`, priority: '0.8', freq: 'weekly' })),
  ];
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) =>
      `  <url><loc>${config.publicUrl}${u.loc.replace(/&/g, '&amp;')}</loc>` +
      `<changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`
    ).join('\n') +
    `\n</urlset>`
  );
});

/* ==================== SPA ==================== */

app.get('*', (_req, res) => {
  const indexFile = path.join(DIST, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.set('Cache-Control', 'no-cache');
    return res.sendFile(indexFile);
  }
  res.status(503).type('text/plain').send('Giao diện chưa được build. Chạy: npm run build');
});

/* ==================== LỖI ==================== */

app.use(errorHandler);

/* ==================== KHỞI ĐỘNG ==================== */

db.load(); // nạp + migrate dữ liệu ngay khi khởi động để lỗi schema lộ ra sớm

// Dọn OTP hết hạn mỗi 15 phút
const otpCleanup = setInterval(() => otpService.purge(), 15 * 60 * 1000);
otpCleanup.unref();

// Hủy đơn quá hạn thanh toán để trả hàng về kho — chạy ngay khi khởi động rồi lặp lại
const { sweepExpired } = require('./payment-lifecycle');
const { addHistory, STATUS } = require('./routes/orders');
const sweep = () => {
  try {
    const n = sweepExpired(addHistory, STATUS);
    if (n) console.log(`[VELATHIER] Đã hủy ${n} đơn quá hạn thanh toán và trả hàng về kho`);
  } catch (e) {
    console.error('[VELATHIER] Lỗi khi quét đơn quá hạn:', e.message);
  }
};
sweep();
const paymentSweep = setInterval(sweep, 5 * 60 * 1000);
paymentSweep.unref();

const server = app.listen(config.port, () => {
  console.log(`\nVELATHIER — http://localhost:${config.port}`);
  console.log(`  Môi trường : ${config.isProd ? 'production' : 'development'}`);
  console.log(`  VNPay      : ${vnpay.isLive() ? 'LIVE' : 'Sandbox nội bộ (chưa cấu hình VNP_TMN_CODE)'}`);
  console.log(`  Email      : ${mailer.isLive() ? 'SMTP' : 'Outbox (xem tại Admin → Email)'}`);
  console.log(`  Phí ship   : ${config.shipping.flatFee.toLocaleString('vi-VN')}₫ · miễn phí từ ${config.shipping.freeThreshold.toLocaleString('vi-VN')}₫\n`);
});

// Tắt máy chủ êm — hoàn tất request đang chạy rồi mới thoát
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`\n[VELATHIER] Nhận ${signal}, đang tắt máy chủ…`);
    server.close(() => { db.saveNow(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}

module.exports = app;

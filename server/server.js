/**
 * VELATHIER — máy chủ ứng dụng.
 * Express + JWT + VNPay + email. Phục vụ cả REST API và bản build React (SPA).
 */
const config = require('./config'); // PHẢI đứng đầu — nạp .env trước mọi module khác
const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const { AsyncResource } = require('node:async_hooks');

const db = require('./db');
const mailer = require('./mailer');
const vnpay = require('./vnpay');
const otpService = require('./otp');
const { securityHeaders, errorHandler, wrap, requireStaff, requireAuth, notFound, limiters, badRequest, RATE_LIMIT_DISABLED } = require('./security');

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

app.set('trust proxy', process.env.TRUST_PROXY ? process.env.TRUST_PROXY.split(',').map(s=>s.trim()) : false);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cors({ origin: config.corsOrigins }));
app.use((req,res,next)=>{
  const requestId=require('node:crypto').randomUUID(),started=Date.now();res.set('X-Request-Id',requestId);
  res.on('finish',()=>{if(config.isProd && (req.method!=='GET'||res.statusCode>=400))console.log(JSON.stringify({kind:'request-audit',requestId,method:req.method,path:req.path.slice(0,160),status:res.statusCode,userId:req.user?.id||null,ip:req.ip,durationMs:Date.now()-started}));});next();
});

/* ==================== TÀI NGUYÊN TĨNH ==================== */

// Preserve historical URLs while removing public access to customer return evidence.
app.get('/assets/img/returns/:key',db.middleware,requireAuth,wrap(async(req,res)=>{
  const key=req.params.key;if(!/^[a-zA-Z0-9_.-]+$/.test(key)||key.includes('..'))throw notFound();
  const ret=db.returns.all().find(r=>(r.photos||[]).includes('/assets/img/returns/'+key));
  if(!ret||(ret.userId!==req.user.id&&!['admin','staff'].includes(req.user.role)))throw notFound();
  const bytes=key.startsWith('retproof_')?await require('./private-storage').read('returns/'+key):await fs.promises.readFile(path.join(ROOT,'assets','img','returns',key));
  res.set('Cache-Control','private, no-store').type(key.endsWith('.webp')?'webp':key.endsWith('.png')?'png':'jpeg').send(bytes);
}));

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
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
      return cb(badRequest('Chỉ chấp nhận ảnh JPG, PNG, WEBP (tối đa 5MB)'));
    }
    cb(null, true);
  },
});

app.use('/api', (req,res,next) => {
  // Public catalog uses targeted repositories and never joins the serialized unit of work.
  if(req.method==='GET' && /^\/products(?:\/[^/]+)?\/?$/.test(req.path))return next();
  return db.middleware(req,res,next);
});
app.use('/sitemap.xml', db.middleware);

app.post('/api/upload', requireStaff, limiters.write, (req,res,next)=>uploadProduct.single('image')(req,res,AsyncResource.bind(e=>next(e ? badRequest('Ảnh JPG/PNG/WebP tối đa 5MB') : undefined))), wrap(async (req, res) => {
  if (!req.file) throw badRequest('Chưa chọn file ảnh hợp lệ');
  let buffer;
  try {const input=sharp(req.file.buffer,{limitInputPixels:25000000,failOn:'warning'});const meta=await input.metadata();if(!['png','jpeg','webp'].includes(meta.format)||meta.pages>1)throw Error();buffer=await input.rotate().resize(2000,2500,{fit:'inside',withoutEnlargement:true}).webp().toBuffer();}catch{throw badRequest('Ảnh hỏng hoặc sai định dạng');}
  const filename=db.uid('catalog')+'.webp';
  await fs.promises.writeFile(path.join(UPLOAD_DIR,filename),buffer,{flag:'wx'});
  res.json({ url: '/assets/img/uploads/' + filename });
}));

/* ==================== API ==================== */

app.use('/api', require('./routes/reviews').router);
app.use('/api', require('./routes/review-photos').router);
app.use('/api', require('./routes/custom-print').router);
app.use('/api/auth', authRoutes.router);
app.use('/api/products', productRoutes.router);
app.use('/api/orders', orderRoutes.router);
app.use('/api/payment', paymentRoutes.router);
app.use('/api/vouchers', voucherRoutes.router);
app.use('/api/returns', returnRoutes.router);
app.use('/api/contact', contactRoutes.router);
app.use('/api/admin', adminRoutes.router);

app.get('/api/health', (_req, res) => res.json({
  ok: db.status().connected,
  database: db.status(),
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

async function start() {
await db.connect();
const outboxTimer = require('./outbox-worker').start();
const notificationTimer = setInterval(() => db.run(() => require('./custom-print').flushNotifications()).catch(e => console.error('[notifications]',e.message)), 15000);
notificationTimer.unref();

// Dọn OTP hết hạn mỗi 15 phút
const otpCleanup = setInterval(() => db.run(() => otpService.purge()).catch((e) => console.error(e.message)), 15 * 60 * 1000);
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
await db.run(sweep);
const paymentSweep = setInterval(() => db.run(sweep).catch((e) => console.error(e.message)), 5 * 60 * 1000);
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
    clearInterval(otpCleanup);
    clearInterval(notificationTimer);
    clearInterval(outboxTimer);
    clearInterval(paymentSweep);
    server.close(async () => { await db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}

}

if (require.main === module) start().catch(async () => {
  console.error("[MongoDB] Không thể khởi động. Kiểm tra MongoDB service và MONGO_URI trong .env.");
  await db.close();
  process.exitCode = 1;
});
module.exports = { app, start };

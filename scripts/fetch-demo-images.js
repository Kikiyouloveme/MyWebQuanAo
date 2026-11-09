#!/usr/bin/env node
/**
 * Tải ảnh demo ngẫu nhiên từ Openverse — có giới hạn.
 *
 * Ràng buộc được mã hoá cứng trong script (không phải quy ước):
 *  - CHỈ chấp nhận license cc0 hoặc pdm. Không attribution, dùng thương mại được.
 *  - CHỈ 12 truy vấn thuộc allowlist bên dưới. Không nhận từ khoá từ bên ngoài.
 *  - Tối đa MAX_TOTAL ảnh mỗi lần chạy, tối đa PER_PRODUCT cho mỗi loại.
 *  - Tối thiểu MIN_WIDTH × MIN_HEIGHT, loại ảnh quá nhỏ.
 *  - Không ghi đè file đã có. Không tải lại ảnh đã nằm trong manifest.
 *  - Mọi ảnh được ghi vào manifest kèm nguồn + giấy phép + bằng chứng.
 *
 * Cách dùng:  node scripts/fetch-demo-images.js
 * Xoá ảnh:    node scripts/fetch-demo-images.js --clean
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'img', 'web');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');

/** Allowlist: mỗi product type có thể có nhiều truy vấn, chọn ngẫu nhiên 1 */
const QUERIES = {
  'tee-boxy-01':          ['t shirt', 'tshirt'],
  'tee-heavy-02':         ['t shirt', 'tshirt'],
  'shirt-flannel-03':     ['plaid shirt', 'flannel shirt'],
  'hoodie-mono-04':       ['hoodie', 'sweatshirt'],
  'jacket-coach-05':      ['jacket', 'coat'],
  'varsity-06':           ['varsity jacket', 'bomber jacket'],
  'pants-wide-07':        ['trousers', 'pants'],
  'pants-cargo-08':       ['cargo pants', 'trousers'],
  'shorts-sweat-09':      ['shorts', 'shorts clothing'],
  'cap-6panel-10':        ['baseball cap', 'cap hat'],
  'tote-canvas-11':       ['tote bag', 'canvas bag'],
  'socks-crew-12':        ['socks', 'ankle socks'],
};

const ALLOWED_LICENSES = ['cc0', 'pdm'];   // hard filter, không đổi qua tham số
const MAX_TOTAL = 24;                       // trần cứng cho cả lần chạy
const PER_PRODUCT = 2;                      // trần cứng cho mỗi sản phẩm
const MIN_WIDTH = 600;
const MIN_HEIGHT = 600;
const API = 'https://api.openverse.org/v1/images/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(query) {
  const url = `${API}?q=${encodeURIComponent(query)}` +
    `&license=${ALLOWED_LICENSES.join(',')}` +
    `&page_size=20&mature=false`;
  const res = await fetch(url, { headers: { 'User-Agent': 'VELATHIER-demo-fetch/1.0' } });
  if (!res.ok) throw new Error(`Openverse ${res.status}`);
  return (await res.json()).results || [];
}

/** Loại ứng viên không dùng được trước khi tải bytes */
function usable(r) {
  return Boolean(
    r.url &&
    String(r.url).startsWith('https://') &&
    ALLOWED_LICENSES.includes(r.license) &&
    r.width >= MIN_WIDTH &&
    r.height >= MIN_HEIGHT
  );
}

function extFrom(url, contentType) {
  const m = /\.(jpe?g|png|webp)$/i.exec(new URL(url).pathname);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  return 'jpg';
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'VELATHIER-demo-fetch/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`không phải ảnh: ${type}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 12 * 1024 * 1024) throw new Error('ảnh quá lớn');
  await fs.writeFile(dest, buf);
  return { bytes: buf.length, type };
}

function entryFor(r, productId, file) {
  return {
    assetId: path.parse(file).name,
    productId,
    localPath: '/assets/img/web/' + file,
    sourceName: r.source || r.creator || 'Openverse',
    sourceURL: r.foreign_landing_url || r.url,
    licenseType: r.license === 'cc0' ? 'CC0 1.0' : 'Public Domain Mark 1.0',
    licenseEvidence: r.license_url || 'https://opensearch.org/',
    attribution: [r.creator, r.title].filter(Boolean).join(' — ').slice(0, 280),
    altText: (r.title || productId).slice(0, 200),
    verifiedAt: new Date().toISOString().slice(0, 10),
  };
}

async function loadManifest() {
  try { return JSON.parse(await fs.readFile(MANIFEST, 'utf8')); }
  catch { return []; }
}

async function main() {
  if (process.argv.includes('--clean')) {
    await fs.rm(OUT_DIR, { recursive: true, force: true });
    console.log(`Đã xoá ${OUT_DIR}`);
    return;
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const manifest = await loadManifest();
  const seen = new Set(manifest.map((m) => m.sourceURL));
  const perProduct = manifest.reduce((a, m) => ((a[m.productId] = (a[m.productId] || 0) + 1), a), {});
  let added = 0;

  for (const [productId, queries] of Object.entries(QUERIES)) {
    if (added >= MAX_TOTAL) { console.log(`Chạm trần ${MAX_TOTAL} ảnh, dừng.`); break; }
    const room = Math.min(PER_PRODUCT - (perProduct[productId] || 0), MAX_TOTAL - added);
    if (room <= 0) continue;

    const query = queries[Math.floor(Math.random() * queries.length)];
    let results;
    try { results = await search(query); }
    catch (e) { console.warn(`[bỏ] ${productId}: ${e.message}`); continue; }

    const pool = results.filter((r) => usable(r) && !seen.has(r.foreign_landing_url));
    if (!pool.length) { console.log(`[trống] ${productId} ("${query}")`); continue; }

    // Xáo trộn rồi thử lần lượt cho tới khi đủ hoặc hết ứng viên
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    let got = 0;
    for (const r of pool) {
      if (got >= room) break;
      const ext = extFrom(r.url, null);
      const file = `${productId}-web-${manifest.length + 1}.${ext}`;
      const dest = path.join(OUT_DIR, file);
      try {
        await fs.access(dest); // đã tồn tại → bỏ qua
        continue;
      } catch { /* chưa có, tiếp tục */ }
      try {
        const { bytes } = await download(r.url, dest);
        manifest.push(entryFor(r, productId, file));
        seen.add(r.foreign_landing_url);
        got++; added++;
        console.log(`+ ${productId} ← "${query}" (${(bytes / 1024).toFixed(0)}KB, ${r.license})`);
      } catch (e) {
        console.warn(`  [lỗi tải] ${e.message}`);
      }
      await sleep(350); // tôn trọng rate limit của Openverse
    }
  }

  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`\nTổng: ${added} ảnh mới, ${manifest.length} trong manifest → ${MANIFEST}`);
  console.log('Đăng ký vào sản phẩm: PUT /api/admin/products/:id/media với mảng media từ manifest.');
}

main().catch((e) => { console.error(e); process.exit(1); });

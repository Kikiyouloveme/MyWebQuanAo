const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { conflict, badRequest } = require('./security');
const storage=require('./private-storage');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pixels = (mm, dpi) => Math.round(mm / 25.4 * dpi);
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
async function renderSide(snapshot, side, assets) {
  const area = snapshot.settings.areas[side];
  const dpi = snapshot.settings.exportDpi || snapshot.settings.recommendedDpi;
  const width = pixels(area.widthMM, dpi), height = pixels(area.heightMM, dpi);
  if (width * height > 40000000) throw badRequest('Bản xuất vượt giới hạn 40 megapixel; cần giảm kích thước hoặc DPI xuất.');
  const overlays = [], sources = [];
  for (const layer of snapshot.layers[side]) {
    const w = Math.max(1, Math.round(layer.width * width)), h = Math.max(1, Math.round(layer.height * height));
    let buffer;
    if (layer.type === 'image') {
      const asset = assets.find(a => a.id === layer.assetId);
      if (!asset || !/^[a-zA-Z0-9_.-]+$/.test(asset.storageKey)) throw conflict('Thiếu artwork gốc');
      const original = await storage.read('artwork/'+asset.storageKey);
      if (digest(original) !== asset.sha256) throw conflict('Artwork gốc không khớp hash');
      if (!require('./print-srs').isSrs(snapshot.settings) && Math.min(asset.width / (layer.width * area.widthMM / 25.4), asset.height / (layer.height * area.heightMM / 25.4)) < snapshot.settings.minDpi) throw badRequest('Artwork dưới DPI tối thiểu');
      sources.push({ assetId: asset.id, sha256: asset.sha256 });
      buffer = await sharp(original).rotate().resize(w, h, { fit: 'fill' }).ensureAlpha().png().toBuffer();
    } else {
      const file = { Arial: 'arial.ttf', Georgia: 'georgia.ttf', 'Courier New': 'cour.ttf' }[layer.font];
      if (!file) throw badRequest('Font không được hỗ trợ');
      const fontfile = path.join(process.env.PRINT_FONT_DIR || 'C:/Windows/Fonts', file);
      const fontBytes = await fs.readFile(fontfile).catch(() => { throw conflict('Máy xuất thiếu font được cấp phép. Cấu hình PRINT_FONT_DIR trước khi duyệt.'); });
      sources.push({ font: layer.font, sha256: digest(fontBytes) });
      const text = await sharp({ text: { text: `<span foreground="${escape(layer.color)}">${escape(layer.text)}</span>`, font: `${layer.font} ${Math.max(1, h * .7 * (layer.fontSize || 32) / 32)}`, fontfile, dpi: 72, rgba: true, wrap: 'none' } }).png().toBuffer();
      const fitted = await sharp(text).resize(w, h, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      buffer = await sharp({ create: { width: w, height: h, channels: 4, background: transparent } }).composite([{input:fitted,gravity:'centre'}]).png().toBuffer();
    }
    const rotated = await sharp(buffer).rotate(layer.rotation, { background: transparent }).png().toBuffer({ resolveWithObject: true });
    const left = Math.round(layer.x * width - rotated.info.width / 2), top = Math.round(layer.y * height - rotated.info.height / 2);
    if (left < 0 || top < 0 || left + rotated.info.width > width || top + rotated.info.height > height) throw badRequest('Lớp in vượt vùng xuất sau xoay; thu nhỏ hoặc căn lại thiết kế.');
    overlays.push({input:rotated.data,left,top});
  }
  const buffer = await sharp({create:{width,height,channels:4,background:transparent}}).composite(overlays).withMetadata({density:dpi}).png().toBuffer();
  return {buffer, manifest:{width,height,dpi,widthMM:area.widthMM,heightMM:area.heightMM,technique:snapshot.settings.technique,sha256:digest(buffer),sources}};
}
async function generate(job) {
  const cp = require('./custom-print');
  if (!job.proof) throw conflict('Chưa có mẫu duyệt');
  if (job.proof.exports) return job;
  const exports = {};
  for (const side of (job.workflowMode==='srs'?['front','back','left_chest']:cp.sides)) {
    const physicalSide=side==='left_chest'?'front':side;
    const snapshot=structuredClone(job.proof.snapshot);
    if(job.workflowMode==='srs'){snapshot.layers[side]=(snapshot.layers[physicalSide]||[]).filter(l=>(l.position||physicalSide.toUpperCase())===side.toUpperCase());snapshot.settings.areas[side]=snapshot.settings.positions[side.toUpperCase()];}
    if (!snapshot.layers[side].length) continue;
    const result = await renderSide(snapshot, side, cp.all('designAssets'));
    const key = `${job.proof.id}-${side}.png`;
    await storage.put('proofs/'+key,result.buffer);
    require('./mongo-store').onRollback(()=>storage.remove('proofs/'+key).catch(()=>{}));
    exports[side] = {...result.manifest,key};
  }
  job.proof.exports = exports;
  job.proof.rendererVersion = 1;
  job.proof.qualification = 'operator-validation-required';
  job.proof.hash = cp.hash({snapshot:job.proof.snapshot,exports,rendererVersion:1});
  return job;
}
async function read(job, side, approved = false) {
  const cp = require('./custom-print'), proof = job.proof;
  if (!proof?.exports || job.status === 'CANCELLED' || proof.revisionId !== job.designRevisionId || cp.hash(job.snapshot) !== cp.hash(proof.snapshot)) throw conflict('Mẫu xuất đã hết hiệu lực; cần duyệt lại');
  if (proof.hash !== cp.hash({snapshot:proof.snapshot,exports:proof.exports,rendererVersion:proof.rendererVersion})) throw conflict('Manifest mẫu in không khớp');
  if(approved&&job.workflowMode==='srs'&&job.staffApproval?.revisionId!==job.designRevisionId)throw conflict('Thiết kế chưa được nhân viên duyệt đúng phiên bản');
  if (approved && job.workflowMode!=='srs' && (job.customerApproval?.hash !== proof.hash || job.customerApproval?.proofId !== proof.id)) throw conflict('Khách chưa xác nhận đúng bản xuất');
  const entry = proof.exports[side];
  if (!entry || !/^proof_[a-z0-9]+-(front|back|left_chest)\.png$/.test(entry.key)) throw conflict('Mặt in không có bản xuất');
  const buffer = await storage.read('proofs/'+entry.key);
  if (digest(buffer) !== entry.sha256) throw conflict('File mẫu in không khớp hash');
  return buffer;
}
module.exports = {renderSide,generate,read,pixels,digest};

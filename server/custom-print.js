const crypto = require('node:crypto');
const db = require('./db');
const { badRequest, conflict, forbidden, notFound, v } = require('./security');
const all = (name) => db.load()[name];
const now = () => new Date().toISOString();
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = (value) => structuredClone(value);
const sides = ['front', 'back'];
const fonts = ['Arial', 'Georgia', 'Courier New'];
const palette = ['#111111', '#ffffff', '#b91c1c', '#1d4ed8', '#15803d', '#eab308'];
const srs=require('./print-srs');
const labels = { WAITING_PAYMENT: 'Chờ thanh toán / xác nhận COD', WAITING_STAFF_REVIEW: 'Chờ duyệt thiết kế', REVISION_REQUIRED: 'Cần chỉnh sửa', REJECTED: 'Thiết kế bị từ chối', WAITING_CUSTOMER_APPROVAL: 'Chờ bạn xác nhận mẫu in', QUEUED: 'Đã xếp lịch in', PRINTING: 'Đang in', QUALITY_CHECK: 'Kiểm tra chất lượng', QC_FAILED: 'Cần in lại', PACKED: 'Đã đóng gói', CANCELLED: 'Đã hủy' };
Object.assign(labels,{AWAITING_REVIEW:'Chờ duyệt thiết kế',APPROVED:'Đã duyệt thiết kế',DONE:'Hoàn tất in'});
function customer(user) { if (!user || !['customer','guest'].includes(user.role)) throw forbidden('Cần phiên khách hoặc tài khoản khách hàng'); }
function settings(productId) { return all('printSettings').filter(s => s.productId === productId).sort((a,b) => b.version-a.version)[0] || null; }
function owned(id, user) { const d = all('designs').find(d => d.id === id && d.userId === user.id && !d.deletedAt); if (!d) throw notFound(); return d; }
function revision(id) { const r = all('designRevisions').find(r => r.id === id); if (!r) throw notFound('Không tìm thấy phiên bản thiết kế'); return r; }
function validProduct(productId, variantId) {
  const p = db.products.byId(productId), variant = p && db.products.variantById(p, variantId);
  if (!p || p.active === false || !variant || variant.active === false) throw badRequest('Sản phẩm/phiên bản không còn bán');
  return { p, variant };
}
function number(n, name, min, max) { if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw badRequest(`${name} không hợp lệ`); return n; }
function validateSettings(raw, productId, userId) {
  if (!db.products.byId(productId)) throw notFound();
  const result = { id: db.uid('ps'), productId, version: (settings(productId)?.version || 0)+1, enabled: raw.enabled === true, updatedBy: userId, updatedAt: now(),
    technique: v.oneOf(raw.technique, ['DTF','DTG','SCREEN'], 'kỹ thuật in'),
    exportDpi: number(raw.exportDpi ?? 300, 'DPI xuất', 72, 600),
    minDpi: number(raw.minDpi, 'DPI tối thiểu', 72, 600), recommendedDpi: number(raw.recommendedDpi, 'DPI khuyến nghị', 72, 1200),
    maxBytes: v.int(raw.maxBytes, 'dung lượng', { min: 1024, max: 10*1024*1024 }),
    formats: Array.isArray(raw.formats) && raw.formats.length ? [...new Set(raw.formats.map(f => v.oneOf(f, ['png','jpeg','webp'], 'định dạng')))] : ['png','jpeg','webp'], mockups: {}, areas: {} };
  if (result.recommendedDpi < result.minDpi) throw badRequest('DPI khuyến nghị phải lớn hơn tối thiểu');
  for (const side of sides) {
    const a = raw.areas?.[side] || {};
    result.areas[side] = { enabled: a.enabled === true, fee: v.int(a.fee, 'phí in', { min: 0, max: 10000000 }), x: number(a.x,'x',0,1), y: number(a.y,'y',0,1), width: number(a.width,'rộng',.01,1), height: number(a.height,'cao',.01,1), widthMM: number(a.widthMM,'rộng mm',10,1000), heightMM: number(a.heightMM,'cao mm',10,1000) };
    if (a.x+a.width > 1 || a.y+a.height > 1) throw badRequest('Vùng in nằm ngoài mockup');
    if (Math.abs(a.width/(a.height*1.25)-a.widthMM/a.heightMM)>.02) throw badRequest('Tỷ lệ vùng in trên mockup phải khớp kích thước vật lý để không méo thiết kế');
  }
  for (const color of db.products.byId(productId).colors || []) {
    result.mockups[color] = {};
    for (const side of sides) {
      const url = raw.mockups?.[color]?.[side];
      if (typeof url !== 'string' || !/^\/assets\/img\/[a-zA-Z0-9_./-]+$/.test(url) || url.includes('..')) throw badRequest(`Thiếu mockup ${color} ${side}`);
      if (!require('fs').existsSync(require('path').join(__dirname, '..', url))) throw badRequest('File mockup không tồn tại');
      result.mockups[color][side] = url;
    }
  }
  return srs.configure(raw,result,fonts,palette);
}
// Coordinates are relative to print zone; rotation about layer center, independent of viewport.
function validateLayers(input, config, ownerId, strict = true) {
  const output = {}, warnings = [], occupied=new Set();
  if(srs.isSrs(config)&&Object.keys(input||{}).some(k=>!sides.includes(k)))throw badRequest('Chỉ có mặt trước và mặt sau; ngực trái nằm trên mặt trước');
  for (const side of sides) {
    const layers = input?.[side];
    if (!Array.isArray(layers) || layers.length > 20) throw badRequest('Tối đa 20 lớp mỗi mặt');
    output[side] = layers.map((raw, index) => {
      if(!raw||typeof raw!=='object')throw badRequest('Nội dung in không hợp lệ');
      const position=srs.positionOf(raw,side),area=srs.area(config,raw,side);
      if(srs.isSrs(config)){
        if(!srs.POSITIONS.includes(position)||srs.sideOf(position)!==side)throw badRequest('Vị trí in không hợp lệ');
        if(occupied.has(position))throw badRequest('Mỗi vị trí chỉ được có một nội dung');occupied.add(position);
      }
      if(!area?.enabled)throw badRequest('Vị trí in chưa được bật');
      const layer = { id: v.str(raw.id, 'mã lớp', { max: 80 }), type: v.oneOf(raw.type, ['text','image'], 'loại lớp'), x: number(raw.x,'x',0,1), y: number(raw.y,'y',0,1), width: number(raw.width,'rộng',.005,1), height: number(raw.height,'cao',.005,1), rotation: number(raw.rotation,'góc xoay',-360,360), zIndex: index };
      if(srs.isSrs(config)){layer.position=position;layer.contentType=layer.type.toUpperCase();layer.configurationVersion=config.version;}
      const aspect = area.width/(area.height*1.25);
      const angle = layer.rotation*Math.PI/180, w = Math.abs(layer.width*Math.cos(angle))+Math.abs(layer.height*Math.sin(angle))/aspect, h = Math.abs(layer.width*Math.sin(angle))*aspect+Math.abs(layer.height*Math.cos(angle));
      if (layer.x-w/2 < -1e-6 || layer.x+w/2 > 1+1e-6 || layer.y-h/2 < -1e-6 || layer.y+h/2 > 1+1e-6) throw badRequest('Thiết kế vượt ranh giới vùng in');
      if (layer.type === 'text') {
        Object.assign(layer, { text: srs.isSrs(config)?srs.text(raw.text,area):v.str(raw.text,'nội dung chữ',{min:1,max:100}), font: v.oneOf(raw.font,config.supportedFonts||fonts,'font'), color: v.oneOf(raw.color,config.supportedColors||palette,'màu chữ') });
        if(srs.isSrs(config))layer.fontSize=number(raw.fontSize??32,'cỡ chữ',8,72);
      } else {
        const asset = all('designAssets').find(a => a.id === raw.assetId && a.ownerId === ownerId && a.status === 'ready' && a.purpose !== 'review' && Number.isFinite(a.width) && Number.isFinite(a.height));
        if (!asset) throw notFound('Không tìm thấy ảnh của bạn');
        layer.assetId = asset.id; layer.assetHash = asset.sha256;
        layer.dpi = Math.min(asset.width/(layer.width*area.widthMM/25.4), asset.height/(layer.height*area.heightMM/25.4));
        if (strict && !srs.isSrs(config) && layer.dpi < config.minDpi) throw badRequest(`Ảnh chỉ đạt ${Math.floor(layer.dpi)} DPI, cần ít nhất ${config.minDpi}`);
        if (layer.dpi < config.recommendedDpi) warnings.push(`${side}: ${Math.floor(layer.dpi)} DPI; khuyến nghị ${config.recommendedDpi}`);
      }
      return layer;
    });
  }
  return { layers: output, warnings };
}
function saveDesign(user, body, id) {
  customer(user);
  const existing = id ? owned(id,user) : null;
  if (existing && existing.currentVersion !== body.version) throw conflict('Bản nháp đã thay đổi ở tab khác. Tải lại trước khi lưu.');
  const productId = existing?.productId || body.productId, variantId = body.variantId || existing?.variantId;
  const { variant } = validProduct(productId,variantId);
  let config = settings(productId);
  if(body.jobId){const job=all('printJobs').find(j=>j.id===body.jobId),order=job&&db.orders.byId(job.orderId);if(!job||job.designId!==existing?.id||(order.userId||order.guestDesignOwnerId)!==user.id)throw notFound();if(job.workflowMode!=='srs'||job.status!=='REJECTED'||job.freeRevisionUsed||job.productionStartedAt)throw conflict('Không còn lượt sửa miễn phí');config=job.settings;}
  if (!config?.enabled || !config.mockups[variant.color]) throw badRequest('Sản phẩm chưa hỗ trợ in');
  const { layers } = validateLayers(body.layers,config,user.id,false);
  const design = existing || { id: db.uid('design'), userId:user.id, productId, currentVersion:0, createdAt:now() };
  const version = design.currentVersion+1;
  const snapshot = { productId, variantId, color:variant.color, size:variant.size, layers, settings:clone(config) };
  const rev = { id:db.uid('rev'), designId:design.id, version, snapshot, hash:hash(snapshot), createdAt:now(), createdBy:user.id };
  Object.assign(design, { title:v.str(body.title,'tên thiết kế',{min:1,max:80}), variantId, currentVersion:version, revisionId:rev.id, updatedAt:now() });
  if (!existing) all('designs').push(design);
  all('designRevisions').push(rev);
  return { ...design, revision:rev };
}
function customLine(item,user,product,variant) {
  customer(user);
  const rev = revision(item.designRevisionId), design = owned(rev.designId,user);
  if (design.productId !== product.id || rev.snapshot.variantId !== variant.id) throw badRequest('Thiết kế không thuộc phiên bản sản phẩm');
  const config = settings(product.id);
  if (!config?.enabled) throw badRequest('Sản phẩm đã tắt in');
  // Geometry is tied to a template. Changed zones require reopening the editor.
  for (const side of sides) {
    const a = { ...config.areas[side] }, b = { ...rev.snapshot.settings.areas[side] }; delete a.fee; delete b.fee;
    if (hash(a) !== hash(b)) throw conflict('Vùng in đã đổi. Mở và lưu lại thiết kế.');
  }
  if (hash(config.mockups) !== hash(rev.snapshot.settings.mockups)) throw conflict('Mockup đã đổi. Mở và lưu lại thiết kế.');
  const validated = validateLayers(rev.snapshot.layers,config,user.id);
  if(srs.isSrs(config)&&!sides.some(s=>validated.layers[s].length))throw badRequest('Cần ít nhất một vị trí in; chọn mua áo không in nếu bỏ tùy chỉnh');
  if(srs.isSrs(config)&&config.version!==rev.snapshot.settings.version)throw conflict('Cấu hình in đã đổi. Mở và lưu lại thiết kế để xác nhận giá mới.');
  validateAssetFiles(validated.layers);
  if (!srs.isSrs(config)&&validated.warnings.length && item.qualityAcknowledged !== true) throw badRequest('Vui lòng xác nhận cảnh báo độ phân giải');
  if(srs.isSrs(config)){
    const fees=srs.fee(config,validated.layers);
    return {itemType:'custom',designRevisionId:rev.id,designId:design.id,designSnapshot:clone(rev.snapshot),printSettingsSnapshot:clone(config),priceBreakdown:{basePrice:product.price,...fees,frontFee:fees.positions.filter(p=>p.position!=='BACK').reduce((n,p)=>n+p.fee,0),backFee:fees.positions.find(p=>p.position==='BACK')?.fee||0,unitTotal:product.price+fees.printFee},qualityWarnings:validated.warnings};
  }
  const frontFee = validated.layers.front.length ? config.areas.front.fee : 0, backFee = validated.layers.back.length ? config.areas.back.fee : 0;
  return { itemType:'custom', designRevisionId:rev.id, designId:design.id, designSnapshot:clone(rev.snapshot), printSettingsSnapshot:clone(config), priceBreakdown:{ basePrice:product.price, frontFee, backFee, unitTotal:product.price+frontFee+backFee }, qualityWarnings:validated.warnings };
}
function validateAssetFiles(layers) {
  for(const side of sides)for(const layer of layers[side])if(layer.type==='image'){
    const a=all('designAssets').find(a=>a.id===layer.assetId), path=require('path'), fs=require('fs');
    if(!a || ![a.storageKey,a.previewKey].every(key=>key&&require('./private-storage').availableLocally('artwork/'+key)))throw badRequest('File ảnh không còn trên máy chủ. Vui lòng tải lại ảnh và lưu phiên bản mới.');
  }
}
function jobs(order) { return all('printJobs').filter(j => j.orderId === order.id); }
function paymentReady(order) {
  if (order.cancel || ['cancelled','refund_pending','refunded'].includes(order.status) || order.stockState !== 'reserved') return false;
  // Phương thức trả trước (VNPay, chuyển khoản VietQR) chỉ sẵn sàng khi tiền đã được ghi nhận.
  if (['vnpay','vietqr'].includes(order.payMethod)) return order.payStatus === 'paid';
  return ['confirmed','processing','ready_to_ship','shipped','delivered'].includes(order.status);
}
function event(order,key,message) {
  if (all('notifications').some(n => n.eventKey === key)) return;
  all('notifications').push({ id:db.uid('notice'), eventKey:key, orderId:order.id, to:order.customerEmail, message, status:'pending', attempts:0, createdAt:now() });
}
function history(job,status,actor,note='') {
  job.status=status; job.updatedAt=now(); job.history.push({status,at:now(),actorId:actor.id,note});
  const order=db.orders.byId(job.orderId);
  if(job.workflowMode==='srs')require('./controllers/orders').addHistory(order,{actor:actor.role||'system',actorId:actor.id,note:`${labels[status]||status}${note?': '+note:''}`});
  event(order,`${job.id}:${job.history.length}`,`${labels[status]}${note ? ': '+note : ''}`);
}
function createJobs(order) {
  for (const line of order.items.filter(i => i.itemType === 'custom')) {
    const job = { id:db.uid('job'), orderId:order.id, orderLineId:line.lineId, designId:line.designId, designRevisionId:line.designRevisionId, snapshot:clone(line.designSnapshot), settings:clone(line.printSettingsSnapshot), status:'WAITING_PAYMENT', history:[], createdAt:now() };
    job.workflowMode=line.printSettingsSnapshot.workflowMode||'enhanced';job.freeRevisionUsed=false;
    line.printJobId=job.id; all('printJobs').push(job); history(job,'WAITING_PAYMENT',{id:order.userId||order.guestDesignOwnerId});
  }
}
function sync(order) {
  for (const job of jobs(order)) {
    if (order.cancel || ['cancelled','refund_pending','refunded'].includes(order.status)) { if (job.status !== 'CANCELLED') history(job,'CANCELLED',{id:'system'}); }
    else if (job.status === 'WAITING_PAYMENT' && paymentReady(order)){job.reviewRequestedAt=now();history(job,job.workflowMode==='srs'?'AWAITING_REVIEW':'WAITING_STAFF_REVIEW',{id:'system'});}
  }
}
function review(job,user,body) {
  const order=db.orders.byId(job.orderId); sync(order);
  if (!paymentReady(order) || job.status !== (job.workflowMode==='srs'?'AWAITING_REVIEW':'WAITING_STAFF_REVIEW')) throw conflict('Thiết kế chưa đủ điều kiện duyệt');
  if(body.designRevisionId&&body.designRevisionId!==job.designRevisionId)throw conflict('Phiên bản đã thay đổi');
  if(body.expectedHistoryLength!==undefined&&body.expectedHistoryLength!==job.history.length)throw conflict('Công việc đã được người khác cập nhật');
  const decision=v.oneOf(body.decision,['approve','revise','reject'],'quyết định');
  const reason=decision === 'approve' ? '' : v.str(body.reason,'lý do',{min:job.workflowMode==='srs'?5:3,max:500});
  if (decision === 'approve') {
    validateLayers(job.snapshot.layers,job.settings,order.userId||order.guestDesignOwnerId);
    validateAssetFiles(job.snapshot.layers);
    job.staffApproval={userId:user.id,revisionId:job.designRevisionId,at:now()};
    job.proof={id:db.uid('proof'), revisionId:job.designRevisionId, snapshot:clone(job.snapshot), hash:hash(job.snapshot), at:now()};
  }
  job.reviewer=user.id;job.reviewedAt=now();job.rejectionReason=reason;
  history(job,job.workflowMode==='srs'?(decision==='approve'?'APPROVED':'REJECTED'):(decision === 'approve' ? 'WAITING_CUSTOMER_APPROVAL' : decision === 'revise' ? 'REVISION_REQUIRED' : 'REJECTED'),user,reason);
  return job;
}
function approve(job,user,body) {
  customer(user); const order=db.orders.byId(job.orderId);
  if (order.userId !== user.id) throw notFound();
  if (!job.proof || job.proof.id !== body.proofId || job.proof.hash !== body.hash) throw conflict('Mẫu in đã thay đổi, vui lòng tải lại');
  if (job.customerApproval?.proofId === body.proofId && job.status !== 'CANCELLED') return job;
  if (job.status !== 'WAITING_CUSTOMER_APPROVAL' || !paymentReady(order)) throw conflict('Không thể duyệt mẫu này');
  if (body.acknowledged !== true) throw badRequest('Cần xác nhận màu in thực tế có thể chênh lệch nhẹ');
  job.customerApproval={userId:user.id,proofId:job.proof.id,hash:job.proof.hash,revisionId:job.designRevisionId,at:now()};
  history(job,'QUEUED',user); return job;
}
function revise(job,user,body) {
  customer(user); const order=db.orders.byId(job.orderId);
  if ((order.userId||order.guestDesignOwnerId) !== user.id) throw notFound();
  if(job.workflowMode==='srs'&&(job.status!=='REJECTED'||job.freeRevisionUsed||!body.designRevisionId))throw conflict('Chỉ được gửi một phiên bản sửa miễn phí sau khi bị từ chối');
  if (job.productionStartedAt || !['REVISION_REQUIRED','WAITING_CUSTOMER_APPROVAL','QUEUED','REJECTED'].includes(job.status) || !paymentReady(order)) throw conflict('Không thể sửa khi sản xuất đã bắt đầu hoặc đơn đã đóng');
  const reason=v.str(body.reason,'lý do sửa',{min:3,max:500});
  let snapshot;
  if (body.designRevisionId) {
    const rev=revision(body.designRevisionId); owned(rev.designId,user);
    if (rev.snapshot.productId !== job.snapshot.productId || rev.snapshot.variantId !== job.snapshot.variantId) throw badRequest('Không thể đổi áo sau đặt hàng');
    validateLayers(rev.snapshot.layers,job.settings,user.id);
    if(job.workflowMode==='srs'&&!sides.some(s=>rev.snapshot.layers[s].length))throw badRequest('Thiết kế sửa phải có ít nhất một nội dung');
    // Paid configuration remains fixed; changing chargeable sides requires cancelling/reordering.
    if (job.workflowMode!=='srs'&&sides.some(s => !!rev.snapshot.layers[s].length !== !!job.snapshot.layers[s].length)) throw conflict('Đổi mặt in làm thay đổi giá. Hủy trước sản xuất và đặt lại để xác nhận giá mới.');
    snapshot=clone(rev.snapshot); snapshot.settings=clone(job.settings);
    job.designRevisionId=rev.id;
  }
  if (snapshot) job.snapshot=snapshot;
  if(job.proof){job.proofHistory ||= [];job.proofHistory.push({...clone(job.proof),revokedAt:now(),revokedBy:user.id});}
  job.staffApproval=null; job.customerApproval=null; job.proof=null;
  if(job.workflowMode==='srs'){job.freeRevisionUsed=true;job.reviewRequestedAt=now();}
  history(job,job.workflowMode==='srs'?'AWAITING_REVIEW':snapshot ? 'WAITING_STAFF_REVIEW' : 'REVISION_REQUIRED',user,reason); return job;
}
const transitions={ QUEUED:['PRINTING'], PRINTING:['QUALITY_CHECK'], QUALITY_CHECK:['PACKED','QC_FAILED'], QC_FAILED:['PRINTING'] };
function transition(job,user,body) {
  const order=db.orders.byId(job.orderId), to=body.status;
  if (job.status === to) return job;
  const flow=job.workflowMode==='srs'?{APPROVED:['PRINTING'],PRINTING:['QUALITY_CHECK'],QUALITY_CHECK:['DONE','PRINTING']}:transitions;
  if (!(flow[job.status] || []).includes(to)) throw conflict('Không thể bỏ qua công đoạn in');
  if(body.expectedHistoryLength!==undefined&&body.expectedHistoryLength!==job.history.length)throw conflict('Công việc đã thay đổi');
  if (!paymentReady(order) || !job.staffApproval || job.staffApproval.revisionId !== job.designRevisionId || (job.workflowMode!=='srs'&&(!job.customerApproval || job.customerApproval.revisionId !== job.designRevisionId || job.customerApproval.hash !== job.proof?.hash))) throw forbidden('Chưa đủ thanh toán, xác nhận và duyệt đúng phiên bản');
  const note=(to === 'QC_FAILED' || job.status === 'QC_FAILED'||(job.status==='QUALITY_CHECK'&&to==='PRINTING')) ? v.str(body.reason,'lý do QC / in lại',{min:5,max:500}) : v.str(body.reason,'ghi chú',{required:false,max:500});
  if (to === 'PRINTING') { job.productionStartedAt ||= now(); const line=order.items.find(i => i.lineId === job.orderLineId); line.stockConsumed=true; }
  if (to === 'PACKED') job.packedAt=now();
  if(to==='DONE')job.completedAt=now();
  history(job,to,user,note); if(to==='DONE')readyOrder(order);return job;
}
function readyOrder(order){
  if(!paymentReady(order)||!['confirmed','processing'].includes(order.status)||!jobs(order).length||jobs(order).some(j=>!['DONE','PACKED'].includes(j.status))||order.items.some(i=>i.itemType!=='custom'&&!i.fulfillmentReady))return false;
  const service=require('./controllers/orders');service.applyTransition(order,'ready_to_ship');service.addHistory(order,{actor:'system',note:'Tất cả công việc in và hàng thường đã sẵn sàng'});event(order,`${order.id}:ready-to-ship`,'Đơn hàng đã sẵn sàng giao');return true;
}
function guardCancel(order, user, exception) {
  if (!jobs(order).some(j=>j.productionStartedAt)) return;
  if (user?.role === 'admin' && exception?.inventoryDecision === 'discard_consumed' && exception?.refundDecision === 'pending_if_paid') return;
  throw forbidden('Đã bắt đầu in. Chỉ Admin được xử lý ngoại lệ với quyết định loại bỏ vật tư đã in và chờ hoàn tiền nếu đã thu.');
}
function guardShipping(order) { if (jobs(order).some(j=>!['PACKED','DONE'].includes(j.status))) throw conflict('Tất cả mẫu in phải hoàn tất trước khi giao');if(jobs(order).some(j=>j.workflowMode==='srs')&&order.items.some(i=>i.itemType!=='custom'&&!i.fulfillmentReady))throw conflict('Hàng thường chưa được xác nhận sẵn sàng'); }
async function flushNotifications() {
  for (const n of all('notifications').filter(n=>!['sent','queued'].includes(n.status) && n.attempts < 3 && (!n.nextAttemptAt || Date.parse(n.nextAttemptAt)<=Date.now()))) {
    n.attempts++; const result=await require('./mailer').send(n.to,'customEvent',n);
    n.status=result.queued ? 'queued' : result.ok ? 'sent' : 'failed'; n.mode=result.mode; n.updatedAt=now(); n.nextAttemptAt=new Date(Date.now()+60000*n.attempts).toISOString();
  }
}
module.exports={readyOrder,all,now,hash,clone,sides,fonts,palette,labels,customer,settings,owned,revision,validProduct,validateSettings,validateLayers,saveDesign,customLine,jobs,paymentReady,event,createJobs,sync,review,approve,revise,transition,guardCancel,guardShipping,flushNotifications};

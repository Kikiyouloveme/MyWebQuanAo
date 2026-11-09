const router = require('express').Router();
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncResource } = require('node:async_hooks');
const sharp = require('sharp');
const multer = require('multer');
const db = require('../db');
const cp = require('../custom-print');
const { wrap, requireAuth, requireVerified, requireStaff, requireAdmin, limiters, v, badRequest, notFound, conflict } = require('../security');
const storage = require('../private-storage');
const guest=require('../guest-print-session');
const srs=require('../print-srs');
router.post('/print/session',limiters.write,wrap(async(req,res)=>guest.issue(req,res)));
router.use((req,res,next)=>{if(req.url.startsWith('/guest/designs'))req.url=req.url.replace('/guest/designs','/designs');next();});
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:4}}).single('image');
const customer = [guest.required, (req,res,next)=>{try{cp.customer(req.user);next();}catch(e){next(e);}}];
const jobFor = (req) => { const j=cp.all('printJobs').find(j=>j.id===req.params.jobId); if(!j) throw notFound(); const o=db.orders.byId(j.orderId); if(!['admin','staff'].includes(req.user.role) && (o.userId||o.guestDesignOwnerId)!==req.user.id) throw notFound(); return j; };
router.get('/products/:id/print-options',wrap(async(req,res)=>res.json(cp.settings(req.params.id))));
router.get('/admin/print-settings',requireStaff,wrap(async(req,res)=>res.json(cp.all('printSettings'))));
router.post('/print/quote',guest.optional,limiters.write,wrap(require('../controllers/orders').postQuote));
router.put('/admin/products/:id/media',requireAdmin,limiters.write,wrap(async(req,res)=>{
  const product=db.products.byId(req.params.id);if(!product)throw notFound();
  if(!Array.isArray(req.body.media)||!req.body.media.length||req.body.media.length>30)throw badRequest('Cần 1–30 ảnh');
  const media=[];
  for(const raw of req.body.media){
    const localPath=v.str(raw.localPath,'đường dẫn ảnh',{max:300});
    if(!/^\/assets\/img\/[A-Za-z0-9_./-]+$/.test(localPath)||localPath.includes('..'))throw badRequest('Ảnh phải nằm trong media nội bộ');
    try{await fs.access(path.join(__dirname,'..','..',localPath));}catch{throw badRequest('File ảnh không tồn tại');}
    media.push({assetId:raw.assetId||db.uid('media'),productId:product.id,color:v.oneOf(raw.color,product.colors,'màu'),viewType:v.oneOf(raw.viewType,['front','back','detail','lifestyle'],'góc chụp'),localPath,altText:v.str(raw.altText,'mô tả ảnh',{max:200}),sourceName:v.str(raw.sourceName,'nguồn',{max:200}),sourceURL:v.str(raw.sourceURL,'URL nguồn',{required:false,max:500}),licenseType:v.str(raw.licenseType,'giấy phép',{max:200}),licenseEvidence:v.str(raw.licenseEvidence,'bằng chứng quyền sử dụng',{max:1000}),attribution:v.str(raw.attribution,'ghi công',{required:false,max:300}),verifiedAt:cp.now()});
  }
  product.media=media;product.img=media[0].localPath;product.img2=(media[1]||media[0]).localPath;res.json(media);
}));
router.put('/admin/print-settings/:id',requireStaff,limiters.write,wrap(async(req,res)=>{
  if ((cp.settings(req.params.id)?.version || 0)!==req.body.version) throw conflict('Cấu hình đã thay đổi, tải lại trước khi lưu');
  const config=cp.validateSettings(req.body,req.params.id,req.user.id);
  for(const views of Object.values(config.mockups))for(const url of Object.values(views)){
    const meta=await sharp(path.join(__dirname,'..','..',url),{limitInputPixels:25000000}).metadata();
    if(Math.abs(meta.width/meta.height-.8)>.001)throw badRequest('Mockup cần tỷ lệ 4:5 (ví dụ 500 × 625) để vùng in không bị méo');
  }
  cp.all('printSettings').push(config); res.json(config);
}));
router.post('/admin/print-settings/:id/copy',requireStaff,limiters.write,wrap(async(req,res)=>{
  const source=cp.settings(req.params.id),target=cp.settings(req.body.targetProductId);
  if(!source||!target||source.technique!==target.technique||db.products.byId(source.productId).cat!==db.products.byId(target.productId).cat)throw badRequest('Cần sản phẩm đích có cấu hình, cùng nhóm áo và kỹ thuật');
  if(target.version!==req.body.version)throw conflict('Cấu hình đích đã thay đổi');
  const config=cp.validateSettings({...source,mockups:target.mockups,areas:target.areas},target.productId,req.user.id);cp.all('printSettings').push(config);res.json(config);
}));
router.get('/designs',...customer,wrap(async(req,res)=>res.json(cp.all('designs').filter(d=>d.userId===req.user.id&&!d.deletedAt))));
router.post('/designs',...customer,limiters.write,wrap(async(req,res)=>res.status(201).json(await require('../print-preview').generate(cp.saveDesign(req.user,req.body)))));
router.get('/designs/:id',...customer,wrap(async(req,res)=>{const d=cp.owned(req.params.id,req.user);res.json({...d,revision:cp.revision(d.revisionId)});}));
router.patch('/designs/:id',...customer,limiters.write,wrap(async(req,res)=>res.json(await require('../print-preview').generate(cp.saveDesign(req.user,req.body,req.params.id)))));
router.get('/design-revisions/:id/preview',guest.required,wrap(async(req,res)=>{
  const rev=cp.revision(req.params.id),design=cp.all('designs').find(d=>d.id===rev.designId);
  if(!design||(!['staff','admin'].includes(req.user.role)&&design.userId!==req.user.id)||!rev.previewKey)throw notFound();
  res.set('Cache-Control','private, no-store').type('png').send(await storage.read('artwork/'+rev.previewKey));
}));
router.delete('/designs/:id',...customer,limiters.write,wrap(async(req,res)=>{
  const d=cp.owned(req.params.id,req.user); if(cp.all('printJobs').some(j=>j.designId===d.id)) throw conflict('Thiết kế đã dùng trong đơn, không thể xóa');
  d.deletedAt=cp.now();res.json({ok:true});
}));
router.post('/designs/:id/assets',...customer,limiters.printUpload,(req,res,next)=>upload(req,res,AsyncResource.bind(e=>next(e ? badRequest('Ảnh quá dung lượng, một file mỗi lần (SRS: tối đa 5 MB)') : undefined))),wrap(async(req,res)=>{
  const d=cp.owned(req.params.id,req.user), config=cp.settings(d.productId);
  if(req.body.rightsConfirmed!=='true') throw badRequest('Cần xác nhận quyền sử dụng ảnh');
  if(!req.file || req.file.size>config.maxBytes || (srs.isSrs(config)&&req.file.size>5*1024*1024)) throw badRequest('Ảnh vượt dung lượng cấu hình (SRS tối đa 5 MB)');
  if(cp.all('designAssets').filter(a=>a.ownerId===req.user.id).length>=100) throw badRequest('Đã đạt giới hạn 100 ảnh cho tài khoản');
  let meta, preview;
  try {
    meta=await sharp(req.file.buffer,{limitInputPixels:25000000,failOn:'warning'}).metadata();
    if(!config.formats.includes(meta.format) || meta.pages>1 || !meta.width || !meta.height) throw new Error('format');
    if(srs.isSrs(config)&&(!['png','jpeg'].includes(meta.format)||! /\.(png|jpe?g)$/i.test(req.file.originalname)))throw new Error('format');
    // Full decode before storage, not only header probing. Derived preview strips metadata.
    preview=await sharp(req.file.buffer,{limitInputPixels:25000000,failOn:'warning'}).rotate().resize(1400,1400,{fit:'inside',withoutEnlargement:true}).webp().toBuffer();
  } catch {throw badRequest('Ảnh hỏng hoặc sai định dạng PNG/JPEG/WebP');}
  if(srs.isSrs(config)&&Math.min(meta.width,meta.height)<500)throw badRequest('Cạnh ngắn nhất của ảnh phải từ 500 pixel');
  const id=db.uid('asset'), storageKey=id+'.'+meta.format, previewKey=id+'.preview.webp';
  try {await storage.put('artwork/'+storageKey,req.file.buffer);await storage.put('artwork/'+previewKey,preview);}
  catch(e){await Promise.all([storageKey,previewKey].map(k=>storage.remove('artwork/'+k).catch(()=>{})));throw e;}
  require('../mongo-store').onRollback(()=>Promise.all([storageKey,previewKey].map(k=>storage.remove('artwork/'+k).catch(()=>{}))));
  const rotated=[5,6,7,8].includes(meta.orientation);
  const asset={id,ownerId:req.user.id,designId:d.id,storageKey,previewKey,mimeType:`image/${meta.format}`,fileSize:req.file.size,width:rotated?meta.height:meta.width,height:rotated?meta.width:meta.height,sha256:crypto.createHash('sha256').update(req.file.buffer).digest('hex'),createdAt:cp.now(),status:'ready',rightsConfirmedAt:cp.now()};
  cp.all('designAssets').push(asset);res.status(201).json({id,width:asset.width,height:asset.height,sha256:asset.sha256,warning:srs.isSrs(config)&&Math.min(asset.width,asset.height)<1000?'Ảnh độ phân giải thấp (500–999 px); nên dùng ảnh từ 1000 px.':null});
}));
router.get('/design-assets/:id',guest.required,wrap(async(req,res)=>{
  const asset=cp.all('designAssets').find(a=>a.id===req.params.id&&a.purpose!=='review');
  const assigned=asset&&cp.all('printJobs').some(j=>cp.sides.some(s=>j.snapshot.layers[s].some(l=>l.assetId===asset.id)));
  if(!asset || (asset.ownerId!==req.user.id && !(['staff','admin'].includes(req.user.role)&&assigned))) throw notFound();
  const original=req.query.original==='1' && ['staff','admin'].includes(req.user.role);
  res.set('Cache-Control','private, no-store').type(original?asset.mimeType:'image/webp').send(await storage.read('artwork/'+(original?asset.storageKey:asset.previewKey)));
}));
router.get('/admin/print-jobs',requireStaff,wrap(async(req,res)=>{for(const o of db.orders.all())cp.sync(o);res.json([...cp.all('printJobs')].sort((a,b)=>(a.reviewRequestedAt||a.createdAt).localeCompare(b.reviewRequestedAt||b.createdAt)).map(j=>({...j,reviewAgeHours:srs.workingHours(j.reviewRequestedAt||j.createdAt),reviewOverdue:['AWAITING_REVIEW','WAITING_STAFF_REVIEW'].includes(j.status)&&srs.workingHours(j.reviewRequestedAt||j.createdAt)>=24})));}));
router.post('/admin/orders/:id/regular-items-ready',requireStaff,limiters.write,wrap(async(req,res)=>{
  const order=db.orders.byId(req.params.id);if(!order)throw notFound();if(!cp.paymentReady(order))throw conflict('Đơn chưa đủ điều kiện chuẩn bị');
  if(order.items.filter(i=>i.itemType!=='custom').every(i=>i.fulfillmentReady))return res.json(order);
  for(const item of order.items.filter(i=>i.itemType!=='custom'))item.fulfillmentReady=true;
  require('../controllers/orders').addHistory(order,{actor:req.user.role,actorId:req.user.id,note:'Đã chuẩn bị đủ các dòng hàng thường'});cp.readyOrder(order);res.json(order);
}));
router.get('/admin/print-jobs/:jobId',requireStaff,wrap(async(req,res)=>res.json(jobFor(req))));
router.get('/print-jobs/:jobId',guest.required,wrap(async(req,res)=>res.json(jobFor(req))));
router.post('/admin/print-jobs/:jobId/review',requireStaff,limiters.write,wrap(async(req,res)=>{
  const job=await cp.review(jobFor(req),req.user,req.body);
  if(req.body.decision==='approve')await require('../print-export').generate(job);
  res.json(job);
}));
router.get('/print-jobs/:jobId/export/:side',guest.required,wrap(async(req,res)=>{
  const job=jobFor(req);
  const side=v.oneOf(req.params.side,['front','back','left_chest'],'vị trí in');
  if(req.query.proofId!==job.proof?.id)throw conflict('Mẫu in đã thay đổi');
  const download=req.query.download==='1';
  if(download&&!['staff','admin'].includes(req.user.role))throw notFound();
  const bytes=await require('../print-export').read(job,side,download||['staff','admin'].includes(req.user.role));
  res.set('Cache-Control','private, no-store').type('png');
  if(download)res.attachment(`${job.proof.id}-${side}.png`);
  res.send(bytes);
}));
router.post('/admin/print-jobs/:jobId/status',requireStaff,limiters.write,wrap(async(req,res)=>{
  const job=jobFor(req);
  if(!job.proof?.exports){
    // Do not strand historical jobs that were already printed before raster exports existed.
    if(!job.productionStartedAt || req.body.status==='PRINTING')throw conflict('Mẫu cũ chưa có bản xuất. Cần khách yêu cầu chỉnh sửa và duyệt lại trước sản xuất.');
  }else for(const side of Object.keys(job.proof.exports))await require('../print-export').read(job,side,true);
  res.json(await cp.transition(job,req.user,req.body));
}));
router.get('/orders/:id/print-proofs',guest.required,wrap(async(req,res)=>{
  const order=require('../controllers/orders').getAuthorizedOrder(req);cp.sync(order);res.json(cp.jobs(order));
}));
router.post('/print-jobs/:jobId/approve',...customer,limiters.write,wrap(async(req,res)=>{const job=jobFor(req);if(!job.proof?.exports)throw conflict('M?u c? ch?a c? b?n xu?t; y?u c?u nh?n vi?n duy?t l?i');for(const side of Object.keys(job.proof.exports))await require('../print-export').read(job,side);res.json(cp.approve(job,req.user,req.body));}));
router.post('/print-jobs/:jobId/revision',...customer,limiters.write,wrap(async(req,res)=>res.json(await cp.revise(jobFor(req),req.user,req.body))));
router.get('/products/:id/size-guide',wrap(async(req,res)=>res.json(cp.all('sizeCharts').find(c=>c.productId===req.params.id)||null)));
function chartFields(body) {
  if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>20)throw badRequest('Cần 1–20 size');
  const rows=body.rows.map(r=>({size:v.str(r.size,'size',{max:20}),chest:v.int(r.chest,'vòng ngực áo cm',{min:40,max:250}),length:v.int(r.length,'dài áo cm',{min:20,max:150})}));
  if(new Set(rows.map(r=>r.size)).size!==rows.length)throw badRequest('Size bị trùng');
  return {rows,fit:v.oneOf(body.fit,['Regular','Oversized','Relaxed'],'phom'),sample:body.sample!==false};
}
router.put('/admin/size-charts/:id',requireAdmin,limiters.write,wrap(async(req,res)=>{
  if(!db.products.byId(req.params.id))throw notFound(); const fields=chartFields(req.body);
  let chart=cp.all('sizeCharts').find(c=>c.productId===req.params.id);
  if((chart?.version||0)!==req.body.version)throw conflict('Bảng size đã thay đổi');
  if(!chart){chart={id:db.uid('size'),productId:req.params.id,version:0};cp.all('sizeCharts').push(chart);}
  Object.assign(chart,fields,{version:chart.version+1,updatedBy:req.user.id,updatedAt:cp.now()});res.json(chart);
}));
router.post('/products/:id/size-recommendation',wrap(async(req,res)=>{
  const chart=cp.all('sizeCharts').find(c=>c.productId===req.params.id), p=db.products.byId(req.params.id);
  if(!chart||!p)throw badRequest('Chưa có dữ liệu đo áo để gợi ý');
  const chest=v.int(req.body.chest,'vòng ngực cơ thể cm',{min:40,max:200});
  const fit=v.oneOf(req.body.fit,['Regular','Oversized','Relaxed'],'độ rộng');const ease={Regular:8,Relaxed:12,Oversized:18}[fit];
  const matches=chart.rows.filter(r=>r.chest>=chest+ease).sort((a,b)=>a.chest-b.chest), best=matches[0];
  const available=best&&p.variants.some(v=>v.size===best.size&&v.color===req.body.color&&v.active!==false&&v.stock>0);
  res.json({size:best?.size||null,available:!!available,explanation:best?`Ngực áo ${best.chest} cm ≥ vòng ngực ${chest} cm + độ cử động ${ease} cm.${available?'':' Size phù hợp hiện hết hàng ở màu này.'}`:'Không có size phù hợp trong bảng. Vui lòng đối chiếu số đo thực tế.',sample:chart.sample});
}));
module.exports={router,chartFields};

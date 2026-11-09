const router=require('express').Router();
const multer=require('multer');
const sharp=require('sharp');
const fs=require('node:fs/promises');
const path=require('node:path');
const {AsyncResource}=require('node:async_hooks');
const db=require('../db');
const {requireRole,wrap,limiters,badRequest,notFound}=require('../security');
const storage=require('../private-storage');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:3}}).single('image');
router.post('/review-photos',requireRole('customer'),limiters.write,(req,res,next)=>upload(req,res,AsyncResource.bind(e=>next(e?badRequest('Ảnh tối đa 5MB'):undefined))),wrap(async(req,res)=>{
  const order=db.orders.byId(req.body.orderId);
  if(!order||order.userId!==req.user.id||order.status!=='delivered')throw notFound('Cần đơn đã giao thuộc tài khoản của bạn');
  if(!req.file)throw badRequest('Chưa chọn ảnh');
  if(db.load().designAssets.filter(a=>a.ownerId===req.user.id&&a.purpose==='review').length>=50)throw badRequest('Đạt giới hạn ảnh đánh giá');
  let buffer;
  try{const input=sharp(req.file.buffer,{limitInputPixels:20000000,failOn:'warning'}),meta=await input.metadata();if(!['png','jpeg','webp'].includes(meta.format)||meta.pages>1)throw Error();buffer=await input.rotate().resize(1200,1200,{fit:'inside',withoutEnlargement:true}).webp().toBuffer();}catch{throw badRequest('Ảnh hỏng hoặc sai định dạng');}
  const id=db.uid('reviewphoto'),storageKey=id+'.webp';await storage.put('review-photos/'+storageKey,buffer);
  require('../mongo-store').onRollback(()=>storage.remove('review-photos/'+storageKey).catch(()=>{}));
  db.load().designAssets.push({id,ownerId:req.user.id,purpose:'review',orderId:order.id,storageKey,status:'ready',createdAt:new Date().toISOString()});
  res.status(201).json({id});
}));
router.get('/review-photos/:id',wrap(async(req,res)=>{
  const asset=db.load().designAssets.find(a=>a.id===req.params.id&&a.purpose==='review');
  if(!asset||!db.load().reviews.some(r=>r.moderationStatus==='published'&&(r.photoAssetIds||[]).includes(asset.id)))throw notFound();
  res.set('Cache-Control','no-store').type('image/webp').send(await storage.read('review-photos/'+asset.storageKey));
}));
module.exports={router};

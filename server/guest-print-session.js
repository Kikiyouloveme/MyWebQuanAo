const jwt=require('jsonwebtoken');
const crypto=require('node:crypto');
const config=require('./config');
const {optionalAuth,forbidden}=require('./security');
const cookieName='vela_print_session';
function read(req){
  try{const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);const p=jwt.verify(token,config.jwtSecret,{audience:'guest-print',algorithms:['HS256']});return {id:p.id,role:'guest',csrf:p.csrf};}catch{return null;}
}
function issue(req,res){
  // Same-origin custom header prevents drive-by session replacement.
  if(req.headers['x-print-session']!=='1')throw forbidden('Yêu cầu phiên khách không hợp lệ');
  let actor=read(req);
  if(!actor){actor={id:'guest_'+crypto.randomUUID(),role:'guest',csrf:crypto.randomBytes(32).toString('hex')};res.cookie(cookieName,jwt.sign(actor,config.jwtSecret,{audience:'guest-print',expiresIn:'7d'}),{httpOnly:true,sameSite:'strict',secure:config.isProd,maxAge:7*86400000,path:'/api'});}
  res.json({csrf:actor.csrf,expiresInDays:7});
}
function optional(req,res,next){optionalAuth(req,res,()=>{req.printActor=req.user||read(req);if(!req.user&&req.printActor&&!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers['x-print-csrf']!==req.printActor.csrf)return next(forbidden('Phiên tùy chỉnh không hợp lệ. Mở lại trình thiết kế.'));next();});}
function required(req,res,next){optional(req,res,error=>{if(error)return next(error);if(!req.printActor)return next(forbidden('Cần mở phiên tùy chỉnh trước'));req.user=req.printActor;next();});}
module.exports={read,issue,optional,required};

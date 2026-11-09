const crypto = require('node:crypto');
const db = require('./db');
const config = require('./config');
const secret = () => crypto.createHash('sha256').update(process.env.OUTBOX_ENCRYPTION_KEY || config.jwtSecret).digest();
function seal(payload) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm',secret(),iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
function unseal(payload) {
  const decipher=crypto.createDecipheriv('aes-256-gcm',secret(),Buffer.from(payload.iv,'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data,'base64')),decipher.final()]).toString());
}
async function tick(send) {
  if(!send){const mailer=require('./mailer');if(!mailer.isLive())return false;send=payload=>mailer.deliver(payload);}
  const now=Date.now(),claim=crypto.randomUUID();
  await db.models.mailOutbox.updateMany({status:'sending',attempts:{$gte:5},nextAttemptAt:{$lte:now}},{$set:{status:'dead',error:'Last delivery lease expired; reconcile provider before retry'}});
  const job=await db.models.mailOutbox.findOneAndUpdate({status:{$in:['pending','sending']},nextAttemptAt:{$lte:now},attempts:{$lt:5}},{$set:{status:'sending',claim,nextAttemptAt:now+120000},$inc:{attempts:1}},{new:true}).lean();
  if(!job)return false;
  try {
    await send({...unseal(job.payload),messageId:`<${job.id}@velathier.invalid>`});
    await db.models.mailOutbox.updateOne({id:job.id,claim},{$set:{status:'sent',sentAt:new Date().toISOString()},$unset:{payload:1,claim:1}});
    await db.models.emails.updateOne({id:job.emailId},{$set:{status:'sent'}});
  } catch(e) {
    const status=job.attempts>=5?'dead':'pending';
    await db.models.mailOutbox.updateOne({id:job.id,claim},{$set:{status,nextAttemptAt:Date.now()+Math.min(3600000,30000*2**job.attempts),error:String(e.message).slice(0,200)},$unset:{claim:1}});
    await db.models.emails.updateOne({id:job.emailId},{$set:{status:status==='dead'?'failed':'pending'}});
  }
  return true;
}
function start(){let active=false;const timer=setInterval(async()=>{if(active)return;active=true;try{await tick();}catch(e){console.error('[outbox]',e.message);}finally{active=false;}},1000);timer.unref();return timer;}
module.exports={seal,unseal,tick,start};

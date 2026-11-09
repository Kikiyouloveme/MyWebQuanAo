require('./config');
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTransition } = require('./controllers/orders');
for (const [from, to] of [['pending','confirmed'],['pending','processing'],['confirmed','processing'],['processing','ready_to_ship'],['ready_to_ship','shipped'],['shipped','delivered']]) {
  test(`P0-A unpaid VNPay cannot move ${from} -> ${to}`, () => {
    const order = { status: from, payMethod: 'vnpay', payStatus: 'pending', inventory: { reserved: true } };
    assert.throws(() => applyTransition(order, to), /thanh toán/);
    assert.equal(order.status, from);
  });
}
test('P0-A paid VNPay and confirmed COD can be fulfilled', () => {
  for (const payMethod of ['cod','vnpay']) {
    const order = { status: 'confirmed', payMethod, payStatus: payMethod === 'cod' ? 'pending' : 'paid' };
    for (const to of ['processing','ready_to_ship','shipped','delivered']) assert.equal(applyTransition(order, to), true);
  }
});
test('P0-A COD must be confirmed before preparation', () => {
  const order = { status: 'pending', payMethod: 'cod', payStatus: 'pending' };
  assert.throws(() => applyTransition(order, 'processing'), /xác nhận/);
  applyTransition(order, 'confirmed');
  applyTransition(order, 'processing');
});
test('P0-B transparent export dimensions, rotation and independent sides', async () => {
  const sharp=require('sharp'),{renderSide,pixels}=require('./print-export');
  const snapshot={settings:{technique:'DTF',recommendedDpi:150,minDpi:72,areas:{front:{widthMM:50.8,heightMM:76.2},back:{widthMM:25.4,heightMM:25.4}}},layers:{front:[{type:'text',font:'Arial',text:'V',color:'#111111',width:.4,height:.2,x:.5,y:.5,rotation:25}],back:[]}};
  const front=await renderSide(snapshot,'front',[]),back=await renderSide(snapshot,'back',[]);
  assert.equal(pixels(25.4,300),300);
  assert.equal(front.manifest.width,300);assert.equal(front.manifest.height,450);
  assert.equal(back.manifest.width,150);assert.equal(back.manifest.height,150);
  const {data,info}=await sharp(front.buffer).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.channels,4);assert.equal(data[3],0);
  assert(data.some((v,i)=>i%4===3&&v>0),'text has visible pixels');
  assert.equal(front.manifest.sources[0].sha256.length,64);
  const blank=await sharp(back.buffer).raw().toBuffer();assert(blank.every((v,i)=>i%4!==3||v===0));
});
test('P1-E outbox ciphertext authenticates content and hides OTP', () => {
  const {seal,unseal}=require('./outbox-worker');const encrypted=seal({html:'OTP 123456'});
  assert(!JSON.stringify(encrypted).includes('123456'));assert.equal(unseal(encrypted).html,'OTP 123456');
  encrypted.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>unseal(encrypted));
});
test('P0-D production rejects HTTP, local storage and wildcard proxy trust',()=>{
  const {spawnSync}=require('node:child_process');
  const base={...process.env,NODE_ENV:'production',JWT_SECRET:'test-only-secret-'.repeat(4),OUTBOX_ENCRYPTION_KEY:'test-outbox-key-'.repeat(4),PRIVATE_STORAGE_PROVIDER:'s3',PRIVATE_STORAGE_BUCKET:'test-private-bucket',PUBLIC_URL:'https://example.invalid',TRUST_PROXY:'',SMTP_HOST:'',SMTP_USER:'',VNP_TMN_CODE:'',VNP_HASH_SECRET:''};
  for(const changes of [{PUBLIC_URL:'http://example.invalid'},{PRIVATE_STORAGE_PROVIDER:'local'},{TRUST_PROXY:'127.0.0.1,0.0.0.0/0'}])assert.notEqual(spawnSync(process.execPath,['-e',"require('./server/config')"],{env:{...base,...changes},windowsHide:true}).status,0);
  assert.equal(spawnSync(process.execPath,['-e',"require('./server/config')"],{env:base,windowsHide:true}).status,0);
});
test('P0-D untrusted forwarded IP cannot evade limiter',async()=>{
  const app=require('express')();app.set('trust proxy',false);app.use(require('express-rate-limit').rateLimit({windowMs:60000,limit:2,validate:false}));app.get('/',(req,res)=>res.json({ip:req.ip}));
  const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
  try{const url=`http://127.0.0.1:${server.address().port}`;for(let i=0;i<3;i++){const r=await fetch(url,{headers:{'X-Forwarded-For':`203.0.113.${i+1}`}});assert.equal(r.status,i<2?200:429);}}finally{await new Promise(r=>server.close(r));}
});
test('P1-H invalid dates, tracking corrections and return-to-sender transitions',()=>{
  const {validateManual}=require('./shipping-provider');
  const order={createdAt:'2026-01-01',shipping:{milestone:'delivery_failed',handedOverAt:'2026-01-02',carrier:'Test',trackingNumber:'TEST'}};
  const change={...order.shipping,milestone:'return_to_sender'};
  assert.doesNotThrow(()=>validateManual(order,change,''));
  assert.throws(()=>validateManual(order,{...change,milestone:'returned_to_sender'},''),/thứ tự/);
  assert.throws(()=>validateManual(order,{...change,handedOverAt:'2099-01-01'},''),/Ngày/);
  assert.throws(()=>validateManual(order,{...change,trackingNumber:'OTHER'},''),/lý do/);
  assert.doesNotThrow(()=>validateManual(order,{...change,trackingNumber:'OTHER'},'Sửa lỗi nhập liệu'));
});
test('P0-C private storage rejects traversal and public namespaces',()=>{
  const {key}=require('./private-storage');for(const value of ['../secret','artwork/../x','assets/photo.png','proofs/a/b.png'])assert.throws(()=>key(value));assert.equal(key('proofs/proof_abc-front.png'),'proofs/proof_abc-front.png');
});
test('Returned-to-sender shipment cannot be marked delivered',()=>{
  const {guardFulfillment}=require('./fulfillment');
  for(const milestone of ['return_to_sender','returned_to_sender'])assert.throws(()=>guardFulfillment({payMethod:'cod',status:'shipped',shipping:{milestone}},'delivered'),/hoàn về/);
});

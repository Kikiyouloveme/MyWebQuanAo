const test=require('node:test');
const assert=require('node:assert/strict');
const cp=require('./custom-print');
const db=require('./db');
const pricing=require('./pricing');
const area={enabled:true,x:.34,y:.3,width:.32,height:.4,widthMM:240,heightMM:300,fee:49000};
const settings={areas:{front:area,back:area},minDpi:150,recommendedDpi:300};
const text={id:'t',type:'text',text:'Test',font:'Arial',color:'#111111',x:.5,y:.5,width:.4,height:.15,rotation:0};
test('Geometry retains normalized values and independent sides',()=>{
  const result=cp.validateLayers({front:[text],back:[]},settings,'u');
  assert.equal(result.layers.front[0].x,.5);assert.deepEqual(result.layers.back,[]);
});
test('Rotated rectangular print zone uses viewport aspect ratio',()=>{
  assert.throws(()=>cp.validateLayers({front:[{...text,x:.1,rotation:90}],back:[]},settings,'u'),/ranh giới/);
  assert.doesNotThrow(()=>cp.validateLayers({front:[{...text,rotation:90}],back:[]},settings,'u'));
});
test('NaN/infinite coordinates rejected',()=>{
  for(const x of [NaN,Infinity,-Infinity])assert.throws(()=>cp.validateLayers({front:[{...text,x}],back:[]},settings,'u'),/không hợp lệ/);
});
test('Unsupported fonts, colors and layers rejected',()=>{
  for(const change of [{font:'UntrustedFont'},{color:'url(javascript:evil)'},{type:'html'}]) assert.throws(()=>cp.validateLayers({front:[{...text,...change}],back:[]},settings,'u'));
});
test('Disabled print side rejects artwork',()=>assert.throws(()=>cp.validateLayers({front:[text],back:[]},{...settings,areas:{...settings.areas,front:{...area,enabled:false}}},'u'),/chưa được bật/));
test('DPI thresholds use limiting axis and require actual owned asset',()=>{
  const original=db.load;db.load=()=>({designAssets:[{id:'a',ownerId:'u',status:'ready',width:1000,height:1000,sha256:'sha'}]});
  try{
    const image={...text,type:'image',assetId:'a',width:.5,height:.5};
    const r=cp.validateLayers({front:[image],back:[]},settings,'u');assert.equal(r.warnings.length,1);
    assert(Math.abs(r.layers.front[0].dpi-1000/(150/25.4))<1e-6);
    assert.throws(()=>cp.validateLayers({front:[{...image,width:1,height:1}],back:[]},settings,'u'),/DPI/);
    assert.throws(()=>cp.validateLayers({front:[image],back:[]},settings,'other'),/ảnh của bạn/);
  }finally{db.load=original;}
});
test('Voucher and refund rounding cannot exceed accepted amounts',()=>{
  assert.equal(pricing.computeDiscount({percentage:10},399999),39999);
  assert.equal(pricing.refundableAmount({subtotal:399999,discount:39999},[{price:399999,qty:1}]),360000);
});
test('Mixed shipment guard and consumed inventory cancellation guard',()=>{
  const original=db.load;const state={printJobs:[{orderId:'o',status:'PRINTING',productionStartedAt:'2026-01-01'}]};db.load=()=>state;
  try{assert.throws(()=>cp.guardShipping({id:'o'}));assert.throws(()=>cp.guardCancel({id:'o'},{role:'customer'}));assert.throws(()=>cp.guardCancel({id:'o'},{role:'staff'},{inventoryDecision:'discard_consumed',refundDecision:'pending_if_paid'}));
    assert.doesNotThrow(()=>cp.guardCancel({id:'o'},{role:'admin'},{inventoryDecision:'discard_consumed',refundDecision:'pending_if_paid'}));
    state.printJobs[0].status='PACKED';assert.doesNotThrow(()=>cp.guardShipping({id:'o'}));
  }finally{db.load=original;}
});
test('Production gate requires exact revision and payment',()=>{
  assert.equal(cp.paymentReady({payMethod:'cod',status:'pending',stockState:'reserved'}),false);
  assert.equal(cp.paymentReady({payMethod:'cod',status:'confirmed',stockState:'reserved'}),true);
  assert.equal(cp.paymentReady({payMethod:'vnpay',payStatus:'pending',status:'confirmed',stockState:'reserved'}),false);
  assert.equal(cp.paymentReady({payMethod:'vnpay',payStatus:'paid',status:'confirmed',stockState:'released'}),false);
});
test('Notification failures remain failed and retries stop after three attempts',async()=>{
  const mailer=require('./mailer'), originalLoad=db.load,originalSend=mailer.send;
  const notice={id:'n',eventKey:'event',to:'demo@example.test',status:'pending',attempts:0};let calls=0;
  db.load=()=>({notifications:[notice]});mailer.send=async()=>{calls++;return {ok:false,mode:'smtp'};};
  try{for(let i=0;i<4;i++){notice.nextAttemptAt=null;await cp.flushNotifications();}assert.equal(calls,3);assert.equal(notice.attempts,3);assert.equal(notice.status,'failed');}
  finally{db.load=originalLoad;mailer.send=originalSend;}
});

const test=require('node:test'),assert=require('node:assert/strict'),cp=require('./custom-print'),srs=require('./print-srs'),db=require('./db');
const area={enabled:true,x:.34,y:.3,width:.32,height:.32,widthMM:240,heightMM:300,fee:49000};
const config={workflowMode:'srs',version:1,areas:{front:area,back:area},minDpi:150,recommendedDpi:300};config.positions=srs.defaults(config);
const layer={id:'t',type:'text',text:'Việt Nam',font:'Arial',color:'#111111',x:.5,y:.5,width:.5,height:.2,rotation:0};
for(const position of srs.POSITIONS)test('TC21 valid '+position,()=>{const layers={front:[],back:[]};layers[srs.sideOf(position)]=[{...layer,position}];assert.equal(cp.validateLayers(layers,config,'u').layers[srs.sideOf(position)][0].position,position);});
for(const [position,max] of [['FRONT',12],['BACK',20],['LEFT_CHEST',12]])test('TC21 text boundary '+position,()=>{assert.equal(srs.text('a'.repeat(max),config.positions[position]).length,max);assert.throws(()=>srs.text('a'.repeat(max+1),config.positions[position]));});
test('TC21 Unicode normalization counts accents once',()=>assert.equal(srs.text('Tiếng Việt'.normalize('NFD'),config.positions.FRONT),'Tiếng Việt'));
test('TC21 duplicate and fourth element fail',()=>assert.throws(()=>cp.validateLayers({front:[layer,{...layer,id:'2'},{...layer,id:'3'},{...layer,id:'4'}],back:[]},config,'u')));
test('TC24 examples 80k and 110k',()=>{assert.equal(srs.fee(config,{front:[{...layer,position:'FRONT'}],back:[{...layer,type:'image',position:'BACK'}]}).printFee,80000);assert.equal(srs.fee(config,{front:[{...layer,position:'FRONT'},{...layer,position:'LEFT_CHEST'}],back:[{...layer,type:'image',position:'BACK'}]}).printFee,110000);});
test('TC24 removing position recalculates fee',()=>assert.equal(srs.fee(config,{front:[],back:[]}).printFee,0));
test('TC27 mixed items and unfinished jobs block automatic readiness',()=>{
  const original=db.load;const job={id:'j',orderId:'o',workflowMode:'srs',status:'DONE'};const state={printJobs:[job],notifications:[]};db.load=()=>state;
  try{const order={id:'o',status:'confirmed',payMethod:'cod',stockState:'reserved',items:[{itemType:'custom'},{itemType:'regular'}]};assert.equal(cp.readyOrder(order),false);order.items[1].fulfillmentReady=true;job.status='PRINTING';assert.equal(cp.readyOrder(order),false);job.status='DONE';assert.equal(cp.readyOrder(order),true);assert.equal(order.status,'ready_to_ship');assert.equal(cp.readyOrder(order),false);assert.equal(state.notifications.length,1);}finally{db.load=original;}
});
test('TC26 one free revision cannot be reused',()=>{
  const original=db.orders.byId;db.orders.byId=()=>({userId:'u'});try{assert.throws(()=>cp.revise({workflowMode:'srs',status:'REJECTED',freeRevisionUsed:true},{id:'u',role:'customer'},{designRevisionId:'r'}),/một/);}finally{db.orders.byId=original;}
});
test('Upload limiter returns real HTTP 429',async()=>{
  const express=require('express'),app=express();app.post('/upload',require('./security').limiters.printUpload,(_q,r)=>r.json({ok:true}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{let status;for(let i=0;i<21;i++)status=(await fetch(`http://127.0.0.1:${server.address().port}/upload`,{method:'POST'})).status;assert.equal(status,429);}finally{await new Promise(r=>server.close(r));}
});

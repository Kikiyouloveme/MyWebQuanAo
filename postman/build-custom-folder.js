// Rebuild only this folder; preserve pre-existing requests and variables.
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'SDN302.postman_collection.json');
const collection=JSON.parse(fs.readFileSync(file,'utf8'));
const folder={name:'Custom Printing — demo only',description:'Chạy trên DB demo. Login lưu token theo actor. Không dùng vận đơn DEMO-NOT-LIVE làm tracking thật. Xem docs/CUSTOM_PRINT_API.md.',item:[]};
function request(name,method,url,body,actor='customer',script=[]){
  const entry={name,request:{method,header:[{key:'Content-Type',value:'application/json'}],url:'{{baseUrl}}/api'+url}};
  if(actor)entry.request.header.push({key:'Authorization',value:`Bearer {{${actor}Token}}`});
  if(body!==undefined)entry.request.body={mode:'raw',raw:JSON.stringify(body,null,2),options:{raw:{language:'json'}}};
  if(script.length)entry.event=[{listen:'test',script:{type:'text/javascript',exec:script}}];folder.item.push(entry);return entry;
}
for(const [actor,email,password]of[['customer','khach@velathier.vn','khach123'],['staff','staff@velathier.vn','staff123'],['admin','admin@velathier.vn','admin123']])request('Login '+actor,'POST','/auth/login',{email,password},null,[`pm.collectionVariables.set('${actor}Token',pm.response.json().token);`]);
request('Chọn blank garment','GET','/products/blank-regular',undefined,null,["pm.collectionVariables.set('customVariantId',pm.response.json().variants[0].id);"]);
request('Print options','GET','/products/blank-regular/print-options',undefined,null);
request('Tạo draft text','POST','/designs',{productId:'blank-regular',variantId:'{{customVariantId}}',title:'Postman demo',layers:{front:[{id:'text-1',type:'text',text:'VELATHIER',font:'Arial',color:'#111111',x:.5,y:.5,width:.6,height:.15,rotation:0}],back:[]}},'customer',["const d=pm.response.json();pm.collectionVariables.set('designId',d.id);pm.collectionVariables.set('designRevisionId',d.revisionId);"]);
request('Danh sách draft','GET','/designs');request('Đọc draft','GET','/designs/{{designId}}');
const upload=request('Upload artwork — chọn file PNG/JPEG/WebP','POST','/designs/{{designId}}/assets');upload.request.header=upload.request.header.filter(h=>h.key!=='Content-Type');upload.request.body={mode:'formdata',formdata:[{key:'rightsConfirmed',value:'true',type:'text'},{key:'image',type:'file',src:[]}]};
const items=[{productId:'blank-regular',variantId:'{{customVariantId}}',itemType:'custom',designRevisionId:'{{designRevisionId}}',qty:1,qualityAcknowledged:true}];
request('Quote custom','POST','/orders/quote',{items},'customer',["pm.collectionVariables.set('acceptedTotal',pm.response.json().total);"]);
const checkout=request('Checkout COD demo','POST','/orders',{items,payMethod:'cod',acceptedTotal:'{{acceptedTotal}}',requestKey:'{{$guid}}',address:{fullName:'Khách Postman Demo',phone:'0901234567',province:'Demo',district:'Demo',ward:'Demo',line1:'Không giao thật — địa chỉ demo'}},'customer',["pm.collectionVariables.set('customOrderId',pm.response.json().id);"]);
checkout.request.body.raw=checkout.request.body.raw.replace('"{{acceptedTotal}}"','{{acceptedTotal}}');
request('Xác nhận COD','PUT','/admin/orders/{{customOrderId}}/status',{status:'confirmed'},'staff');
request('Lấy jobs của đơn','GET','/orders/{{customOrderId}}/print-proofs',undefined,'customer',["pm.collectionVariables.set('printJobId',pm.response.json()[0].id);"]);
request('Staff approve','POST','/admin/print-jobs/{{printJobId}}/review',{decision:'approve'},'staff',["const p=pm.response.json().proof;pm.collectionVariables.set('proofId',p.id);pm.collectionVariables.set('proofHash',p.hash);"]);
request('Customer approve exact proof','POST','/print-jobs/{{printJobId}}/approve',{proofId:'{{proofId}}',hash:'{{proofHash}}',acknowledged:true});
for(const status of ['PRINTING','QUALITY_CHECK','PACKED'])request(status,'POST','/admin/print-jobs/{{printJobId}}/status',{status},'staff');
request('Ready to ship','PUT','/admin/orders/{{customOrderId}}/status',{status:'ready_to_ship'},'staff');
request('Shipping demo manual','PUT','/admin/orders/{{customOrderId}}/shipping',{carrier:'Demo — không vận chuyển thật',trackingNumber:'DEMO-NOT-LIVE-POSTMAN',customerNote:'Minh họa lớp học'},'staff');
request('Order detail','GET','/orders/{{customOrderId}}');
request('Size guide','GET','/products/blank-regular/size-guide',undefined,null);
request('Size recommendation','POST','/products/blank-regular/size-recommendation',{chest:90,fit:'Regular',color:'Trắng'},null);
request('Settings history (Admin)','GET','/admin/print-settings',undefined,'admin');
request('Reviews summary','GET','/products/blank-regular/reviews',undefined,null);
collection.item=collection.item.filter(i=>i.name!==folder.name);collection.item.push(folder);
for(const key of ['customerToken','staffToken','adminToken','customVariantId','designId','designRevisionId','acceptedTotal','customOrderId','printJobId','proofId','proofHash'])if(!collection.variable.some(v=>v.key===key))collection.variable.push({key,value:''});
fs.writeFileSync(file,JSON.stringify(collection,null,2)+'\n');
console.log('Updated custom printing folder; existing Postman requests preserved.');

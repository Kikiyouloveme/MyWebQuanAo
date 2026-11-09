/**
 * Unit of work cho các service nghiệp vụ đồng bộ hiện có.
 * Mỗi request đọc lại MongoDB, chỉ ghi các document thay đổi và chờ ghi xong
 * trước khi trả response. Không có file JSON hay cache dữ liệu dài hạn.
 * Hàng đợi chỉ bảo vệ một process. Replica set dùng transaction MongoDB thật;
 * standalone chỉ có atomicity từng document, không phải nhiều collection.
 */
const mongoose = require('mongoose');
const { AsyncLocalStorage } = require('node:async_hooks');
const models = require('./models');
const context = new AsyncLocalStorage();
const collections = Object.keys(models).filter((key) => key !== 'metadata');
let queue = Promise.resolve();
let supportsTransactions = false;
let failNextCommit = false;
const writerId=require('node:crypto').randomUUID();
let leaseTimer, leaseValid=true, leaseRequired=false;
const clean = (doc) => {
  const value = JSON.parse(JSON.stringify(doc));
  delete value._id;
  delete value.__v;
  return value;
};
const keyOf = (name, doc) => name === 'otps' ? `${doc.email}\0${doc.purpose}` : doc.id;
const filterOf = (name, doc) => name === 'otps' ? { email: doc.email, purpose: doc.purpose } : { id: doc.id };

async function connect() {
  const { mongoUri } = require('./config');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000, bufferCommands: false });
  await Promise.all(Object.values(models).map(async (model) => {
    await model.createCollection();
    await model.createIndexes();
  }));
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  supportsTransactions = Boolean(hello.setName || hello.msg === 'isdbgrid');
  if (require('./config').isProd && !supportsTransactions) throw new Error('Production requires a MongoDB replica set; standalone is demo only');
  leaseRequired=!supportsTransactions&&!/^velathier_test_\d+_\d+$/.test(mongoose.connection.name);
  if(leaseRequired){
    const leases=mongoose.connection.db.collection('_writerLease');
    try{await leases.findOneAndUpdate({_id:'demo-writer',$or:[{expiresAt:{$lt:Date.now()}},{owner:writerId}]},{$set:{owner:writerId,expiresAt:Date.now()+30000}},{upsert:true});}
    catch{throw Error('Another demo writer is active. Stop it before starting server/migration.');}
    leaseTimer=setInterval(async()=>{try{const r=await leases.updateOne({_id:'demo-writer',owner:writerId},{$set:{expiresAt:Date.now()+30000}});leaseValid=r.matchedCount===1;}catch{leaseValid=false;}},5000);leaseTimer.unref();
  }
  console.log(`[MongoDB] Connected: ${mongoose.connection.name} (${supportsTransactions ? 'transactions' : 'standalone'})`);
}
async function read(session, filters) {
  const state = {};
  for (const name of collections) state[name] = filters && filters[name] === false ? [] : (await models[name].find(filters?.[name] || {}).session(session || null).lean()).map(clean);
  // Repository cũ trả document mới nhất trước.
  for (const name of ['orders', 'returns', 'emails', 'messages', 'products', 'vouchers']) {
    state[name].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  const meta = await models.metadata.findById('app').session(session || null).lean();
  state.schemaVersion = meta?.schemaVersion || 3;
  state.counters = meta?.counters || { order: 1000, return: 500 };
  return state;
}
async function commit(scope) {
  if(leaseRequired){const lease=await mongoose.connection.db.collection('_writerLease').findOne({_id:'demo-writer',owner:writerId});if(!leaseValid||!lease||lease.expiresAt<=Date.now())throw Error('Demo writer lease lost; refusing writes');}
  const changes = [];
  // Validate toàn bộ thay đổi trước khi ghi bất kỳ document nào.
  for (const name of collections) {
    const before = new Map(scope.before[name].map((doc) => [keyOf(name, doc), doc]));
    for (const doc of scope.state[name]) {
      const key = keyOf(name, doc);
      const prior = before.get(key);
      before.delete(key);
      if (JSON.stringify(prior) === JSON.stringify(doc)) continue;
      const instance = new models[name](doc);
      await instance.validate();
      changes.push({ name, doc: clean(instance.toObject()), insert: !prior });
    }
    for (const doc of before.values()) changes.push({ name, doc, remove: true });
  }
  const metadataChanged = JSON.stringify(scope.before.counters) !== JSON.stringify(scope.state.counters)
    || scope.before.schemaVersion !== scope.state.schemaVersion;
  if (!changes.length && !metadataChanged) return;
  const write = async (session) => {
    for (const change of changes) {
      const model = models[change.name];
      const opts = session ? { session } : {};
      if (change.remove) await model.deleteOne(filterOf(change.name, change.doc), opts);
      else if (change.insert) await model.create([change.doc], opts);
      else {
        const prior=scope.before[change.name].find(doc=>keyOf(change.name,doc)===keyOf(change.name,change.doc));
        const withoutStock=doc=>({...doc,variants:doc.variants?.map(v=>({...v,stock:0}))});
        if(change.name==='products' && require('node:util').isDeepStrictEqual(withoutStock(prior),withoutStock(change.doc))){
          const increments={};change.doc.variants.forEach((v,i)=>{const delta=v.stock-prior.variants[i].stock;if(delta)increments[`variants.${i}.stock`]=delta;});
          const result=await model.updateOne({id:prior.id,variants:prior.variants},{$inc:increments},opts);
          if(!result.matchedCount){const error=new Error('Tồn kho vừa thay đổi; vui lòng thử lại.');error.status=409;throw error;}
        }else if(change.name==='printJobs' && prior?.history && change.doc.history?.length>prior.history.length){
          // Duyệt/cập nhật sản xuất phải ghi đè đúng trạng thái đã đọc. Nếu một nhân viên
          // khác vừa thêm lịch sử thì không ghi đè — trả 409 và bắt tải lại công việc.
          // So với bản ghi HIỆN TẠI trong DB chứ không chỉ snapshot lúc đọc, để cả trường
          // hợp scope đã cũ vẫn bị phát hiện thay vì âm thầm ghi đè.
          const live = await model.findOne({ id: prior.id }, { status: 1, history: 1 }).lean();
          if(!live || live.status !== prior.status || (live.history || []).length !== prior.history.length){
            const error=new Error('Công việc in vừa được người khác cập nhật. Tải lại trước khi thao tác.');error.status=409;throw error;
          }
          const result=await model.updateOne(
            {id:prior.id,status:prior.status,'history':{$size:prior.history.length}},
            {$set:{...change.doc}},
            {...opts,runValidators:true}
          );
          if(!result.matchedCount){const error=new Error('Công việc in vừa được người khác cập nhật. Tải lại trước khi thao tác.');error.status=409;throw error;}
        }else await model.replaceOne(filterOf(change.name, change.doc), change.doc, { ...opts, runValidators: true });
      }
      if(failNextCommit){failNextCommit=false;throw Error('Injected mid-commit test failure');}
    }
    if(metadataChanged)await models.metadata.updateOne({ _id: 'app' }, {
      $set: { schemaVersion: scope.state.schemaVersion, counters: scope.state.counters },
    }, { upsert: true, ...(session ? { session } : {}) });
  };
  await write(scope.session);
}
function load() {
  const scope = context.getStore();
  if (!scope || scope.closed) throw new Error('Database access must run inside db.run()');
  return scope.state;
}
function run(fn, filters) {
  // Ghép vào hàng đợi NGAY khi tạo operation. Nếu chỉ gán lại `queue` ở cuối hàm
  // thì hai request tới trong cùng một tick đều đọc giá trị `queue` cũ, chạy song
  // song và cùng thấy trạng thái trước khi ghi — phá vỡ kiểm tra chống duyệt trùng.
  const operation = (supportsTransactions ? Promise.resolve() : queue).then(async () => {
    const session = supportsTransactions ? await mongoose.startSession() : null;
    if(session)session.startTransaction({readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
    let scope;
    try {
    const state = await read(session,filters);
    scope = { state, before: structuredClone(state), session, pending: [], rollback: [], closed: false };
    return await context.run(scope, async () => {
      try {
        const result = await fn();
        await Promise.all(scope.pending);
        await commit(scope);
        if(session)await session.commitTransaction();
        return result;
      } catch (error) { await Promise.allSettled(scope.rollback.map(fn => fn())); throw error; }
      finally { scope.closed = true; }
    });
    } catch(error) {
      if(session?.inTransaction())await session.abortTransaction();
      if(error.hasErrorLabel?.('TransientTransactionError') || error.code===112) {
        const conflict=new Error('Dữ liệu vừa thay đổi. Vui lòng thử lại với cùng mã yêu cầu.');conflict.status=409;throw conflict;
      }
      throw error;
    } finally { if(session)await session.endSession(); }
  });
  queue = operation.catch(() => {});
  return operation;
}
function track(promise) {
  const scope = context.getStore();
  if (scope && !scope.closed) scope.pending.push(promise);
  return promise;
}
function middleware(req, res, next) {
  const originalEnd = res.end;
  const preserveRejectedAuth = /^\/(?:api\/)?auth(?:\/|$)/.test(req.originalUrl) || /\/orders\/guest\/verify-code(?:\?|$)/.test(req.originalUrl);
  let response;
  // Các API hiện tại trả JSON/HTML không streaming. Hoãn end để chờ MongoDB ACK.
  let filters;
  // Checkout/quotes load only the customer, requested SKUs/revisions and matching voucher.
  if(req.method==='POST' && ['/orders','/orders/quote'].includes(req.path) && Array.isArray(req.body.items)){
    try{
      const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
      const payload=require('jsonwebtoken').verify(token,require('./config').jwtSecret);
      const ids=req.body.items.map(i=>i.productId).filter(i=>typeof i==='string');
      filters=Object.fromEntries(collections.map(name=>[name,false]));
      Object.assign(filters,{users:{id:payload.id},products:{id:{$in:ids}},vouchers:{code:String(req.body.voucherCode||'').trim().toUpperCase()},orders:{userId:payload.id,requestKey:typeof req.body.requestKey==='string'?req.body.requestKey:'__none__'},designs:{userId:payload.id},designRevisions:{id:{$in:req.body.items.map(i=>i.designRevisionId).filter(i=>typeof i==='string')}},designAssets:{ownerId:payload.id},printSettings:{productId:{$in:ids}}});
    }catch{/* Guest/invalid token retains established authentication and OTP path. */}
  }
  run(() => new Promise((resolve,reject) => {
    res.end = function (...args) { response = args;
      if(res.statusCode>=400 && (!preserveRejectedAuth || res.statusCode>=500)){const error=new Error('Rejected request');error.httpResponse=true;reject(error);}else resolve();return this; };
    res.once('close', resolve);
    next();
  }), filters).then(() => {
    res.end = originalEnd;
    if (!res.destroyed && response) originalEnd.apply(res, response);
  }).catch((error) => {
    res.end = originalEnd;
    if (res.destroyed) return;
    if(error.httpResponse && response){originalEnd.apply(res,response);return;}
    res.removeHeader('Content-Length');
    res.removeHeader('ETag');
    res.removeHeader('Location');
    next(error);
  });
}
module.exports = { connect, load, run, track, middleware, models, collections,
  injectFailureForTest: () => { if(require('./config').isProd || !/^velathier_test_\d+_\d+$/.test(mongoose.connection.name) || !supportsTransactions)throw Error('Fault injection is isolated replica-set test only');failNextCommit=true; },
  onRollback: (fn) => context.getStore().rollback.push(fn),
  close: async () => { clearInterval(leaseTimer);if(leaseRequired&&mongoose.connection.readyState===1)await mongoose.connection.db.collection('_writerLease').deleteOne({_id:'demo-writer',owner:writerId});await mongoose.disconnect(); },
  status: () => ({ connected: mongoose.connection.readyState === 1, name: mongoose.connection.name, transactions: supportsTransactions }),
};

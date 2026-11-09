// Offline backup: stop application writers first. Never logs documents or credentials.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const config = require('./config');
const EJSON = mongoose.mongo.BSON.EJSON;
async function main() {
  const target = path.resolve('server/private/backups', new Date().toISOString().replace(/[:.]/g, '-'));
  await mongoose.connect(config.mongoUri);
  try {
    const database = mongoose.connection.db;
    const names = (await database.listCollections().toArray()).map(c => c.name).sort();
    const dump = {};
    for (const name of names) dump[name] = await database.collection(name).find({}).toArray();
    await fs.mkdir(target, { recursive: true });
    const data = EJSON.stringify(dump, { relaxed: false });
    await fs.writeFile(path.join(target, 'database.ejson'), data, { flag: 'wx' });
    const assets = [], keys=new Set();
    for(const revision of dump.designRevisions||[])if(revision.previewKey)keys.add('artwork/'+revision.previewKey);
    for(const asset of dump.designAssets||[]){const prefix=asset.purpose==='review'?'review-photos/':'artwork/';if(asset.storageKey)keys.add(prefix+asset.storageKey);if(asset.previewKey)keys.add(prefix+asset.previewKey);}
    for(const job of dump.printJobs||[])for(const proof of [job.proof,...(job.proofHistory||[])])for(const item of Object.values(proof?.exports||{}))keys.add('proofs/'+item.key);
    for(const ret of dump.returns||[])for(const url of ret.photos||[])if(url.startsWith('/assets/img/returns/'))keys.add('returns/'+url.split('/').pop());
    const storage=require('./private-storage');
    for(const key of keys){storage.key(key);const bytes=key.startsWith('returns/')&&!key.startsWith('returns/retproof_')?await fs.readFile(path.join('assets/img',key)):await storage.read(key);const file=path.join(target,key);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes,{flag:'wx'});assets.push({key,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
    await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify({ database: database.databaseName, createdAt: new Date().toISOString(), schemaVersion: dump.metadata?.find(m => m._id === 'app')?.schemaVersion, databaseSha256: crypto.createHash('sha256').update(data).digest('hex'), assets }, null, 2));
    console.log(`Backup saved privately: ${target}; ${names.length} collections; ${assets.length} files. Requires stopped writers for consistency.`);
  } finally { await mongoose.disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });

require('./config');
const db=require('./db');
const fs=require('node:fs/promises');
const path=require('node:path');
// Dry-run by default. Only orphan files (no metadata), older than seven days.
// Assets referenced by drafts, revisions, orders or proofs are never purged here.
async function main(){
  await db.connect();let candidates=0;
  const storage=require('./private-storage');
  if(storage.provider!=='local')throw Error('S3 retention requires inventory/reconciliation before deletion; this filesystem GC is disabled for S3');
  const assets=await db.models.designAssets.find({}).lean();
  const retained=new Set(assets.flatMap(a=>[a.storageKey,a.previewKey]).filter(Boolean));
  for(const rev of await db.models.designRevisions.find({}).lean())if(rev.previewKey)retained.add(rev.previewKey);
  for(const job of await db.models.printJobs.find({}).lean())for(const proof of [job.proof,...(job.proofHistory||[])])for(const item of Object.values(proof?.exports||{}))retained.add(item.key);
  for(const ret of await db.models.returns.find({}).lean())for(const photo of ret.photos||[])retained.add(photo.split('/').pop());
  for(const subdir of ['artwork','review-photos','proofs','returns']){
    const root=path.resolve(storage.root,subdir);await fs.mkdir(root,{recursive:true});
    for(const name of await fs.readdir(root)){
      if(!/^(asset|reviewphoto|proof|retproof)_[A-Za-z0-9]+(?:\.preview|-front|-back)?\.(png|jpeg|webp)$/.test(name)||retained.has(name))continue;
      const file=path.resolve(root,name);if(path.dirname(file)!==root)throw Error('Unsafe media cleanup path');
      const stat=await fs.stat(file);if(!stat.isFile()||Date.now()-stat.mtimeMs<7*86400000)continue;
      candidates++;if(process.argv.includes('--apply'))await fs.unlink(file);
    }
  }
  console.log(`${process.argv.includes('--apply')?'Đã dọn':'Dry-run, file mồ côi quá 7 ngày'}: ${candidates}`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.close());

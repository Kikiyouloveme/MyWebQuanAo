require('./config');
const db=require('./db'),cp=require('./custom-print'),srs=require('./print-srs');
async function migrate(){
  for(const id of ['blank-regular','blank-oversized','blank-hoodie']){
    const old=cp.settings(id);if(!old||cp.all('printSettings').some(s=>s.productId===id&&s.migration==='uc21-27-v1'))continue;
    const config=cp.validateSettings({...old,workflowMode:'srs',positions:srs.defaults(old)},id,'migration-srs');config.migration='uc21-27-v1';cp.all('printSettings').push(config);
  }
  db.load().schemaVersion=Math.max(6,db.load().schemaVersion||0);
  console.log('SRS migration: new settings versions for 3 demo products; historical snapshots unchanged.');
}
if(require.main===module)db.connect().then(()=>db.run(migrate)).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
module.exports={migrate};

// Restore only into an empty database with a separate explicit URI. Does not overwrite live records.
const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');const mongoose=require('mongoose');
async function main(){
  const folder=path.resolve(process.argv[2]||'');if(!process.argv[2]||!process.env.RESTORE_MONGO_URI)throw Error('Usage: RESTORE_MONGO_URI=<empty isolated DB> node server/restore-private.js <backup directory>');
  const manifest=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8')),bytes=await fs.readFile(path.join(folder,'database.ejson'));
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');if(hash(bytes)!==manifest.databaseSha256)throw Error('Backup DB hash mismatch');
  for(const item of manifest.assets){if(!/^(artwork|review-photos|proofs|returns)\/[a-zA-Z0-9_.-]+$/.test(item.key)||item.key.includes('..'))throw Error('Unsafe backup key');if(hash(await fs.readFile(path.join(folder,item.key)))!==item.sha256)throw Error('Backup asset hash mismatch');}
  await mongoose.connect(process.env.RESTORE_MONGO_URI);
  try{
    const database=mongoose.connection.db;if(database.databaseName===manifest.database||['admin','local','config'].includes(database.databaseName))throw Error('Restore target must be separate from source');
    if((await database.listCollections().toArray()).length)throw Error('Restore target must have no collections');
    const dump=mongoose.mongo.BSON.EJSON.parse(bytes.toString());
    for(const [name,documents] of Object.entries(dump)){if(documents.length)await database.collection(name).insertMany(documents);}
    // Restore assets into a NEW local root; operator configures it after validation.
    const target=path.resolve('server/private/restores',database.databaseName+'-'+Date.now());await fs.mkdir(target,{recursive:true});
    for(const item of manifest.assets){const file=path.join(target,item.key);await fs.mkdir(path.dirname(file),{recursive:true});await fs.copyFile(path.join(folder,item.key),file);}
    console.log(`Restored ${Object.keys(dump).length} collections to isolated DB; files at ${target}. Recreate indexes with db:check; validate before switching traffic.`);
  }finally{await mongoose.disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

// One-time production bootstrap from secret-manager environment, never a default password.
const config=require('./config');const db=require('./db');
async function main(){
  if(!config.isProd)throw Error('Production bootstrap only; development uses existing demo accounts');
  const email=String(process.env.ADMIN_BOOTSTRAP_EMAIL||'').trim().toLowerCase(),password=process.env.ADMIN_BOOTSTRAP_PASSWORD||'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<16||password.length>72)throw Error('Inject ADMIN_BOOTSTRAP_EMAIL and unique ADMIN_BOOTSTRAP_PASSWORD (16–72 characters)');
  const pass=await require('bcryptjs').hash(password,12);
  await db.connect();
  await db.run(()=>{if(db.users.all().some(u=>u.role==='admin'&&u.id!=='u_admin'&&!u.disabled))throw Error('A production administrator already exists; bootstrap refused');if(db.users.byEmail(email))throw Error('Email already exists; no account overwritten');db.users.insert({id:db.uid('admin'),email,name:'Quản trị viên',pass,role:'admin',emailVerified:true,tokensValidFrom:Date.now(),addresses:[],createdAt:new Date().toISOString()});});
  console.log('Production administrator created. Remove bootstrap variables from runtime secrets.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.close());

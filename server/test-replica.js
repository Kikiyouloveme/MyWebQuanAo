// Own disposable mongod, database and two API processes. Never connects to .env DB.
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const {MongoClient}=require('mongodb');
const port=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const mongoPort=await port(),first=await port(),second=await port();
  const name=`velathier_test_${Date.now()}_${process.pid}`,dir=path.resolve('server/private/test-replicas',name);
  await fs.mkdir(dir,{recursive:true});
  const processes=[];
  const mongo=spawn(process.env.TEST_MONGOD_PATH||'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe',['--dbpath',dir,'--port',String(mongoPort),'--bind_ip','127.0.0.1','--replSet','velaTest','--logpath',path.join(dir,'mongod.log')],{windowsHide:true,stdio:'ignore'});processes.push(mongo);
  let client;
  try{
    for(let i=0;i<60;i++){try{client=await MongoClient.connect(`mongodb://127.0.0.1:${mongoPort}/?directConnection=true`,{serverSelectionTimeoutMS:500});break;}catch{await pause(250);}}
    if(!client)throw Error('Disposable mongod unavailable');
    await client.db('admin').command({replSetInitiate:{_id:'velaTest',members:[{_id:0,host:`127.0.0.1:${mongoPort}`}]}});
    for(let i=0;i<60;i++){if((await client.db('admin').command({hello:1})).isWritablePrimary)break;await pause(250);}
    const env={...process.env,NODE_ENV:'development',MONGO_URI:`mongodb://127.0.0.1:${mongoPort}/${name}?replicaSet=velaTest`,SMTP_HOST:'',SMTP_USER:'',VNP_TMN_CODE:'',VNP_HASH_SECRET:'',DISABLE_RATE_LIMIT:'1',TEST_BASE_URL:`http://127.0.0.1:${first}`,TEST_SECOND_BASE_URL:`http://127.0.0.1:${second}`,PUBLIC_URL:`http://127.0.0.1:${first}`};
    Object.assign(env,{PRIVATE_STORAGE_PROVIDER:'local',PRIVATE_STORAGE_ROOT:path.resolve('server/private/test-storage',name),JWT_SECRET:'isolated-test-jwt-secret-never-production',VNP_REFUND_AUTOMATION_ENABLED:'0'});
    const run=script=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{env,windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${script}: ${code}`)));});
    await run('server/seed.js');
    for(const p of [first,second]){const server=spawn(process.execPath,['server/server.js'],{env:{...env,PORT:String(p)},windowsHide:true,stdio:'ignore'});processes.push(server);}
    for(const base of [env.TEST_BASE_URL,env.TEST_SECOND_BASE_URL]){let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await pause(100);}if(!ready)throw Error('Test API not ready');}
    await run('server/test-reliability.js');
  }finally{
    for(const p of processes.reverse()){if(p.exitCode===null){const exited=new Promise(r=>p.once('exit',r));p.kill();await exited;}}
    await client?.close();
    // Retain disposable files/log for diagnosis; never remove a computed external directory.
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

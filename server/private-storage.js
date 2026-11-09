const fs=require('node:fs/promises');
const path=require('node:path');
const provider=process.env.PRIVATE_STORAGE_PROVIDER||'local';
const root=path.resolve(process.env.PRIVATE_STORAGE_ROOT||path.join(__dirname,'private'));
function key(value){if(!/^(artwork|proofs|review-photos|returns)\/[a-zA-Z0-9_.-]+$/.test(value)||value.includes('..'))throw Error('Invalid private storage key');return value;}
let client;
function s3(){const sdk=require('@aws-sdk/client-s3');client ||= new sdk.S3Client({region:process.env.AWS_REGION||'us-east-1',endpoint:process.env.S3_ENDPOINT||undefined,forcePathStyle:process.env.S3_FORCE_PATH_STYLE==='1'});return {sdk,client};}
async function put(value,bytes){key(value);if(provider==='s3'){const {sdk,client}=s3();await client.send(new sdk.PutObjectCommand({Bucket:process.env.PRIVATE_STORAGE_BUCKET,Key:value,Body:bytes,IfNoneMatch:'*',ServerSideEncryption:'AES256',ContentType:value.endsWith('.png')?'image/png':'application/octet-stream'}));}else{const file=path.join(root,value);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes,{flag:'wx'});}}
async function read(value){key(value);if(provider==='s3'){const {sdk,client}=s3();const result=await client.send(new sdk.GetObjectCommand({Bucket:process.env.PRIVATE_STORAGE_BUCKET,Key:value}));return Buffer.from(await result.Body.transformToByteArray());}return fs.readFile(path.join(root,value));}
async function remove(value){key(value);if(provider==='s3'){const {sdk,client}=s3();await client.send(new sdk.DeleteObjectCommand({Bucket:process.env.PRIVATE_STORAGE_BUCKET,Key:value}));}else await fs.unlink(path.join(root,value));}
function availableLocally(value){key(value);return provider==='s3'||require('node:fs').existsSync(path.join(root,value));}
module.exports={put,read,remove,availableLocally,provider,root,key};

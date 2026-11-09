// Versioned SRS policy. Historical snapshots without workflowMode remain enhanced.
const {badRequest,v}=require('./security');
const POSITIONS=['FRONT','BACK','LEFT_CHEST'];
const sideOf=p=>p==='BACK'?'back':'front';
const positionOf=(layer,side)=>layer.position||side.toUpperCase();
const isSrs=config=>config?.workflowMode==='srs';
function workingHours(start,end=Date.now()){
  let hours=0,cursor=new Date(Date.parse(start)+7*3600000),finish=end+7*3600000;
  if(!Number.isFinite(cursor.getTime()))return 0;
  while(cursor.getTime()<finish){const next=Math.min(finish,Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth(),cursor.getUTCDate(),cursor.getUTCHours()+1));if(![0,6].includes(cursor.getUTCDay())&&cursor.getUTCHours()>=9&&cursor.getUTCHours()<17)hours+=(next-cursor.getTime())/3600000;cursor=new Date(next);}
  return hours;
}
function defaults(config){
  return Object.fromEntries(POSITIONS.map(p=>[p,{...(p==='LEFT_CHEST'?{enabled:true,x:.57,y:.28,width:.12,height:.096,widthMM:90,heightMM:90}:config.areas[sideOf(p)]),textRate:30000,imageRate:50000,maxChars:p==='BACK'?20:12}]));
}
function configure(raw,result,fonts,palette){
  result.workflowMode=v.oneOf(raw.workflowMode||'enhanced',['srs','enhanced'],'quy trình');
  if(!isSrs(result))return result;
  result.formats=['png','jpeg'];result.maxBytes=5*1024*1024;
  if(raw.supportedFonts&&!Array.isArray(raw.supportedFonts)||raw.supportedColors&&!Array.isArray(raw.supportedColors))throw badRequest('Font và màu phải là danh sách');
  result.supportedFonts=[...new Set((raw.supportedFonts||fonts).map(f=>v.oneOf(f,fonts,'font')))];
  result.supportedColors=[...new Set((raw.supportedColors||palette).map(c=>v.oneOf(c,palette,'màu')))];
  if(!result.supportedFonts.length||!result.supportedColors.length)throw badRequest('Cần ít nhất một font và màu');
  result.positions={};
  if(Object.keys(raw.positions||{}).some(p=>!POSITIONS.includes(p)))throw badRequest('Vị trí cấu hình không hợp lệ');
  for(const p of POSITIONS){
    const a=raw.positions?.[p];if(!a)throw badRequest('Thiếu cấu hình vị trí '+p);
    const next={enabled:a.enabled===true,textRate:v.int(a.textRate,'phí chữ',{min:0,max:10000000}),imageRate:v.int(a.imageRate,'phí ảnh',{min:0,max:10000000}),maxChars:v.int(a.maxChars,'số ký tự',{min:1,max:200})};
    for(const k of ['x','y','width','height','widthMM','heightMM']){const n=a[k];if(typeof n!=='number'||!Number.isFinite(n)||n<(k==='x'||k==='y'?0:.001)||n>(k.endsWith('MM')?1000:1))throw badRequest('Vùng in không hợp lệ');next[k]=n;}
    if(next.x+next.width>1||next.y+next.height>1||Math.abs(next.width/(next.height*1.25)-next.widthMM/next.heightMM)>.02)throw badRequest('Vùng in ngoài áo hoặc sai tỷ lệ vật lý');
    result.positions[p]=next;
  }
  result.allowedPositions=POSITIONS.filter(p=>result.positions[p].enabled);
  if(result.enabled&&!result.allowedPositions.length)throw badRequest('Cần bật ít nhất một vị trí in');
  return result;
}
function text(raw,area){
  if(typeof raw!=='string')throw badRequest('Cần nội dung chữ');
  const value=raw.normalize('NFC').trim();
  if(!value||[...value].length>area.maxChars)throw badRequest(`Vị trí này cho phép tối đa ${area.maxChars} ký tự`);
  if(!/^[\p{Script=Latin}0-9 .,!?\-_:;'"()&+/@#%]+$/u.test(value))throw badRequest('Chỉ dùng chữ Latin/tiếng Việt, số, khoảng trắng và dấu câu cơ bản');
  return value;
}
function area(config,layer,side){return isSrs(config)?config.positions?.[positionOf(layer,side)]:config.areas[side];}
function fee(config,layers){
  const positions=[];
  for(const side of ['front','back'])for(const layer of layers[side]){const position=positionOf(layer,side),a=config.positions[position];positions.push({position,contentType:layer.type.toUpperCase(),fee:layer.type==='text'?a.textRate:a.imageRate});}
  return {positions,printFee:positions.reduce((sum,p)=>sum+p.fee,0)};
}
module.exports={workingHours,POSITIONS,sideOf,positionOf,isSrs,defaults,configure,text,area,fee};

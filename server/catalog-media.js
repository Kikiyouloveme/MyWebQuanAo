const fs=require('node:fs/promises');
const path=require('node:path');
const db=require('./db');
const palette={'Kem':'#e4dbc7','Trắng':'#f1efea','Đen':'#27282a','Xanh rêu':'#626a49','Nâu đất':'#715548','Xanh navy':'#303c50','Xám tiêu':'#8a8b89','Xanh olive':'#697252','Be':'#c5b394','Kem / Đen':'#ddd3bc','Navy / Trắng':'#34435a','Đen / Trắng':'#333538'};
const types={'tee-boxy-01':'boxy','tee-heavy-02':'tee','shirt-flannel-03':'shirt','hoodie-mono-04':'hoodie','jacket-coach-05':'coach','varsity-06':'varsity','pants-wide-07':'wide','pants-cargo-08':'cargo','shorts-sweat-09':'shorts','cap-6panel-10':'cap','tote-canvas-11':'tote','socks-crew-12':'socks'};
function artwork(kind,back,fill){
  const seams='fill="none" stroke="#888" stroke-opacity=".5" stroke-width="2"';
  const body=d=>`<path d="${d}" fill="url(#cloth)" stroke="#666" stroke-opacity=".5" stroke-width="2" filter="url(#shadow)"/>`;
  const stitch=d=>`<path d="${d}" ${seams}/>`;
  const logo=(x,y,size=12)=>`<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial" font-size="${size}" letter-spacing="2" fill="${fill==='#27282a'?'#858583':'#666b62'}">VELATHIER</text>`;
  const buttons=()=>[225,285,345,405,465].map(y=>`<circle cx="250" cy="${y}" r="4" fill="#777"/>`).join('');
  if(['tee','boxy'].includes(kind))return body(kind==='boxy'?'M175 110 L115 135 L35 265 L125 310 L150 255 L150 530 L350 530 L350 255 L375 310 L465 265 L385 135 L325 110 Q250 160 175 110Z':'M175 100 L125 125 L55 245 L130 285 L160 235 L160 535 L340 535 L340 235 L370 285 L445 245 L375 125 L325 100 Q250 150 175 100Z')+stitch(`M175 110 Q250 ${back?145:205} 325 110 M160 516 L340 516 M125 270 L75 240 M375 270 L425 240`)+(back?'':logo(kind==='boxy'?300:250,kind==='boxy'?250:270,kind==='boxy'?8:12));
  if(kind==='hoodie')return body('M165 155 Q165 55 250 50 Q335 55 335 155 L390 180 L455 430 L385 450 L350 300 L350 535 L150 535 L150 300 L115 450 L45 430 L110 180Z')+stitch('M165 155 Q250 205 335 155 M155 510 L345 510 M200 180 L195 300 M300 180 L305 300')+(back?stitch('M170 145 Q250 255 330 145'):stitch('M190 395 L310 395 L330 475 L170 475Z')+logo(250,300));
  if(['shirt','coach','varsity'].includes(kind))return body('M185 110 L115 140 L55 445 L120 465 L155 290 L150 540 L350 540 L345 290 L380 465 L445 445 L385 140 L315 110Z')+(kind==='varsity'?`<path d="M115 140 L55 445 L120 465 L155 290 L155 160Z M385 140 L445 445 L380 465 L345 290 L345 160Z" fill="${fill==='#ddd3bc'?'#27282a':'#eeeae2'}"/>`:'')+stitch('M185 110 L250 160 L315 110 M250 160 L250 535 M155 520 L345 520')+(kind==='shirt'?`<path d="M170 180H330 M160 225H340 M155 270H345 M155 315H345 M155 360H345 M155 405H345 M155 450H345 M155 495H345 M180 150V530 M220 150V530 M280 150V530 M320 150V530" stroke="#beb2a0" stroke-opacity=".4" stroke-width="7"/>`:'')+(back?'':buttons()+stitch('M175 255 H220 V310 H175Z M280 255 H325 V310 H280Z')+(kind==='varsity'?'<text x="300" y="245" font-family="Georgia" font-size="42" fill="#d6d0b9">V</text>':''));
  if(['wide','cargo','shorts'].includes(kind)){
    const short=kind==='shorts',bottom=short?440:560;
    return body(`M155 100 H345 L${kind==='wide'?370:345} ${bottom} H275 L250 ${short?280:260} L225 ${bottom} H${kind==='wide'?130:155}Z`)+stitch(`M155 125 H345 M250 125 V250 M170 150 L160 210 M330 150 L340 210 M${kind==='wide'?135:160} ${bottom-18} H220 M280 ${bottom-18} H${kind==='wide'?365:340}`)+(kind==='wide'?stitch('M200 130 L185 530 M300 130 L315 530'):kind==='cargo'?stitch('M160 280 H220 V365 H160Z M280 280 H340 V365 H280Z M160 300 H220 M280 300 H340'):'')+(short?stitch('M245 120 Q225 170 230 225 M255 120 Q280 165 270 225'):back?stitch('M180 160 H225 V210 H180Z M275 160 H320 V210 H275Z'):stitch('M255 125 V220 Q265 245 250 250'));
  }
  if(kind==='cap')return body('M120 330 Q115 180 250 165 Q385 180 380 330 Q250 375 120 330Z')+body(back?'M180 330 Q250 270 320 330 L315 350 H185Z':'M130 320 Q250 295 370 320 L425 375 Q250 425 75 375Z')+stitch('M250 165 V320 M250 165 Q160 210 170 330 M250 165 Q340 210 330 330')+(back?'':logo(250,285));
  if(kind==='tote')return `<path d="M180 235 V135 Q250 60 320 135 V235" fill="none" stroke="${fill}" stroke-width="25"/>`+body('M130 220 H370 L390 535 H110Z')+stitch('M140 240 H360 M130 510 H370 M180 225 V275 M320 225 V275')+(back?'':logo(250,375,16));
  if(kind==='socks')return body('M120 150 H205 V355 Q220 390 265 405 Q285 435 245 455 L135 420 Q110 400 110 365Z')+`<path d="M290 145 H375 V350 Q390 385 435 400 Q455 430 415 450 L305 415 Q280 395 280 360Z" fill="#e9e8e3" stroke="#aaa" stroke-width="2"/>`+stitch('M125 165 H200 M125 180 H200 M125 195 H200 M295 160 H370 M295 175 H370 M295 190 H370');
  return '';
}
async function migrateCatalogMedia(){
  const root=path.join(__dirname,'..','assets','img','catalog');await fs.mkdir(root,{recursive:true});
  for(const [id,kind] of Object.entries(types)){
    const p=db.products.byId(id);if(!p)continue;const media=[];
    for(const [index,color] of p.colors.entries())for(const view of ['front','back']){
      const file=`${id}-${index}-${view}.svg`,fill=palette[color]||'#c3b9a8';
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 625" width="500" height="625"><defs><linearGradient id="cloth"><stop stop-color="${fill}"/><stop offset=".48" stop-color="${fill}"/><stop offset="1" stop-color="${fill}" stop-opacity=".8"/></linearGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="9" flood-opacity=".12"/></filter></defs><rect width="500" height="625" fill="#ebe7df"/><ellipse cx="250" cy="560" rx="150" ry="12" fill="#252525" opacity=".04"/>${artwork(kind,view==='back',fill)}<text x="250" y="594" font-family="Arial" font-size="11" letter-spacing="2" text-anchor="middle" fill="#68645e">VELATHIER · MINH HỌA ${view==='front'?'MẶT TRƯỚC':'MẶT SAU'}</text></svg>`;
      await fs.writeFile(path.join(root,file),svg,'utf8');media.push({assetId:file,productId:id,color,viewType:view,localPath:'/assets/img/catalog/'+file,altText:`${p.title} — ${color} — minh họa ${view}`,sourceName:'VELATHIER project',sourceURL:null,licenseType:'Project-authored SVG',licenseEvidence:'server/catalog-media.js',attribution:'Minh họa hình dáng; chưa có ảnh nhà cung cấp',verifiedAt:'2026-11-07'});
    }
    if(!p.media?.length && String(p.img).startsWith(`/assets/img/p/${id}`)){p.media=media;p.img=media[0].localPath;p.img2=media[1].localPath;}
  }
}
module.exports={migrateCatalogMedia};

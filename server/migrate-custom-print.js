require('./config');
const db=require('./db');
const fs=require('node:fs/promises');
const path=require('node:path');
const cp=require('./custom-print');
// Additive seed: never modifies existing products, users, orders, stock or configured settings.
async function migrate() {
  db.load().schemaVersion=Math.max(db.load().schemaVersion||3,5);
  await require('./catalog-media').migrateCatalogMedia();
  const artworkPath=path.join(__dirname,'..','assets','img','demo','artwork.svg');
  await require('sharp')(artworkPath).png().toFile(path.join(path.dirname(artworkPath),'artwork-1800.png'));
  await require('sharp')(artworkPath).resize(64,64).png().toFile(path.join(path.dirname(artworkPath),'artwork-low-resolution.png'));
  const root=path.join(__dirname,'..','assets','img','custom'); await fs.mkdir(root,{recursive:true});
  for (const [kind,title,price] of [['regular','Áo thun trơn Regular — in theo yêu cầu',250000],['oversized','Áo thun trơn Oversized — in theo yêu cầu',290000],['hoodie','Hoodie trơn — in theo yêu cầu',550000]]) {
    const id=`blank-${kind}`, media=[], mockups={};
    for(const [color,fill] of [['Trắng','#f7f6f2'],['Đen','#252525']]) {
      mockups[color]={};
      for(const side of cp.sides) {
        const key=`${id}-${color==='Đen'?'black':'white'}-${side}.svg`,url='/assets/img/custom/'+key;
        const shape=kind==='hoodie'?'M165 125 Q175 30 250 30 Q325 30 335 125 L390 160 L460 370 L395 390 L350 260 L350 560 L150 560 L150 260 L105 390 L40 370 L110 160 Z':kind==='oversized'?'M165 90 L105 115 L30 255 L125 300 L150 245 L150 555 L350 555 L350 245 L375 300 L470 255 L395 115 L335 90 Q250 140 165 90Z':'M175 90 L115 120 L45 245 L125 285 L155 235 L155 550 L345 550 L345 235 L375 285 L455 245 L385 120 L325 90 Q250 140 175 90Z';
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="625" viewBox="0 0 500 625"><rect width="500" height="625" fill="#eeeae4"/><path d="${shape}" fill="${fill}" stroke="#888" stroke-width="2"/><path d="M175 90 Q250 ${side==='front'?180:120} 325 90" fill="none" stroke="#888" stroke-width="3"/>${kind==='hoodie'?'<path d="M165 125 Q250 210 335 125 M180 440 L320 440 L335 500 L165 500Z" fill="none" stroke="#888" stroke-width="2"/>':''}<text x="250" y="605" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">MOCKUP MINH HỌA · ${side==='front'?'MẶT TRƯỚC':'MẶT SAU'}</text></svg>`;
        await fs.writeFile(path.join(root,key),svg,'utf8');mockups[color][side]=url;
        media.push({assetId:key,productId:id,color,viewType:side,localPath:url,altText:`${title}, ${color}, ${side==='front'?'mặt trước':'mặt sau'} — minh họa`,sourceName:'VELATHIER project',sourceURL:null,licenseType:'Project-authored SVG',licenseEvidence:'server/migrate-custom-print.js',verifiedAt:'2026-11-07',attribution:'Mockup minh họa; không phải ảnh chụp'});
      }
    }
    let p=db.products.byId(id);
    if(!p) {
      const variants=['Trắng','Đen'].flatMap((color,ci)=>['S','M','L','XL'].map(size=>({id:`${id}-${ci}-${size}`,sku:`${id}-${ci}-${size}`,color,size,stock:30,active:true})));
      p={id,title,price,cat:kind==='hoodie'?'outerwear':'tops',desc:'Áo trơn demo; mockup minh họa. Số đo là dữ liệu mẫu cần đối chiếu khi sản xuất.',active:true,variants,colors:['Trắng','Đen'],sizes:['S','M','L','XL'],tags:['custom'],img:media[0].localPath,img2:media[1].localPath,media,createdAt:cp.now()};db.products.insert(p);
    }
    if(!cp.settings(id)) {
      const area={enabled:true,x:.34,y:kind==='hoodie'?.34:.30,width:.32,height:kind==='hoodie'?(160*230/240/625):.32,widthMM:240,heightMM:kind==='hoodie'?230:300};
      cp.all('printSettings').push(cp.validateSettings({enabled:true,technique:'DTF',minDpi:150,recommendedDpi:300,maxBytes:10485760,mockups,areas:{front:{...area,fee:49000},back:{...area,fee:69000}}},id,'migration'));
    }
    const prior=cp.settings(id);
    if(prior?.updatedBy==='migration'&&prior.version===1&&[.3,.4].includes(prior.areas.front.height)){
      const areas=structuredClone(prior.areas);for(const side of cp.sides)areas[side].height=areas[side].width*areas[side].heightMM/areas[side].widthMM/1.25;
      cp.all('printSettings').push(cp.validateSettings({...prior,areas},id,'migration'));
    }
    if(!cp.all('sizeCharts').some(c=>c.productId===id)) cp.all('sizeCharts').push({id:`size-${id}`,productId:id,version:1,sample:true,fit:kind==='oversized'?'Oversized':'Regular',rows:['S','M','L','XL'].map((size,i)=>({size,chest:96+i*8+(kind==='oversized'?12:0),length:65+i*3}))});
  }
  console.log('Custom migration: bổ sung 3 áo trơn, mockup và bảng size; không reset dữ liệu.');
}
if(require.main===module) db.connect().then(()=>db.run(migrate)).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
module.exports={migrate};

const sharp=require('sharp'),path=require('node:path');
const cp=require('./custom-print'),srs=require('./print-srs'),storage=require('./private-storage');
async function generate(design){
  if(!srs.isSrs(design.revision.snapshot.settings))return design;
  const snapshot=structuredClone(design.revision.snapshot),images=[];
  snapshot.settings.exportDpi=72;
  for(const side of cp.sides){
    const overlays=[];
    for(const layer of snapshot.layers[side]){
      const area=srs.area(snapshot.settings,layer,side),single=structuredClone(snapshot);single.layers[side]=[layer];single.settings.areas[side]=area;
      const rendered=await require('./print-export').renderSide(single,side,cp.all('designAssets'));
      overlays.push({input:await sharp(rendered.buffer).resize(Math.round(area.width*400),Math.round(area.height*500)).png().toBuffer(),left:Math.round(area.x*400),top:Math.round(area.y*500)});
    }
    images.push(await sharp(path.join(__dirname,'..',snapshot.settings.mockups[snapshot.color][side])).resize(400,500).composite(overlays).png().toBuffer());
  }
  const key=design.revisionId+'.preview.png';
  const bytes=await sharp({create:{width:800,height:500,channels:4,background:'#eeeae4'}}).composite(images.map((input,i)=>({input,left:i*400,top:0}))).png().toBuffer();
  await storage.put('artwork/'+key,bytes);require('./mongo-store').onRollback(()=>storage.remove('artwork/'+key).catch(()=>{}));
  design.revision.previewKey=key;design.revision.previewUrl=`/api/design-revisions/${design.revisionId}/preview`;return design;
}
module.exports={generate};

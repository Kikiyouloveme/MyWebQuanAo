import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KImage, Rect, Text, Transformer } from 'react-konva';
import Konva from 'konva';
import { getToken } from '@/lib/api';
import type { DesignLayer, DesignSnapshot, Side } from '@/lib/custom-print';
import {areaFor} from '@/lib/custom-print';

function useImage(src:string, privateAsset=false) {
  const [image,setImage]=useState<HTMLImageElement>(),[error,setError]=useState(false);
  useEffect(()=>{let cancelled=false,url='';setImage(undefined);
    setError(false);if(!src)return;
    async function load(){
      let source=src;
      if(privateAsset){const response=await fetch(src,{headers:{Authorization:`Bearer ${getToken()}`}});if(!response.ok)throw new Error('Không tải được ảnh');url=URL.createObjectURL(await response.blob());source=url;}
      const img=new window.Image();img.onload=()=>{if(!cancelled)setImage(img);};img.onerror=()=>{if(!cancelled)setError(true);};img.src=source;
    }
    load().catch(()=>{if(!cancelled)setError(true);});return()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
  },[src,privateAsset]);return {image,error};
}
function Artwork({item,area,selected,onSelect,onChange,editable}:{item:DesignLayer;area:{x:number;y:number;width:number;height:number};selected:boolean;onSelect:()=>void;onChange:(item:DesignLayer)=>void;editable:boolean}) {
  const node=useRef<Konva.Image | Konva.Text>(null), transformer=useRef<Konva.Transformer>(null);
  const {image,error}=useImage(item.assetId?`/api/design-assets/${item.assetId}`:'',true);
  useEffect(()=>{if(selected&&node.current)transformer.current?.nodes([node.current]);},[selected]);
  const props={x:area.x+item.x*area.width,y:area.y+item.y*area.height,width:item.width*area.width,height:item.height*area.height,offsetX:item.width*area.width/2,offsetY:item.height*area.height/2,rotation:item.rotation,draggable:editable,onClick:onSelect,onTap:onSelect,
    onDragEnd:(e:Konva.KonvaEventObject<DragEvent>)=>onChange({...item,x:(e.target.x()-area.x)/area.width,y:(e.target.y()-area.y)/area.height}),
    onTransformEnd:()=>{const n=node.current!;const updated={...item,x:(n.x()-area.x)/area.width,y:(n.y()-area.y)/area.height,width:item.width*n.scaleX(),height:item.height*n.scaleY(),rotation:n.rotation()};n.scaleX(1);n.scaleY(1);onChange(updated);}};
  return <>{error?<Text {...props} text="Không thể hiển thị bản xem trước" fill="red"/>:item.type==='image'?<KImage {...props} image={image} ref={node as React.RefObject<Konva.Image>}/>:<Text {...props} ref={node as React.RefObject<Konva.Text>} text={item.text} fontFamily={item.font} fill={item.color} fontSize={Math.min(item.height*area.height*.7*(item.fontSize||32)/32,item.width*area.width/Math.max(1,[...(item.text||'')].length)*1.5)} align="center" verticalAlign="middle" wrap="none"/>}{selected&&editable&&<Transformer ref={transformer} flipEnabled={false} keepRatio boundBoxFunc={(oldBox,newBox)=>newBox.width<8||newBox.height<8?oldBox:newBox}/>}</>;
}
export function DesignCanvas({snapshot,side,editable=false,selected='',onSelect=()=>{},onChange=()=>{},guides=false,zoom=1}:{snapshot:DesignSnapshot;side:Side;editable?:boolean;selected?:string;onSelect?:(id:string)=>void;onChange?:(item:DesignLayer)=>void;guides?:boolean;zoom?:number}) {
  const container=useRef<HTMLDivElement>(null),[width,setWidth]=useState(400);
  useEffect(()=>{const obs=new ResizeObserver(entries=>setWidth(Math.min(650,entries[0].contentRect.width)));if(container.current)obs.observe(container.current);return()=>obs.disconnect();},[]);
  const {image:base,error:baseError}=useImage(snapshot.settings.mockups[snapshot.color]?.[side]||'');
  const config=snapshot.settings.areas[side],height=width*1.25;
  const area={x:config.x*width,y:config.y*height,width:config.width*width,height:config.height*height};
  return <div ref={container} className="w-full overflow-auto rounded-xl bg-stone-100" aria-label={`Mẫu in ${side==='front'?'mặt trước':'mặt sau'}`}>
    {!base&&<p className="p-3 text-sm" role="status">{baseError||!snapshot.settings.mockups[snapshot.color]?.[side]?'Không thể hiển thị bản xem trước':'Đang tải bản xem trước…'}</p>}
    <Stage width={width*zoom} height={height*zoom} scaleX={zoom} scaleY={zoom}><Layer>
      <KImage image={base} width={width} height={height} onClick={()=>onSelect('')}/>
      {guides&&<Rect {...area} stroke="#d97706" dash={[6,4]} listening={false}/>}
      {snapshot.layers[side].map(item=>{const c=areaFor(snapshot,item,side),region={x:c.x*width,y:c.y*height,width:c.width*width,height:c.height*height};return <Artwork key={item.id} item={item} area={region} selected={selected===item.id} editable={editable} onSelect={()=>onSelect(item.id)} onChange={onChange}/>;})}
      {guides&&snapshot.settings.workflowMode==='srs'&&Object.entries(snapshot.settings.positions||{}).filter(([p,a])=>a.enabled&&(p==='BACK'?'back':'front')===side).map(([p,a])=><Rect key={p} x={a.x*width} y={a.y*height} width={a.width*width} height={a.height*height} stroke="#d97706" dash={[6,4]} listening={false}/>)}
    </Layer></Stage>
  </div>;
}

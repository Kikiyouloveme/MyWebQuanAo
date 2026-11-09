import {useEffect,useState} from 'react';
import {getToken} from '@/lib/api';
export function PrivateImage({src,alt,className,width,height}:{src:string;alt:string;className?:string;width?:number;height?:number}){
  const [url,setUrl]=useState('');
  useEffect(()=>{let active=true,local='';setUrl('');fetch(src,{headers:{Authorization:`Bearer ${getToken()}`}}).then(async r=>{if(!r.ok)throw Error();local=URL.createObjectURL(await r.blob());if(active)setUrl(local);else URL.revokeObjectURL(local);}).catch(()=>{});return()=>{active=false;if(local)URL.revokeObjectURL(local);};},[src]);
  return url?<a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={alt} width={width} height={height} className={className}/></a>:<span role="status">Ảnh riêng tư đang tải hoặc không có quyền xem</span>;
}

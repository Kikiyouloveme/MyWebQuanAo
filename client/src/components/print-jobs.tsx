import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '@/lib/api';
import { PRINT_LABEL,type PrintJob,type Side } from '@/lib/custom-print';
import { DesignCanvas } from './design-canvas';
import { Button } from './ui/button';
import { useAuth } from '@/context/auth';
import { useToast } from '@/context/toast';
export function PrintJobs({orderId,staff=false}:{orderId?:string;staff?:boolean}) {
  const toast=useToast();
  const [jobs,setJobs]=useState<PrintJob[]>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>api.get<PrintJob[]>(staff?'/api/admin/print-jobs':`/api/orders/${orderId}/print-proofs`).then(j=>{setJobs(j);setError('');}).catch(e=>{const message=e?.message||'Không tải được danh sách công việc in';setError(message);toast.error(message);});
  useEffect(()=>{void load();},[orderId,staff]);
  async function action(url:string,body:unknown){setBusy(true);setError('');try{await api.post(url,body);await load();toast.success('Đã cập nhật công việc in');}catch(e){const message=(e as Error).message;setError(message);toast.error(message);}finally{setBusy(false);}}
  return <section className="my-6 space-y-4"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{staff?'Xưởng in & duyệt thiết kế':'Mẫu in & tiến độ sản xuất'}</h2><Button size="sm" variant="outline" onClick={()=>void load()}>Làm mới</Button></div>{error&&<p role="alert" className="text-red-700">{error}</p>}{!jobs&&!error&&<p>Đang tải…</p>}{jobs?.length===0&&<p className="text-sm text-muted-foreground">Chưa có công việc in.</p>}{jobs?.map(job=><Job key={job.id} job={job} staff={staff} busy={busy} action={action}/>)}</section>;
}
function Job({job,staff,busy,action}:{job:PrintJob;staff:boolean;busy:boolean;action:(url:string,body:unknown)=>Promise<void>}){
  const {user}=useAuth();
  const [side,setSide]=useState<Side>('front'),[reason,setReason]=useState(''),[ack,setAck]=useState(false);
  useEffect(()=>setAck(false),[job.proof?.id]);
  const next:Record<string,string[]>=job.workflowMode==='srs'?{APPROVED:['PRINTING'],PRINTING:['QUALITY_CHECK'],QUALITY_CHECK:['DONE','PRINTING']}:{QUEUED:['PRINTING'],PRINTING:['QUALITY_CHECK'],QUALITY_CHECK:['PACKED','QC_FAILED'],QC_FAILED:['PRINTING']};
  return <article className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{job.orderId} · {job.snapshot.color} / {job.snapshot.size}</h3><span>{PRINT_LABEL[job.status]||job.status}</span></div>
    <details className="mt-3" open={job.status==='WAITING_CUSTOMER_APPROVAL'||['WAITING_STAFF_REVIEW','AWAITING_REVIEW'].includes(job.status)}><summary className="cursor-pointer">Xem thiết kế và lịch sử</summary><div className="mt-3 grid gap-4 md:grid-cols-2"><div><div className="mb-2 flex gap-2">{(['front','back'] as Side[]).map(s=><Button key={s} size="sm" variant={s===side?'default':'outline'} onClick={()=>setSide(s)}>{s==='front'?'Trước':'Sau'}</Button>)}</div><DesignCanvas snapshot={job.proof?.snapshot||job.snapshot} side={side}/>{job.proof?.exports?.[side]&&<ExportPreview job={job} side={side} staff={staff}/>}</div><div className="space-y-3"><p className="text-sm">Mẫu minh họa đúng phiên bản {job.designRevisionId}. Vùng in {job.settings.areas[side].widthMM} × {job.settings.areas[side].heightMM} mm.</p>{job.snapshot.layers[side].filter(l=>l.dpi).map(l=><p key={l.id} className="text-sm">Ảnh: {Math.floor(l.dpi!)} DPI</p>)}<ol className="space-y-2 border-l pl-4 text-sm">{job.history.map((h,i)=><li key={i}><b>{PRINT_LABEL[h.status]||h.status}</b><p>{new Date(h.at).toLocaleString('vi-VN')}</p><p>{h.note}</p></li>)}</ol></div></div></details>
    <div className="mt-4 space-y-3">
      {staff&&job.reviewRequestedAt&&<p className={job.reviewOverdue?'text-red-700':'text-muted-foreground'}>Đã chờ {(job.reviewAgeHours||0).toFixed(1)} giờ làm việc{job.reviewOverdue?' — quá hạn duyệt 24 giờ':''}. Lịch demo: thứ Hai–Sáu, 09:00–17:00 giờ Việt Nam.</p>}
      {side==='front'&&job.proof?.exports?.left_chest&&<ExportPreview job={job} side="left_chest" staff={staff}/>}
      {(staff||['WAITING_CUSTOMER_APPROVAL','QUEUED','REVISION_REQUIRED','REJECTED'].includes(job.status))&&<input aria-label="Lý do hoặc ghi chú" className="w-full rounded border p-2" placeholder="Lý do chỉnh sửa / từ chối / QC / in lại" value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/>}
      {staff&&['WAITING_STAFF_REVIEW','AWAITING_REVIEW'].includes(job.status)&&<><p className="text-sm">Chờ duyệt từ {new Date(job.reviewRequestedAt||job.history[0]?.at).toLocaleString('vi-VN')}. Chính sách: chỉ duyệt nội dung hợp pháp, không thù ghét, không xâm phạm quyền bên thứ ba; xác nhận của khách không chứng minh bản quyền.</p><div className="flex flex-wrap gap-2">{(job.workflowMode==='srs'?['approve','reject']:['approve','revise','reject']).map(decision=><Button key={decision} disabled={busy} variant={decision==='approve'?'default':'outline'} onClick={()=>void action(`/api/admin/print-jobs/${job.id}/review`,{decision,reason,designRevisionId:job.designRevisionId,expectedHistoryLength:job.history.length})}>{decision==='approve'?(job.workflowMode==='srs'?'Duyệt thiết kế':'Duyệt → gửi mẫu cho khách'):decision==='reject'?'Từ chối':'Yêu cầu sửa'}</Button>)}</div></>}
      {staff&&next[job.status]&&<div className="flex flex-wrap gap-2">{next[job.status].map(status=><Button key={status} disabled={busy} onClick={()=>void action(`/api/admin/print-jobs/${job.id}/status`,{status,reason,expectedHistoryLength:job.history.length})}>{job.status==='QUALITY_CHECK'&&status==='PRINTING'?'QC không đạt — in lại':PRINT_LABEL[status]}</Button>)}</div>}
      {staff&&job.workflowMode==='srs'&&<Button variant="outline" disabled={busy} onClick={()=>void action(`/api/admin/orders/${job.orderId}/regular-items-ready`,{})}>Xác nhận đã chuẩn bị hàng thường trong đơn</Button>}
      {!staff&&job.freeRevisionUsed&&<p>Đã sử dụng một lần chỉnh sửa miễn phí.</p>}
      {!staff&&job.status==='WAITING_CUSTOMER_APPROVAL'&&<><label className="flex gap-2 text-sm"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>Tôi đã kiểm tra đúng mẫu, màu áo, size, vị trí; màu in thực tế có thể chênh lệch nhẹ.</label><Button disabled={busy||!ack} onClick={()=>void action(`/api/print-jobs/${job.id}/approve`,{proofId:job.proof?.id,hash:job.proof?.hash,acknowledged:ack})}>Xác nhận mẫu in</Button></>}
      {!staff&&['WAITING_CUSTOMER_APPROVAL','QUEUED'].includes(job.status)&&<Button variant="outline" disabled={busy} onClick={()=>void action(`/api/print-jobs/${job.id}/revision`,{reason})}>Yêu cầu chỉnh sửa</Button>}
      {!staff&&['REVISION_REQUIRED','REJECTED'].includes(job.status)&&<Button asChild><Link to={`/designs/${job.designId}?job=${job.id}`}>Sửa và gửi lại thiết kế</Link></Button>}
      {staff&&<p className="text-sm"><Link to={`/orders/${job.orderId}`} className="underline">Xem đơn hàng</Link> · Xác nhận COD và nhập vận đơn tại Quản trị → Đơn hàng.</p>}
      {staff&&user?.role==='admin'&&job.productionStartedAt&&job.status!=='CANCELLED'&&<Button variant="outline" disabled={busy||reason.trim().length<3} onClick={()=>{if(window.confirm('Hủy ngoại lệ toàn đơn: vật tư đã in bị loại bỏ, chỉ hoàn kho hàng chưa in; tiền đã thu chuyển sang chờ hoàn. Tiếp tục?'))void action(`/api/orders/${job.orderId}/cancel`,{reason,productionException:{inventoryDecision:'discard_consumed',refundDecision:'pending_if_paid'}});}}>Hủy ngoại lệ: loại bỏ vật tư đã in</Button>}
    </div>
  </article>;
}

function ExportPreview({job,side,staff}:{job:PrintJob;side:Side|'left_chest';staff:boolean}) {
  const [src,setSrc]=useState(''),[error,setError]=useState('');
  const url=`/api/print-jobs/${job.id}/export/${side}?proofId=${job.proof?.id}`;
  useEffect(()=>{let active=true,objectUrl='';setSrc('');setError('');fetch(url,{headers:{Authorization:`Bearer ${getToken()}`}}).then(async r=>{if(!r.ok)throw Error('Không tải được bản xuất; tải lại mẫu duyệt.');objectUrl=URL.createObjectURL(await r.blob());if(active)setSrc(objectUrl);else URL.revokeObjectURL(objectUrl);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[url]);
  async function download(){try{const r=await fetch(url+'&download=1',{headers:{Authorization:`Bearer ${getToken()}`}});if(!r.ok)throw Error('Chỉ tải được đúng bản khách đã xác nhận.');const blob=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=blob;a.download=`${job.proof?.id}-${side}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(blob),1000);}catch(e){setError((e as Error).message);}}
  const info=job.proof?.exports?.[side];
  return <div className="my-3 space-y-2 rounded border p-3"><p>Bản xuất để xác nhận: {info?.width} × {info?.height} px / {info?.dpi} DPI</p>{src?<img src={src} alt="Bản xuất in đúng phiên bản" className="max-h-80 w-full bg-stone-200 object-contain"/>:<p>Đang tải bản xuất…</p>}<p className="text-xs">PNG nền trong suốt, sRGB. Cần xưởng kiểm tra kích thước, màu, kỹ thuật và in thử vật lý trước sản xuất; chưa chứng nhận sẵn sàng in.</p>{error&&<p role="alert">{error}</p>}{staff&&<Button variant="outline" onClick={()=>void download()}>Tải PNG khách đã duyệt</Button>}</div>;
}

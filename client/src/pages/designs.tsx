import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Design } from '@/lib/custom-print';
import { Button } from '@/components/ui/button';
export default function Designs(){const [items,setItems]=useState<Design[]>(),[error,setError]=useState('');
  const load=()=>api.printSession().then(()=>api.get<Design[]>('/api/designs')).then(setItems).catch(e=>setError(e.message));useEffect(()=>{void load();},[]);
  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-10"><h1 className="text-3xl font-bold">Thiết kế của tôi</h1><Link to="/shop?tag=custom" className="underline">Chọn áo để tạo thiết kế</Link>{error&&<p role="alert">{error}</p>}{!items&&!error&&<p>Đang tải…</p>}{items?.length===0&&<p>Bạn chưa có bản nháp. Chọn một áo trơn để bắt đầu.</p>}<div className="grid gap-4 sm:grid-cols-2">{items?.map(d=><article key={d.id} className="space-y-3 rounded-xl border p-5"><h2 className="text-xl font-semibold">{d.title}</h2><p>Phiên bản {d.currentVersion} · {new Date(d.updatedAt).toLocaleString('vi-VN')}</p><div className="flex gap-3"><Button asChild><Link to={`/designs/${d.id}`}>Mở thiết kế</Link></Button><Button variant="outline" onClick={async()=>{if(!window.confirm('Xóa bản nháp chưa dùng này?'))return;try{await api.del(`/api/designs/${d.id}`);await load();}catch(e){setError((e as Error).message);}}}>Xóa</Button></div></article>)}</div></main>;
}

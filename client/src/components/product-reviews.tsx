import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/auth';
import { Button } from '@/components/ui/button';
type Review = { id: string; rating: number; title: string; comment: string; createdAt: string;photoAssetIds?:string[] };
type Purchase = { orderId: string; lineId: string; color: string; size: string; review: Review | null };
type Summary = { reviews: Review[]; count: number; average: number; distribution: { rating: number; count: number }[] };
export function ProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [selected, setSelected] = useState('');
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [sort, setSort] = useState('newest');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [photoAssetIds,setPhotoAssetIds]=useState<string[]>([]);
  useEffect(() => {
    let active = true;
    setError(''); setSummary(null); setPurchases([]); setSelected('');
    Promise.all([api.get<Summary>(`/api/products/${productId}/reviews?sort=${sort}`),
      user?.role === 'customer' ? api.get<Purchase[]>(`/api/products/${productId}/review-purchases`) : Promise.resolve([])])
      .then(([data, owned]) => { if (active) { setSummary(data); setPurchases(owned); } })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [productId, user?.id, user?.role, sort, reload]);
  const purchase = purchases.find((p) => p.lineId === selected);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!purchase) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const body = { rating, title, comment, photoAssetIds };
      if (purchase.review) await api.put(`/api/reviews/${purchase.review.id}`, body);
      else await api.post(`/api/orders/${purchase.orderId}/items/${encodeURIComponent(purchase.lineId)}/review`, body);
      setMessage('Đã lưu đánh giá của bạn.'); setReload((n) => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được đánh giá'); }
    finally { setBusy(false); }
  }
  return <section className="mt-16 border-t pt-8" aria-label="Đánh giá sản phẩm">
    <h2 className="text-2xl font-semibold">Đánh giá từ khách đã mua</h2>
    {error && <p role="alert" className="my-3 text-red-700">{error} <button onClick={() => setReload((n) => n + 1)}>Thử lại</button></p>}
    {message && <p role="status" className="my-3">{message}</p>}
    {!summary && !error && <p role="status">Đang tải đánh giá…</p>}
    {summary && <>
      <p className="my-4">{summary.count ? `${summary.average.toFixed(1)}/5 · ${summary.count} đánh giá` : 'Chưa có đánh giá. Hãy chia sẻ trải nghiệm sau khi nhận hàng.'}</p>
      <div className="flex flex-wrap gap-4 text-sm">{summary.distribution.map((d) => <span key={d.rating}>{d.rating} sao: {d.count}</span>)}</div>
      <label className="my-4 block">Sắp xếp <select className="ml-2 rounded border p-2" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Mới nhất</option><option value="rating">Số sao cao nhất</option></select></label>
      <div className="grid gap-4 md:grid-cols-2">{summary.reviews.map((r) => <article key={r.id} className="rounded border p-5">
        <p>{r.rating}/5 sao · Đã mua hàng</p><h3 className="mt-2 font-semibold">{r.title}</h3><p className="whitespace-pre-wrap break-words">{r.comment}</p><time className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</time>
        <div className="mt-3 flex flex-wrap gap-2">{r.photoAssetIds?.map(id=><a key={id} href={`/api/review-photos/${id}`} target="_blank" rel="noreferrer"><img src={`/api/review-photos/${id}`} alt="Ảnh trải nghiệm của khách" width={100} height={100} loading="lazy" className="size-24 rounded object-cover"/></a>)}</div>
      </article>)}</div>
    </>}
    {user?.role === 'customer' && <div className="mt-6 max-w-xl">
      {!purchases.length ? <p>Bạn có thể đánh giá sau khi đơn hàng được giao thành công.</p> : <form onSubmit={submit} className="space-y-4">
        <label className="block">Lần mua <select required className="mt-1 block w-full rounded border p-3" value={selected} onChange={(e) => {
          setSelected(e.target.value); const r = purchases.find((p) => p.lineId === e.target.value)?.review;
          setRating(r?.rating || 5); setTitle(r?.title || ''); setComment(r?.comment || '');
          setPhotoAssetIds(r?.photoAssetIds||[]);
        }}><option value="">Chọn sản phẩm đã nhận</option>{purchases.map((p) => <option key={p.lineId} value={p.lineId}>{p.orderId} · {p.color}/{p.size}{p.review ? ' · Sửa đánh giá' : ''}</option>)}</select></label>
        {purchase && <><label className="block">Số sao <select className="ml-2 rounded border p-2" value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} sao</option>)}</select></label>
          <label className="block">Tiêu đề<input maxLength={100} className="mt-1 block w-full rounded border p-3" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="block">Trải nghiệm của bạn<textarea required minLength={3} maxLength={2000} className="mt-1 block w-full rounded border p-3" value={comment} onChange={(e) => setComment(e.target.value)} /></label>
          <label className="block">Ảnh trải nghiệm (tùy chọn, tối đa 4 ảnh, 5MB/ảnh)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||photoAssetIds.length>=4} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);try{const body=new FormData();body.append('image',file);body.append('orderId',purchase.orderId);const result=await api.post<{id:string}>('/api/review-photos',body);setPhotoAssetIds(ids=>[...ids,result.id]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/></label><p className="text-xs">Ảnh được công khai cùng đánh giá. Đã chọn {photoAssetIds.length} ảnh. <button type="button" onClick={()=>setPhotoAssetIds([])}>Bỏ các ảnh</button></p>
          <Button disabled={busy} type="submit">{busy ? 'Đang lưu…' : 'Lưu đánh giá'}</Button></>}
      </form>}
    </div>}
  </section>;
}

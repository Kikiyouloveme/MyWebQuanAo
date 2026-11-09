import { useCallback, useEffect, useState } from "react";
import { PrintJobs } from '@/components/print-jobs';
import { PrivateImage } from '@/components/private-image';
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Truck, Package, MapPin, CreditCard, Loader2, XCircle, RefreshCcw,
  Upload, Trash2, CheckCircle2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/context/toast";
import {
  api, ApiError, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAY_STATUS_LABEL, PAY_STATUS_TONE,
  type Order, type ReturnEligibility, type ReturnRequest,
} from "@/lib/api";
import { money, cn } from "@/lib/utils";

/** Khách được tự hủy cho tới trước khi đơn bàn giao đơn vị vận chuyển */
const CANCELLABLE = ["pending", "confirmed", "processing", "ready_to_ship"];

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [eligibility, setEligibility] = useState<ReturnEligibility | null>(null);
  const [error, setError] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Order>(`/api/orders/${id}`);
      setOrder(data);
      const [mine, elig] = await Promise.all([
        api.get<ReturnRequest[]>("/api/returns/mine").catch(() => []),
        api.get<ReturnEligibility>(`/api/returns/eligibility/${id}`).catch(() => null),
      ]);
      setReturns(mine.filter((r) => r.orderId === id));
      setEligibility(elig);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tải được đơn hàng");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function cancelOrder() {
    if (cancelReason.trim().length < 3) return toast.error("Vui lòng nhập lý do hủy đơn");
    setBusy(true);
    try {
      await api.post(`/api/orders/${id}/cancel`, { reason: cancelReason.trim() });
      toast.success("Đã hủy đơn hàng. Sản phẩm đã được trả về kho.");
      setCancelOpen(false);
      setCancelReason("");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không hủy được đơn hàng");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <h1 className="font-display text-2xl font-bold uppercase">{error}</h1>
        <Button className="mt-6" asChild><Link to="/orders">Đơn hàng của tôi</Link></Button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10" aria-busy="true">
        <div className="h-10 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const canCancel = CANCELLABLE.includes(order.status) && !order.items.some(i=>i.stockConsumed);
  const activeReturn = returns.find((r) => r.status !== "rejected");

  return (
    <div className="mx-auto max-w-4xl px-5 pb-20">
      <nav aria-label="Đường dẫn" className="py-8 text-xs uppercase tracking-widest text-muted-foreground">
        <Link to="/account" className="hover:text-brand">Tài khoản</Link> /{" "}
        <Link to="/orders" className="hover:text-brand">Đơn hàng</Link> / {order.id}
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight">Đơn {order.id}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Đặt lúc {new Date(order.createdAt).toLocaleString("vi-VN")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status] || order.status}</Badge>
          <Badge variant={PAY_STATUS_TONE[order.payStatus]}>{PAY_STATUS_LABEL[order.payStatus]}</Badge>
        </div>
      </header>
      {order.demo&&<p className="mt-3 rounded border p-3 text-sm">Dữ liệu minh họa lớp học. Không có giao dịch thu tiền hoặc vận đơn thật.</p>}

      {/* Hành động */}
      <div className="mt-6 flex flex-wrap gap-2">
        {order.payStatus !== "paid" && order.payMethod === "vnpay" && order.status !== "cancelled" && (
          <Button size="sm" variant="brand" asChild><Link to={`/payment/${order.id}`}>Thanh toán ngay</Link></Button>
        )}
        {canCancel && (
          <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}><XCircle /> Hủy đơn hàng</Button>
        )}
        {eligibility?.eligible && !activeReturn && (
          <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)}>
            <RefreshCcw /> Đổi / trả hàng
          </Button>
        )}
      </div>

      {order.status === "delivered" && eligibility && !eligibility.eligible && !activeReturn && (
        <p className="mt-3 text-sm text-muted-foreground">{eligibility.reason}</p>
      )}
      {order.status === "delivered" && eligibility?.eligible && !activeReturn && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-4" /> Còn {eligibility.daysLeft} ngày để yêu cầu đổi/trả
        </p>
      )}

      {order.items.some(i=>i.itemType==='custom') && <PrintJobs orderId={order.id}/>}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {/* Sản phẩm */}
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-wide">Sản phẩm</h2>
            <ul className="space-y-4">
              {order.items.map((item) => (
                <li key={item.lineId || item.variantId} className="flex gap-3">
                  <PrivateImage src={item.img} alt="" width={56} height={72} className="h-18 w-14 shrink-0 rounded border border-border object-cover" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/product/${item.productId}`} className="font-medium hover:text-brand">{item.title}</Link>
                    <p className="text-sm text-muted-foreground">{item.color} / {item.size}</p>
                    <p className="text-sm text-muted-foreground">{money(item.price)} × {item.qty}</p>
                    {item.priceBreakdown&&<p className="text-xs">Áo {money(item.priceBreakdown.basePrice)} + in trước {money(item.priceBreakdown.frontFee)} + in sau {money(item.priceBreakdown.backFee)}</p>}
                  </div>
                  <span className="font-display font-semibold">{money(item.price * item.qty)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Timeline */}
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-wide">Lịch sử đơn hàng</h2>
            <ol className="relative space-y-5 border-l border-border pl-6">
              {[...order.history].reverse().map((entry, index) => (
                <li key={index} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[26px] top-1 grid size-3.5 place-items-center rounded-full border-2 border-background",
                      index === 0 ? "bg-brand" : "bg-border"
                    )}
                  />
                  <p className="text-sm font-medium">{ORDER_STATUS_LABEL[entry.status] || entry.status}</p>
                  {entry.note && <p className="mt-0.5 text-sm text-muted-foreground">{entry.note}</p>}
                  <time className="mt-0.5 block text-xs text-muted-foreground">
                    {new Date(entry.at).toLocaleString("vi-VN")}
                  </time>
                </li>
              ))}
            </ol>
          </section>

          {/* Yêu cầu đổi/trả */}
          {returns.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-wide">Yêu cầu đổi / trả</h2>
              {returns.map((r) => (
                <div key={r.id} className="border-t border-border pt-4 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="font-display">{r.id}</b>
                    <Badge variant={r.status === "rejected" ? "destructive" : r.status === "completed" ? "success" : "warning"}>
                      {{ pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Bị từ chối", receiving: "Đang nhận hàng", received: "Đã nhận hàng", completed: "Hoàn tất" }[r.status]}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {r.type === "exchange" ? "Đổi hàng" : "Trả hàng"} · {r.reasonLabel}
                  </p>
                  <p className="mt-1 text-sm">{r.description}</p>
                  {r.adminNote && <p className="mt-2 text-sm"><b>Phản hồi:</b> {r.adminNote}</p>}
                  {r.status === "approved" && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Phí vận chuyển do <b className="text-foreground">{r.shippingResponsibility === "shop" ? "cửa hàng" : "bạn"}</b> chịu.
                    </p>
                  )}
                  {r.photos.length > 0 && (
                    <div className="mt-3 flex gap-2">
                      {r.photos.map((src) => (
                        <PrivateImage key={src} src={src} alt="Ảnh minh chứng" width={64} height={64} className="size-16 rounded border border-border object-cover" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>

        {/* Cột phải */}
        <aside className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide">
              <MapPin className="size-4" /> Địa chỉ giao hàng
            </h2>
            <p className="text-sm font-medium">{order.shippingAddress.fullName}</p>
            <p className="text-sm text-muted-foreground">{order.shippingAddress.phone}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {[order.shippingAddress.line1, order.shippingAddress.ward, order.shippingAddress.district, order.shippingAddress.province]
                .filter(Boolean).join(", ")}
            </p>
            {order.shippingAddress.note && (
              <p className="mt-2 text-xs text-muted-foreground">Ghi chú: {order.shippingAddress.note}</p>
            )}
          </section>

          {(order.shipping?.carrier || order.shipping?.trackingNumber) && (
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide">
                <Truck className="size-4" /> Vận chuyển
              </h2>
              {order.shipping.carrier && <p className="text-sm">Đơn vị: <b>{order.shipping.carrier}</b></p>}
              <p className="text-xs text-muted-foreground">Theo dõi thủ công do nhân viên cập nhật.</p>
              {order.shipping.estimatedDeliveryAt&&<p className="text-sm">Dự kiến giao: {new Date(order.shipping.estimatedDeliveryAt).toLocaleDateString('vi-VN')}</p>}
              {order.shipping.customerNote&&<p className="text-sm">{order.shipping.customerNote}</p>}
              {order.shipping.trackingNumber && (
                <p className="mt-1 text-sm">Mã vận đơn: <b className="font-mono">{order.shipping.trackingNumber}</b></p>
              )}
              {order.shipping.handedOverAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Bàn giao: {new Date(order.shipping.handedOverAt).toLocaleString("vi-VN")}
                </p>
              )}
              {order.shipping.deliveredAt && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700">
                  <CheckCircle2 className="size-3.5" /> Giao thành công: {new Date(order.shipping.deliveredAt).toLocaleString("vi-VN")}
                </p>
              )}
            </section>
          )}

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide">
              <CreditCard className="size-4" /> Thanh toán
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Tạm tính</span><span>{money(order.subtotal)}</span></div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Giảm giá{order.voucher ? ` (${order.voucher.code})` : ""}</span>
                  <span>−{money(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Phí vận chuyển</span>
                <span>{order.shippingFee === 0 ? "Miễn phí" : money(order.shippingFee)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-display text-base font-bold">
                <span>Tổng cộng</span><span>{money(order.total)}</span>
              </div>
              <p className="pt-2 text-xs text-muted-foreground">
                Phương thức: {order.payMethod === "cod" ? "Thanh toán khi nhận hàng" : "VNPay"}
                {order.payment?.transactionNo && <><br />Mã giao dịch: {order.payment.transactionNo}</>}
              </p>
            </div>
          </section>

          {order.refund && (
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide">Hoàn tiền</h2>
              <p className="text-sm">
                {order.refund.status === "refunded"
                  ? <>Đã hoàn <b>{money(order.refund.amount)}</b> qua {order.refund.method === "vnpay" ? "VNPay" : "chuyển khoản"}.</>
                  : <>Đang xử lý hoàn <b>{money(order.refund.amount)}</b>. Cửa hàng sẽ liên hệ khi hoàn tất.</>}
                {(order.refundedTotal ?? 0) > 0 && order.refundedTotal !== order.total && (
                  <> Tổng đã hoàn: <b>{money(order.refundedTotal!)}</b> / {money(order.total)}.</>
                )}
              </p>
              {order.refund.refundedAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(order.refund.refundedAt).toLocaleString("vi-VN")}
                </p>
              )}
            </section>
          )}

          {order.cancel && (
            <section className="rounded-lg border border-destructive/30 bg-red-50 p-5">
              <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-destructive">Đơn đã hủy</h2>
              <p className="text-sm text-red-900">Lý do: {order.cancel.reason}</p>
              <p className="mt-1 text-xs text-red-800">{new Date(order.cancel.at).toLocaleString("vi-VN")}</p>
            </section>
          )}
        </aside>
      </div>

      {/* Hủy đơn */}
      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Hủy đơn hàng"
        description="Vui lòng cho chúng tôi biết lý do để cải thiện dịch vụ."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCancelOpen(false)} disabled={busy}>Không hủy nữa</Button>
            <Button variant="destructive" size="sm" onClick={cancelOrder} disabled={busy || cancelReason.trim().length < 3}>
              {busy ? <><Loader2 className="animate-spin" /> Đang hủy…</> : "Xác nhận hủy đơn"}
            </Button>
          </>
        }
      >
        <Label htmlFor="cancel-reason">Lý do hủy đơn *</Label>
        <Input
          id="cancel-reason"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Ví dụ: Đổi ý, đặt nhầm size…"
          className="mt-2"
          autoFocus
        />
        {order.payStatus === "paid" && (
          <p className="mt-3 rounded bg-secondary px-3 py-2 text-sm text-muted-foreground">
            Đơn hàng đã thanh toán. Chúng tôi sẽ hoàn tiền sau khi xác nhận hủy.
          </p>
        )}
      </Dialog>

      {/* Yêu cầu đổi/trả */}
      {returnOpen && eligibility && (
        <ReturnDialog
          order={order}
          eligibility={eligibility}
          onClose={() => setReturnOpen(false)}
          onDone={() => { setReturnOpen(false); load(); }}
        />
      )}
    </div>
  );
}

/* ==================== HỘP THOẠI YÊU CẦU ĐỔI / TRẢ ==================== */

function ReturnDialog({
  order, eligibility, onClose, onDone,
}: { order: Order; eligibility: ReturnEligibility; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<"return" | "exchange">("return");
  const [reason, setReason] = useState(eligibility.reasons[0]?.value ?? "");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>(
    Object.fromEntries(order.items.map((i) => [i.lineId || i.variantId, 0]))
  );
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const chosenItems = Object.entries(selected).filter(([, qty]) => qty > 0);
  const needsBank = type === "return" && order.payMethod === "cod";

  function pickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const tooBig = files.find((f) => f.size > 5 * 1024 * 1024);
    if (tooBig) return toast.error(`Ảnh "${tooBig.name}" vượt quá 5MB`);
    setPhotos((prev) => [...prev, ...files].slice(0, 5));
    e.target.value = "";
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chosenItems.length) return toast.error("Vui lòng chọn ít nhất một sản phẩm");
    if (description.trim().length < 10) return toast.error("Mô tả cần ít nhất 10 ký tự");
    if (!photos.length) return toast.error("Vui lòng đính kèm ít nhất một ảnh minh chứng");

    const form = new FormData(e.currentTarget);
    const body = new FormData();
    body.append("orderId", order.id);
    body.append("type", type);
    body.append("reason", reason);
    body.append("description", description.trim());
    body.append("items", JSON.stringify(chosenItems.map(([key, qty]) => { const item=order.items.find(i=>(i.lineId||i.variantId)===key)!;return {lineId:item.lineId,variantId:item.variantId,qty}; })));
    photos.forEach((p) => body.append("photos", p));

    if (needsBank) {
      body.append("bankAccountHolder", String(form.get("bankAccountHolder") || ""));
      body.append("bankAccountNumber", String(form.get("bankAccountNumber") || ""));
      body.append("bankName", String(form.get("bankName") || ""));
    }

    setBusy(true);
    try {
      await api.post("/api/returns", body);
      toast.success("Đã gửi yêu cầu. Chúng tôi sẽ phản hồi trong 1–2 ngày làm việc.");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không gửi được yêu cầu");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Yêu cầu đổi / trả hàng" size="lg">
      <form onSubmit={submit} className="space-y-5" noValidate>
        {/* Loại yêu cầu */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Bạn muốn</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              { value: "return", label: "Trả hàng & hoàn tiền" },
              { value: "exchange", label: "Đổi sang sản phẩm khác" },
            ] as const).map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg border p-3.5 text-sm transition-colors",
                  type === option.value ? "border-brand bg-brand/5" : "border-border"
                )}
              >
                <input
                  type="radio" name="type" className="size-4 accent-[var(--brand)]"
                  checked={type === option.value} onChange={() => setType(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Chọn sản phẩm */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Sản phẩm muốn đổi/trả *</legend>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.lineId || item.variantId} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <PrivateImage src={item.img} alt="" width={40} height={52} className="h-13 w-10 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.color} / {item.size} · đã mua {item.qty}</p>
                </div>
                <select
                  aria-label={`Số lượng đổi/trả cho ${item.title}`}
                  value={selected[item.lineId || item.variantId] ?? 0}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [item.lineId || item.variantId]: Number(e.target.value) }))}
                  className="h-10 shrink-0 rounded border border-input bg-background px-2 text-sm"
                >
                  {Array.from({ length: item.qty + 1 }, (_, n) => (
                    <option key={n} value={n}>{n === 0 ? "Không" : n}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </fieldset>

        {/* Lý do */}
        <div>
          <Label htmlFor="return-reason">Lý do *</Label>
          <select
            id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)}
            className="mt-2 h-11 w-full rounded border border-input bg-background px-3 text-sm"
          >
            {eligibility.reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        <div>
          <Label htmlFor="return-desc">Mô tả chi tiết *</Label>
          <textarea
            id="return-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả tình trạng sản phẩm, vấn đề gặp phải…"
            className="mt-2 w-full rounded border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">{description.trim().length}/10 ký tự tối thiểu</p>
        </div>

        {/* Ảnh minh chứng */}
        <div>
          <Label htmlFor="return-photos">Ảnh minh chứng * (tối đa 5 ảnh, mỗi ảnh ≤ 5MB)</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map((file, index) => (
              <div key={index} className="relative">
                <img src={URL.createObjectURL(file)} alt="" className="size-20 rounded border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                  aria-label="Xóa ảnh"
                  className="absolute -right-1.5 -top-1.5 grid size-6 cursor-pointer place-items-center rounded-full bg-destructive text-white"
                ><Trash2 className="size-3" /></button>
              </div>
            ))}
            {photos.length < 5 && (
              <label className="grid size-20 cursor-pointer place-items-center rounded border border-dashed border-border text-muted-foreground hover:border-primary">
                <Upload className="size-5" />
                <input id="return-photos" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={pickPhotos} className="sr-only" />
              </label>
            )}
          </div>
        </div>

        {/* Thông tin nhận hoàn tiền cho COD */}
        {needsBank && (
          <fieldset className="rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-medium">Thông tin nhận hoàn tiền</legend>
            <p className="mb-3 text-xs text-muted-foreground">
              Đơn thanh toán khi nhận hàng sẽ được hoàn qua chuyển khoản. Thông tin này chỉ nhân viên xử lý hoàn tiền xem được.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="bankAccountHolder">Chủ tài khoản</Label>
                <Input id="bankAccountHolder" name="bankAccountHolder" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="bankAccountNumber">Số tài khoản</Label>
                <Input id="bankAccountNumber" name="bankAccountNumber" inputMode="numeric" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="bankName">Ngân hàng</Label>
                <Input id="bankName" name="bankName" className="mt-2" />
              </div>
            </div>
          </fieldset>
        )}

        <p className="rounded bg-secondary px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Điều kiện: sản phẩm còn nguyên tem mác, chưa qua sử dụng và trong vòng {eligibility.windowDays} ngày kể từ khi nhận hàng.
          Yêu cầu sẽ được cửa hàng xem xét trước khi chấp thuận.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>Hủy bỏ</Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? <><Loader2 className="animate-spin" /> Đang gửi…</> : "Gửi yêu cầu"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Package, ShoppingCart, Users, BarChart3, Plus, Pencil, Trash2, Mail,
  Ticket, RefreshCcw, Loader2, Search, AlertTriangle, Truck, Banknote, X, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { useAuth } from "@/context/auth";
import { useToast } from "@/context/toast";
import {
  api, ApiError, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAY_STATUS_LABEL, PAY_STATUS_TONE,
  type Product, type Variant, type Order, type Stats, type User, type Role,
  type MailRecord, type Voucher, type ReturnRequest, type ExchangeOptions,
} from "@/lib/api";
import { money, cn } from "@/lib/utils";

type View = "dash" | "products" | "orders" | "returns" | "vouchers" | "messages" | "users" | "emails";

const ORDER_STATUSES = [
  "pending", "confirmed", "processing", "ready_to_ship", "shipped", "delivered",
  "return_requested", "return_approved", "return_rejected", "returning", "returned",
  "refund_pending", "refunded",
];

export default function Admin() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [view, setView] = useState<View>("dash");

  const NAVS: { id: View; label: string; icon: typeof Package; adminOnly?: boolean }[] = [
    { id: "dash", label: "Tổng quan", icon: BarChart3 },
    { id: "products", label: "Sản phẩm", icon: Package },
    { id: "orders", label: "Đơn hàng", icon: ShoppingCart },
    { id: "returns", label: "Đổi/Trả", icon: RefreshCcw },
    { id: "vouchers", label: "Mã giảm giá", icon: Ticket },
    { id: "messages", label: "Tin nhắn", icon: MessageSquare },
    { id: "users", label: "Khách hàng", icon: Users, adminOnly: true },
    { id: "emails", label: "Email", icon: Mail },
  ];

  return (
    <div className="mx-auto max-w-7xl px-5 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3 py-10">
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">Quản trị<span className="text-brand">.</span></h1>
        <Badge variant="brand">{isAdmin ? "Admin — toàn quyền" : "Nhân viên — sản phẩm & đơn hàng"}</Badge>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[190px_1fr]">
        <nav className="-mx-5 flex overflow-x-auto px-5 lg:mx-0 lg:sticky lg:top-24 lg:flex-col lg:rounded-lg lg:border lg:border-border lg:bg-card lg:px-0" aria-label="Điều hướng quản trị">
          {NAVS.filter((n) => !n.adminOnly || isAdmin).map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              aria-current={view === n.id ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap px-4 py-3 font-display text-[13px] font-semibold uppercase tracking-wide transition-colors",
                view === n.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
              )}
            >
              <n.icon className="size-4" /> {n.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {view === "dash" && <DashView />}
          {view === "products" && <ProductsView />}
          {view === "orders" && <OrdersView />}
          {view === "returns" && <ReturnsView />}
          {view === "vouchers" && <VouchersView />}
          {view === "messages" && <MessagesView />}
          {view === "users" && isAdmin && <UsersView currentId={user!.id} />}
          {view === "emails" && <EmailsView />}
        </div>
      </div>
    </div>
  );
}

/* ==================== TỔNG QUAN ==================== */

function DashView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Stats>("/api/admin/stats").then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!stats) return <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div>;

  const cards = [
    { label: "Doanh thu", value: money(stats.revenue), hint: `Hôm nay ${money(stats.revenueToday)}` },
    { label: "Đơn hàng", value: String(stats.orders), hint: `${stats.pendingOrders} đơn chờ xử lý` },
    { label: "Sản phẩm", value: String(stats.activeProducts), hint: `${stats.lowStockCount} sắp hết hàng` },
    { label: "Khách hàng", value: String(stats.users), hint: `${stats.verifiedUsers} đã xác minh email` },
  ];

  const maxRevenue = Math.max(...stats.daily.map((d) => d.revenue), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</p>
            <p className="mt-1.5 font-display text-2xl font-bold">{c.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Doanh thu chỉ tính đơn đã thanh toán và chưa bị hủy/hoàn tiền.
        {stats.refunded > 0 && ` Đã hoàn ${money(stats.refunded)}.`}
      </p>

      {/* Doanh thu 30 ngày */}
      {stats.daily.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide">Doanh thu 30 ngày gần nhất</h2>
          <div className="mt-4 flex h-32 items-end gap-1" role="img" aria-label="Biểu đồ doanh thu theo ngày">
            {stats.daily.map((d) => (
              <div
                key={d.date}
                className="flex-1 rounded-t bg-brand/70 transition-colors hover:bg-brand"
                style={{ height: `${Math.max(4, (d.revenue / maxRevenue) * 100)}%` }}
                title={`${new Date(d.date).toLocaleDateString("vi-VN")}: ${money(d.revenue)}`}
              />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {stats.topProducts.length > 0 && (
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide">Bán chạy nhất</h2>
            <ul className="space-y-2.5">
              {stats.topProducts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link to={`/product/${p.id}`} className="truncate hover:text-brand">{p.title}</Link>
                  <span className="shrink-0 text-muted-foreground">{p.qty} · {money(p.revenue)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {stats.lowStock.length > 0 && (
          <section className="rounded-lg border border-amber-500/40 bg-amber-50 p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-amber-900">
              <AlertTriangle className="size-4" /> Sắp hết hàng
            </h2>
            <ul className="space-y-2 text-sm text-amber-900">
              {stats.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{p.title}</span>
                  <b className="shrink-0">còn {p.totalStock}</b>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide">Trạng thái tích hợp</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded border border-border p-3.5">
            <span className="text-sm">Cổng thanh toán VNPay</span>
            <Badge variant={stats.vnpayMode === "live" ? "success" : "warning"}>
              {stats.vnpayMode === "live" ? "Đang chạy thật" : "Môi trường thử nghiệm"}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3 rounded border border-border p-3.5">
            <span className="text-sm">Gửi email</span>
            <Badge variant={stats.mailMode === "smtp" ? "success" : "warning"}>
              {stats.mailMode === "smtp" ? "SMTP" : `Hộp thư nội bộ (${stats.emails})`}
            </Badge>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Cấu hình <code className="rounded bg-secondary px-1.5 py-0.5">VNP_TMN_CODE</code>,{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5">VNP_HASH_SECRET</code> và{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5">SMTP_HOST</code> trong file <code className="rounded bg-secondary px-1.5 py-0.5">.env</code> để chuyển sang chế độ thật.
        </p>
      </section>
    </div>
  );
}

/* ==================== SẢN PHẨM ==================== */

const CATEGORIES = [
  { value: "tops", label: "Áo" },
  { value: "bottoms", label: "Quần" },
  { value: "outerwear", label: "Khoác" },
  { value: "accessories", label: "Phụ kiện" },
];

type VariantDraft = Omit<Variant, "id"> & { id?: string };

function ProductsView() {
  const toast = useToast();
  const [list, setList] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api.get<Product[]>("/api/products/admin/all").then(setList).catch((e) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await api.del<{ archived: boolean; message?: string }>(`/api/products/${deleting.id}`);
      toast.success(res.archived ? (res.message ?? "Đã ẩn sản phẩm") : "Đã xóa sản phẩm");
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không xóa được");
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold uppercase">Sản phẩm</h2>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus /> Thêm sản phẩm</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary text-left font-display text-[11px] uppercase tracking-wider text-primary-foreground">
              <th className="px-3.5 py-2.5">Ảnh</th>
              <th className="px-3.5 py-2.5">Tên</th>
              <th className="px-3.5 py-2.5">Giá</th>
              <th className="px-3.5 py-2.5">Phiên bản</th>
              <th className="px-3.5 py-2.5">Tồn kho</th>
              <th className="px-3.5 py-2.5">Trạng thái</th>
              <th className="px-3.5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {(list ?? []).map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-3.5 py-2"><img src={p.img} alt="" width={40} height={52} className="h-13 w-10 rounded border border-border object-cover" /></td>
                <td className="px-3.5 py-2 font-medium">{p.title}</td>
                <td className="px-3.5 py-2 whitespace-nowrap">{money(p.price)}</td>
                <td className="px-3.5 py-2">{p.variants.length}</td>
                <td className={cn("px-3.5 py-2 font-bold", p.totalStock <= 5 && "text-destructive")}>{p.totalStock}</td>
                <td className="px-3.5 py-2">
                  <Badge variant={p.active === false ? "secondary" : "success"}>{p.active === false ? "Đã ẩn" : "Đang bán"}</Badge>
                </td>
                <td className="px-3.5 py-2">
                  <span className="flex gap-1">
                    <button onClick={() => { setEditing(p); setDialogOpen(true); }} aria-label={`Sửa ${p.title}`} className="grid size-9 cursor-pointer place-items-center rounded hover:bg-secondary hover:text-brand"><Pencil className="size-4" /></button>
                    <button onClick={() => setDeleting(p)} aria-label={`Xóa ${p.title}`} className="grid size-9 cursor-pointer place-items-center rounded hover:bg-secondary hover:text-destructive"><Trash2 className="size-4" /></button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list && <p className="p-5 text-muted-foreground">Đang tải…</p>}
        {list?.length === 0 && <p className="p-5 text-muted-foreground">Chưa có sản phẩm nào.</p>}
      </div>

      {dialogOpen && (
        <ProductDialog
          product={editing}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
          onSaved={() => { setDialogOpen(false); setEditing(null); reload(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        tone="destructive"
        title="Xóa sản phẩm"
        description={`Xóa "${deleting?.title}"? Nếu sản phẩm đã có trong đơn hàng, hệ thống sẽ ẩn thay vì xóa để giữ dữ liệu đơn cũ.`}
        confirmLabel="Xóa sản phẩm"
      />
    </>
  );
}

function ProductDialog({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [variants, setVariants] = useState<VariantDraft[]>(
    product?.variants.length
      ? product.variants.map((v) => ({ ...v }))
      : [{ color: "", size: "", sku: "", stock: 0, active: true }]
  );
  const [imgUrl, setImgUrl] = useState(product?.img ?? "");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const totalStock = useMemo(() => variants.reduce((s, v) => s + (Number(v.stock) || 0), 0), [variants]);

  function updateVariant(index: number, patch: Partial<VariantDraft>) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const res = await api.upload(file);
      setImgUrl(res.url);
      toast.success("Đã tải ảnh lên");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Tải ảnh thất bại");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const get = (k: string) => String(form.get(k) || "").trim();

    const cleaned = variants.filter((v) => v.color.trim() && v.size.trim());
    if (!cleaned.length) return setError("Sản phẩm phải có ít nhất một phiên bản với đủ màu và size.");

    const body = {
      title: get("title"),
      price: Number(get("price")),
      compareAtPrice: get("compareAtPrice") ? Number(get("compareAtPrice")) : null,
      cat: get("cat"),
      badge: get("badge") || null,
      desc: get("desc"),
      tags: get("tags").split(",").map((t) => t.trim()).filter(Boolean),
      active: form.get("active") === "on",
      img: imgUrl || undefined,
      img2: imgUrl || undefined,
      variants: cleaned.map((v) => ({
        id: v.id, color: v.color.trim(), size: v.size.trim(),
        sku: v.sku?.trim() || undefined, stock: Number(v.stock) || 0, active: v.active !== false,
      })),
    };

    setBusy(true);
    try {
      if (product) await api.put(`/api/products/${product.id}`, body);
      else await api.post("/api/products", body);
      toast.success(product ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không lưu được sản phẩm");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={product ? "Sửa sản phẩm" : "Thêm sản phẩm"} size="lg">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="p-title">Tên sản phẩm *</Label>
            <Input id="p-title" name="title" required defaultValue={product?.title} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="p-price">Giá bán (₫) *</Label>
            <Input id="p-price" name="price" type="number" min="1000" required defaultValue={product?.price} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="p-compare">Giá gốc (khi giảm giá)</Label>
            <Input id="p-compare" name="compareAtPrice" type="number" min="1000" defaultValue={product?.compareAtPrice ?? ""} placeholder="Để trống nếu không giảm giá" className="mt-2" />
          </div>
          <div>
            <Label htmlFor="p-cat">Danh mục</Label>
            <select id="p-cat" name="cat" defaultValue={product?.cat ?? "tops"} className="mt-2 h-10 w-full cursor-pointer rounded border border-input bg-card px-3 text-sm">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="p-badge">Nhãn hiển thị</Label>
            <Input id="p-badge" name="badge" defaultValue={product?.badge ?? ""} placeholder="Mới, Bán chạy…" className="mt-2" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="p-tags">Nhãn lọc (phân cách bằng dấu phẩy)</Label>
            <Input id="p-tags" name="tags" defaultValue={product?.tags?.join(", ")} placeholder="womens, summer, sale" className="mt-2" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="p-img">Ảnh sản phẩm</Label>
            <div className="mt-2 flex items-center gap-3">
              {imgUrl && <img src={imgUrl} alt="" width={48} height={62} className="h-16 w-12 rounded border border-border object-cover" />}
              <Input id="p-img" value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="/assets/img/p/..." className="flex-1" />
              <label className="shrink-0">
                <span className={cn("inline-flex h-10 cursor-pointer items-center rounded border border-input px-3 text-sm", uploading && "opacity-60")}>
                  {uploading ? "Đang tải…" : "Tải ảnh"}
                </span>
                <input
                  type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
                />
              </label>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="p-desc">Mô tả</Label>
            <textarea id="p-desc" name="desc" rows={3} defaultValue={product?.desc} className="mt-2 w-full rounded border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring" />
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm sm:col-span-2">
            <input type="checkbox" name="active" defaultChecked={product?.active !== false} className="size-4 accent-[var(--brand)]" />
            Đang bán (bỏ chọn để ẩn khỏi cửa hàng)
          </label>
        </div>

        {/* Biến thể */}
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
            Phiên bản (màu + size)
            <span className="font-normal text-muted-foreground">· tổng tồn kho {totalStock}</span>
          </legend>

          <div className="mt-3 space-y-2">
            {variants.map((variant, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_90px_auto] items-end gap-2">
                <div>
                  {index === 0 && <Label className="mb-1.5 text-xs">Màu</Label>}
                  <Input value={variant.color} onChange={(e) => updateVariant(index, { color: e.target.value })} placeholder="Đen" aria-label={`Màu phiên bản ${index + 1}`} />
                </div>
                <div>
                  {index === 0 && <Label className="mb-1.5 text-xs">Size</Label>}
                  <Input value={variant.size} onChange={(e) => updateVariant(index, { size: e.target.value })} placeholder="M" aria-label={`Size phiên bản ${index + 1}`} />
                </div>
                <div>
                  {index === 0 && <Label className="mb-1.5 text-xs">Tồn kho</Label>}
                  <Input type="number" min="0" value={variant.stock} onChange={(e) => updateVariant(index, { stock: Number(e.target.value) })} aria-label={`Tồn kho phiên bản ${index + 1}`} />
                </div>
                <button
                  type="button"
                  onClick={() => setVariants((prev) => prev.filter((_, i) => i !== index))}
                  disabled={variants.length === 1}
                  aria-label={`Xóa phiên bản ${index + 1}`}
                  className="grid size-10 cursor-pointer place-items-center rounded hover:bg-secondary hover:text-destructive disabled:opacity-30"
                ><X className="size-4" /></button>
              </div>
            ))}
          </div>

          <Button
            type="button" size="sm" variant="outline" className="mt-3"
            onClick={() => setVariants((prev) => [...prev, { color: prev[prev.length - 1]?.color ?? "", size: "", sku: "", stock: 0, active: true }])}
          ><Plus /> Thêm phiên bản</Button>
        </fieldset>

        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>Hủy</Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? <><Loader2 className="animate-spin" /> Đang lưu…</> : "Lưu sản phẩm"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ==================== ĐƠN HÀNG ==================== */

function OrdersView() {
  const toast = useToast();
  const [list, setList] = useState<Order[] | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<Order | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (query) params.set("q", query);
    api.get<Order[]>(`/api/admin/orders?${params}`).then(setList).catch((e) => setError(e.message));
  }, [statusFilter, query]);

  useEffect(() => {
    const timer = setTimeout(reload, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [reload, query]);

  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <>
      <h2 className="mb-4 font-display text-lg font-bold uppercase">Đơn hàng</h2>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm mã đơn, tên, SĐT, mã vận đơn…" className="h-11 pl-8" aria-label="Tìm đơn hàng" />
        </div>
        <select
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Lọc theo trạng thái"
          className="h-11 cursor-pointer rounded border border-input bg-card px-3 text-sm"
        >
          <option value="">Tất cả trạng thái</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary text-left font-display text-[11px] uppercase tracking-wider text-primary-foreground">
              <th className="px-3.5 py-2.5">Mã đơn</th>
              <th className="px-3.5 py-2.5">Khách hàng</th>
              <th className="px-3.5 py-2.5">Tổng tiền</th>
              <th className="px-3.5 py-2.5">Thanh toán</th>
              <th className="px-3.5 py-2.5">Trạng thái</th>
              <th className="px-3.5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {(list ?? []).map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="px-3.5 py-2.5">
                  <b className="font-display">{o.id}</b>
                  <br /><small className="text-muted-foreground">{new Date(o.createdAt).toLocaleString("vi-VN")}</small>
                </td>
                <td className="px-3.5 py-2.5">
                  {o.shippingAddress?.fullName}
                  <br /><small className="text-muted-foreground">{o.shippingAddress?.phone}</small>
                </td>
                <td className="px-3.5 py-2.5 whitespace-nowrap">
                  <b>{money(o.total)}</b>
                  <br /><small className="text-muted-foreground">{o.payMethod === "cod" ? "COD" : "VNPay"}</small>
                </td>
                <td className="px-3.5 py-2.5"><Badge variant={PAY_STATUS_TONE[o.payStatus]}>{PAY_STATUS_LABEL[o.payStatus]}</Badge></td>
                <td className="px-3.5 py-2.5"><Badge variant={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge></td>
                <td className="px-3.5 py-2.5">
                  <Button size="sm" variant="ghost" onClick={() => setDetail(o)}>Chi tiết</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list && <p className="p-5 text-muted-foreground">Đang tải…</p>}
        {list?.length === 0 && <p className="p-5 text-muted-foreground">Không có đơn hàng phù hợp.</p>}
      </div>

      {detail && (
        <AdminOrderDialog
          orderId={detail.id}
          onClose={() => setDetail(null)}
          onChanged={() => { reload(); toast.success("Đã cập nhật đơn hàng"); }}
        />
      )}
    </>
  );
}

function AdminOrderDialog({ orderId, onClose, onChanged }: { orderId: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);

  const load = useCallback(() => {
    api.get<Order>(`/api/admin/orders/${orderId}`).then(setOrder).catch(() => setOrder(null));
  }, [orderId]);
  useEffect(load, [load]);

  async function updateStatus(status: string) {
    setBusy(true);
    try {
      await api.put(`/api/admin/orders/${orderId}/status`, { status });
      load(); onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không cập nhật được");
    } finally { setBusy(false); }
  }

  async function saveShipping(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.put(`/api/admin/orders/${orderId}/shipping`, {
        carrier: String(form.get("carrier") || ""),
        trackingNumber: String(form.get("trackingNumber") || ""),
      });
      load(); onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không lưu được");
    } finally { setBusy(false); }
  }

  async function cancelOrder() {
    setBusy(true);
    try {
      await api.post(`/api/orders/${orderId}/cancel`, { reason: cancelReason });
      setCancelOpen(false); setCancelReason("");
      load(); onChanged();
      toast.success("Đã hủy đơn và hoàn kho");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không hủy được đơn");
    } finally { setBusy(false); }
  }

  async function refund(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.post(`/api/admin/orders/${orderId}/refund`, {
        amount: Number(form.get("amount")),
        reference: String(form.get("reference") || ""),
        note: String(form.get("note") || ""),
      });
      setRefundOpen(false);
      load(); onChanged();
      toast.success("Đã ghi nhận hoàn tiền");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không ghi nhận được hoàn tiền");
    } finally { setBusy(false); }
  }

  if (!order) return <Dialog open onClose={onClose} title="Đang tải…"><Loader2 className="mx-auto size-6 animate-spin" /></Dialog>;

  const canCancel = !["cancelled", "delivered", "returned", "refunded"].includes(order.status);

  return (
    <>
      <Dialog open onClose={onClose} title={`Đơn ${order.id}`} size="lg">
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge variant={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
            <Badge variant={PAY_STATUS_TONE[order.payStatus]}>{PAY_STATUS_LABEL[order.payStatus]}</Badge>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Sản phẩm</h3>
            <ul className="space-y-2 text-sm">
              {order.items.map((item) => (
                <li key={item.variantId} className="flex justify-between gap-3">
                  <span>{item.title} <span className="text-muted-foreground">({item.color}/{item.size}) × {item.qty}</span></span>
                  <span className="shrink-0">{money(item.price * item.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between"><span>Tạm tính</span><span>{money(order.subtotal)}</span></div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Giảm giá {order.voucher?.code}</span><span>−{money(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between"><span>Phí ship</span><span>{order.shippingFee ? money(order.shippingFee) : "Miễn phí"}</span></div>
              <div className="flex justify-between font-display font-bold"><span>Tổng</span><span>{money(order.total)}</span></div>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Giao tới</h3>
            <p className="text-sm">{order.shippingAddress.fullName} · {order.shippingAddress.phone}</p>
            <p className="text-sm text-muted-foreground">
              {[order.shippingAddress.line1, order.shippingAddress.ward, order.shippingAddress.district, order.shippingAddress.province].filter(Boolean).join(", ")}
            </p>
          </section>

          <section>
            <Label htmlFor="o-status">Trạng thái đơn hàng</Label>
            <select
              id="o-status" value={order.status} disabled={busy}
              onChange={(e) => updateStatus(e.target.value)}
              className="mt-2 h-10 w-full cursor-pointer rounded border border-input bg-card px-3 text-sm"
            >
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
            </select>
            <p className="mt-1.5 text-xs text-muted-foreground">Dùng nút Hủy đơn bên dưới để hủy — thao tác đó sẽ hoàn kho và hoàn lượt voucher.</p>
          </section>

          <form onSubmit={saveShipping} className="rounded-lg border border-border p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Truck className="size-4" /> Vận chuyển</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="o-carrier">Đơn vị vận chuyển</Label>
                <Input id="o-carrier" name="carrier" defaultValue={order.shipping?.carrier} placeholder="GHN, GHTK, Viettel Post…" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="o-tracking">Mã vận đơn</Label>
                <Input id="o-tracking" name="trackingNumber" defaultValue={order.shipping?.trackingNumber} className="mt-2" />
              </div>
            </div>
            <Button type="submit" size="sm" className="mt-3" disabled={busy}>Lưu thông tin vận chuyển</Button>
          </form>

          <div className="flex flex-wrap gap-2">
            {canCancel && <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>Hủy đơn hàng</Button>}
            {order.payStatus === "paid" && order.refund?.status !== "refunded" && (
              <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}><Banknote /> Ghi nhận hoàn tiền</Button>
            )}
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Lịch sử</h3>
            <ol className="space-y-2 text-sm">
              {[...order.history].reverse().map((entry, i) => (
                <li key={i} className="flex gap-3">
                  <time className="w-32 shrink-0 text-xs text-muted-foreground">{new Date(entry.at).toLocaleString("vi-VN")}</time>
                  <span>
                    <b>{ORDER_STATUS_LABEL[entry.status] || entry.status}</b>
                    {entry.note && <span className="text-muted-foreground"> — {entry.note}</span>}
                    <span className="ml-1 text-xs text-muted-foreground">({entry.actor})</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </Dialog>

      <Dialog
        open={cancelOpen} onClose={() => setCancelOpen(false)} title="Hủy đơn hàng" size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCancelOpen(false)} disabled={busy}>Đóng</Button>
            <Button variant="destructive" size="sm" onClick={cancelOrder} disabled={busy || cancelReason.trim().length < 3}>
              {busy ? "Đang hủy…" : "Xác nhận hủy"}
            </Button>
          </>
        }
      >
        <Label htmlFor="cancel-reason-admin">Lý do hủy *</Label>
        <Input id="cancel-reason-admin" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="mt-2" autoFocus />
        <p className="mt-3 text-sm text-muted-foreground">Hàng sẽ được hoàn về kho và lượt dùng voucher được trả lại.</p>
      </Dialog>

      <Dialog open={refundOpen} onClose={() => setRefundOpen(false)} title="Ghi nhận hoàn tiền" size="sm">
        <form onSubmit={refund} className="space-y-4">
          <div>
            <Label htmlFor="r-amount">Số tiền hoàn *</Label>
            <Input id="r-amount" name="amount" type="number" min="1000" max={order.total} defaultValue={order.total} required className="mt-2" />
          </div>
          <div>
            <Label htmlFor="r-ref">Mã tham chiếu giao dịch {order.payMethod === "cod" && "*"}</Label>
            <Input id="r-ref" name="reference" required={order.payMethod === "cod"} placeholder="Mã giao dịch chuyển khoản" className="mt-2" />
          </div>
          <div>
            <Label htmlFor="r-note">Ghi chú</Label>
            <Input id="r-note" name="note" className="mt-2" />
          </div>
          <p className="rounded bg-secondary px-3 py-2 text-xs text-muted-foreground">
            {order.payMethod === "vnpay"
              ? "Nếu VNPay đã cấu hình thật, hệ thống sẽ gọi API hoàn tiền về nguồn thanh toán."
              : "Đơn COD hoàn qua chuyển khoản — hãy chuyển khoản trước rồi nhập mã giao dịch vào đây."}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRefundOpen(false)}>Hủy</Button>
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Đang xử lý…" : "Xác nhận hoàn tiền"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/* ==================== ĐỔI / TRẢ ==================== */

const RETURN_STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối",
  receiving: "Đang nhận", received: "Đã nhận hàng", completed: "Hoàn tất",
};

function ReturnsView() {
  const toast = useToast();
  const [list, setList] = useState<ReturnRequest[] | null>(null);
  const [detail, setDetail] = useState<ReturnRequest | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api.get<ReturnRequest[]>("/api/returns").then(setList).catch((e) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);

  async function act(id: string, path: string, body: unknown, message: string) {
    try {
      await api.put(`/api/returns/${id}/${path}`, body);
      toast.success(message);
      reload();
      setDetail(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Thao tác thất bại");
    }
  }

  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <>
      <h2 className="mb-4 font-display text-lg font-bold uppercase">Yêu cầu đổi / trả</h2>

      {!list ? (
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : !list.length ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
          Chưa có yêu cầu đổi/trả nào.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <b className="font-display">{r.id}</b>
                  <span className="text-sm text-muted-foreground">· đơn {r.orderId}</span>
                </span>
                <span className="flex gap-2">
                  <Badge variant="secondary">{r.type === "exchange" ? "Đổi hàng" : "Trả hàng"}</Badge>
                  <Badge variant={r.status === "rejected" ? "destructive" : r.status === "completed" ? "success" : "warning"}>
                    {RETURN_STATUS_LABEL[r.status]}
                  </Badge>
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{r.reasonLabel} — {r.description}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm">Giá trị: <b>{money(r.refundAmount)}</b></span>
                <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>Xử lý</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && <ReturnDetailDialog ret={detail} onClose={() => setDetail(null)} onAct={act} />}
    </>
  );
}

function ReturnDetailDialog({
  ret, onClose, onAct,
}: {
  ret: ReturnRequest;
  onClose: () => void;
  onAct: (id: string, path: string, body: unknown, message: string) => Promise<void>;
}) {
  const toast = useToast();
  const [adminNote, setAdminNote] = useState(ret.adminNote ?? "");
  const [responsibility, setResponsibility] = useState<"shop" | "customer">(ret.shippingResponsibility);
  const [busy, setBusy] = useState(false);

  async function refund(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.post(`/api/returns/${ret.id}/refund`, {
        amount: Number(form.get("amount")),
        reference: String(form.get("reference") || ""),
        note: String(form.get("note") || ""),
      });
      toast.success("Đã ghi nhận hoàn tiền");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không hoàn tiền được");
    } finally { setBusy(false); }
  }

  const bank = ret.bankAccount && "number" in ret.bankAccount ? ret.bankAccount : null;

  return (
    <Dialog open onClose={onClose} title={`Yêu cầu ${ret.id}`} size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{ret.type === "exchange" ? "Đổi hàng" : "Trả hàng"}</Badge>
          <Badge variant={ret.status === "rejected" ? "destructive" : ret.status === "completed" ? "success" : "warning"}>
            {RETURN_STATUS_LABEL[ret.status]}
          </Badge>
          <Link to={`/orders/${ret.orderId}`} className="text-sm text-brand hover:underline">Xem đơn {ret.orderId}</Link>
        </div>

        <section>
          <h3 className="mb-1 text-sm font-semibold">Lý do</h3>
          <p className="text-sm">{ret.reasonLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">{ret.description}</p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Sản phẩm ({money(ret.refundAmount)})</h3>
          <ul className="space-y-2 text-sm">
            {ret.items.map((item) => (
              <li key={item.variantId} className="flex items-center gap-3">
                <img src={item.img} alt="" width={36} height={46} className="h-11 w-9 rounded border border-border object-cover" />
                <span className="flex-1">{item.title} <span className="text-muted-foreground">({item.color}/{item.size}) × {item.qty}</span></span>
                <span>{money(item.price * item.qty)}</span>
              </li>
            ))}
          </ul>
        </section>

        {ret.photos.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Ảnh minh chứng</h3>
            <div className="flex flex-wrap gap-2">
              {ret.photos.map((src) => (
                <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                  <img src={src} alt="Ảnh minh chứng" className="size-24 rounded border border-border object-cover transition-opacity hover:opacity-80" />
                </a>
              ))}
            </div>
          </section>
        )}

        {bank && (
          <section className="rounded-lg border border-amber-500/40 bg-amber-50 p-4">
            <h3 className="mb-1.5 text-sm font-semibold text-amber-900">Thông tin nhận hoàn tiền</h3>
            <p className="text-sm text-amber-900">{bank.holder} · {bank.number} · {bank.bank}</p>
            <p className="mt-1 text-xs text-amber-800">Thông tin nhạy cảm — chỉ dùng để chuyển khoản hoàn tiền.</p>
          </section>
        )}

        {/* Duyệt */}
        {ret.status === "pending" && (
          <section className="rounded-lg border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Xử lý yêu cầu</h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="ret-note">Ghi chú gửi khách</Label>
                <Input id="ret-note" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} className="mt-2" placeholder="Lý do từ chối hoặc hướng dẫn gửi hàng…" />
              </div>
              <div>
                <Label htmlFor="ret-resp">Bên chịu phí vận chuyển</Label>
                <select
                  id="ret-resp" value={responsibility}
                  onChange={(e) => setResponsibility(e.target.value as "shop" | "customer")}
                  className="mt-2 h-10 w-full cursor-pointer rounded border border-input bg-card px-3 text-sm"
                >
                  <option value="customer">Khách hàng chịu (khách đổi ý)</option>
                  <option value="shop">Cửa hàng chịu (sản phẩm lỗi / giao sai)</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onAct(ret.id, "review", { decision: "approved", adminNote, shippingResponsibility: responsibility }, "Đã duyệt yêu cầu")}>
                  Duyệt yêu cầu
                </Button>
                <Button size="sm" variant="outline" onClick={() => onAct(ret.id, "review", { decision: "rejected", adminNote }, "Đã từ chối yêu cầu")}>
                  Từ chối
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Nhận hàng */}
        {ret.status === "approved" && (
          <section className="rounded-lg border border-border p-4">
            <h3 className="mb-2 text-sm font-semibold">Xác nhận đã nhận lại hàng</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Chọn có nhập lại kho hay không tùy tình trạng hàng nhận về.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onAct(ret.id, "receive", { restock: true }, "Đã nhận hàng và nhập lại kho")}>
                Nhận hàng, nhập lại kho
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAct(ret.id, "receive", { restock: false }, "Đã nhận hàng, không nhập kho")}>
                Nhận hàng, không nhập kho
              </Button>
            </div>
          </section>
        )}

        {/* Đổi hàng — chỉ sau khi đã nhận lại hàng cũ */}
        {ret.type === "exchange" && ret.status === "received" && !ret.exchange?.fulfilledAt && (
          <ExchangePicker ret={ret} onDone={onClose} />
        )}

        {ret.type === "exchange" && ret.status === "approved" && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-900">
            Cần xác nhận đã nhận lại hàng cũ trước khi chọn sản phẩm đổi cho khách.
          </p>
        )}

        {ret.exchange?.fulfilledAt && (
          <section className="rounded-lg border border-emerald-600/40 bg-emerald-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-emerald-900">Đã xử lý đổi hàng</h3>
            <p className="text-sm text-emerald-900">
              Đổi sang <b>{ret.exchange.title}</b> ({ret.exchange.color} / {ret.exchange.size}) × {ret.exchange.qty}
            </p>
            <p className="mt-1 text-xs text-emerald-800">
              Cùng giá trị {money(ret.exchange.originalValue)} — không phát sinh chênh lệch.
            </p>
          </section>
        )}

        {/* Hoàn tiền */}
        {["received", "completed"].includes(ret.status) && ret.type === "return" && (
          <form onSubmit={refund} className="rounded-lg border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Hoàn tiền</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="rr-amount">Số tiền</Label>
                <Input id="rr-amount" name="amount" type="number" defaultValue={ret.refundAmount} required className="mt-2" />
              </div>
              <div>
                <Label htmlFor="rr-ref">Mã giao dịch</Label>
                <Input id="rr-ref" name="reference" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="rr-note">Ghi chú</Label>
                <Input id="rr-note" name="note" className="mt-2" />
              </div>
            </div>
            <Button type="submit" size="sm" className="mt-3" disabled={busy}>
              {busy ? "Đang xử lý…" : "Xác nhận đã hoàn tiền"}
            </Button>
          </form>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold">Lịch sử</h3>
          <ol className="space-y-1.5 text-sm">
            {ret.history.map((h, i) => (
              <li key={i} className="flex gap-3">
                <time className="w-32 shrink-0 text-xs text-muted-foreground">{new Date(h.at).toLocaleString("vi-VN")}</time>
                <span>{h.note} <span className="text-xs text-muted-foreground">({h.actor})</span></span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Dialog>
  );
}

/**
 * Chọn sản phẩm thay thế cho yêu cầu đổi hàng.
 * Danh sách do server gợi ý — chỉ gồm sản phẩm CÙNG GIÁ TRỊ và còn hàng, nên nhân
 * viên không phải tự dò giá và không thể chọn nhầm món lệch giá.
 */
function ExchangePicker({ ret, onDone }: { ret: ReturnRequest; onDone: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<ExchangeOptions | null>(null);
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<ExchangeOptions>(`/api/returns/${ret.id}/exchange-options`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Không tải được danh sách sản phẩm"));
  }, [ret.id]);

  const selectedProduct = data?.options.find((p) => p.id === productId) ?? null;
  const availableVariants = selectedProduct?.variants.filter((x) => x.inStock) ?? [];
  const selectedVariant = availableVariants.find((x) => x.id === variantId) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVariant) return toast.error("Vui lòng chọn phiên bản thay thế");
    setBusy(true);
    setError("");
    try {
      await api.put(`/api/returns/${ret.id}/exchange`, {
        productId, variantId, qty: data?.qty ?? 1,
      });
      toast.success("Đã xử lý đổi hàng và trừ kho sản phẩm thay thế");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không xử lý được đổi hàng");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="rounded-lg border border-border p-4">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border p-4">
      <h3 className="mb-1 text-sm font-semibold">Chọn sản phẩm đổi cho khách</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Chỉ được đổi sang sản phẩm cùng giá trị <b className="text-foreground">{money(data.targetValue)}</b>.
        Nếu khách muốn món giá khác, hãy xử lý trả hàng để khách đặt đơn mới.
      </p>

      {!data.options.length ? (
        <p className="rounded border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          {data.note ?? "Không có sản phẩm nào cùng giá trị và còn hàng."}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ex-product">Sản phẩm thay thế</Label>
              <select
                id="ex-product"
                value={productId}
                onChange={(e) => { setProductId(e.target.value); setVariantId(""); }}
                className="mt-2 h-10 w-full cursor-pointer rounded border border-input bg-card px-3 text-sm"
              >
                <option value="">— Chọn sản phẩm —</option>
                {data.options.map((p) => (
                  <option key={p.id} value={p.id}>{p.title} · {money(p.price)}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="ex-variant">Màu / Size</Label>
              <select
                id="ex-variant"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                disabled={!selectedProduct}
                className="mt-2 h-10 w-full cursor-pointer rounded border border-input bg-card px-3 text-sm disabled:opacity-50"
              >
                <option value="">— Chọn phiên bản —</option>
                {availableVariants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.color} / {variant.size} — còn {variant.stock}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedProduct && !availableVariants.length && (
            <p className="mt-2 text-sm text-destructive">Sản phẩm này đã hết hàng ở mọi phiên bản.</p>
          )}

          {selectedVariant && (
            <p className="mt-3 rounded bg-secondary px-3 py-2 text-sm">
              Giao cho khách: <b>{selectedProduct?.title}</b> ({selectedVariant.color} / {selectedVariant.size})
              — kho còn {selectedVariant.stock}, sẽ trừ {data.qty}.
            </p>
          )}

          {error && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p>}

          <Button type="submit" size="sm" className="mt-3" disabled={busy || !selectedVariant}>
            {busy ? <><Loader2 className="animate-spin" /> Đang xử lý…</> : "Xác nhận đổi hàng"}
          </Button>
        </>
      )}
    </form>
  );
}

/* ==================== VOUCHER ==================== */

function VouchersView() {
  const toast = useToast();
  const [list, setList] = useState<Voucher[] | null>(null);
  const [editing, setEditing] = useState<Voucher | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Voucher | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => { api.get<Voucher[]>("/api/vouchers").then(setList).catch(() => setList([])); }, []);
  useEffect(reload, [reload]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const get = (k: string) => String(form.get(k) || "").trim();
    const body = {
      code: get("code"),
      percentage: Number(get("percentage")),
      description: get("description"),
      minOrderValue: get("minOrderValue") ? Number(get("minOrderValue")) : 0,
      maxDiscount: get("maxDiscount") ? Number(get("maxDiscount")) : null,
      usageLimit: get("usageLimit") ? Number(get("usageLimit")) : null,
      perUserLimit: get("perUserLimit") ? Number(get("perUserLimit")) : 1,
      startsAt: get("startsAt") || null,
      expiresAt: get("expiresAt") || null,
      active: form.get("active") === "on",
      public: form.get("public") === "on",
    };
    setBusy(true);
    try {
      if (editing) await api.put(`/api/vouchers/${editing.id}`, body);
      else await api.post("/api/vouchers", body);
      toast.success(editing ? "Đã cập nhật mã giảm giá" : "Đã tạo mã giảm giá");
      setDialogOpen(false); setEditing(null); reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không lưu được");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await api.del<{ deactivated: boolean; message?: string }>(`/api/vouchers/${deleting.id}`);
      toast.success(res.deactivated ? (res.message ?? "Đã tắt mã") : "Đã xóa mã");
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không xóa được");
    } finally { setBusy(false); setDeleting(null); }
  }

  const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold uppercase">Mã giảm giá</h2>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus /> Tạo mã</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary text-left font-display text-[11px] uppercase tracking-wider text-primary-foreground">
              <th className="px-3.5 py-2.5">Mã</th>
              <th className="px-3.5 py-2.5">Giảm</th>
              <th className="px-3.5 py-2.5">Đơn tối thiểu</th>
              <th className="px-3.5 py-2.5">Đã dùng</th>
              <th className="px-3.5 py-2.5">Hết hạn</th>
              <th className="px-3.5 py-2.5">Trạng thái</th>
              <th className="px-3.5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {(list ?? []).map((v) => (
              <tr key={v.id} className="border-b border-border last:border-0">
                <td className="px-3.5 py-2.5">
                  <b className="font-mono">{v.code}</b>
                  {v.description && <><br /><small className="text-muted-foreground">{v.description}</small></>}
                </td>
                <td className="px-3.5 py-2.5">
                  {v.percentage}%
                  {v.maxDiscount && <><br /><small className="text-muted-foreground">tối đa {money(v.maxDiscount)}</small></>}
                </td>
                <td className="px-3.5 py-2.5 whitespace-nowrap">{v.minOrderValue ? money(v.minOrderValue) : "—"}</td>
                <td className="px-3.5 py-2.5">{v.usedCount}{v.usageLimit ? ` / ${v.usageLimit}` : ""}</td>
                <td className="px-3.5 py-2.5 whitespace-nowrap">{v.expiresAt ? new Date(v.expiresAt).toLocaleDateString("vi-VN") : "Không giới hạn"}</td>
                <td className="px-3.5 py-2.5"><Badge variant={v.active ? "success" : "secondary"}>{v.active ? "Đang chạy" : "Đã tắt"}</Badge></td>
                <td className="px-3.5 py-2.5">
                  <span className="flex gap-1">
                    <button onClick={() => { setEditing(v); setDialogOpen(true); }} aria-label={`Sửa ${v.code}`} className="grid size-9 cursor-pointer place-items-center rounded hover:bg-secondary hover:text-brand"><Pencil className="size-4" /></button>
                    <button onClick={() => setDeleting(v)} aria-label={`Xóa ${v.code}`} className="grid size-9 cursor-pointer place-items-center rounded hover:bg-secondary hover:text-destructive"><Trash2 className="size-4" /></button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list && <p className="p-5 text-muted-foreground">Đang tải…</p>}
        {list?.length === 0 && <p className="p-5 text-muted-foreground">Chưa có mã giảm giá nào.</p>}
      </div>

      <Dialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} title={editing ? `Sửa mã ${editing.code}` : "Tạo mã giảm giá"}>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div>
            <Label htmlFor="v-code">Mã *</Label>
            <Input id="v-code" name="code" required defaultValue={editing?.code} readOnly={!!editing} placeholder="WELCOME10" className={cn("mt-2 uppercase", editing && "opacity-70")} />
          </div>
          <div>
            <Label htmlFor="v-pct">Phần trăm giảm (%) *</Label>
            <Input id="v-pct" name="percentage" type="number" min="1" max="100" required defaultValue={editing?.percentage} className="mt-2" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="v-desc">Mô tả</Label>
            <Input id="v-desc" name="description" defaultValue={editing?.description} placeholder="Giảm 10% cho đơn đầu tiên" className="mt-2" />
          </div>
          <div>
            <Label htmlFor="v-min">Giá trị đơn tối thiểu (₫)</Label>
            <Input id="v-min" name="minOrderValue" type="number" min="0" defaultValue={editing?.minOrderValue || ""} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="v-max">Giảm tối đa (₫)</Label>
            <Input id="v-max" name="maxDiscount" type="number" min="1000" defaultValue={editing?.maxDiscount ?? ""} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="v-limit">Tổng lượt dùng</Label>
            <Input id="v-limit" name="usageLimit" type="number" min="1" defaultValue={editing?.usageLimit ?? ""} placeholder="Không giới hạn" className="mt-2" />
          </div>
          <div>
            <Label htmlFor="v-peruser">Lượt dùng mỗi khách</Label>
            <Input id="v-peruser" name="perUserLimit" type="number" min="1" defaultValue={editing?.perUserLimit ?? 1} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="v-start">Bắt đầu</Label>
            <Input id="v-start" name="startsAt" type="date" defaultValue={toDateInput(editing?.startsAt ?? null)} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="v-end">Hết hạn</Label>
            <Input id="v-end" name="expiresAt" type="date" defaultValue={toDateInput(editing?.expiresAt ?? null)} className="mt-2" />
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" name="active" defaultChecked={editing?.active !== false} className="size-4 accent-[var(--brand)]" />
            Đang hoạt động
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" name="public" defaultChecked={editing?.public !== false} className="size-4 accent-[var(--brand)]" />
            Hiển thị công khai
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setDialogOpen(false); setEditing(null); }}>Hủy</Button>
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Đang lưu…" : "Lưu mã"}</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} busy={busy} tone="destructive"
        title="Xóa mã giảm giá"
        description={`Xóa mã ${deleting?.code}? Nếu mã đã được sử dụng, hệ thống sẽ tắt thay vì xóa để giữ dữ liệu đơn cũ.`}
        confirmLabel="Xóa mã"
      />
    </>
  );
}

/* ==================== TIN NHẮN LIÊN HỆ ==================== */

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  subjectLabel: string;
  orderId?: string;
  content: string;
  status: "new" | "in_progress" | "resolved";
  createdAt: string;
}

const MESSAGE_STATUS: Record<string, { label: string; tone: "warning" | "brand" | "success" }> = {
  new: { label: "Mới", tone: "warning" },
  in_progress: { label: "Đang xử lý", tone: "brand" },
  resolved: { label: "Đã xong", tone: "success" },
};

function MessagesView() {
  const toast = useToast();
  const [list, setList] = useState<ContactMessage[] | null>(null);
  const [filter, setFilter] = useState("");

  const reload = useCallback(() => {
    api.get<ContactMessage[]>(`/api/contact${filter ? `?status=${filter}` : ""}`)
      .then(setList)
      .catch(() => setList([]));
  }, [filter]);
  useEffect(reload, [reload]);

  async function setStatus(message: ContactMessage, status: string) {
    try {
      await api.put(`/api/contact/${message.id}/status`, { status });
      toast.success("Đã cập nhật trạng thái tin nhắn");
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không cập nhật được");
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold uppercase">Tin nhắn liên hệ</h2>
        <select
          value={filter} onChange={(e) => setFilter(e.target.value)}
          aria-label="Lọc theo trạng thái"
          className="h-11 cursor-pointer rounded border border-input bg-card px-3 text-sm"
        >
          <option value="">Tất cả</option>
          <option value="new">Mới</option>
          <option value="in_progress">Đang xử lý</option>
          <option value="resolved">Đã xong</option>
        </select>
      </div>

      {!list ? (
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : !list.length ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
          Chưa có tin nhắn nào.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((m) => (
            <div key={m.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display font-semibold">{m.name}</p>
                  <p className="text-sm text-muted-foreground">
                    <a href={`mailto:${m.email}`} className="hover:text-brand">{m.email}</a>
                    {m.phone && ` · ${m.phone}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{m.subjectLabel}</Badge>
                  <Badge variant={MESSAGE_STATUS[m.status]?.tone}>{MESSAGE_STATUS[m.status]?.label}</Badge>
                </div>
              </div>

              {m.orderId && (
                <p className="mt-2 text-sm">
                  Đơn liên quan: <Link to={`/orders/${m.orderId}`} className="text-brand hover:underline">{m.orderId}</Link>
                </p>
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <time className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString("vi-VN")}</time>
                <span className="flex gap-2">
                  {m.status !== "in_progress" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(m, "in_progress")}>Nhận xử lý</Button>
                  )}
                  {m.status !== "resolved" && (
                    <Button size="sm" onClick={() => setStatus(m, "resolved")}>Đánh dấu đã xong</Button>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ==================== KHÁCH HÀNG ==================== */

interface AdminUser extends User { orderCount: number; totalSpent: number }

function UsersView({ currentId }: { currentId: string }) {
  const toast = useToast();
  const [list, setList] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState("");

  const reload = useCallback(() => {
    api.get<AdminUser[]>(`/api/admin/users?q=${encodeURIComponent(query)}`).then(setList).catch(() => setList([]));
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(reload, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [reload, query]);

  async function setRole(user: AdminUser, role: Role) {
    try {
      await api.put(`/api/admin/users/${user.id}/role`, { role });
      toast.success(`Đã đổi vai trò của ${user.email} thành ${role}`);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không đổi được vai trò");
      reload();
    }
  }

  return (
    <>
      <h2 className="mb-4 font-display text-lg font-bold uppercase">Khách hàng</h2>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc email…" className="h-11 pl-8" aria-label="Tìm khách hàng" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary text-left font-display text-[11px] uppercase tracking-wider text-primary-foreground">
              <th className="px-3.5 py-2.5">Tên</th>
              <th className="px-3.5 py-2.5">Email</th>
              <th className="px-3.5 py-2.5">Xác minh</th>
              <th className="px-3.5 py-2.5">Đơn hàng</th>
              <th className="px-3.5 py-2.5">Đã chi</th>
              <th className="px-3.5 py-2.5">Vai trò</th>
            </tr>
          </thead>
          <tbody>
            {(list ?? []).map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-3.5 py-2.5 font-medium">
                  {u.name}
                  {u.id === currentId && <span className="ml-2 text-xs text-muted-foreground">(bạn)</span>}
                </td>
                <td className="px-3.5 py-2.5">{u.email}</td>
                <td className="px-3.5 py-2.5">
                  <Badge variant={u.emailVerified ? "success" : "warning"}>{u.emailVerified ? "Đã xác minh" : "Chưa"}</Badge>
                </td>
                <td className="px-3.5 py-2.5">{u.orderCount}</td>
                <td className="px-3.5 py-2.5 whitespace-nowrap">{money(u.totalSpent)}</td>
                <td className="px-3.5 py-2.5">
                  {u.id === currentId ? (
                    <Badge variant="brand">{u.role}</Badge>
                  ) : (
                    <select
                      value={u.role} onChange={(e) => setRole(u, e.target.value as Role)}
                      aria-label={`Vai trò của ${u.email}`}
                      className="cursor-pointer rounded border border-input bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="customer">customer</option>
                      <option value="staff">staff</option>
                      <option value="admin">admin</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list && <p className="p-5 text-muted-foreground">Đang tải…</p>}
        {list?.length === 0 && <p className="p-5 text-muted-foreground">Không tìm thấy khách hàng.</p>}
      </div>
    </>
  );
}

/* ==================== EMAIL ==================== */

const TEMPLATE_LABEL: Record<string, string> = {
  welcome: "Chào mừng",
  verifyEmail: "Xác minh email",
  resetPassword: "Đặt lại mật khẩu",
  passwordChanged: "Đổi mật khẩu",
  orderPlaced: "Xác nhận đơn",
  paymentSuccess: "Thanh toán thành công",
  paymentFailed: "Thanh toán thất bại",
  orderStatus: "Cập nhật đơn",
  orderCancelled: "Hủy đơn",
  returnRequested: "Yêu cầu đổi/trả",
  returnReviewed: "Kết quả đổi/trả",
  refunded: "Hoàn tiền",
};

function EmailsView() {
  const [list, setList] = useState<MailRecord[] | null>(null);
  const [preview, setPreview] = useState<MailRecord | null>(null);

  useEffect(() => { api.get<MailRecord[]>("/api/admin/emails").then(setList).catch(() => setList([])); }, []);

  async function open(id: string) {
    try { setPreview(await api.get<MailRecord>("/api/admin/emails/" + id)); } catch { /* bỏ qua */ }
  }

  return (
    <>
      <h2 className="mb-2 font-display text-lg font-bold uppercase">Email đã gửi</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Toàn bộ email hệ thống phát ra. Khi chưa cấu hình SMTP, email được lưu tại đây thay vì gửi ra ngoài.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary text-left font-display text-[11px] uppercase tracking-wider text-primary-foreground">
              <th className="px-3.5 py-2.5">Người nhận</th>
              <th className="px-3.5 py-2.5">Tiêu đề</th>
              <th className="px-3.5 py-2.5">Loại</th>
              <th className="px-3.5 py-2.5">Trạng thái</th>
              <th className="px-3.5 py-2.5">Thời gian</th>
              <th className="px-3.5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {(list ?? []).map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-3.5 py-2.5">{m.to}</td>
                <td className="px-3.5 py-2.5 font-medium">{m.subject}</td>
                <td className="px-3.5 py-2.5">
                  {TEMPLATE_LABEL[m.template] || m.template}
                  {m.sensitive && (
                    <span className="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      ẩn nội dung
                    </span>
                  )}
                </td>
                <td className="px-3.5 py-2.5">
                  <Badge variant={m.status === "sent" ? "success" : "destructive"}>
                    {m.status === "sent" ? (m.mode === "smtp" ? "Đã gửi" : "Hộp thư nội bộ") : "Lỗi"}
                  </Badge>
                </td>
                <td className="px-3.5 py-2.5 whitespace-nowrap">{new Date(m.createdAt).toLocaleString("vi-VN")}</td>
                <td className="px-3.5 py-2.5"><Button size="sm" variant="ghost" onClick={() => open(m.id)}>Xem</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list && <p className="p-5 text-muted-foreground">Đang tải…</p>}
        {list?.length === 0 && <p className="p-5 text-muted-foreground">Chưa có email nào được gửi.</p>}
      </div>

      {preview && (
        <Dialog open onClose={() => setPreview(null)} title={preview.subject} description={`Tới: ${preview.to}`} size="lg">
          {preview.html ? (
            <iframe
              title={`Nội dung email: ${preview.subject}`}
              srcDoc={preview.html}
              sandbox=""
              className="h-[60vh] w-full rounded border-0 bg-white"
            />
          ) : (
            <div className="rounded border border-amber-500/40 bg-amber-50 p-5 text-sm text-amber-900">
              <p className="font-semibold">Nội dung được ẩn vì lý do bảo mật</p>
              <p className="mt-1.5 leading-relaxed">
                {preview.redactedReason
                  ?? "Email này chứa mã xác minh dùng một lần. Nội dung không được lưu lại để nhân viên không đọc được mã của khách hàng."}
              </p>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

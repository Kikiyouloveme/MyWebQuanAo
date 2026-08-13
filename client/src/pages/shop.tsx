import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProductGrid, GridSkeleton } from "@/components/product-card";
import { api, type Product } from "@/lib/api";
import { usePageMeta } from "@/lib/use-page-meta";

const CATS = [
  { v: "all", label: "Tất cả" },
  { v: "tops", label: "Tops" },
  { v: "bottoms", label: "Bottoms" },
  { v: "outerwear", label: "Outerwear" },
  { v: "accessories", label: "Accessories" },
];

const TAG_LABELS: Record<string, string> = {
  womens: "Womens",
  summer: "Summer Collection",
  sale: "Sale",
};

export default function Shop() {
  usePageMeta({
    title: "Shop — VELATHIER",
    description: "Toàn bộ sản phẩm VELATHIER: áo, quần, áo khoác, phụ kiện. Lọc theo danh mục, tìm kiếm và sắp xếp theo giá.",
  });

  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || "all";
  const tag = params.get("tag") || "";
  const urlQ = params.get("q") || "";
  const [sort, setSort] = useState("newest");
  const [q, setQ] = useState(urlQ);
  const [items, setItems] = useState<Product[] | null>(null);
  const [err, setErr] = useState("");

  // Đồng bộ khi q trên URL đổi từ nguồn khác (vd tìm kiếm ở header)
  useEffect(() => { setQ(urlQ); }, [urlQ]);

  useEffect(() => {
    setItems(null);
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ cat, sort });
      if (tag) qs.set("tag", tag);
      if (q) qs.set("q", q);
      api.get<Product[]>(`/api/products?${qs.toString()}`)
        .then(setItems)
        .catch((e) => setErr(e.message));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [cat, tag, sort, q]);

  function onSearchInput(v: string) {
    setQ(v);
    const next = new URLSearchParams(params);
    if (v) next.set("q", v); else next.delete("q");
    setParams(next, { replace: true });
  }

  function clearTag() {
    const next = new URLSearchParams(params);
    next.delete("tag");
    setParams(next);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 pb-20">
      <div className="py-10">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Trang chủ / Shop</p>
        <h1 className="mt-2 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          Shop<span className="text-brand">.</span>
        </h1>
      </div>

      {tag && TAG_LABELS[tag] && (
        <div className="mb-5 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Đang lọc:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-brand">
            {TAG_LABELS[tag]}
            <button onClick={clearTag} aria-label="Xóa bộ lọc" className="cursor-pointer"><X className="size-3.5" /></button>
          </span>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Chip danh mục — cuộn ngang trên mobile, cao tối thiểu 44px cho cảm ứng */}
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {CATS.map((c) => (
            <button
              key={c.v}
              onClick={() => setParams(c.v === "all" ? {} : { cat: c.v })}
              aria-pressed={cat === c.v}
              className={`h-11 shrink-0 cursor-pointer rounded-full border px-4 font-display text-xs font-bold uppercase tracking-wider transition-colors ${
                cat === c.v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => onSearchInput(e.target.value)} placeholder="Tìm sản phẩm…" className="h-11 w-full pl-8 sm:w-48" aria-label="Tìm sản phẩm" />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sắp xếp sản phẩm"
            className="h-11 shrink-0 cursor-pointer border border-input bg-card px-3 text-sm"
          >
            <option value="newest">Mới nhất</option>
            <option value="price-asc">Giá tăng dần</option>
            <option value="price-desc">Giá giảm dần</option>
          </select>
        </div>
      </div>

      {err && <p className="py-6 text-destructive">{err}</p>}
      {items === null ? (
        <GridSkeleton />
      ) : items.length ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{items.length} sản phẩm</p>
          <ProductGrid items={items} />
        </>
      ) : (
        <p className="py-16 text-center text-muted-foreground">Không có sản phẩm phù hợp.</p>
      )}
    </div>
  );
}

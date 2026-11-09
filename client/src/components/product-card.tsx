import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/context/cart";
import { useToast } from "@/context/toast";
import { money } from "@/lib/utils";
import type { Product } from "@/lib/api";

// Tách riêng khỏi import tĩnh — trang chủ (Home) tải ProductCard ngay từ đầu (không
// lazy) để có LCP nhanh, nên hộp thoại xem nhanh (nặng hơn: bảng size, chọn màu/size)
// chỉ nên tải khi khách thực sự bấm nút "+".
const ProductQuickView = lazy(() =>
  import("@/components/product-quick-view").then((m) => ({ default: m.ProductQuickView }))
);

export function ProductCard({ p }: { p: Product }) {
  const { add } = useCart();
  const toast = useToast();
  const [quickView, setQuickView] = useState(false);

  const soldOut = !p.inStock;
  const onSale = !!p.compareAtPrice && p.compareAtPrice > p.price;
  const off = onSale ? Math.round((1 - p.price / p.compareAtPrice!) * 100) : 0;
  const availableVariants = p.variants.filter((v) => v.stock > 0);
  // Chỉ thêm nhanh được khi sản phẩm có đúng một phiên bản; nhiều màu/size thì
  // mở hộp thoại xem nhanh để chọn, tránh thêm nhầm biến thể.
  const canQuickAdd = availableVariants.length === 1;

  function quickAdd() {
    if (canQuickAdd) {
      add(p, availableVariants[0]);
      toast.success(`Đã thêm ${p.title} vào giỏ`);
    } else {
      setQuickView(true);
    }
  }

  return (
    <article className="group relative flex flex-col">
      {p.badge && <Badge variant="brand" className="absolute left-2.5 top-2.5 z-10">{p.badge}</Badge>}
      {!p.badge && onSale && <Badge variant="destructive" className="absolute left-2.5 top-2.5 z-10">−{off}%</Badge>}
      {soldOut && <Badge variant="outline" className="absolute right-2.5 top-2.5 z-10 bg-background">Hết hàng</Badge>}

      <Link
        to={`/product/${p.id}`}
        className="relative block aspect-[3/4] overflow-hidden rounded bg-muted transition-shadow duration-300 group-hover:shadow-md"
      >
        <img
          src={p.img} alt={p.title} width={600} height={800} loading="lazy" decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-0"
        />
        <img
          src={p.img2 || p.img} alt="" width={600} height={800} loading="lazy" decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      </Link>

      {!soldOut && (
        <button
          onClick={quickAdd}
          aria-label={canQuickAdd ? `Thêm ${p.title} vào giỏ` : `Chọn màu và size cho ${p.title}`}
          title={canQuickAdd ? "Thêm vào giỏ" : "Chọn màu & size"}
          className="absolute bottom-[86px] right-2 z-10 grid size-11 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition-all hover:bg-brand group-hover:opacity-100 max-lg:opacity-100"
        >
          <Plus className="size-4" />
        </button>
      )}

      <div className="flex flex-1 flex-col gap-1 pt-3">
        <Link to={`/product/${p.id}`} className="flex min-h-11 items-start font-display text-sm font-semibold leading-snug hover:text-brand">
          {p.title}
        </Link>
        <span className="text-xs text-muted-foreground">
          {p.colors.length > 1 ? `${p.colors.length} màu` : p.colors[0]}
        </span>
        <span className="mt-auto flex items-baseline gap-2 font-display text-[15px] font-bold">
          {onSale && <s className="text-xs font-medium text-muted-foreground">{money(p.compareAtPrice!)}</s>}
          <span className={onSale ? "text-brand" : ""}>{money(p.price)}</span>
        </span>
      </div>

      {quickView && (
        <Suspense fallback={null}>
          <ProductQuickView productId={p.id} onClose={() => setQuickView(false)} />
        </Suspense>
      )}
    </article>
  );
}

export function ProductGrid({ items, cols = 4 }: { items: Product[]; cols?: number }) {
  return (
    <div className={`grid gap-x-4 gap-y-9 sm:gap-x-6 ${cols === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3"}`}>
      {items.map((p) => <ProductCard key={p.id} p={p} />)}
    </div>
  );
}

export function GridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="aspect-[3/4.6] animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

/** Trạng thái rỗng dùng chung cho danh sách sản phẩm */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="py-20 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

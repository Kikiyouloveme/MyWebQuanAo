import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus, ShoppingBag, Ruler } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/cart";
import { useToast } from "@/context/toast";
import { api, type Product, type Variant } from "@/lib/api";
import { money, cn } from "@/lib/utils";

const APPAREL_SIZES = new Set(["S", "M", "L", "XL", "XXL"]);

const APPAREL_GUIDE = [
  { size: "S", chest: "88–92", length: "66" },
  { size: "M", chest: "93–97", length: "68" },
  { size: "L", chest: "98–103", length: "70" },
  { size: "XL", chest: "104–109", length: "72" },
  { size: "XXL", chest: "110–115", length: "74" },
];

const PANTS_GUIDE = [
  { size: "28", waist: "70–74", hip: "92" },
  { size: "30", waist: "75–79", hip: "96" },
  { size: "32", waist: "80–84", hip: "100" },
  { size: "34", waist: "85–89", hip: "104" },
  { size: "36", waist: "90–94", hip: "108" },
];

type GuideRow = { size: string; [k: string]: string };
type Guide = { rows: GuideRow[]; cols: string[]; labels: Record<string, string> };

/** Bảng size chỉ hiện được khi sản phẩm dùng size chữ (áo) hoặc size số vòng eo (quần) */
function guideFor(product: Product): Guide | null {
  if (product.sizes.some((s) => APPAREL_SIZES.has(s))) {
    return { rows: APPAREL_GUIDE, cols: ["chest", "length"], labels: { chest: "Vòng ngực (cm)", length: "Dài áo (cm)" } };
  }
  if (product.sizes.length && product.sizes.every((s) => /^\d+$/.test(s))) {
    return { rows: PANTS_GUIDE, cols: ["waist", "hip"], labels: { waist: "Vòng eo (cm)", hip: "Vòng mông (cm)" } };
  }
  return null;
}

interface ProductQuickViewProps {
  /** id sản phẩm đang xem nhanh — null nghĩa là đóng hộp thoại */
  productId: string | null;
  onClose: () => void;
}

/**
 * Xem nhanh sản phẩm dạng hộp thoại — mở khi bấm nút "+" trên thẻ sản phẩm thay vì
 * chuyển hẳn sang trang chi tiết. Bấm ra ngoài hoặc Esc sẽ đóng lại, người dùng vẫn
 * ở nguyên trang danh sách sản phẩm (Dialog dùng chung đã xử lý sẵn hành vi này).
 */
export function ProductQuickView({ productId, onClose }: ProductQuickViewProps) {
  const { add } = useCart();
  const toast = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!productId) return;
    setProduct(null);
    setColor("");
    setSize("");
    setQty(1);
    api.get<Product>("/api/products/" + productId)
      .then((p) => {
        setProduct(p);
        const firstAvailable = p.colors.find((c) => p.variants.some((v) => v.color === c && v.stock > 0));
        setColor(firstAvailable || p.colors[0] || "");
      })
      .catch(() => toast.error("Không tải được sản phẩm"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const sizesForColor = useMemo(() => {
    if (!product || !color) return [] as Variant[];
    return product.variants.filter((v) => v.color === color);
  }, [product, color]);

  useEffect(() => {
    if (!sizesForColor.length) return;
    const keep = sizesForColor.find((v) => v.size === size && v.stock > 0);
    if (keep) return;
    const available = sizesForColor.find((v) => v.stock > 0);
    setSize(available ? available.size : sizesForColor[0].size);
    setQty(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizesForColor]);

  const selectedVariant = sizesForColor.find((v) => v.size === size) || null;
  const canAdd = !!selectedVariant && selectedVariant.stock > 0;
  const guide = useMemo(() => (product ? guideFor(product) : null), [product]);
  const onSale = !!product?.compareAtPrice && product.compareAtPrice > product.price;

  function addToCart() {
    if (!product || !selectedVariant) return;
    add(product, selectedVariant, qty);
    toast.success(`Đã thêm ${product.title} (${selectedVariant.color} / ${selectedVariant.size}) vào giỏ`);
    onClose();
  }

  return (
    <Dialog open={!!productId} onClose={onClose} title={product?.title || "Đang tải…"} size="lg">
      {!product ? (
        <div className="grid gap-5 sm:grid-cols-2" aria-busy="true">
          <div className="aspect-[3/4] animate-pulse rounded bg-muted" />
          <div className="space-y-3">
            <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-24 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="aspect-[3/4] overflow-hidden rounded bg-muted">
            <img src={product.img} alt={product.title} width={500} height={667} className="h-full w-full object-cover" />
          </div>

          <div>
            <p className="flex items-baseline gap-2 font-display text-xl font-bold">
              {onSale && <s className="text-sm font-medium text-muted-foreground">{money(product.compareAtPrice!)}</s>}
              <span className="text-brand">{money(product.price)}</span>
            </p>

            {/* Màu sắc */}
            <fieldset className="mt-5">
              <legend className="font-display text-xs font-bold uppercase tracking-[0.14em]">
                Màu sắc: <span className="font-normal normal-case tracking-normal text-muted-foreground">{color}</span>
              </legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {product.colors.map((c) => {
                  const stockOfColor = product.variants.filter((v) => v.color === c).reduce((s, v) => s + v.stock, 0);
                  const soldOut = stockOfColor === 0;
                  return (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      aria-pressed={color === c}
                      className={cn(
                        "min-h-10 cursor-pointer rounded border px-3 text-sm font-medium transition-colors",
                        color === c ? "border-brand bg-brand/10 text-brand" : "border-border bg-card hover:border-primary",
                        soldOut && "opacity-45"
                      )}
                    >
                      {c}
                      {soldOut && <span className="ml-1 text-xs">(hết)</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Size */}
            <fieldset className="mt-4">
              <legend className="font-display text-xs font-bold uppercase tracking-[0.14em]">Size</legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {sizesForColor.map((variant) => {
                  const soldOut = variant.stock === 0;
                  return (
                    <button
                      key={variant.id}
                      onClick={() => { setSize(variant.size); setQty(1); }}
                      disabled={soldOut}
                      aria-pressed={size === variant.size}
                      title={soldOut ? "Hết hàng" : `Còn ${variant.stock} sản phẩm`}
                      className={cn(
                        "relative min-h-10 min-w-11 cursor-pointer rounded border px-3 text-sm font-semibold transition-colors",
                        size === variant.size ? "border-brand bg-brand text-white" : "border-border bg-card hover:border-primary",
                        soldOut && "cursor-not-allowed border-border/60 text-muted-foreground/50 line-through hover:border-border/60"
                      )}
                    >
                      {variant.size}
                    </button>
                  );
                })}
              </div>
              {selectedVariant && selectedVariant.stock > 0 && selectedVariant.stock <= 5 && (
                <p className="mt-2 text-sm font-medium text-amber-700" aria-live="polite">Chỉ còn {selectedVariant.stock} sản phẩm</p>
              )}
            </fieldset>

            {/* Số lượng + thêm vào giỏ */}
            <div className="mt-5 flex gap-2.5">
              <span className="inline-flex items-stretch rounded border border-input bg-card">
                <button
                  className="grid w-10 cursor-pointer place-items-center disabled:opacity-40"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="Giảm số lượng"
                ><Minus className="size-4" /></button>
                <span className="grid w-10 place-items-center font-bold" aria-live="polite">{qty}</span>
                <button
                  className="grid w-10 cursor-pointer place-items-center disabled:opacity-40"
                  onClick={() => setQty((q) => Math.min(q + 1, selectedVariant?.stock ?? 1, 20))}
                  disabled={!canAdd || qty >= Math.min(selectedVariant?.stock ?? 1, 20)}
                  aria-label="Tăng số lượng"
                ><Plus className="size-4" /></button>
              </span>
              <Button className="flex-1" disabled={!canAdd} onClick={addToCart}>
                <ShoppingBag /> {canAdd ? "Thêm vào giỏ" : "Hết hàng"}
              </Button>
            </div>

            <Link
              to={`/product/${product.id}`}
              onClick={onClose}
              className="mt-3 inline-block text-xs font-medium text-muted-foreground underline-offset-2 hover:text-brand hover:underline"
            >
              Xem đầy đủ thông tin sản phẩm →
            </Link>

            {/* Hướng dẫn chọn size */}
            {guide && (
              <div className="mt-6 border-t border-border pt-5">
                <p className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-[0.14em]">
                  <Ruler className="size-3.5 text-brand" /> Hướng dẫn chọn size
                </p>
                <div className="mt-2.5 overflow-x-auto">
                  <table className="w-full min-w-[280px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">Size</th>
                        {guide.cols.map((c) => <th key={c} className="py-1.5 pr-3 font-medium">{guide.labels[c]}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {guide.rows.map((row) => (
                        <tr key={row.size} className={cn("border-b border-border/60", row.size === size && "bg-brand/5 font-semibold text-brand")}>
                          <td className="py-1.5 pr-3">{row.size}</td>
                          {guide.cols.map((c) => <td key={c} className="py-1.5 pr-3">{row[c]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Phom relaxed — nếu bạn ở giữa hai size, nên chọn size nhỏ hơn để form ôm vừa phải.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

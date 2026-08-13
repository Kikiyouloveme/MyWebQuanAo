import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Truck, RefreshCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductGrid, GridSkeleton } from "@/components/product-card";
import { api, type Product } from "@/lib/api";
import { usePageMeta } from "@/lib/use-page-meta";

const TILES = [
  { cat: "tops", label: "Tops", img: "/assets/img/p/tee-boxy-01.svg" },
  { cat: "outerwear", label: "Outerwear", img: "/assets/img/p/hoodie-mono-04.svg" },
  { cat: "bottoms", label: "Bottoms", img: "/assets/img/p/pants-cargo-08.svg" },
  { cat: "accessories", label: "Accessories", img: "/assets/img/p/tote-canvas-11.svg" },
];

const PERKS = [
  { icon: Truck, title: "Freeship từ 750K", desc: "Giao nhanh toàn quốc, tự động áp dụng sau khi trừ mã giảm giá." },
  { icon: RefreshCcw, title: "Đổi trả 7 ngày", desc: "Còn nguyên tem, chưa qua sử dụng — đổi sang sản phẩm cùng giá trị hoặc hoàn tiền." },
  { icon: ShieldCheck, title: "Bảo hành đường may", desc: "Sửa miễn phí lỗi đường may trong 30 ngày đầu." },
];

export default function Home() {
  usePageMeta({
    title: "VELATHIER — Thời trang cơ bản làm kỹ",
    description: "Áo thun, quần, áo khoác và phụ kiện chất liệu tốt, phom dáng chuẩn. Miễn phí vận chuyển đơn từ 750.000₫, đổi trả trong 7 ngày.",
  });

  const [items, setItems] = useState<Product[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get<Product[]>("/api/products?sort=newest&limit=8")
      .then(setItems)
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col justify-center px-5 py-16 lg:py-24">
            <span className="mb-6 w-fit bg-primary px-3.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground">
              FW26 Collection
            </span>
            <h1 className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              Wear the<br />basics <span className="text-brand">well.</span>
            </h1>
            <p className="mt-5 max-w-md text-base text-muted-foreground">
              Đồ cơ bản làm kỹ: cotton dày dặn, phom relaxed, đường may chắc chắn. Ít món hơn — mặc lâu hơn.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/shop">Mua sắm ngay <ArrowRight /></Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/shop?cat=outerwear">Xem Outerwear</Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 border-t border-border p-2.5 lg:border-l lg:border-t-0">
            {TILES.map((t) => (
              <Link key={t.cat} to={`/shop?cat=${t.cat}`} className="group relative overflow-hidden bg-card">
                <img
                  src={t.img}
                  alt={t.label}
                  width={600}
                  height={600}
                  fetchPriority={t.cat === "tops" ? "high" : "auto"}
                  decoding="async"
                  className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <b className="absolute bottom-3 left-3 bg-background px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider shadow-sm">
                  {t.label}
                </b>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Hàng mới */}
      <section className="mx-auto max-w-7xl px-5 py-16">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">
            Hàng mới về<span className="text-brand">.</span>
          </h2>
          <Link to="/shop" className="border-b border-brand pb-0.5 font-display text-[13px] font-bold uppercase tracking-wider hover:text-brand">
            Xem tất cả
          </Link>
        </div>
        {err && <p className="text-destructive">{err}</p>}
        {items ? <ProductGrid items={items} /> : <GridSkeleton />}
      </section>

      {/* Cam kết */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-7xl sm:grid-cols-3">
          {PERKS.map((p, i) => (
            <div key={p.title} className={`flex gap-4 px-6 py-8 ${i > 0 ? "border-t border-border sm:border-l sm:border-t-0" : ""}`}>
              <p.icon className="size-8 shrink-0 text-brand" strokeWidth={1.6} />
              <div>
                <h3 className="font-display text-sm font-bold uppercase tracking-wider">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary py-20 text-center text-primary-foreground">
        <div className="mx-auto max-w-2xl px-5">
          <h2 className="font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
            Join <span className="text-brand">VELATHIER.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-primary-foreground/60">
            Tạo tài khoản để nhận ưu đãi 10% cho đơn đầu tiên và theo dõi đơn hàng dễ dàng.
          </p>
          <Button size="lg" variant="brand" className="mt-8" asChild>
            <Link to="/register">Đăng ký ngay</Link>
          </Button>
        </div>
      </section>
    </>
  );
}

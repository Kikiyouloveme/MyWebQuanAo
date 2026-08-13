import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ShoppingBag, User, Menu, X, Minus, Plus, Trash2, ShieldCheck, Home, Store, Search, ChevronDown, Package, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoLink } from "@/components/logo";
import { useAuth } from "@/context/auth";
import { useCart } from "@/context/cart";
import { money, cn } from "@/lib/utils";
import { SITE, POLICIES, hasDirectContact } from "@/lib/site";

const NAV = [
  { to: "/shop", label: "shop" },
  { to: "/shop?cat=tops", label: "tops" },
  { to: "/shop?cat=bottoms", label: "bottoms" },
  { to: "/shop?cat=outerwear", label: "outerwear" },
  { to: "/shop?cat=accessories", label: "accessories" },
  { to: "/shop?tag=womens", label: "womens" },
  { to: "/shop?tag=summer", label: "summer collection" },
  { to: "/shop?tag=sale", label: "sale" },
];

/** Nút bấm tối thiểu 44×44px theo chuẩn Apple HIG / Material */
const TAP = "grid size-11 place-items-center";

function Ticker() {
  const msgs = [
    "Miễn phí vận chuyển đơn từ 750K",
    "Bộ sưu tập FW26 đã lên kệ",
    "Đổi trả trong 7 ngày",
    "VELATHIER — Wear the basics well",
  ];
  return (
    <div className="overflow-hidden bg-brand py-1.5 text-brand-foreground">
      <div className="animate-marquee flex whitespace-nowrap font-display text-[11px] font-semibold uppercase tracking-[0.16em] sm:text-xs">
        {[...msgs, ...msgs, ...msgs, ...msgs].map((m, i) => (
          <span key={i} className="px-7">
            {m} <span className="ml-7 opacity-50">●</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Ô tìm kiếm — Enter hoặc bấm nút sẽ điều hướng sang /shop?q=... */
function HeaderSearch({ className }: { className?: string }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const id = useId();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    navigate(query ? `/shop?q=${encodeURIComponent(query)}` : "/shop");
  }

  return (
    <form onSubmit={onSubmit} role="search" className={cn("flex h-11 w-full", className)}>
      <label htmlFor={id} className="sr-only">Tìm kiếm sản phẩm</label>
      <input
        id={id}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm kiếm sản phẩm…"
        className="h-full min-w-0 flex-1 border border-r-0 border-input bg-card px-3.5 text-sm outline-none focus-visible:bg-background"
      />
      <button
        type="submit"
        aria-label="Tìm kiếm"
        className="grid aspect-square h-full shrink-0 cursor-pointer place-items-center bg-primary text-primary-foreground transition-colors hover:bg-brand"
      >
        <Search className="size-4.5" />
      </button>
    </form>
  );
}

/** Icon người dùng + hai dòng chữ + dropdown — khớp bố cục: dòng phụ trên, "Tài khoản của tôi ⌄" bên dưới */
function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isStaff = user && ["admin", "staff"].includes(user.role);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 cursor-pointer items-center gap-2 px-2"
      >
        <User className="size-5 shrink-0" />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[11px] text-muted-foreground">
            {user ? `Xin chào, ${user.name.split(" ").slice(-1)[0]}` : "Đăng nhập / Đăng ký"}
          </span>
          <span className="flex items-center gap-1 font-display text-[13px] font-bold">
            Tài khoản của tôi
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-24px)] border border-border bg-background shadow-lg"
        >
          {user ? (
            <>
              <div className="border-b border-border px-4 py-3">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <Link role="menuitem" to="/account" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-secondary">
                <User className="size-4" /> Tài khoản của tôi
              </Link>
              <Link role="menuitem" to="/orders" onClick={() => setOpen(false)} className="flex items-center gap-2.5 border-t border-border px-4 py-3 text-sm hover:bg-secondary">
                <Package className="size-4" /> Đơn hàng của tôi
              </Link>
              {isStaff && (
                <Link role="menuitem" to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2.5 border-t border-border px-4 py-3 text-sm font-semibold text-brand hover:bg-secondary">
                  <ShieldCheck className="size-4" /> Quản trị
                </Link>
              )}
              <button
                role="menuitem"
                onClick={() => { logout(); setOpen(false); navigate("/"); }}
                className="flex w-full cursor-pointer items-center gap-2.5 border-t border-border px-4 py-3 text-left text-sm text-destructive hover:bg-secondary"
              >
                <LogOut className="size-4" /> Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link role="menuitem" to="/login" onClick={() => setOpen(false)} className="block px-4 py-3 text-sm font-semibold hover:bg-secondary">
                Đăng nhập
              </Link>
              <Link role="menuitem" to="/register" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-3 text-sm hover:bg-secondary">
                Đăng ký tài khoản
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CartDrawer() {
  const { items, subtotal, open, setOpen, setQty, remove } = useCart();
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[100] bg-primary/50 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-[101] flex w-full max-w-md flex-col border-l border-border bg-background shadow-xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
        aria-label="Giỏ hàng"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-border py-3 pl-5 pr-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest">Giỏ hàng</h2>
          <button onClick={() => setOpen(false)} aria-label="Đóng giỏ hàng" className={cn(TAP, "cursor-pointer")}>
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              Giỏ hàng trống.
              <div className="mt-4">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/shop" onClick={() => setOpen(false)}>Mua sắm ngay</Link>
                </Button>
              </div>
            </div>
          ) : (
            items.map((i) => (
              <div key={i.key} className="grid grid-cols-[64px_1fr_auto] gap-3 border-b border-border py-3">
                <img src={i.img} alt="" width={64} height={80} className="h-20 w-16 rounded border border-border object-cover" />
                <div>
                  <p className="font-display text-sm font-semibold">{i.title}</p>
                  <p className="text-xs text-muted-foreground">{i.color} / {i.size}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center border border-border">
                      <button className="grid size-9 cursor-pointer place-items-center" onClick={() => setQty(i.key, i.qty - 1)} aria-label={`Giảm số lượng ${i.title}`}>
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold">{i.qty}</span>
                      <button className="grid size-9 cursor-pointer place-items-center" onClick={() => setQty(i.key, i.qty + 1)} aria-label={`Tăng số lượng ${i.title}`}>
                        <Plus className="size-3.5" />
                      </button>
                    </span>
                    <button className={cn(TAP, "cursor-pointer text-muted-foreground hover:text-destructive")} onClick={() => remove(i.key)} aria-label={`Xóa ${i.title}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <span className="font-display text-sm font-bold">{money(i.price * i.qty)}</span>
              </div>
            ))
          )}
        </div>
        {items.length > 0 && (
          <div className="border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            <div className="mb-3 flex justify-between font-display font-bold">
              <span>Tạm tính</span>
              <span>{money(subtotal)}</span>
            </div>
            <Button className="w-full" size="lg" asChild>
              <Link to="/checkout" onClick={() => setOpen(false)}>Thanh toán</Link>
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}

function Header() {
  const { count, setOpen } = useCart();
  const [menu, setMenu] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);

  return (
    <header className="sticky top-0 z-90 border-b border-border bg-background">
      {/* Hàng 1: menu di động · logo góc trái · tìm kiếm · tài khoản · giỏ hàng */}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-4 sm:px-5">
        <button className={cn(TAP, "cursor-pointer lg:hidden")} onClick={() => setMenu(true)} aria-label="Mở menu">
          <Menu className="size-5" />
        </button>

        <LogoLink />

        <div className="hidden flex-1 justify-center px-2 md:flex lg:px-6">
          <HeaderSearch className="max-w-xl" />
        </div>

        <div className="ml-auto flex items-center">
          <button
            className={cn(TAP, "cursor-pointer md:hidden")}
            onClick={() => setMobileSearch((v) => !v)}
            aria-label="Tìm kiếm sản phẩm"
            aria-expanded={mobileSearch}
          >
            <Search className="size-5" />
          </button>
          <AccountMenu />
          <button className={cn(TAP, "relative cursor-pointer")} onClick={() => setOpen(true)} aria-label={`Giỏ hàng, ${count} sản phẩm`}>
            <ShoppingBag className="size-5" />
            {count > 0 && (
              <span className="absolute right-1 top-1 grid min-w-4.5 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4.5 text-white">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Ô tìm kiếm cho mobile — bật/tắt bằng icon kính lúp */}
      {mobileSearch && (
        <div className="border-t border-border px-3 py-3 md:hidden">
          <HeaderSearch />
        </div>
      )}

      {/* Hàng 2: danh mục — chữ thường, dàn đều, desktop hiện đầy đủ, mobile dùng menu burger */}
      <nav className="hidden border-t border-border lg:block" aria-label="Danh mục">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          {NAV.map((n) => (
            <NavLink
              key={n.label}
              to={n.to}
              className="whitespace-nowrap text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* menu di động */}
      <div
        className={cn("fixed inset-0 z-[100] bg-primary/50 transition-opacity lg:hidden", menu ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={() => setMenu(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[101] w-72 border-r border-border bg-background shadow-xl transition-transform duration-300 lg:hidden",
          menu ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Menu di động"
        aria-hidden={!menu}
      >
        <div className="flex items-center justify-between border-b border-border py-3 pl-5 pr-2">
          <span className="font-display font-bold uppercase tracking-widest">Menu</span>
          <button onClick={() => setMenu(false)} aria-label="Đóng menu" className={cn(TAP, "cursor-pointer")}><X className="size-5" /></button>
        </div>
        <MobileMenuLinks onClose={() => setMenu(false)} />
      </aside>
    </header>
  );
}

function MobileMenuLinks({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isStaff = user && ["admin", "staff"].includes(user.role);

  return (
    <nav className="flex h-[calc(100%-57px)] flex-col overflow-y-auto px-5 py-2">
      {NAV.map((n) => (
        <Link key={n.label} to={n.to} onClick={onClose} className="border-b border-border py-4 font-display text-sm font-semibold uppercase tracking-wider">
          {n.label}
        </Link>
      ))}
      <Link to="/about" onClick={onClose} className="border-b border-border py-4 font-display text-sm font-semibold uppercase tracking-wider">
        Về chúng tôi
      </Link>
      <Link to="/contact" onClick={onClose} className="border-b border-border py-4 font-display text-sm font-semibold uppercase tracking-wider">
        Liên hệ
      </Link>
      <Link to={user ? "/account" : "/login"} onClick={onClose} className="border-b border-border py-4 font-display text-sm font-semibold uppercase tracking-wider">
        {user ? "Tài khoản của tôi" : "Đăng nhập / Đăng ký"}
      </Link>
      {user && (
        <Link to="/orders" onClick={onClose} className="border-b border-border py-4 font-display text-sm font-semibold uppercase tracking-wider">
          Đơn hàng của tôi
        </Link>
      )}
      {isStaff && (
        <Link to="/admin" onClick={onClose} className="border-b border-border py-4 font-display text-sm font-semibold uppercase tracking-wider text-brand">
          Quản trị
        </Link>
      )}
      {user && (
        <button
          onClick={() => { logout(); onClose(); navigate("/"); }}
          className="cursor-pointer py-4 text-left font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Đăng xuất
        </button>
      )}
    </nav>
  );
}

/** Thanh điều hướng dưới cùng — chỉ hiện trên mobile, tối đa 4 mục */
function BottomNav() {
  const { count, setOpen } = useCart();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const item = "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold uppercase tracking-wide min-h-14";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-80 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Điều hướng nhanh"
    >
      <Link to="/" className={cn(item, pathname === "/" ? "text-brand" : "text-muted-foreground")}>
        <Home className="size-5" /> Trang chủ
      </Link>
      <Link to="/shop" className={cn(item, pathname === "/shop" ? "text-brand" : "text-muted-foreground")}>
        <Store className="size-5" /> Shop
      </Link>
      <button onClick={() => setOpen(true)} className={cn(item, "relative cursor-pointer text-muted-foreground")} aria-label={`Giỏ hàng, ${count} sản phẩm`}>
        <ShoppingBag className="size-5" />
        {count > 0 && (
          <span className="absolute right-[22%] top-1 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold leading-4 text-white">
            {count}
          </span>
        )}
        Giỏ hàng
      </button>
      <Link to={user ? "/account" : "/login"} className={cn(item, pathname.startsWith("/account") ? "text-brand" : "text-muted-foreground")}>
        <User className="size-5" /> {user ? "Tài khoản" : "Đăng nhập"}
      </Link>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-2xl font-bold">VELATHIER<span className="text-brand">.</span></p>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Thời trang cơ bản làm kỹ — cotton dày dặn, phom chuẩn, đường may bền.
          </p>
        </div>
        <div>
          <h2 className="font-display text-xs font-bold uppercase tracking-[0.16em]">Mua sắm</h2>
          <ul className="mt-2 text-sm text-muted-foreground">
            <li><Link className="inline-block py-2 hover:text-brand" to="/shop?cat=tops">Tops</Link></li>
            <li><Link className="inline-block py-2 hover:text-brand" to="/shop?cat=bottoms">Bottoms</Link></li>
            <li><Link className="inline-block py-2 hover:text-brand" to="/shop?cat=outerwear">Outerwear</Link></li>
            <li><Link className="inline-block py-2 hover:text-brand" to="/shop?cat=accessories">Accessories</Link></li>
            <li><Link className="inline-block py-2 hover:text-brand" to="/shop?tag=sale">Sale</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="font-display text-xs font-bold uppercase tracking-[0.16em]">Hỗ trợ</h2>
          <ul className="mt-2 text-sm text-muted-foreground">
            <li><Link className="inline-block py-2 hover:text-brand" to="/about">Về chúng tôi</Link></li>
            <li><Link className="inline-block py-2 hover:text-brand" to="/contact">Liên hệ</Link></li>
            <li><Link className="inline-block py-2 hover:text-brand" to="/news">Tin tức</Link></li>
            <li><Link className="inline-block py-2 hover:text-brand" to="/orders">Tra cứu đơn hàng</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="font-display text-xs font-bold uppercase tracking-[0.16em]">Chính sách</h2>
          <ul className="mt-2 text-sm text-muted-foreground">
            <li className="py-2">Miễn phí vận chuyển đơn từ {POLICIES.freeShippingThreshold.toLocaleString("vi-VN")}₫</li>
            <li className="py-2">Phí vận chuyển {POLICIES.flatShippingFee.toLocaleString("vi-VN")}₫</li>
            <li className="py-2">Đổi trả trong {POLICIES.returnWindowDays} ngày kể từ khi nhận hàng</li>
            <li><Link className="inline-block py-2 hover:text-brand" to="/contact">Gửi yêu cầu hỗ trợ</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-5 py-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} {SITE.name}</span>
          {hasDirectContact && (
            <span>
              {SITE.email && <a className="hover:text-brand" href={`mailto:${SITE.email}`}>{SITE.email}</a>}
              {SITE.email && SITE.phone && " · "}
              {SITE.phone && <a className="hover:text-brand" href={`tel:${SITE.phone.replace(/\s/g, "")}`}>{SITE.phone}</a>}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

export default function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Ticker />
      <Header />
      {/* pb-14 chừa chỗ cho bottom nav trên mobile */}
      <main className="flex-1 pb-14 lg:pb-0">
        <Outlet />
      </main>
      <CartDrawer />
      <Footer />
      <BottomNav />
    </div>
  );
}

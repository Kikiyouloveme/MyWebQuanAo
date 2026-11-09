import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import Layout from "@/components/layout";
import { Protected } from "@/components/protected";
import { AuthProvider } from "@/context/auth";
import { CartProvider } from "@/context/cart";
import { ToastProvider } from "@/context/toast";
import Home from "@/pages/home"; // eager — là LCP của trang chủ

/* Code-splitting: mỗi route tải riêng, giảm bundle ban đầu */
const Shop = lazy(() => import("@/pages/shop"));
const ProductPage = lazy(() => import("@/pages/product"));
const Checkout = lazy(() => import("@/pages/checkout"));
const Payment = lazy(() => import("@/pages/payment"));
const Login = lazy(() => import("@/pages/login"));
const Register = lazy(() => import("@/pages/register"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const VerifyEmail = lazy(() => import("@/pages/verify-email"));
const Account = lazy(() => import("@/pages/account"));
const Orders = lazy(() => import("@/pages/orders"));
const OrderDetail = lazy(() => import("@/pages/order-detail"));
const Admin = lazy(() => import("@/pages/admin"));
const DesignStudio = lazy(() => import("@/pages/design-studio"));
const Designs = lazy(() => import("@/pages/designs"));

const About = lazy(() => import("@/pages/content").then((m) => ({ default: m.About })));
const Contact = lazy(() => import("@/pages/content").then((m) => ({ default: m.Contact })));
const News = lazy(() => import("@/pages/content").then((m) => ({ default: m.News })));
const NotFound = lazy(() => import("@/pages/content").then((m) => ({ default: m.NotFound })));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/** Skeleton trong lúc chunk route đang tải — giữ chiều cao để tránh layout shift */
function RouteFallback() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-16" aria-busy="true" aria-live="polite">
      <div className="h-10 w-64 animate-pulse rounded bg-muted" />
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[3/4.6] animate-pulse rounded bg-muted" />
        ))}
      </div>
      <span className="sr-only">Đang tải trang…</span>
    </div>
  );
}

/** Bọc route lazy cho gọn */
const page = (node: React.ReactNode) => <Suspense fallback={<RouteFallback />}>{node}</Suspense>;

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <ScrollTop />
            <Routes>
              <Route element={<Layout />}>
                {/* Công khai */}
                <Route index element={<Home />} />
                <Route path="/shop" element={page(<Shop />)} />
                <Route path="/product/:id" element={page(<ProductPage />)} />
                <Route path="/about" element={page(<About />)} />
                <Route path="/contact" element={page(<Contact />)} />
                <Route path="/news" element={page(<News />)} />

                {/* Xác thực */}
                <Route path="/login" element={page(<Login />)} />
                <Route path="/register" element={page(<Register />)} />
                <Route path="/forgot-password" element={page(<ForgotPassword />)} />
                <Route path="/verify-email" element={page(<VerifyEmail />)} />

                {/* Cần đăng nhập */}
                <Route path="/checkout" element={page(<Checkout />)} />
                <Route path="/payment/:orderId" element={<Protected>{page(<Payment />)}</Protected>} />
                <Route path="/account" element={<Protected>{page(<Account />)}</Protected>} />
                <Route path="/orders" element={<Protected>{page(<Orders />)}</Protected>} />
                <Route path="/designs" element={page(<Designs />)} />
                <Route path="/designs/new" element={page(<DesignStudio />)} />
                <Route path="/designs/:id" element={page(<DesignStudio />)} />
                <Route path="/orders/:id" element={<Protected>{page(<OrderDetail />)}</Protected>} />

                {/* Quản trị */}
                <Route path="/admin" element={<Protected roles={["admin", "staff"]}>{page(<Admin />)}</Protected>} />

                <Route path="*" element={page(<NotFound />)} />
              </Route>
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

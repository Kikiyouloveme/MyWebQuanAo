import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth";
import type { Role } from "@/lib/api";

/**
 * Chặn route theo vai trò.
 * Đây chỉ là lớp bảo vệ giao diện — mọi API tương ứng đều tự kiểm tra quyền ở server,
 * nên bỏ qua lớp này cũng không truy cập được dữ liệu.
 */
export function Protected({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Đang kiểm tra phiên đăng nhập…</span>
      </div>
    );
  }

  // Nhớ trang đích để sau khi đăng nhập quay lại đúng chỗ
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="font-display text-3xl font-bold uppercase">
          Không đủ quyền<span className="text-brand">.</span>
        </h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Tài khoản <b className="text-foreground">{user.email}</b> không được phép truy cập khu vực này.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild><a href="/">Về trang chủ</a></Button>
          <Button variant="outline" asChild><a href="/account">Tài khoản của tôi</a></Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

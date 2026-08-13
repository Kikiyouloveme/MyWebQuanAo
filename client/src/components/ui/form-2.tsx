"use client";

/**
 * Form đăng ký workspace (chuyển thể từ 21st.dev FormLayout01, Việt hóa)
 * — nối thẳng vào API /api/auth/register, thêm trường mật khẩu.
 */
import * as React from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/auth";

export default function FormLayout01() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) || "").trim();

    if (get("password").length < 6) return setErr("Mật khẩu tối thiểu 6 ký tự.");
    if (get("password") !== get("confirm-password")) return setErr("Mật khẩu nhập lại không khớp.");

    setBusy(true);
    try {
      await register({
        name: `${get("first-name")} ${get("last-name")}`.trim(),
        email: get("email"),
        password: get("password"),
        profile: {
          address: get("address"),
          city: get("city"),
          state: get("state"),
          postalCode: get("postal-code"),
        },
      });
      navigate("/account");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Đăng ký thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-center p-10 max-sm:p-4">
      <div className="w-full sm:mx-auto sm:max-w-2xl">
        <h3 className="text-2xl font-semibold text-foreground uppercase">
          Đăng ký tài khoản<span className="text-brand">.</span>
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Dành vài phút để tạo tài khoản VELATHIER — nhận ưu đãi 10% cho đơn hàng đầu tiên.
        </p>
        <form onSubmit={onSubmit} className="mt-8">
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
            <div className="col-span-full sm:col-span-3">
              <Label htmlFor="first-name" className="text-sm font-medium text-foreground">
                Họ<span className="text-red-500">*</span>
              </Label>
              <Input
                type="text"
                id="first-name"
                name="first-name"
                autoComplete="family-name"
                placeholder="Nguyễn"
                className="mt-2"
                required
              />
            </div>
            <div className="col-span-full sm:col-span-3">
              <Label htmlFor="last-name" className="text-sm font-medium text-foreground">
                Tên<span className="text-red-500">*</span>
              </Label>
              <Input
                type="text"
                id="last-name"
                name="last-name"
                autoComplete="given-name"
                placeholder="Văn A"
                className="mt-2"
                required
              />
            </div>
            <div className="col-span-full">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Email<span className="text-red-500">*</span>
              </Label>
              <Input
                type="email"
                id="email"
                name="email"
                autoComplete="email"
                placeholder="ban@email.com"
                className="mt-2"
                required
              />
            </div>
            <div className="col-span-full sm:col-span-3">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Mật khẩu<span className="text-red-500">*</span>
              </Label>
              <Input
                type="password"
                id="password"
                name="password"
                autoComplete="new-password"
                placeholder="Tối thiểu 6 ký tự"
                className="mt-2"
                required
                minLength={6}
              />
            </div>
            <div className="col-span-full sm:col-span-3">
              <Label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
                Nhập lại mật khẩu<span className="text-red-500">*</span>
              </Label>
              <Input
                type="password"
                id="confirm-password"
                name="confirm-password"
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu"
                className="mt-2"
                required
              />
            </div>
            <div className="col-span-full">
              <Label htmlFor="address" className="text-sm font-medium text-foreground">
                Địa chỉ
              </Label>
              <Input
                type="text"
                id="address"
                name="address"
                autoComplete="street-address"
                placeholder="Số nhà, tên đường…"
                className="mt-2"
              />
            </div>
            <div className="col-span-full sm:col-span-2">
              <Label htmlFor="city" className="text-sm font-medium text-foreground">
                Quận / Huyện
              </Label>
              <Input
                type="text"
                id="city"
                name="city"
                autoComplete="address-level2"
                placeholder="Quận 1"
                className="mt-2"
              />
            </div>
            <div className="col-span-full sm:col-span-2">
              <Label htmlFor="state" className="text-sm font-medium text-foreground">
                Tỉnh / Thành phố
              </Label>
              <Input
                type="text"
                id="state"
                name="state"
                autoComplete="address-level1"
                placeholder="TP. Hồ Chí Minh"
                className="mt-2"
              />
            </div>
            <div className="col-span-full sm:col-span-2">
              <Label htmlFor="postal-code" className="text-sm font-medium text-foreground">
                Mã bưu chính
              </Label>
              <Input
                id="postal-code"
                name="postal-code"
                autoComplete="postal-code"
                placeholder="700000"
                className="mt-2"
              />
            </div>
          </div>

          {err && (
            <p role="alert" className="mt-4 text-sm font-medium text-destructive">
              {err}
            </p>
          )}

          <Separator className="my-6" />
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Đã có tài khoản?{" "}
              <Link to="/login" className="font-semibold text-brand hover:underline">
                Đăng nhập
              </Link>
            </p>
            <div className="flex items-center space-x-4">
              <Button type="button" variant="outline" className="whitespace-nowrap" asChild>
                <Link to="/">Hủy</Link>
              </Button>
              <Button type="submit" className="whitespace-nowrap" disabled={busy}>
                {busy ? "Đang tạo…" : "Đăng ký"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

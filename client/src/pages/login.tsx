import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthShell, AuthMessage, DarkButton, darkInput, darkLabel } from "@/components/auth/auth-shell";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Quay lại đúng trang người dùng đang định vào trước khi bị chặn (vd /checkout)
  const redirectTo = location.state?.from;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const user = await login(String(form.get("email")), String(form.get("password")));
      navigate(redirectTo || (["admin", "staff"].includes(user.role) ? "/admin" : "/account"), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể đăng nhập. Vui lòng thử lại.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Đăng nhập"
      subtitle="Nhập thông tin tài khoản để tiếp tục mua sắm."
      footer={
        <>
          Chưa có tài khoản?{" "}
          <Link to="/register" className="font-semibold text-zinc-100 underline-offset-4 hover:text-[#c14d21] hover:underline">
            Đăng ký ngay
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="email" className={darkLabel}>Email</label>
          <input
            id="email" name="email" type="email" required
            autoComplete="email" placeholder="ban@email.com"
            className={darkInput} aria-invalid={!!error}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-zinc-300">Mật khẩu</label>
            <Link
              to="/forgot-password"
              className="text-sm text-zinc-400 underline-offset-4 transition-colors hover:text-[#c14d21] hover:underline"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password" name="password" required
              type={showPassword ? "text" : "password"}
              autoComplete="current-password" placeholder="••••••••"
              className={`${darkInput} pr-12`} aria-invalid={!!error}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center text-zinc-500 hover:text-zinc-300"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {error && <AuthMessage tone="error">{error}</AuthMessage>}

        <DarkButton type="submit" disabled={busy}>
          {busy ? <><Loader2 className="size-4 animate-spin" /> Đang đăng nhập…</> : "Đăng nhập"}
        </DarkButton>
      </form>
    </AuthShell>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Check } from "lucide-react";
import { AuthShell, AuthMessage, DarkButton, darkInput, darkLabel } from "@/components/auth/auth-shell";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Các điều kiện mật khẩu — khớp đúng với validate ở server */
const RULES = [
  { label: "Tối thiểu 8 ký tự", test: (p: string) => p.length >= 8 },
  { label: "Có ít nhất một chữ cái", test: (p: string) => /[a-zA-Z]/.test(p) },
  { label: "Có ít nhất một chữ số", test: (p: string) => /\d/.test(p) },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const allRulesPassed = RULES.every((r) => r.test(password));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const get = (k: string) => String(form.get(k) || "").trim();

    if (!allRulesPassed) return setError("Mật khẩu chưa đáp ứng đủ điều kiện bên dưới.");
    if (password !== get("confirmPassword")) return setError("Mật khẩu nhập lại không khớp.");

    setBusy(true);
    try {
      await register({
        name: `${get("lastName")} ${get("firstName")}`.trim(),
        email: get("email"),
        phone: get("phone") || undefined,
        password,
      });
      // Tài khoản mới chưa xác minh email — đưa thẳng tới bước xác minh
      navigate("/verify-email", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể tạo tài khoản. Vui lòng thử lại.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Tạo tài khoản"
      subtitle="Đăng ký để theo dõi đơn hàng và nhận ưu đãi dành riêng cho thành viên."
      wide
      footer={
        <>
          Đã có tài khoản?{" "}
          <Link to="/login" className="font-semibold text-zinc-100 underline-offset-4 hover:text-[#c14d21] hover:underline">
            Đăng nhập
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="lastName" className={darkLabel}>Họ <span className="text-[#c14d21]">*</span></label>
            <input id="lastName" name="lastName" required autoComplete="family-name" placeholder="Nguyễn" className={darkInput} />
          </div>
          <div>
            <label htmlFor="firstName" className={darkLabel}>Tên <span className="text-[#c14d21]">*</span></label>
            <input id="firstName" name="firstName" required autoComplete="given-name" placeholder="Văn A" className={darkInput} />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className={darkLabel}>Email <span className="text-[#c14d21]">*</span></label>
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="ban@email.com" className={darkInput} />
          </div>
          <div>
            <label htmlFor="phone" className={darkLabel}>Số điện thoại</label>
            <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0901234567" className={darkInput} />
          </div>
        </div>

        <div>
          <label htmlFor="password" className={darkLabel}>Mật khẩu <span className="text-[#c14d21]">*</span></label>
          <div className="relative">
            <input
              id="password" name="password" required
              type={showPassword ? "text" : "password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password" placeholder="••••••••"
              className={`${darkInput} pr-12`}
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

          {password && (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-3">
              {RULES.map((rule) => {
                const passed = rule.test(password);
                return (
                  <li key={rule.label} className={cn("flex items-center gap-1.5 text-xs", passed ? "text-emerald-400" : "text-zinc-500")}>
                    <Check className={cn("size-3.5 shrink-0", !passed && "opacity-30")} />
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className={darkLabel}>Nhập lại mật khẩu <span className="text-[#c14d21]">*</span></label>
          <input
            id="confirmPassword" name="confirmPassword" required
            type={showPassword ? "text" : "password"}
            autoComplete="new-password" placeholder="••••••••" className={darkInput}
          />
        </div>

        {error && <AuthMessage tone="error">{error}</AuthMessage>}

        <DarkButton type="submit" disabled={busy}>
          {busy ? <><Loader2 className="size-4 animate-spin" /> Đang tạo tài khoản…</> : "Tạo tài khoản"}
        </DarkButton>

        <p className="text-center text-xs leading-relaxed text-zinc-500">
          Sau khi đăng ký, chúng tôi sẽ gửi mã xác minh tới email của bạn.
        </p>
      </form>
    </AuthShell>
  );
}

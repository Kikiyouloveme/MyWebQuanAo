import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Loader2, Check, MailCheck } from "lucide-react";
import { AuthShell, AuthMessage, DarkButton, darkInput, darkLabel } from "@/components/auth/auth-shell";
import { OtpInput } from "@/components/auth/otp-input";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Step = "email" | "otp" | "password" | "done";

const RULES = [
  { label: "Tối thiểu 8 ký tự", test: (p: string) => p.length >= 8 },
  { label: "Có ít nhất một chữ cái", test: (p: string) => /[a-zA-Z]/.test(p) },
  { label: "Có ít nhất một chữ số", test: (p: string) => /\d/.test(p) },
];

const OTP_TTL_SECONDS = 10 * 60;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Đếm ngược hiệu lực mã và thời gian chờ gửi lại
  const [expiresIn, setExpiresIn] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (step !== "otp") return;
    timerRef.current = window.setInterval(() => {
      setExpiresIn((v) => Math.max(0, v - 1));
      setResendIn((v) => Math.max(0, v - 1));
    }, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [step]);

  const mmss = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  /* ---------------- bước 1: gửi mã ---------------- */
  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError(""); setNotice("");
    setBusy(true);
    try {
      const res = await api.post<{ message: string; cooldown?: number }>("/api/auth/forgot-password", { email });
      setNotice(res.message);
      setStep("otp");
      setCode("");
      setExpiresIn(OTP_TTL_SECONDS);
      setResendIn(res.cooldown ?? 60);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không gửi được mã xác minh. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- bước 2: xác minh mã ---------------- */
  async function verifyOtp(submitted?: string) {
    const value = submitted ?? code;
    if (value.length !== 6) return setError("Vui lòng nhập đủ 6 chữ số.");
    setError(""); setNotice("");
    setBusy(true);
    try {
      const res = await api.post<{ ticket: string }>("/api/auth/forgot-password/verify", { email, code: value });
      setTicket(res.ticket);
      setStep("password");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mã xác minh không hợp lệ.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- bước 3: đặt mật khẩu mới ---------------- */
  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!RULES.every((r) => r.test(password))) return setError("Mật khẩu chưa đáp ứng đủ điều kiện bên dưới.");
    if (password !== confirmPassword) return setError("Mật khẩu nhập lại không khớp.");

    setBusy(true);
    try {
      await api.post("/api/auth/forgot-password/reset", { email, password, confirmPassword, ticket });
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không đặt lại được mật khẩu.");
    } finally {
      setBusy(false);
    }
  }

  const backToSignIn = (
    <Link
      to="/login"
      className="inline-flex items-center gap-1.5 text-sm text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-100 hover:underline"
    >
      <ArrowLeft className="size-4" /> Quay lại đăng nhập
    </Link>
  );

  const stepBadge = (
    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
      Bước {step === "email" ? 1 : step === "otp" ? 2 : 3} / 3
    </span>
  );

  /* ---------------- bước 1 ---------------- */
  if (step === "email") {
    return (
      <AuthShell
        title="Quên mật khẩu"
        subtitle="Nhập email đã đăng ký, chúng tôi sẽ gửi mã xác minh gồm 6 chữ số."
        eyebrow={stepBadge}
        footer={backToSignIn}
      >
        <form onSubmit={requestOtp} className="space-y-5" noValidate>
          <div>
            <label htmlFor="email" className={darkLabel}>Email</label>
            <input
              id="email" type="email" required autoFocus
              autoComplete="email" placeholder="ban@email.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className={darkInput} aria-invalid={!!error}
            />
          </div>

          {error && <AuthMessage tone="error">{error}</AuthMessage>}

          <DarkButton type="submit" disabled={busy || !email.trim()}>
            {busy ? <><Loader2 className="size-4 animate-spin" /> Đang gửi…</> : "Gửi mã xác minh"}
          </DarkButton>
        </form>
      </AuthShell>
    );
  }

  /* ---------------- bước 2 ---------------- */
  if (step === "otp") {
    return (
      <AuthShell
        title="Nhập mã xác minh"
        subtitle={`Chúng tôi đã gửi mã 6 chữ số tới ${email}. Mã có hiệu lực trong 10 phút.`}
        eyebrow={stepBadge}
        footer={backToSignIn}
      >
        <div className="space-y-5">
          {notice && <AuthMessage tone="info">{notice}</AuthMessage>}

          <OtpInput
            value={code}
            onChange={(v) => { setCode(v); setError(""); }}
            onComplete={verifyOtp}
            disabled={busy}
            invalid={!!error}
            autoFocus
          />

          <p className="text-center text-sm text-zinc-500">
            {expiresIn > 0
              ? <>Mã hết hạn sau <span className="font-medium text-zinc-300">{mmss(expiresIn)}</span></>
              : <span className="text-red-400">Mã đã hết hạn, vui lòng gửi lại.</span>}
          </p>

          {error && <AuthMessage tone="error">{error}</AuthMessage>}

          <DarkButton onClick={() => verifyOtp()} disabled={busy || code.length !== 6}>
            {busy ? <><Loader2 className="size-4 animate-spin" /> Đang kiểm tra…</> : "Xác minh"}
          </DarkButton>

          <div className="flex items-center justify-between gap-3 text-sm">
            <button
              type="button"
              onClick={() => { setStep("email"); setError(""); setNotice(""); }}
              className="cursor-pointer text-zinc-400 underline-offset-4 hover:text-zinc-100 hover:underline"
            >
              Đổi email khác
            </button>
            <button
              type="button"
              onClick={() => requestOtp()}
              disabled={busy || resendIn > 0}
              className="cursor-pointer text-zinc-400 underline-offset-4 hover:text-zinc-100 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline"
            >
              {resendIn > 0 ? `Gửi lại sau ${resendIn}s` : "Gửi lại mã"}
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  /* ---------------- bước 3 ---------------- */
  if (step === "password") {
    return (
      <AuthShell
        title="Đặt mật khẩu mới"
        subtitle="Chọn mật khẩu mới cho tài khoản của bạn."
        eyebrow={stepBadge}
        footer={backToSignIn}
      >
        <form onSubmit={resetPassword} className="space-y-5" noValidate>
          <div>
            <label htmlFor="new-password" className={darkLabel}>Mật khẩu mới</label>
            <div className="relative">
              <input
                id="new-password" required autoFocus
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
              <ul className="mt-3 space-y-1.5">
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
            <label htmlFor="confirm-password" className={darkLabel}>Nhập lại mật khẩu mới</label>
            <input
              id="confirm-password" required
              type={showPassword ? "text" : "password"}
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password" placeholder="••••••••" className={darkInput}
            />
          </div>

          {error && <AuthMessage tone="error">{error}</AuthMessage>}

          <DarkButton type="submit" disabled={busy}>
            {busy ? <><Loader2 className="size-4 animate-spin" /> Đang cập nhật…</> : "Đặt lại mật khẩu"}
          </DarkButton>
        </form>
      </AuthShell>
    );
  }

  /* ---------------- hoàn tất ---------------- */
  return (
    <AuthShell title="Đã đổi mật khẩu" subtitle="Bạn có thể đăng nhập bằng mật khẩu mới ngay bây giờ.">
      <div className="space-y-6 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
          <MailCheck className="size-7 text-emerald-400" />
        </div>
        <p className="text-sm leading-relaxed text-zinc-400">
          Mật khẩu của tài khoản <span className="text-zinc-200">{email}</span> đã được cập nhật.
          Mọi phiên đăng nhập cũ đã được đăng xuất để đảm bảo an toàn.
        </p>
        <DarkButton onClick={() => navigate("/login", { replace: true })}>Đăng nhập</DarkButton>
      </div>
    </AuthShell>
  );
}

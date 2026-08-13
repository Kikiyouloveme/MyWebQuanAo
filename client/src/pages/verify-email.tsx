import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { AuthShell, AuthMessage, DarkButton } from "@/components/auth/auth-shell";
import { OtpInput } from "@/components/auth/otp-input";
import { useAuth } from "@/context/auth";
import { api, ApiError, type User } from "@/lib/api";

/**
 * Xác minh email bằng mã OTP. Bắt buộc hoàn tất trước khi đặt hàng.
 * Vào thẳng URL này khi chưa đăng nhập sẽ được chuyển về trang đăng nhập.
 */
export default function VerifyEmail() {
  const { user, ready, setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const sentOnce = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) { navigate("/login", { replace: true, state: { from: "/verify-email" } }); return; }
    if (user.emailVerified) { navigate(next || "/account", { replace: true }); return; }

    // Gửi mã ngay khi vào trang (chỉ một lần cho mỗi lần mở)
    if (!sentOnce.current) {
      sentOnce.current = true;
      sendCode(true);
    }
  }, [ready, user, next, navigate]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function sendCode(silent = false) {
    if (!silent) { setBusy(true); setError(""); }
    try {
      await api.post("/api/auth/verify-email/send");
      setNotice(`Mã xác minh đã được gửi tới ${user?.email}. Mã có hiệu lực trong 10 phút.`);
      setResendIn(60);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setNotice(err.message);
        setResendIn(60);
      } else if (!silent) {
        setError(err instanceof ApiError ? err.message : "Không gửi được mã xác minh.");
      }
    } finally {
      if (!silent) setBusy(false);
    }
  }

  async function verify(submitted?: string) {
    const value = submitted ?? code;
    if (value.length !== 6) return setError("Vui lòng nhập đủ 6 chữ số.");
    setBusy(true); setError("");
    try {
      const res = await api.post<{ user: User }>("/api/auth/verify-email/confirm", { code: value });
      setUser(res.user);
      navigate(next || "/account", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mã xác minh không hợp lệ.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !user) {
    return (
      <AuthShell title="Đang tải…">
        <div className="flex justify-center py-6"><Loader2 className="size-6 animate-spin text-zinc-500" /></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Xác minh email"
      subtitle={`Nhập mã 6 chữ số đã gửi tới ${user.email} để kích hoạt tài khoản.`}
      eyebrow={
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
          <ShieldCheck className="size-3.5" /> Bắt buộc trước khi đặt hàng
        </span>
      }
      footer={
        <Link to="/shop" className="text-sm text-zinc-400 underline-offset-4 hover:text-zinc-100 hover:underline">
          Để sau, tiếp tục xem sản phẩm
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="mx-auto grid size-14 place-items-center rounded-full border border-zinc-700 bg-zinc-800/50">
          <MailCheck className="size-7 text-[#c14d21]" />
        </div>

        {notice && <AuthMessage tone="info">{notice}</AuthMessage>}

        <OtpInput
          value={code}
          onChange={(v) => { setCode(v); setError(""); }}
          onComplete={verify}
          disabled={busy}
          invalid={!!error}
          autoFocus
        />

        {error && <AuthMessage tone="error">{error}</AuthMessage>}

        <DarkButton onClick={() => verify()} disabled={busy || code.length !== 6}>
          {busy ? <><Loader2 className="size-4 animate-spin" /> Đang kiểm tra…</> : "Xác minh email"}
        </DarkButton>

        <div className="text-center">
          <button
            type="button"
            onClick={() => sendCode()}
            disabled={busy || resendIn > 0}
            className="cursor-pointer text-sm text-zinc-400 underline-offset-4 hover:text-zinc-100 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline"
          >
            {resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : "Chưa nhận được mã? Gửi lại"}
          </button>
        </div>
      </div>
    </AuthShell>
  );
}

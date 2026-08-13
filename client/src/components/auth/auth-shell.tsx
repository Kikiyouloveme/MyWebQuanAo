import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/lib/use-page-meta";

/**
 * Khung nền cho các trang xác thực: nền zinc tối, card ở giữa,
 * đường accent mảnh và các hạt sáng chuyển động chậm.
 *
 * Nền tối chỉ dùng cho khu vực xác thực — phần còn lại của website giữ nguyên
 * tông giấy sáng của thương hiệu.
 */

/** Hạt sáng nền — vị trí sinh một lần rồi giữ nguyên để không nhảy khi re-render */
function Particles({ count = 26 }: { count?: number }) {
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 2 + 1,
        delay: Math.random() * 8,
        duration: Math.random() * 6 + 9,
        opacity: Math.random() * 0.35 + 0.08,
      })),
    [count]
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {dots.map((d) => (
        <span
          key={d.id}
          className="absolute rounded-full bg-zinc-300 motion-safe:animate-[particle-drift_linear_infinite]"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            opacity: d.opacity,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Nội dung phụ hiển thị trên tiêu đề, ví dụ chỉ báo bước */
  eyebrow?: ReactNode;
  wide?: boolean;
}

export function AuthShell({ title, subtitle, children, footer, eyebrow, wide }: AuthShellProps) {
  // Trang xác thực là khu vực riêng tư — không cho công cụ tìm kiếm lập chỉ mục
  usePageMeta({ title: `${title} — VELATHIER`, description: subtitle, noIndex: true });

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden bg-zinc-950 px-4 py-14">
      {/* nền: lưới mờ + quầng sáng + hạt */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(to right, #3f3f46 1px, transparent 1px), linear-gradient(to bottom, #3f3f46 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-72 w-[36rem] -translate-x-1/2 rounded-full blur-3xl"
        aria-hidden="true"
        style={{ background: "radial-gradient(circle, rgba(193,77,33,.16), transparent 70%)" }}
      />
      <Particles />

      <div className={cn("relative w-full motion-safe:animate-[fade-up_.5s_ease-out]", wide ? "max-w-2xl" : "max-w-md")}>
        {/* đường accent phía trên card */}
        <div className="mx-auto mb-px h-px w-2/3 bg-gradient-to-r from-transparent via-[#c14d21] to-transparent" />

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-7 shadow-2xl backdrop-blur-sm sm:p-9">
          <div className="mb-7 text-center">
            <Link
              to="/"
              className="inline-flex font-display text-2xl font-bold tracking-tight text-zinc-50"
              aria-label="VELATHIER — về trang chủ"
            >
              VELATHIER<span className="text-[#c14d21]">.</span>
            </Link>
            {eyebrow && <div className="mt-4">{eyebrow}</div>}
            <h1 className="mt-4 font-display text-xl font-semibold text-zinc-50">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-relaxed text-zinc-400">{subtitle}</p>}
          </div>

          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-zinc-400">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- các thành phần form trên nền tối ---------------- */

export const darkInput =
  "h-11 w-full rounded-md border border-zinc-700 bg-zinc-950/60 px-3.5 text-[15px] text-zinc-100 " +
  "placeholder:text-zinc-600 outline-none transition-colors " +
  "focus-visible:border-[#c14d21] focus-visible:ring-[3px] focus-visible:ring-[#c14d21]/25 " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-[invalid=true]:border-red-500/70 aria-[invalid=true]:ring-red-500/20";

export const darkLabel = "mb-2 block text-sm font-medium text-zinc-300";

export function DarkButton({
  className, children, variant = "primary", ...props
}: React.ComponentProps<"button"> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-semibold",
        "transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-[#c14d21]/40",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary"
          ? "bg-zinc-50 text-zinc-950 hover:bg-[#c14d21] hover:text-white"
          : "border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Thông báo lỗi/thành công dùng chung trong khu vực xác thực */
export function AuthMessage({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  if (!children) return null;
  const tones = {
    error: "border-red-500/30 bg-red-500/10 text-red-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    info: "border-zinc-700 bg-zinc-800/50 text-zinc-300",
  };
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-md border px-3.5 py-2.5 text-sm leading-relaxed", tones[tone])}
    >
      {children}
    </p>
  );
}

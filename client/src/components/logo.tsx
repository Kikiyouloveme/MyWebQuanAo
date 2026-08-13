import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Biểu tượng Velathier: khung vuông brutalist với nét "V" cắt xuyên
 * và một ô vuông cam nhỏ ở đỉnh — gợi liên tưởng đến khuy áo / mũi kim may.
 * Vẽ bằng currentColor để đổi màu theo theme (sáng/tối) không cần asset riêng.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="2.5" y="2.5" width="43" height="43" rx="2" stroke="currentColor" strokeWidth="3" />
      <path d="M13 13 L24 33 L35 13" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square" strokeLinejoin="miter" />
      <rect x="21" y="6.5" width="6" height="6" fill="#c14d21" />
    </svg>
  );
}

export function Logo({ className, markClassName, textClassName }: { className?: string; markClassName?: string; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={cn("size-8 shrink-0 text-primary", markClassName)} />
      <span className={cn("font-display text-xl font-bold tracking-tight sm:text-2xl", textClassName)}>
        VELATHIER<span className="text-brand">.</span>
      </span>
    </span>
  );
}

/** Logo bọc sẵn trong Link, dùng ở góc trên trái header */
export function LogoLink({ className }: { className?: string }) {
  return (
    <Link to="/" aria-label="VELATHIER — về trang chủ" className={cn("flex min-h-11 shrink-0 items-center", className)}>
      <Logo />
    </Link>
  );
}

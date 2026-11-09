import { cn } from "@/lib/utils";

/**
 * 4 mẫu ảnh đại diện dựng sẵn (kiểu "boring avatars" — hình khối + màu ngẫu nhiên).
 * id khớp 1:1 với avatarId lưu ở backend (server/routes/auth.js AVATAR_COUNT).
 * Không cho khách tải ảnh lên — tránh phải kiểm duyệt nội dung ảnh đại diện.
 *
 * File này CHỦ Ý không phụ thuộc "motion" — layout.tsx và admin.tsx tải avatar
 * ngay từ đầu (không lazy), nên mọi thư viện animation phải nằm ở avatar-picker.tsx
 * (chỉ trang Tài khoản mới tải) để không kéo cân nặng vào bundle chính.
 */
export interface AvatarDef {
  id: number;
  svg: React.ReactNode;
  alt: string;
}

export const AVATARS: AvatarDef[] = [
  {
    id: 1,
    alt: "Ảnh đại diện hồng cam",
    svg: (
      <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40" role="img" aria-hidden="true">
        <mask id="avatar-mask-1" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36">
          <rect width="36" height="36" rx="72" fill="#FFFFFF" />
        </mask>
        <g mask="url(#avatar-mask-1)">
          <rect width="36" height="36" fill="#ff005b" />
          <rect x="0" y="0" width="36" height="36" transform="translate(9 -5) rotate(219 18 18) scale(1)" fill="#ffb238" rx="6" />
          <g transform="translate(4.5 -4) rotate(9 18 18)">
            <path d="M15 19c2 1 4 1 6 0" stroke="#000000" fill="none" strokeLinecap="round" />
            <rect x="10" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#000000" />
            <rect x="24" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#000000" />
          </g>
        </g>
      </svg>
    ),
  },
  {
    id: 2,
    alt: "Ảnh đại diện cam tím",
    svg: (
      <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40" role="img" aria-hidden="true">
        <mask id="avatar-mask-2" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36">
          <rect width="36" height="36" rx="72" fill="#FFFFFF" />
        </mask>
        <g mask="url(#avatar-mask-2)">
          <rect width="36" height="36" fill="#ff7d10" />
          <rect x="0" y="0" width="36" height="36" transform="translate(5 -1) rotate(55 18 18) scale(1.1)" fill="#0a0310" rx="6" />
          <g transform="translate(7 -6) rotate(-5 18 18)">
            <path d="M15 20c2 1 4 1 6 0" stroke="#FFFFFF" fill="none" strokeLinecap="round" />
            <rect x="14" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF" />
            <rect x="20" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF" />
          </g>
        </g>
      </svg>
    ),
  },
  {
    id: 3,
    alt: "Ảnh đại diện đen hồng",
    svg: (
      <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40" role="img" aria-hidden="true">
        <mask id="avatar-mask-3" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36">
          <rect width="36" height="36" rx="72" fill="#FFFFFF" />
        </mask>
        <g mask="url(#avatar-mask-3)">
          <rect width="36" height="36" fill="#0a0310" />
          <rect x="0" y="0" width="36" height="36" transform="translate(-3 7) rotate(227 18 18) scale(1.2)" fill="#ff005b" rx="36" />
          <g transform="translate(-3 3.5) rotate(7 18 18)">
            <path d="M13,21 a1,0.75 0 0,0 10,0" fill="#FFFFFF" />
            <rect x="12" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF" />
            <rect x="22" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF" />
          </g>
        </g>
      </svg>
    ),
  },
  {
    id: 4,
    alt: "Ảnh đại diện xanh lá",
    svg: (
      <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40" role="img" aria-hidden="true">
        <mask id="avatar-mask-4" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36">
          <rect width="36" height="36" rx="72" fill="#FFFFFF" />
        </mask>
        <g mask="url(#avatar-mask-4)">
          <rect width="36" height="36" fill="#d8fcb3" />
          <rect x="0" y="0" width="36" height="36" transform="translate(9 -5) rotate(219 18 18) scale(1)" fill="#89fcb3" rx="6" />
          <g transform="translate(4.5 -4) rotate(9 18 18)">
            <path d="M15 19c2 1 4 1 6 0" stroke="#000000" fill="none" strokeLinecap="round" />
            <rect x="10" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#000000" />
            <rect x="24" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#000000" />
          </g>
        </g>
      </svg>
    ),
  },
];

export const avatarById = (id: number) => AVATARS.find((a) => a.id === id) ?? AVATARS[0];

/** Vòng tròn ảnh đại diện đơn giản — dùng ở header, bảng khách hàng, mọi nơi chỉ cần hiển thị */
export function AvatarGlyph({ avatarId, size = 32, className }: { avatarId: number; size?: number; className?: string }) {
  const avatar = avatarById(avatarId);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={avatar.alt}
    >
      <span style={{ width: size, height: size }} className="[&_svg]:h-full [&_svg]:w-full">
        {avatar.svg}
      </span>
    </span>
  );
}

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { AVATARS, avatarById } from "@/components/ui/avatar-glyph";

const pickerVariants = {
  container: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
  },
  item: {
    initial: { y: 16, opacity: 0 },
    animate: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 300, damping: 20 } },
  },
};

interface AvatarPickerProps {
  /** avatarId đang được chọn */
  value: number;
  /** Gọi khi khách bấm chọn một mẫu khác */
  onSelect: (avatarId: number) => void;
  /** Khoá thao tác trong lúc đang lưu lên server */
  busy?: boolean;
}

/**
 * Bộ chọn ảnh đại diện — component có kiểm soát (controlled), không tự lưu trạng thái
 * hay gọi API. Nơi dùng (trang Tài khoản) chịu trách nhiệm gọi PUT /api/auth/avatar
 * rồi truyền avatarId mới xuống qua `value`.
 *
 * Dùng "motion" cho hiệu ứng chọn — component này chỉ nên import ở những trang đã
 * được code-split (route lazy), không import ở layout.tsx/App.tsx để tránh kéo
 * thư viện animation vào bundle tải ngay từ đầu. Cần hiển thị avatar tĩnh (không cần
 * hiệu ứng) thì dùng AvatarGlyph từ avatar-glyph.tsx.
 */
export function AvatarPicker({ value, onSelect, busy }: AvatarPickerProps) {
  const selected = avatarById(value);

  return (
    <motion.div initial="initial" animate="animate" className="flex flex-col items-center gap-4">
      {/* Ảnh đại diện đang chọn, phóng to */}
      <motion.div
        key={selected.id}
        className="relative flex size-24 items-center justify-center overflow-hidden rounded-full border-2 border-brand bg-card"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <div className="flex size-full scale-[2.6] items-center justify-center">{selected.svg}</div>
      </motion.div>

      {/* Danh sách để chọn */}
      <motion.div className="flex flex-wrap justify-center gap-2.5" variants={pickerVariants.container} initial="initial" animate="animate">
        {AVATARS.map((avatar) => {
          const isSelected = avatar.id === value;
          return (
            <motion.button
              key={avatar.id}
              type="button"
              disabled={busy}
              onClick={() => onSelect(avatar.id)}
              className={cn(
                "relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-50",
                isSelected ? "border-brand" : "border-border hover:border-primary"
              )}
              variants={pickerVariants.item}
              whileHover={busy ? undefined : { y: -2 }}
              whileTap={busy ? undefined : { y: 0 }}
              aria-label={`Chọn ${avatar.alt}`}
              aria-pressed={isSelected}
            >
              <div className="flex size-full items-center justify-center">{avatar.svg}</div>
              {isSelected && (
                <motion.span
                  className="absolute inset-0 rounded-full ring-2 ring-brand ring-offset-2 ring-offset-background"
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                />
              )}
            </motion.button>
          );
        })}
      </motion.div>
    </motion.div>
  );
}

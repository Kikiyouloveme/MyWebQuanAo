import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  /** Gọi khi người dùng nhập/dán đủ số — dùng để tự submit */
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
}

/**
 * Ô nhập OTP: tự chuyển focus khi gõ, lùi ô khi xoá, dán được cả dãy 6 số.
 * Dùng inputMode="numeric" để điện thoại bật bàn phím số.
 */
export function OtpInput({
  value, onChange, length = 6, disabled, invalid, onComplete, autoFocus,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, " ").slice(0, length).split("");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const emit = (next: string) => {
    onChange(next);
    if (next.length === length && !next.includes(" ")) onComplete?.(next);
  };

  const setDigit = (index: number, digit: string) => {
    const chars = value.padEnd(length, " ").split("");
    chars[index] = digit;
    emit(chars.join("").replace(/\s+$/, ""));
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    setDigit(index, digit);
    if (index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const chars = value.padEnd(length, " ").split("");
      if (chars[index] && chars[index] !== " ") {
        chars[index] = " ";
        emit(chars.join("").replace(/\s+$/, ""));
      } else if (index > 0) {
        chars[index - 1] = " ";
        emit(chars.join("").replace(/\s+$/, ""));
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    emit(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-2.5" role="group" aria-label={`Mã xác minh ${length} chữ số`}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit.trim()}
          disabled={disabled}
          aria-label={`Chữ số thứ ${index + 1}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "size-12 rounded-md border bg-zinc-950/60 text-center font-display text-xl font-semibold text-zinc-100",
            "outline-none transition-colors sm:size-13",
            "focus-visible:border-[#c14d21] focus-visible:ring-[3px] focus-visible:ring-[#c14d21]/25",
            "disabled:cursor-not-allowed disabled:opacity-50",
            invalid ? "border-red-500/70" : "border-zinc-700"
          )}
        />
      ))}
    </div>
  );
}

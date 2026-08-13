import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastCtx {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const Ctx = createContext<ToastCtx>(null!);
export const useToast = () => useContext(Ctx);

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };
const TONES: Record<ToastTone, string> = {
  success: "border-emerald-600/40 bg-emerald-50 text-emerald-900",
  error: "border-destructive/40 bg-red-50 text-red-900",
  info: "border-border bg-card text-foreground",
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId++;
    setItems((prev) => [...prev.slice(-2), { id, tone, message }]);
    setTimeout(() => dismiss(id), tone === "error" ? 6000 : 4000);
  }, [dismiss]);

  const value: ToastCtx = {
    success: useCallback((m) => push("success", m), [push]),
    error: useCallback((m) => push("error", m), [push]),
    info: useCallback((m) => push("info", m), [push]),
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* aria-live để trình đọc màn hình thông báo mà không cướp focus của người dùng */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[200] flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg",
                "animate-[toast-in_.2s_ease-out]",
                TONES[t.tone]
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Đóng thông báo"
                className="-m-1 shrink-0 cursor-pointer rounded p-1 opacity-60 hover:opacity-100"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

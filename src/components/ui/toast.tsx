import * as React from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

type ToastOptions = {
  variant?: ToastVariant;
  duration?: number;
};

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toast: (message: string, options?: ToastOptions) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(0);
  const timers = React.useRef(new Map<number, number>());

  const remove = React.useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback((message: string, options: ToastOptions = {}) => {
    if (!message) return;
    const id = ++nextId.current;
    const duration = options.duration ?? 2000;
    setItems((current) => [...current.slice(-3), { id, message, variant: options.variant || "success" }]);
    timers.current.set(id, window.setTimeout(() => remove(id), duration));
  }, [remove]);

  React.useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }, []);

  const context = React.useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={context}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[120] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[min(360px,calc(100vw-2.5rem))]" aria-live="polite" aria-atomic="true">
        {items.map((item) => {
          const Icon = item.variant === "error" ? CircleAlert : item.variant === "info" ? Info : CheckCircle2;
          return (
            <div
              key={item.id}
              role="status"
              className={cn(
                "pointer-events-auto flex w-full min-w-0 items-start gap-2.5 rounded-lg border bg-card px-3.5 py-3 text-sm text-card-foreground shadow-lg animate-in slide-in-from-bottom-2 fade-in-0",
                item.variant === "error" ? "border-destructive/35" : "border-border/80",
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", item.variant === "error" ? "text-destructive" : item.variant === "info" ? "text-primary" : "text-emerald-500")} />
              <span className="min-w-0 flex-1 break-words leading-5">{item.message}</span>
              <button type="button" onClick={() => remove(item.id)} className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="关闭提示"><X className="size-3.5" /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast 必须在 ToastProvider 中使用");
  return context.toast;
}

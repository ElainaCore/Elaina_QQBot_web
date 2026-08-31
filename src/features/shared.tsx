import type { ComponentType, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type IconType = ComponentType<{ className?: string }>;

export function FeatureHeading(_: { icon: IconType; title: string; detail: string }) {
  return null;
}

export function Busy() {
  return <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />加载中...</div>;
}

export function Notice({ text, error = false }: { text: string; error?: boolean }) {
  return <p className={cn("text-sm", error ? "text-destructive" : "text-muted-foreground")}>{text}</p>;
}

export function EditorBox({ value, onChange, rows = 16 }: { value: string; onChange: (value: string) => void; rows?: number }) {
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className="w-full min-w-0 max-w-full resize-y rounded-lg border border-border/70 bg-background p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" />;
}

export function SelectBox({ value, onChange, children, className }: { value: string; onChange: (value: string) => void; children: ReactNode; className?: string }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className={cn("h-10 min-w-0 max-w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40", className)}>{children}</select>;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PromptOptions = DialogOptions & {
  defaultValue?: string;
  placeholder?: string;
  allowEmpty?: boolean;
};

type DialogRequest = {
  id: number;
  kind: "confirm" | "prompt" | "alert";
  options: DialogOptions | PromptOptions;
  resolve: (value: boolean | string | null) => void;
};

type AppDialogContextValue = {
  confirm: (options: string | DialogOptions) => Promise<boolean>;
  prompt: (options: string | PromptOptions) => Promise<string | null>;
  alert: (options: string | DialogOptions) => Promise<void>;
};

const AppDialogContext = React.createContext<AppDialogContextValue | null>(null);

function normalizeOptions(options: string | DialogOptions, fallbackTitle: string): DialogOptions {
  return typeof options === "string" ? { title: fallbackTitle, description: options } : options;
}

function AppDialog({ request, onResolve }: { request: DialogRequest; onResolve: (value: boolean | string | null) => void }) {
  const promptOptions = request.options as PromptOptions;
  const [value, setValue] = React.useState(promptOptions.defaultValue || "");
  const isPrompt = request.kind === "prompt";
  const isAlert = request.kind === "alert";
  const cancel = () => onResolve(isPrompt ? null : false);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onResolve(isPrompt ? value : true);
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) cancel(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[101] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[440px] min-w-0 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-4 pr-10 shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-h-[calc(100dvh-2rem)] sm:w-[min(92vw,440px)] sm:p-5 sm:pr-10">
          <form onSubmit={submit}>
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">{request.options.title}</DialogPrimitive.Title>
            {request.options.description ? <DialogPrimitive.Description className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{request.options.description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">操作确认</DialogPrimitive.Description>}
            {isPrompt && <Input autoFocus className="mt-4" value={value} placeholder={promptOptions.placeholder} onChange={(event) => setValue(event.target.value)} />}
            <div className="mt-5 flex justify-end gap-2">
              {!isAlert && <Button type="button" variant="outline" onClick={cancel}>{request.options.cancelLabel || "取消"}</Button>}
              <Button type="submit" variant={request.options.destructive ? "destructive" : "default"} className={cn(isPrompt && !promptOptions.allowEmpty && !value.trim() && "opacity-70")} disabled={isPrompt && !promptOptions.allowEmpty && !value.trim()}>{request.options.confirmLabel || (isAlert ? "知道了" : "确认")}</Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = React.useState<DialogRequest[]>([]);
  const nextId = React.useRef(0);
  const enqueue = React.useCallback((kind: DialogRequest["kind"], options: DialogOptions | PromptOptions) => new Promise<boolean | string | null>((resolve) => {
    setQueue((current) => [...current, { id: ++nextId.current, kind, options, resolve }]);
  }), []);
  const confirm = React.useCallback((options: string | DialogOptions) => enqueue("confirm", normalizeOptions(options, "确认操作")).then(Boolean), [enqueue]);
  const prompt = React.useCallback((options: string | PromptOptions) => enqueue("prompt", normalizeOptions(options, "请输入") as PromptOptions).then((result) => typeof result === "string" ? result : null), [enqueue]);
  const alert = React.useCallback(async (options: string | DialogOptions) => { await enqueue("alert", normalizeOptions(options, "提示")); }, [enqueue]);
  const resolveActive = React.useCallback((value: boolean | string | null) => {
    queue[0]?.resolve(value);
    setQueue((current) => current.slice(1));
  }, [queue]);
  const context = React.useMemo(() => ({ confirm, prompt, alert }), [alert, confirm, prompt]);
  return <AppDialogContext.Provider value={context}>{children}{queue[0] && <AppDialog key={queue[0].id} request={queue[0]} onResolve={resolveActive} />}</AppDialogContext.Provider>;
}

export function useAppDialog() {
  const context = React.useContext(AppDialogContext);
  if (!context) throw new Error("useAppDialog 必须在 AppDialogProvider 中使用");
  return context;
}

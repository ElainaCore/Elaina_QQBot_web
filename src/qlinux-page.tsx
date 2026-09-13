import { useCallback, useEffect, useState, type ComponentType } from "react";
import {
  Bot,
  KeyRound,
  Loader2,
  Monitor,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import { api, type ApiData } from "@/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAppDialog } from "@/components/ui/app-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string }>;

const STATUS_LABELS: Record<string, string> = {
  online: "在线",
  offline: "离线",
  reconnecting: "自动重连中",
  resume_pending: "待恢复",
  login_failed: "登录失败",
  waiting_scan: "等待扫码",
  confirming: "手机确认中",
  password_login: "账密登录中",
  qr_expired: "二维码已过期",
  qr_canceled: "已取消",
  captcha: "等待验证码",
  sms: "等待短信验证",
  new_device: "等待设备验证",
};

function statusVariant(status: string): "success" | "warning" | "secondary" | "destructive" {
  if (status === "online") return "success";
  if (["reconnecting", "resume_pending"].includes(status)) return "warning";
  if (["offline", "login_failed"].includes(status)) return "destructive";
  if (["waiting_scan", "confirming", "password_login", "captcha", "sms", "new_device"].includes(status)) return "warning";
  if (["qr_canceled", "qr_expired"].includes(status)) return "destructive";
  return "secondary";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function QLinuxPage() {
  const toast = useToast();
  const dialog = useAppDialog();
  const [accounts, setAccounts] = useState<ApiData[]>([]);
  const [runnerVersion, setRunnerVersion] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [qr, setQr] = useState<{ bot_id: string; png_base64: string; url: string; state?: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [form, setForm] = useState({ bot_id: "" });
  const [pwForm, setPwForm] = useState({ bot_id: "", uin: "", password: "" });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError("");
    try {
      const data = await api<ApiData>("/api/qlinux/accounts");
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setRunnerVersion(String(data.version || ""));
    } catch (error) {
      setLoadError(errorMessage(error, "QLinux 渠道未启用或加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  const refreshQr = useCallback(async (botId: string) => {
    try {
      const data = await api<ApiData>(`/api/qlinux/qr?bot_id=${encodeURIComponent(botId)}`);
      setQr({
        bot_id: botId,
        png_base64: String(data.png_base64 || ""),
        url: String(data.url || ""),
        state: data.status ? String(data.status) : undefined,
      });
    } catch {
      setQr(null);
    }
  }, []);

  const action = async (path: string, body: ApiData, doneMessage: string) => {
    try {
      const data = await api<ApiData>(path, { method: "POST", body: JSON.stringify(body) });
      toast(String(data.message || doneMessage));
      return data;
    } catch (error) {
      toast(errorMessage(error, "操作失败"), { variant: "error" });
      return null;
    }
  };

  const createAccount = async () => {
    const botId = form.bot_id.trim();
    if (!botId) return;
    setBusy("create");
    const result = await action("/api/qlinux/create", { bot_id: botId }, "账号已创建");
    setBusy("");
    if (result) {
      setAddOpen(false);
      setForm({ bot_id: "" });
      await load(true);
      await startQrLogin(botId);
    }
  };

  const startQrLogin = async (botId: string) => {
    setBusy(`qr:${botId}`);
    const result = await action("/api/qlinux/login/qr", { bot_id: botId }, "二维码生成中");
    setBusy("");
    if (result) {
      setQr({ bot_id: botId, png_base64: "", url: "" });
      for (let i = 0; i < 8; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        await refreshQr(botId);
        const cached = await api<ApiData>(`/api/qlinux/qr?bot_id=${encodeURIComponent(botId)}`).catch(() => null);
        if (cached?.png_base64) break;
      }
      await load(true);
    }
  };

  const passwordLogin = async () => {
    const botId = pwForm.bot_id.trim();
    const uin = Number(pwForm.uin.trim());
    if (!botId || !uin || !pwForm.password) return;
    setBusy("pw");
    const result = await action(
      "/api/qlinux/login/password",
      { bot_id: botId, uin, password: pwForm.password },
      "登录流程已发起",
    );
    setBusy("");
    if (result) {
      setPwOpen(false);
      setPwForm({ bot_id: "", uin: "", password: "" });
      await load(true);
    }
  };

  const stopAccount = async (botId: string) => {
    setBusy(`stop:${botId}`);
    await action("/api/qlinux/stop", { bot_id: botId }, "账号已下线");
    setBusy("");
    await load(true);
  };

  const deleteAccount = async (botId: string) => {
    const confirmed = await dialog.confirm({
      title: "删除 QLinux 账号",
      description: `将删除 ${botId} 的本地登录数据 (keystore)，需要重新扫码登录。确定删除？`,
      confirmLabel: "删除",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(`delete:${botId}`);
    await action("/api/qlinux/delete", { bot_id: botId }, "账号已删除");
    setBusy("");
    if (qr?.bot_id === botId) setQr(null);
    await load(true);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Lagrange 协议端 (Linux 协议) · 支持 <ShieldCheck className="inline size-3.5" /> 扫码 / <KeyRound className="inline size-3.5" /> 账密登录
          {runnerVersion && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">runner v{runnerVersion}</span>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />刷新
          </Button>
          <Button size="sm" variant="outline" disabled={busy === "pw"} onClick={() => setPwOpen(true)}>
            <KeyRound className="size-3.5" />账密登录
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} disabled={busy === "create"}>
            <Plus className="size-3.5" />添加账号
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
          <p className="mt-1 text-xs text-muted-foreground">在 config/settings.yaml 中设置 qlinux.enabled: true 后重启框架</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />加载账号
        </div>
      ) : accounts.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.map((account, index) => {
            const botId = String(account.bot_id || `#${index}`);
            const status = String(account.status || "offline");
            const uin = String(account.uin || "");
            const qrActive = qr?.bot_id === botId && qr.png_base64;
            return (
              <Card key={botId} className="overflow-hidden">
                <CardContent className="p-5 pt-6 sm:p-6">
                  <div className="flex min-h-12 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar size={4}>
                        {uin ? (
                          <AvatarImage src={`https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=100`} alt={botId} />
                        ) : null}
                        <AvatarFallback><Bot className="size-4" /></AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{botId}</h3>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          QQ {uin || "等待登录"} · Lagrange Linux 协议
                        </p>
                      </div>
                    </div>
                    <Badge className="shrink-0" variant={statusVariant(status)}>
                      {STATUS_LABELS[status] || status}
                    </Badge>
                  </div>

                  {account.last_error && (
                    <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {String(account.last_error)}
                    </div>
                  )}

                  {qrActive ? (
                    <div className="mt-4 flex items-center gap-3 rounded-lg border border-border/70 p-3">
                      <img
                        className="size-28 rounded-md bg-white object-contain"
                        src={`data:image/png;base64,${qr.png_base64}`}
                        alt="QLinux 登录二维码"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">扫码登录</p>
                        <p className="mt-1 text-xs text-muted-foreground">手机 QQ 扫码并确认，约 2 分钟有效</p>
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="outline" disabled={busy === `qr:${botId}`} onClick={() => void startQrLogin(botId)}>
                            <RefreshCw className="size-3" />刷新二维码
                          </Button>
                          {qr.url && (
                            <a
                              className="inline-flex items-center text-xs text-primary hover:underline"
                              href={qr.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              打开链接
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy === `qr:${botId}`} onClick={() => void startQrLogin(botId)}>
                      <QrCode className="size-3.5" />扫码登录
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={status === "online" || busy === `stop:${botId}`}
                      onClick={() => void stopAccount(botId)}
                    >
                      <Square className="size-3.5" />下线
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={busy === `delete:${botId}`}
                      onClick={() => void deleteAccount(botId)}
                    >
                      <Trash2 className="size-3.5" />删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : !loadError ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Monitor className="mx-auto size-9 text-muted-foreground/35" />
          <h3 className="mt-4 text-sm font-medium">还没有 QLinux 账号</h3>
          <p className="mt-1 text-xs text-muted-foreground">Lagrange 协议端，支持多账号 · 首次使用会自动下载 runner</p>
          <Button className="mt-4" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />添加账号
          </Button>
        </div>
      ) : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-base font-semibold">添加 QLinux 账号</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            账号 ID 仅用于本地标识 (字母/数字/下划线/连字符)，创建后自动弹出扫码登录
          </DialogDescription>
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="例如 my-bot-1"
              value={form.bot_id}
              onChange={(event) => setForm({ bot_id: event.target.value })}
              onKeyDown={(event) => event.key === "Enter" && void createAccount()}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>取消</Button>
            <Button size="sm" disabled={!form.bot_id.trim() || busy === "create"} onClick={() => void createAccount()}>
              {busy === "create" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}创建并扫码
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-base font-semibold">账密登录</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            需要先创建账号 ID；触发滑块/短信验证时回到该账号卡片按提示提交
          </DialogDescription>
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="账号 ID (已创建的)"
              value={pwForm.bot_id}
              onChange={(event) => setPwForm({ ...pwForm, bot_id: event.target.value })}
            />
            <Input
              placeholder="QQ 号"
              inputMode="numeric"
              value={pwForm.uin}
              onChange={(event) => setPwForm({ ...pwForm, uin: event.target.value.replace(/\D/g, "") })}
            />
            <Input
              type="password"
              placeholder="QQ 密码"
              value={pwForm.password}
              onChange={(event) => setPwForm({ ...pwForm, password: event.target.value })}
              onKeyDown={(event) => event.key === "Enter" && void passwordLogin()}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPwOpen(false)}>取消</Button>
            <Button
              size="sm"
              disabled={!pwForm.bot_id.trim() || !pwForm.uin || !pwForm.password || busy === "pw"}
              onClick={() => void passwordLogin()}
            >
              {busy === "pw" ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}开始登录
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

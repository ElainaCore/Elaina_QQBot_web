import { useCallback, useEffect, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Monitor,
  MonitorSmartphone,
  Network,
  PackageCheck,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Square,
  Trash2,
  Unplug,
} from "lucide-react";
import { api, type ApiData } from "@/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useToast } from "@/components/ui/toast";
import { ConnectionsPage } from "@/features/basic-pages";
import { QLinuxPage } from "@/qlinux-page";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string }>;
type AccessView = "accounts" | "onebot" | "qlinux" | "injected" | "embedded";
type AddStep = "choose" | "qq" | "hookqq";
type EmbeddedForm = { bot_id: string; nickname: string; uin: string; qq_version_key: string; force_quick_login: boolean };

function statusText(bot: ApiData) {
  if (bot.connected || bot.status === "online") return "在线";
  const labels: Record<string, string> = {
    logging_in: "登录中",
    authorizing: "初始化中",
    waiting_qr: "等待扫码",
    error: "异常",
    not_installed: "未安装 QQ",
    offline: "离线",
  };
  return labels[String(bot.status || "")] || "离线";
}

function isQLinux(bot: ApiData) {
  return [bot.connection_type, bot.runtime_mode, bot.protocol, bot.channel]
    .some((value) => ["QLinux", "QLinux 协议端", "Lagrange Linux"].includes(String(value)));
}

function isEmbedded(bot: ApiData) {
  return Boolean(bot.bot_id) && !isQLinux(bot);
}

function isInjected(bot: ApiData) {
  return ["QQ 注入", "QQ 连接"].includes(String(bot.connection_type)) || ["QQ 注入", "QQ 连接"].includes(String(bot.runtime_mode));
}

function AccountAvatar({ bot }: { bot: ApiData }) {
  const label = String(bot.name || bot.nickname || bot.qq || bot.bot_qq || "Q");
  return (
    <Avatar size={48}>
      {bot.avatar ? <AvatarImage src={String(bot.avatar)} alt={label} /> : null}
      <AvatarFallback className="bg-primary/10 text-primary">{label.slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

function AccessMethod({ icon: MethodIcon, title, detail, onClick }: { icon: Icon; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-lg border border-border/70 p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><MethodIcon className="size-5" /></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function EmbeddedAccountForm({
  form,
  compatible,
  busy,
  windows,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: EmbeddedForm;
  compatible: ApiData[];
  busy: string;
  windows: boolean;
  onChange: (field: keyof EmbeddedForm, value: string | boolean) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{windows ? "添加内置 HookQQ" : "添加内置 QQ"}</CardTitle>
        <CardDescription>创建账号后可启动 QQ，通过二维码或快捷登录完成接入。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block space-y-1.5 text-sm"><span className="font-medium">账号标识</span><Input value={form.bot_id} onChange={(event) => onChange("bot_id", event.target.value)} placeholder="例如 bot1" /></label>
        <label className="block space-y-1.5 text-sm"><span className="font-medium">显示名称</span><Input value={form.nickname} onChange={(event) => onChange("nickname", event.target.value)} placeholder="可选" /></label>
        <label className="block space-y-1.5 text-sm"><span className="font-medium">QQ 号</span><Input value={form.uin} onChange={(event) => onChange("uin", event.target.value)} placeholder="可选，用于快捷登录" /></label>
        <label className="block space-y-1.5 text-sm"><span className="font-medium">QQ 版本</span><select value={form.qq_version_key} onChange={(event) => onChange("qq_version_key", event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">{compatible.map((item) => <option key={item.key} value={item.key}>{item.label} {item.version}</option>)}</select></label>
        <div className="flex items-center justify-between rounded-lg border border-border/70 p-3 text-sm"><div><p className="font-medium">快捷登录</p><p className="mt-1 text-xs text-muted-foreground">优先复用本地 QQ 登录会话</p></div><ToggleSwitch value={form.force_quick_login} onChange={(value) => onChange("force_quick_login", value)} ariaLabel="快捷登录" /></div>
        <div className="flex justify-end gap-2 border-t pt-4">{onCancel && <Button variant="outline" onClick={onCancel}>取消</Button>}<Button onClick={onSubmit} disabled={busy === "create"}>{busy === "create" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}创建账号</Button></div>
      </CardContent>
    </Card>
  );
}

function InjectedQQPage({
  windows,
  loading,
  busy,
  processes,
  onRefresh,
  onInject,
  onDetach,
}: {
  windows: boolean;
  loading: boolean;
  busy: string;
  processes: ApiData[];
  onRefresh: () => void;
  onInject: (process: ApiData) => void;
  onDetach: (process: ApiData) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3 border-l-2 border-amber-500 bg-muted/30 px-4 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0 text-xs leading-5 text-muted-foreground">
          <p className="font-medium text-foreground">注入 QQ 仅支持 Windows</p>
          <p>请先启动并登录系统 QQ。该模式直接连接现有进程，不负责安装、启动或适配 QQ 版本；遇到权限错误时请以管理员身份运行框架。</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">QQ 主进程</h2>
          <p className="mt-1 text-xs text-muted-foreground">检测到 {processes.length} 个可管理进程</p>
        </div>
        <Button type="button" size="icon-sm" variant="outline" onClick={onRefresh} disabled={loading} aria-label="刷新 QQ 进程" title="刷新 QQ 进程">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {!windows ? (
        <div className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">当前系统不支持注入 QQ。</div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />检测 QQ 进程</div>
      ) : processes.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {processes.map((process) => {
            const pid = Number(process.pid || 0);
            const connected = process.status === "online" || process.hooked;
            const processBusy = busy === `inject:${pid}` || busy === `detach:${pid}`;
            return (
              <Card key={String(process.id || pid)}>
                <CardContent className="flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><MonitorSmartphone className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-medium">{process.name || process.process_name || "QQ"}</h3>
                      <Badge variant={connected ? "success" : process.injected ? "warning" : "secondary"}>{connected ? "已连接" : process.injected ? "已注入" : "可注入"}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">PID {pid}{process.uin ? ` · QQ ${process.uin}` : ""}{process.memory_rss_mb ? ` · ${process.memory_rss_mb} MB` : ""}</p>
                    {process.path && <p className="mt-1 truncate text-xs text-muted-foreground" title={String(process.path)}>{process.path}</p>}
                    {process.error && <p className="mt-2 text-xs text-amber-600">{process.error}</p>}
                  </div>
                  {connected ? (
                    <Button size="sm" variant="outline" disabled={processBusy} onClick={() => onDetach(process)}><Unplug className="size-3.5" />断开</Button>
                  ) : (
                    <Button size="sm" disabled={processBusy || (!process.can_load && !process.can_attach)} onClick={() => onInject(process)}>
                      {processBusy ? <Loader2 className="size-3.5 animate-spin" /> : <MonitorSmartphone className="size-3.5" />}{process.injected ? "继续连接" : "注入"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="border border-dashed border-border p-10 text-center"><MonitorSmartphone className="mx-auto size-8 text-muted-foreground/35" /><p className="mt-3 text-sm text-muted-foreground">未检测到 QQ 主进程，请先启动并登录系统 QQ。</p></div>
      )}
    </section>
  );
}

export function AccessCenterPage() {
  const dialog = useAppDialog();
  const toast = useToast();
  const [view, setView] = useState<AccessView>("accounts");
  const [bots, setBots] = useState<ApiData[]>([]);
  const [versions, setVersions] = useState<ApiData[]>([]);
  const [qqStatus, setQqStatus] = useState<ApiData>({});
  const [processes, setProcesses] = useState<ApiData[]>([]);
  const [platform, setPlatform] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [loadError, setLoadError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [inlineEditorOpen, setInlineEditorOpen] = useState(false);
  const [addStep, setAddStep] = useState<AddStep>("choose");
  const [connectionSignal, setConnectionSignal] = useState(0);
  const [form, setForm] = useState<EmbeddedForm>({ bot_id: "", nickname: "", uin: "", qq_version_key: "", force_quick_login: false });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [botData, versionData, statusData, systemData, processData] = await Promise.all([
        api<ApiData>("/api/bots"),
        api<ApiData>("/api/qq/versions"),
        api<ApiData>("/api/qq/status"),
        api<ApiData>("/api/system/info"),
        api<ApiData>("/api/processes"),
      ]);
      const nextVersions = Array.isArray(versionData.versions) ? versionData.versions : [];
      setBots(Array.isArray(botData.bots) ? botData.bots : []);
      setVersions(nextVersions);
      setQqStatus(statusData.status || {});
      setProcesses(Array.isArray(processData.processes) ? processData.processes : []);
      setPlatform(String(systemData.platform || (statusData.status?.install_strategy === "official_website" ? "windows" : "linux")));
      setForm((current) => ({
        ...current,
        qq_version_key: current.qq_version_key || String(nextVersions.find((item: ApiData) => item.recommended)?.key || nextVersions.find((item: ApiData) => item.compatible)?.key || ""),
      }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "接入信息读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openAdd = () => {
    // Account creation belongs to the embedded QQ tab. Injection and OneBot
    // remain separate tabs and should never be part of this add flow.
    setView("embedded");
    setInlineEditorOpen(true);
  };

  const chooseOneBot = () => {
    setAddOpen(false);
    setView("onebot");
    setConnectionSignal((value) => value + 1);
  };

  const createEmbedded = async () => {
    if (!form.bot_id.trim()) { toast("请输入账号标识", { variant: "info" }); return; }
    setBusy("create");
    try {
      await api("/api/embedded/bots", { method: "POST", body: JSON.stringify({ ...form, runtime_mode: windows ? "hookqq" : "embedded" }) });
      setForm((current) => ({ ...current, bot_id: "", nickname: "", uin: "" }));
      setAddOpen(false);
      setInlineEditorOpen(false);
      toast(windows ? "内置 HookQQ 账号已创建" : "内置 QQ 账号已创建");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "创建失败", { variant: "error" });
    } finally { setBusy(""); }
  };

  const injectProcess = async (process: ApiData) => {
    if (!process.pid) return;
    setAddOpen(false);
    setBusy(`inject:${process.pid}`);
    try {
      await api(`/api/processes/${process.pid}/inject`, { method: "POST", body: "{}" });
      toast(`QQ 进程 PID ${process.pid} 已注入并连接`);
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "连接失败", { variant: "error" });
    } finally { setBusy(""); }
  };

  const botAction = async (bot: ApiData, action: "start" | "stop" | "delete" | "qr/refresh") => {
    const botId = String(bot.bot_id || "");
    if (!botId) return;
    if (action === "delete" && !await dialog.confirm({ title: "删除账号", description: `删除账号 ${bot.name || botId}？本地 QQ 会话数据将保留。`, confirmLabel: "删除", destructive: true })) return;
    setBusy(`${action}:${botId}`);
    try {
      await api(`/api/embedded/${action}`, { method: "POST", body: JSON.stringify({ bot_id: botId, cleanup_data: false }) });
      toast(action === "start" ? "QQ 已启动" : action === "stop" ? "QQ 已停止" : action === "delete" ? "账号已删除" : "二维码已刷新");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", { variant: "error" });
    } finally { setBusy(""); }
  };

  const detachInjected = async (bot: ApiData) => {
    if (!bot.pid || !await dialog.confirm({ title: "断开连接", description: `断开 QQ ${bot.qq || bot.bot_qq} 的连接？`, confirmLabel: "断开", destructive: true })) return;
    setBusy(`detach:${bot.pid}`);
    try {
      await api(`/api/processes/${bot.pid}/detach`, { method: "POST", body: "{}" });
      toast("QQ 连接已断开");
      await load();
    } catch (error) { toast(error instanceof Error ? error.message : "断开连接失败", { variant: "error" }); }
    finally { setBusy(""); }
  };

  const updateEmbedded = async (bot: ApiData, endpoint: "version" | "quick-login", value: string | boolean) => {
    const botId = String(bot.bot_id || "");
    setBusy(`${endpoint}:${botId}`);
    try {
      const body = endpoint === "version" ? { bot_id: botId, qq_version_key: value } : { bot_id: botId, enabled: value };
      await api(`/api/embedded/${endpoint}`, { method: "POST", body: JSON.stringify(body) });
      toast("账号设置已保存");
      await load();
    } catch (error) { toast(error instanceof Error ? error.message : "保存失败", { variant: "error" }); }
    finally { setBusy(""); }
  };

  const qqAction = async (action: "download" | "install" | "cleanup", versionKey: string) => {
    setBusy(`qq:${action}:${versionKey}`);
    try {
      const result = await api<ApiData>(`/api/qq/${action}`, { method: "POST", body: JSON.stringify({ version_key: versionKey, auto_download: true }) });
      toast(String(result.message || result.job?.message || "任务已提交"));
      await load();
    } catch (error) { toast(error instanceof Error ? error.message : "QQ 客户端操作失败", { variant: "error" }); }
    finally { setBusy(""); }
  };

  const compatible = versions.filter((item) => item.compatible);
  const windows = platform === "windows";
  const externalProcesses = processes.filter((item) => !item.managed);
  const embeddedBots = bots.filter(isEmbedded);
  const displayBots = view === "embedded" ? embeddedBots : bots;

  return (
    <section className="space-y-6">
      <div className="w-full overflow-x-auto pb-1">
        <div className="inline-flex h-10 min-w-max items-center rounded-lg border border-border/70 bg-muted/40 p-1">
          <button type="button" onClick={() => setView("accounts")} className={cn("flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors", view === "accounts" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}><Bot className="size-3.5" />QQ 账号 <span className="tabular-nums">{bots.length}</span></button>
          {windows && <button type="button" onClick={() => setView("onebot")} className={cn("flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors", view === "onebot" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}><Network className="size-3.5" />OneBot 接入</button>}
          <button type="button" onClick={() => setView("qlinux")} className={cn("flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors", view === "qlinux" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}><Monitor className="size-3.5" />QLinux 协议端</button>
          <button type="button" onClick={() => setView("injected")} className={cn("flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors", view === "injected" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}><MonitorSmartphone className="size-3.5" />注入 QQ <span className="tabular-nums">{externalProcesses.length}</span></button>
          <button type="button" onClick={() => setView("embedded")} className={cn("flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors", view === "embedded" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}><Bot className="size-3.5" />内置 QQ <span className="tabular-nums">{embeddedBots.length}</span></button>
        </div>
      </div>

      {loadError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</div>}

      {view === "onebot" ? <ConnectionsPage compact createSignal={connectionSignal} /> : view === "qlinux" ? <QLinuxPage /> : view === "injected" ? (
        <InjectedQQPage windows={windows} loading={loading} busy={busy} processes={externalProcesses} onRefresh={() => void load()} onInject={(process) => void injectProcess(process)} onDetach={(process) => void detachInjected(process)} />
      ) : (
        <>
          {view === "embedded" && inlineEditorOpen && !loading && <EmbeddedAccountForm form={form} compatible={compatible} busy={busy} windows={windows} onChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))} onSubmit={() => void createEmbedded()} onCancel={() => setInlineEditorOpen(false)} />}
          {view === "embedded" && !inlineEditorOpen && !loading && <div className="flex justify-end"><Button size="sm" onClick={openAdd}><Plus className="size-3.5" />添加内置 QQ</Button></div>}
          {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />加载账号</div> : displayBots.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {displayBots.map((bot, index) => {
                const botId = String(bot.bot_id || "");
                const embedded = isEmbedded(bot);
                const injected = isInjected(bot);
                const qlinux = isQLinux(bot);
                const running = Boolean(bot.pid || bot.connected || ["logging_in", "waiting_qr", "authorizing", "online"].includes(String(bot.status)));
                const online = Boolean(bot.connected || bot.status === "online");
                return (
                  <Card key={botId || bot.bot_qq || index} className="overflow-hidden">
                    <CardContent className="p-5 pt-6 sm:p-6">
                      <div className="flex min-h-12 items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3"><AccountAvatar bot={bot} /><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{bot.name || bot.nickname || bot.qq || bot.bot_qq || botId}</h3><p className="mt-1 truncate text-xs text-muted-foreground">QQ {bot.qq || bot.bot_qq || "等待登录"}</p></div></div>
                        <Badge className="shrink-0" variant={online ? "success" : running ? "warning" : "secondary"}>{statusText(bot)}</Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-md bg-muted/60 p-2.5"><span className="text-muted-foreground">接入方式</span><p className="mt-1 truncate font-medium">{bot.connection_type || bot.runtime_mode || (embedded ? "内置 QQ" : "OneBot")}</p></div><div className="rounded-md bg-muted/60 p-2.5"><span className="text-muted-foreground">运行信息</span><p className="mt-1 truncate font-medium">{bot.pid ? `PID ${bot.pid}` : bot.connected ? "连接正常" : "未连接"}</p></div></div>
                      {bot.error && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{bot.error}</p>}
                      {(bot.qrcode || bot.qrcode_url) && <div className="mt-3 flex items-center gap-3 rounded-lg border border-border/70 p-3">{bot.qrcode ? <img className="size-24 rounded-md bg-white object-contain" src={String(bot.qrcode).startsWith("data:") ? String(bot.qrcode) : `data:image/png;base64,${bot.qrcode}`} alt="QQ 登录二维码" /> : <span className="grid size-16 place-items-center rounded-md bg-muted"><QrCode className="size-6" /></span>}<div><p className="text-sm font-medium">扫码登录 QQ</p><p className="mt-1 text-xs text-muted-foreground">使用手机 QQ 扫描二维码</p>{bot.qrcode_url && <a className="mt-2 inline-flex text-xs text-primary hover:underline" href={String(bot.qrcode_url)} target="_blank" rel="noreferrer">打开二维码链接</a>}</div></div>}
                      {embedded && <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"><select value={bot.qq_version_key || ""} disabled={running || busy.startsWith("version:")} onChange={(event) => void updateEmbedded(bot, "version", event.target.value)} className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm">{compatible.map((item) => <option key={item.key} value={item.key}>{item.label} {item.version}</option>)}</select><div className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-xs text-muted-foreground"><ToggleSwitch value={Boolean(bot.force_quick_login)} onChange={(value) => void updateEmbedded(bot, "quick-login", value)} ariaLabel="快捷登录" disabled={busy.startsWith("quick-login:")} />快捷登录</div></div>}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {embedded && (running ? <Button size="sm" variant="outline" disabled={busy === `stop:${botId}`} onClick={() => void botAction(bot, "stop")}><Square className="size-3.5" />停止</Button> : <Button size="sm" disabled={busy === `start:${botId}`} onClick={() => void botAction(bot, "start")}><Play className="size-3.5" />启动登录</Button>)}
                        {embedded && <Button size="sm" variant="outline" disabled={!running || busy === `qr/refresh:${botId}`} onClick={() => void botAction(bot, "qr/refresh")}><QrCode className="size-3.5" />刷新二维码</Button>}
                        {embedded && <Button size="sm" variant="outline" className="text-destructive" disabled={running || busy === `delete:${botId}`} onClick={() => void botAction(bot, "delete")}><Trash2 className="size-3.5" />删除</Button>}
                        {injected && <Button size="sm" variant="outline" disabled={busy === `detach:${bot.pid}`} onClick={() => void detachInjected(bot)}><Unplug className="size-3.5" />断开连接</Button>}
                        {qlinux && <Button size="sm" variant="outline" onClick={() => setView("qlinux")}><Link2 className="size-3.5" />管理账号</Button>}
                        {!embedded && !injected && !qlinux && <Button size="sm" variant="outline" onClick={() => setView("onebot")}><Link2 className="size-3.5" />管理接入</Button>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : inlineEditorOpen ? null : <div className="rounded-lg border border-dashed border-border p-12 text-center"><Bot className="mx-auto size-9 text-muted-foreground/35" /><h3 className="mt-4 text-sm font-medium">{view === "embedded" ? "还没有内置 QQ 账号" : "还没有 QQ 账号"}</h3><p className="mt-1 text-xs text-muted-foreground">{windows ? "使用下方按钮添加 QQ 接入" : "使用下方按钮添加内置 QQ"}</p><Button className="mt-4" size="sm" onClick={openAdd}><Plus className="size-3.5" />{windows ? "添加接入" : "添加内置 QQ"}</Button></div>}

          {!loading && view === "embedded" && (windows ? (
            <Card><CardHeader className="flex-row flex-wrap items-start justify-between gap-3"><div className="min-w-0"><CardTitle>Windows QQ</CardTitle><CardDescription className="break-all">{qqStatus.qq_executable || "安装并登录系统 QQ 后，可从添加接入中选择进程连接"}</CardDescription></div><Badge className="shrink-0" variant={qqStatus.installed ? "success" : "secondary"}>{qqStatus.installed ? "已检测到" : "未检测到"}</Badge></CardHeader><CardContent><Button variant="outline" onClick={() => window.open(String(qqStatus.official_download_url || "https://im.qq.com/index/#/"), "_blank", "noopener,noreferrer")}><ExternalLink className="size-3.5" />前往 QQ 官网</Button></CardContent></Card>
          ) : (
            <Card><CardHeader><CardTitle>内置 QQ 运行时</CardTitle><CardDescription>下载或安装框架管理的 Linux QQ 版本</CardDescription></CardHeader><CardContent className="space-y-2">{compatible.length ? compatible.map((item) => <div key={item.key} className="flex flex-col gap-3 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-sm font-medium">{item.label} {item.version}{item.recommended && <Badge>推荐</Badge>}{item.installed && <Badge variant="success">已安装</Badge>}</div><p className="mt-1 break-words text-xs text-muted-foreground">{item.platform} {item.arch} · {item.size}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy.startsWith("qq:")} onClick={() => void qqAction("download", item.key)}><Download className="size-3.5" />下载</Button><Button size="sm" disabled={busy.startsWith("qq:")} onClick={() => void qqAction("install", item.key)}><PackageCheck className="size-3.5" />安装</Button>{item.downloaded && <Button size="sm" variant="outline" onClick={() => void qqAction("cleanup", item.key)}>清理缓存</Button>}</div></div>) : <p className="text-sm text-muted-foreground">当前平台没有可用的 QQ 安装包。</p>}</CardContent></Card>
          ))}
        </>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <div className="pr-8">
            <DialogTitle>{addStep === "choose" ? "选择接入方式" : addStep === "qq" ? "注入 QQ 进程" : windows ? "添加内置 HookQQ" : "添加内置 QQ"}</DialogTitle>
            <DialogDescription className="mt-1">{addStep === "choose" ? windows ? "选择注入现有 QQ、内置 HookQQ 或已有 OneBot 实现。" : "选择内置 QQ 或已有 OneBot 实现。" : addStep === "qq" ? "选择一个已经运行的 QQ 主进程，框架不会检查 QQ 版本，也不会启动或重启 QQ。" : windows ? "由框架复制并启动隔离的 QQ，只有 HookQQ 模式会校验 QQ 版本。" : "创建后启动 QQ，并通过扫码或快捷登录接入。"}</DialogDescription>
          </div>
          {addStep === "choose" ? (
            <div className="mt-6 space-y-3">{windows ? <><AccessMethod icon={MonitorSmartphone} title="注入 QQ" detail="选择本机已运行的 QQ 进程；不校验 QQ 版本" onClick={() => setAddStep("qq")} /><AccessMethod icon={Bot} title="内置 HookQQ" detail="由框架启动隔离 QQ；启动时校验兼容版本" onClick={() => setAddStep("hookqq")} /></> : <AccessMethod icon={Bot} title="内置 QQ" detail="由框架启动 Linux QQ，通过扫码登录并保存账号会话" onClick={() => setAddStep("hookqq")} />}<AccessMethod icon={Network} title="OneBot 接入" detail="使用正向或反向 WebSocket、HTTP 接入已有实现端" onClick={chooseOneBot} /></div>
          ) : addStep === "qq" ? (
            <div className="mt-6 space-y-3"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">检测到 {externalProcesses.length} 个 QQ 主进程</p><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="size-3.5" />刷新</Button></div>{externalProcesses.length ? externalProcesses.map((process) => <div key={process.id || process.pid} className="flex flex-col gap-3 rounded-lg border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{process.name || process.process_name || "QQ"}</span><Badge variant={process.status === "online" ? "success" : process.injected ? "warning" : "secondary"}>{process.status === "online" ? "已连接" : process.injected ? "已注入" : "可注入"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">PID {process.pid}{process.uin ? ` · QQ ${process.uin}` : ""}{process.memory_rss_mb ? ` · ${process.memory_rss_mb} MB` : ""}</p>{process.path && <p className="mt-1 truncate text-xs text-muted-foreground" title={String(process.path)}>{process.path}</p>}{process.error && <p className="mt-2 text-xs text-amber-600">{process.error}</p>}</div><Button size="sm" disabled={process.status === "online" || (!process.can_load && !process.can_attach) || busy === `inject:${process.pid}`} onClick={() => void injectProcess(process)}>{busy === `inject:${process.pid}` ? <Loader2 className="size-3.5 animate-spin" /> : <MonitorSmartphone className="size-3.5" />}{process.status === "online" ? "已连接" : process.injected ? "继续连接" : "QQ 注入"}</Button></div>) : <div className="rounded-lg border border-dashed border-border p-10 text-center"><MonitorSmartphone className="mx-auto size-8 text-muted-foreground/35" /><p className="mt-3 text-sm text-muted-foreground">未检测到 QQ 主进程，请先安装、启动并登录 QQ。</p></div>}<Button variant="ghost" size="sm" onClick={() => setAddStep("choose")}>返回接入方式</Button></div>
          ) : (
            <EmbeddedAccountForm form={form} compatible={compatible} busy={busy} windows={windows} onChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))} onSubmit={() => void createEmbedded()} onCancel={() => setAddStep("choose")} />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

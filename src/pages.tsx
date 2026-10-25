import { useCallback, useEffect, useState, type ComponentType } from "react";
import {
  Activity,
  Bot,
  Boxes,
  ChevronRight,
  CheckCircle2,
  CircleAlert,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileText,
  HardDrive,
  Loader2,
  Link2,
  MonitorSmartphone,
  Network,
  PackageCheck,
  Play,
  PlugZap,
  Plus,
  QrCode,
  RefreshCw,
  RotateCw,
  Server,
  Settings,
  Square,
  Terminal,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { api, type ApiData } from "@/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppDialog } from "@/components/ui/app-dialog";
import { useToast } from "@/components/ui/toast";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn, formatBytes, formatUptime } from "@/lib/utils";
import { Logo, type Page } from "@/App";
import { ConnectionsPage } from "@/features/basic-pages";

type Icon = ComponentType<{ className?: string }>;

function useData<T>(load: () => Promise<T>, initial: T, interval = 0) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const value = await load();
        if (active) { setData(value); setError(""); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "加载失败");
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    setLoading(true);
    void refresh();
    const timer = interval > 0 ? window.setInterval(() => { if (!document.hidden) void refresh(); }, interval) : undefined;
    return () => { active = false; if (timer !== undefined) window.clearInterval(timer); };
  }, [load, interval]);
  return { data, loading, error };
}

function Heading({
  icon: PageIcon,
  title,
  detail,
}: {
  icon: Icon;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <PageIcon className="size-5" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      加载中…
    </div>
  );
}
function ErrorText({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-destructive">
      <CircleAlert className="size-4" />
      {text}
    </div>
  );
}
function Empty({
  icon: EmptyIcon,
  text,
  action,
  onClick,
}: {
  icon: Icon;
  text: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <EmptyIcon className="size-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{text}</p>
      {action && (
        <Button variant="outline" size="sm" onClick={onClick}>
          {action}
        </Button>
      )}
    </div>
  );
}
function InfoRow({
  icon: RowIcon,
  label,
  value,
}: {
  icon: Icon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-muted/60">
      <span className="flex items-center gap-2 text-muted-foreground">
        <RowIcon className="size-4" />
        {label}
      </span>
      <span
        className="max-w-[62%] truncate text-right font-medium"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon: StatIcon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: Icon;
  tone?: "primary" | "success" | "warning";
}) {
  return (
    <Card className="metric-card">
      <CardContent className="flex items-start justify-between p-5 pt-5 sm:p-5 sm:pt-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            tone === "success"
              ? "bg-emerald-500/10 text-emerald-600"
              : tone === "warning"
                ? "bg-amber-500/10 text-amber-600"
                : "bg-primary/10 text-primary",
          )}
        >
          <StatIcon className="size-5" />
        </div>
      </CardContent>
      {String(value).endsWith("%") && <div className="metric-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, parseFloat(String(value)) || 0))}><span style={{ width: `${Math.min(100, Math.max(0, parseFloat(String(value)) || 0))}%` }} /></div>}

    </Card>
  );
}
function Quick({
  icon: ActionIcon,
  title,
  detail,
  onClick,
}: {
  icon: Icon;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-border/60 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
        <ActionIcon className="size-4" />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

export function OverviewPage({ navigate }: { navigate: (page: Page) => void }) {
  const dialog = useAppDialog();
  const system = useData(
    useCallback(() => api<ApiData>("/api/system/info"), []),
    {},
    10000,
  );
  const bots = useData(
    useCallback(() => api<ApiData>("/api/bots"), []),
    { bots: [] },
    15000,
  );
  const processes = useData(
    useCallback(() => api<ApiData>("/api/processes"), []),
    { processes: [] },
    30000,
  );
  const dependencies = useData(
    useCallback(() => api<ApiData>("/api/system/dependencies"), []),
    { python: {}, dependencies: [] },
  );
  const password = useData(
    useCallback(() => api<ApiData>("/api/auth/password-status"), []),
    {},
  );
  const info = system.data;
  const botList = Array.isArray(bots.data.bots) ? bots.data.bots : [];
  const processList = Array.isArray(processes.data.processes)
    ? processes.data.processes
    : [];
  const restart = async () => {
    if (!await dialog.confirm({ title: "重启框架", description: "重启 ElainaBot？Web 面板会短暂断开。", confirmLabel: "重启", destructive: true })) return;
    await api("/api/bot/restart", { method: "POST" }).catch(() => undefined);
  };
  const [samples, setSamples] = useState<Array<{ time: number; cpu: number; memory: number }>>([]);
  useEffect(() => {
    if (info.cpu_percent === undefined || info.memory_percent === undefined) return;
    setSamples((previous) => [...previous, { time: Date.now(), cpu: Number(info.cpu_percent), memory: Number(info.memory_percent) }].slice(-60));
  }, [info]);
  const online = botList.filter((bot: ApiData) => bot.connected).length;

  const dependencyList: ApiData[] = [{name: "Python", installed: dependencies.data.python?.version, required: dependencies.data.python?.required, status: dependencies.data.python?.status || (dependencies.data.python?.version ? "ok" : "missing")}, ...(dependencies.data.dependencies || [])];
  const percent = (value: unknown) => Math.min(100, Math.max(0, Number(value) || 0));
  const trendPath = (field: "cpu" | "memory") => samples.map((sample, index) => `${index ? "L" : "M"}${32 + index / Math.max(1, samples.length - 1) * 520},${108 - percent(sample[field]) * .94}`).join(" ");
  return (
    <section className="dashboard">
      {(password.data.is_default || password.data.is_weak) && <div className="dashboard-alert"><CircleAlert className="size-4 shrink-0" /><span>当前管理员密码为默认或弱密码，请在框架配置中修改后重启框架。</span></div>}
      {system.error && <div className="dashboard-alert" role="status">资源数据更新失败：{system.error}，10 秒后重试</div>}
      <div className="dashboard-metrics">
        <Stat label="接入账号" value={bots.loading ? "—" : botList.length} detail="已配置的 QQ 机器人" icon={Bot} />
        <Stat label="在线连接" value={bots.loading ? "—" : online} detail={botList.length ? `${Math.round(online / botList.length * 100)}% 账号在线` : "等待添加账号"} icon={PlugZap} tone="success" />
        <Stat label="插件处理器" value={system.loading ? "—" : info.plugins_count ?? 0} detail="已注册的消息处理器" icon={Boxes} />
        <Stat label="受管进程" value={processes.loading ? "—" : processList.filter((item: ApiData) => item.managed).length} detail={`共检测到 ${processList.length} 个进程`} icon={Activity} tone="warning" />
      </div>
      <div className="dashboard-primary">
        <Card className="dashboard-trend">
          <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><Activity className="size-4 text-muted-foreground" />资源变化</CardTitle><span className="text-xs text-muted-foreground">本次会话 · 每 10 秒采样</span></CardHeader>
          <CardContent>
            <div className="trend-summary"><span><i className="cpu-dot" />CPU <b>{info.cpu_percent ?? "—"}%</b></span><span><i className="memory-dot" />内存 <b>{info.memory_percent ?? "—"}%</b></span><span className="trend-sample-count">{samples.length} 个采样点</span></div>
            <div className="trend-plot">
              <svg viewBox="0 0 568 126" preserveAspectRatio="none" role="img" aria-label="当前页面会话中的 CPU 和内存使用率变化，纵轴为百分比">
                <defs><linearGradient id="cpu-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".16" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
                {[0, 50, 100].map((tick) => <g key={tick}><line x1="32" y1={108-tick*.94} x2="552" y2={108-tick*.94} stroke="var(--border)" strokeDasharray="4 5" /><text x="0" y={111-tick*.94} fill="var(--muted-foreground)" fontSize="9">{tick}%</text></g>)}
                {samples.length > 1 && <><path d={trendPath("cpu") + " L552,108 L32,108 Z"} fill="url(#cpu-fill)" /><path d={trendPath("cpu")} fill="none" stroke="var(--primary)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /><path d={trendPath("memory")} fill="none" stroke="var(--dashboard-teal)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></>}
              </svg>
              {samples.length < 2 && <p className="trend-waiting">{system.loading ? "读取资源数据…" : "正在采集，下一次采样后显示趋势"}</p>}
            </div>
            <div className="trend-axis"><span>{samples[0] ? new Date(samples[0].time).toLocaleTimeString('zh-CN', {hour12:false}) : "—"}</span><span>仅展示真实采样数据</span><span>{samples.length > 1 ? new Date(samples[samples.length-1].time).toLocaleTimeString('zh-CN', {hour12:false}) : "—"}</span></div>
          </CardContent>
        </Card>
        <Card className="dashboard-resources">
          <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><Cpu className="size-4 text-muted-foreground" />资源监控</CardTitle><span className="soft-status">实时</span></CardHeader>
          <CardContent>{[{label:"CPU", Icon:Cpu, value:info.cpu_percent, detail:`${info.cpu_cores ?? "—"} 核处理器`, process:`框架占用 ${info.framework_cpu_percent ?? "—"}%`, tone:"cpu"}, {label:"内存", Icon:Database, value:info.memory_percent, detail:`${formatBytes((info.memory_used ?? 0)*1024*1024)} / ${formatBytes((info.memory_total ?? 0)*1024*1024)}`, process:`框架 ${info.framework_memory_total ?? "—"} MB`, tone:"memory"}].map(({label,Icon,value,detail,process,tone}) => <div key={label} className={`resource-row ${tone}`}><div className="resource-label"><span><Icon className="size-4" />{label}<small>系统占用</small></span><b>{value ?? "—"}<small>%</small></b></div><div className="resource-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(value)}><span style={{width:percent(value)+"%"}} /></div><div className="resource-detail"><span>{detail}</span><span>{process}</span></div></div>)}</CardContent>
        </Card>
      </div>
      <div className="dashboard-secondary">
        <Card className="dashboard-accounts">
          <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><Bot className="size-4 text-muted-foreground" />账号状态</CardTitle><Button variant="ghost" size="sm" onClick={() => navigate("access")}>管理 <ChevronRight className="size-3.5" /></Button></CardHeader>
          <CardContent>{bots.loading ? <Loading /> : botList.length ? <div className="dashboard-account-list">{botList.slice(0,4).map((bot: ApiData,index:number) => <div className="dashboard-account-row" key={bot.bot_id || bot.bot_qq || index}><span className={cn("connection-dot",bot.connected && "online")} /><span className="truncate font-medium">{bot.name || bot.nickname || bot.qq || bot.bot_qq || "未命名账号"}</span><span className="account-number">{bot.qq || bot.bot_qq}</span><span className="account-state">{bot.connected ? "在线" : "离线"}</span></div>)}</div> : <div className="dashboard-no-accounts"><Bot className="size-6 text-muted-foreground" /><span>还没有接入账号</span><Button size="sm" variant="outline" onClick={() => navigate("access")}>添加接入</Button></div>}</CardContent>
        </Card>

        <Card className="dashboard-dependencies">
          <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><Boxes className="size-4 text-muted-foreground" />运行环境</CardTitle><span className="soft-status">{dependencyList.filter(item => item.status === "ok").length} 项正常</span></CardHeader>
          <CardContent>{dependencies.loading ? <Loading /> : <div className="dependency-grid">{dependencyList.map(item => <div key={String(item.name)} className="dependency-tile"><div><span>{item.name}</span><i className={item.status === "ok" ? "online" : "missing"} /></div><div><code>{item.installed || "缺失"}</code><span title={String(item.required || "")}>{item.required || "已安装"}</span></div></div>)}</div>}</CardContent>
        </Card>
      </div>
      <footer className="dashboard-footer"><div className="dashboard-runtime"><span><Server className="size-3.5" />{info.platform || "运行环境"}</span><span>已运行 {formatUptime(info.uptime ?? 0)}</span><span title={String(info.system_version || "")}>磁盘 {info.disk_info?.percent ?? "—"}%</span></div><div className="dashboard-footer-actions"><Button variant="ghost" size="sm" onClick={() => navigate("logs")}><Terminal className="size-3.5" />日志</Button><Button variant="ghost" size="sm" onClick={() => navigate("plugins")}><Boxes className="size-3.5" />插件</Button><Button variant="ghost" size="sm" onClick={restart}><RotateCw className="size-3.5" />重启</Button></div></footer>
    </section>
  );
}

/* legacy access pages removed: access is now handled by src/access-page.tsx */
/*
export function ProcessesPage({ compact = false }: { compact?: boolean }) {
  const { data, loading, error } = useData(
    useCallback(() => api<ApiData>("/api/processes"), []),
    { processes: [] },
  );
  const [busy, setBusy] = useState("");
  const list = Array.isArray(data.processes) ? data.processes : [];
  const action = async (item: ApiData, kind: "start" | "stop") => {
    if (item.managed && !item.bot_id) return;
    if (!item.managed && !item.pid) return;
    if (
      !item.managed &&
      kind === "start" &&
      !Boolean(
        `连接已登录的 QQ 进程 PID ${item.pid}？`,
      )
    )
      return;
    setBusy(item.id);
    try {
      if (item.managed) {
        await api("/api/embedded/" + kind, {
          method: "POST",
          body: JSON.stringify({ bot_id: item.bot_id }),
        });
      } else {
        await api(
          `/api/processes/${item.pid}/${kind === "start" ? "load" : "unload"}`,
          { method: "POST", body: "{}" },
        );
      }
      window.location.reload();
    } catch (cause) {
      void (cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy("");
    }
  };
  const counts = [
    ["已发现", list.length],
    ["受管账号", list.filter((item: ApiData) => item.managed).length],
    [
      "可连接",
      list.filter((item: ApiData) => !item.managed && item.can_load).length,
    ],
    [
      "已加载",
      list.filter(
        (item: ApiData) => item.status === "loaded" || item.status === "online",
      ).length,
    ],
  ];
  return (
    <section className="space-y-6">
      {!compact && (
        <Heading
          icon={PlugZap}
          title="QQ 进程"
          detail="查找已登录的 QQ 并连接账号"
        />
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {counts.map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-lg border border-border/60 bg-card px-4 py-3"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>QQ 进程</CardTitle>
            <CardDescription>
              请先安装并登录 QQ，再选择对应进程连接。不会关闭或重启 QQ。
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="size-3.5" />
            刷新
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorText text={error} />
          ) : list.length ? (
            list.map((item: ApiData) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      "mt-1 size-2.5 shrink-0 rounded-full",
                      item.status === "online" || item.status === "loaded"
                        ? "bg-emerald-500"
                        : item.status === "error"
                          ? "bg-red-500"
                          : "bg-amber-500",
                    )}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">
                        {item.name || item.process_name}
                      </strong>
                      <Badge
                        variant={
                          item.status === "online" || item.status === "loaded"
                            ? "success"
                            : item.status === "error"
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {item.status === "detected"
                          ? "已发现"
                          : item.status === "online"
                            ? "已在线"
                            : item.status === "loaded"
                              ? "已加载"
                              : item.status || "未知"}
                      </Badge>
                      {item.managed && <Badge variant="secondary">受管</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      PID {item.pid || "—"}
                      {item.uin ? " · QQ " + item.uin : ""}
                      {item.memory_rss_mb
                        ? " · " + item.memory_rss_mb + " MB"
                        : ""}
                    </p>
                    {item.error && (
                      <p className="mt-2 text-xs text-amber-600">
                        {item.error}
                      </p>
                    )}
                    {item.path && (
                      <p
                        className="mt-1 truncate text-xs text-muted-foreground"
                        title={item.path}
                      >
                        {item.path}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.can_load && (
                    <Button
                      size="sm"
                      disabled={busy === item.id}
                      onClick={() => action(item, "start")}
                    >
                      {busy === item.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Zap className="size-3.5" />
                      )}
                      {item.managed ? "启动" : "连接"}
                    </Button>
                  )}
                  {item.can_unload && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === item.id}
                      onClick={() => action(item, "stop")}
                    >
                      {item.managed ? "停止" : "卸载"}
                    </Button>
                  )}
                  {!item.can_load && !item.can_unload && (
                    <span className="self-center text-xs text-muted-foreground">
                      不可操作
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <Empty
              icon={Activity}
              text="未检测到 QQ 主进程，请先启动并登录 QQ"
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function BotsPage({ compact = false }: { compact?: boolean }) {
  const toast = useToast();
  const [bots, setBots] = useState<ApiData[]>([]);
  const [versions, setVersions] = useState<ApiData[]>([]);
  const [qqStatus, setQqStatus] = useState<ApiData>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({
    bot_id: "",
    nickname: "",
    uin: "",
    qq_version_key: "",
    force_quick_login: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [botData, versionData, statusData] = await Promise.all([
        api<ApiData>("/api/bots"),
        api<ApiData>("/api/qq/versions"),
        api<ApiData>("/api/qq/status"),
      ]);
      const nextVersions = Array.isArray(versionData.versions)
        ? versionData.versions
        : [];
      setBots(Array.isArray(botData.bots) ? botData.bots : []);
      setVersions(nextVersions);
      setQqStatus(statusData.status || {});
      setForm((value) => ({
        ...value,
        qq_version_key:
          value.qq_version_key ||
          nextVersions.find((item: ApiData) => item.recommended)?.key ||
          nextVersions.find((item: ApiData) => item.compatible)?.key ||
          "",
      }));
      setLoadError("");
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "账号信息读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!form.bot_id.trim()) {
      toast("请输入账号标识", { variant: "error" });
      return;
    }
    setBusy("create");
    try {
      await api("/api/embedded/bots", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm((value) => ({ ...value, bot_id: "", nickname: "", uin: "" }));
      await load();
      toast("账号已创建");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "创建失败", {
        variant: "error",
      });
    } finally {
      setBusy("");
    }
  };

  const botAction = async (
    bot: ApiData,
    action: "start" | "stop" | "delete" | "qr/refresh",
  ) => {
    const botId = String(bot.bot_id || "");
    if (!botId) return;
    if (
      action === "delete" &&
      !Boolean(`删除账号 ${bot.name || botId}？账号数据默认保留。`)
    )
      return;
    setBusy(`${action}:${botId}`);
    try {
      await api(`/api/embedded/${action}`, {
        method: "POST",
        body: JSON.stringify({ bot_id: botId, cleanup_data: false }),
      });
      await load();
      toast(
        action === "delete"
          ? "账号已删除"
          : action === "start"
            ? "账号已启动"
            : action === "stop"
              ? "账号已停止"
              : "二维码已刷新",
      );
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "操作失败", {
        variant: "error",
      });
    } finally {
      setBusy("");
    }
  };

  const updateBot = async (
    bot: ApiData,
    endpoint: "version" | "quick-login",
    value: string | boolean,
  ) => {
    const botId = String(bot.bot_id || "");
    setBusy(`${endpoint}:${botId}`);
    try {
      const body =
        endpoint === "version"
          ? { bot_id: botId, qq_version_key: value }
          : { bot_id: botId, enabled: value };
      await api(`/api/embedded/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await load();
      toast(endpoint === "version" ? "QQ 版本已保存" : "快捷登录设置已保存");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "保存失败", {
        variant: "error",
      });
    } finally {
      setBusy("");
    }
  };

  const qqAction = async (
    action: "install" | "download" | "cleanup" | "uninstall",
    versionKey: string,
  ) => {
    if (
      action === "uninstall" &&
      !Boolean("卸载框架管理的 QQ？系统外部安装的 QQ 不会被自动删除。")
    )
      return;
    setBusy(`qq:${action}:${versionKey}`);
    try {
      const result = await api<ApiData>(`/api/qq/${action}`, {
        method: "POST",
        body: JSON.stringify({ version_key: versionKey, auto_download: true }),
      });
      toast(String(result.message || result.job?.message || "任务已提交"));
      await load();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "QQ 客户端操作失败", {
        variant: "error",
      });
    } finally {
      setBusy("");
    }
  };

  const compatible = versions.filter((item) => item.compatible);
  const openOfficialQQ = () => {
    window.open(
      String(qqStatus.official_download_url || "https://im.qq.com/index/#/"),
      "_blank",
      "noopener,noreferrer",
    );
  };
  return (
    <section className="space-y-6">
      {!compact && (
        <Heading
          icon={Bot}
          title="账号与连接"
          detail="管理 QQ 账号与内置运行时"
        />
      )}
      {loadError && (
        <div className="rounded-lg border border-border/60 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          {loadError}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>添加内置账号</CardTitle>
          <CardDescription>
            创建后可启动 QQ，通过二维码或快捷登录完成接入。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Input
            value={form.bot_id}
            onChange={(event) =>
              setForm({ ...form, bot_id: event.target.value })
            }
            placeholder="账号标识（必填）"
          />
          <Input
            value={form.nickname}
            onChange={(event) =>
              setForm({ ...form, nickname: event.target.value })
            }
            placeholder="显示名称"
          />
          <Input
            value={form.uin}
            onChange={(event) => setForm({ ...form, uin: event.target.value })}
            placeholder="QQ 号（可选）"
          />
          <select
            value={form.qq_version_key}
            onChange={(event) =>
              setForm({ ...form, qq_version_key: event.target.value })
            }
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {compatible.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} {item.version}
              </option>
            ))}
          </select>
          <Button onClick={create} disabled={busy === "create"}>
            {busy === "create" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            添加账号
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2 xl:col-span-5">
            <input
              type="checkbox"
              checked={form.force_quick_login}
              onChange={(event) =>
                setForm({ ...form, force_quick_login: event.target.checked })
              }
            />
            优先使用快捷登录
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {loading ? (
          <Loading />
        ) : bots.length ? (
          bots.map((bot, index) => {
            const botId = String(bot.bot_id || "");
            const running = Boolean(
              bot.pid ||
              bot.connected ||
              ["logging_in", "waiting_qr", "authorizing", "online"].includes(
                String(bot.status),
              ),
            );
            return (
              <Card key={botId || bot.bot_qq || index}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Bot className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">
                          {bot.name || botId}
                        </h3>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {botId} · QQ {bot.qq || "等待登录"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        bot.connected
                          ? "success"
                          : running
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {bot.connected
                        ? "已连接"
                        : running
                          ? bot.status || "启动中"
                          : "已停止"}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-md bg-muted/60 p-2.5">
                      <span className="text-muted-foreground">运行方式</span>
                      <p className="mt-1 truncate font-medium">
                        {bot.runtime_mode ||
                          bot.connection_type ||
                          "Embedded QQ"}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/60 p-2.5">
                      <span className="text-muted-foreground">运行信息</span>
                      <p className="mt-1 truncate font-medium">
                        {bot.pid ? `PID ${bot.pid}` : "未运行"}
                      </p>
                    </div>
                  </div>
                  {bot.error && (
                    <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {bot.error}
                    </p>
                  )}
                  {(bot.qrcode || bot.qrcode_url) && (
                    <div className="mt-3 flex items-center gap-3 rounded-lg border p-3">
                      {bot.qrcode && (
                        <img
                          className="size-24 rounded-md bg-white object-contain"
                          src={
                            String(bot.qrcode).startsWith("data:")
                              ? bot.qrcode
                              : `data:image/png;base64,${bot.qrcode}`
                          }
                          alt="QQ 登录二维码"
                        />
                      )}
                      <div>
                        <p className="text-sm font-medium">扫码登录 QQ</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          二维码失效时点击刷新。
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <select
                      value={bot.qq_version_key || ""}
                      disabled={running || busy.startsWith("version:")}
                      onChange={(event) =>
                        updateBot(bot, "version", event.target.value)
                      }
                      className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm"
                    >
                      {compatible.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label} {item.version}
                        </option>
                      ))}
                    </select>
                    <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={Boolean(bot.force_quick_login)}
                        onChange={(event) =>
                          updateBot(bot, "quick-login", event.target.checked)
                        }
                      />
                      快捷登录
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {running ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `stop:${botId}`}
                        onClick={() => botAction(bot, "stop")}
                      >
                        <Square className="size-3.5" />
                        停止
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy === `start:${botId}`}
                        onClick={() => botAction(bot, "start")}
                      >
                        <Play className="size-3.5" />
                        启动
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!running || busy === `qr/refresh:${botId}`}
                      onClick={() => botAction(bot, "qr/refresh")}
                    >
                      <QrCode className="size-3.5" />
                      刷新二维码
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={running || busy === `delete:${botId}`}
                      onClick={() => botAction(bot, "delete")}
                    >
                      <Trash2 className="size-3.5" />
                      删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="lg:col-span-2">
            <CardContent className="p-10">
              <Empty
                icon={Bot}
                text="还没有内置 QQ 账号，可在上方创建，或在 QQ 进程页签连接已登录的 QQ。"
              />
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>QQ 客户端</CardTitle>
            <CardDescription>
              {qqStatus.qq_executable ||
                (qqStatus.install_strategy === "official_website"
                  ? "Windows QQ 由用户自行安装并登录"
                  : "尚未检测到 QQ 可执行文件")}
            </CardDescription>
          </div>
          <Badge variant={qqStatus.installed ? "success" : "secondary"}>
            {qqStatus.installed ? "系统安装" : "未安装"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {qqStatus.install_strategy === "official_website" ? (
            <div className="flex flex-col gap-4 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Windows QQ</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  前往 QQ 官网下载安装，登录后再到 QQ 进程页签操作。
                </p>
              </div>
              <Button onClick={openOfficialQQ}>
                <ExternalLink className="size-3.5" />
                前往 QQ 官网
              </Button>
            </div>
          ) : (
            compatible.map((item) => (
              <div
                key={item.key}
                className="flex flex-col gap-3 rounded-lg border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {item.label} {item.version}
                    </span>
                    {item.recommended && <Badge>推荐</Badge>}
                    {item.installed && <Badge variant="success">已安装</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.platform} {item.arch} · {item.size}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy.startsWith("qq:")}
                    onClick={() => qqAction("download", item.key)}
                  >
                    <Download className="size-3.5" />
                    下载
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy.startsWith("qq:")}
                    onClick={() => qqAction("install", item.key)}
                  >
                    <PackageCheck className="size-3.5" />
                    安装
                  </Button>
                  {item.downloaded && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => qqAction("cleanup", item.key)}
                    >
                      清理缓存
                    </Button>
                  )}
                  {item.installed && qqStatus.managed_install && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => qqAction("uninstall", item.key)}
                    >
                      <Trash2 className="size-3.5" />
                      卸载
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}

type AccessTab = "processes" | "accounts" | "connections";

const accessTabs: Array<{
  id: AccessTab;
  label: string;
  icon: Icon;
}> = [
  { id: "processes", label: "QQ 进程", icon: PlugZap },
  { id: "accounts", label: "QQ 账号", icon: Bot },
  { id: "connections", label: "OneBot 网络", icon: Network },
];

export function AccessCenterPage() {
  const [tab, setTab] = useState<AccessTab>("processes");
  return (
    <section className="space-y-6">
      <Heading
        icon={PlugZap}
        title="接入中心"
        detail="在同一处管理 QQ 进程、账号与 OneBot 网络连接"
      />
      <div className="flex flex-wrap gap-2 border-b border-border/60 pb-3">
        {accessTabs.map(({ id, label, icon: TabIcon }) => (
          <Button
            key={id}
            size="sm"
            variant={tab === id ? "default" : "outline"}
            onClick={() => setTab(id)}
          >
            <TabIcon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
      {tab === "processes" ? (
        <ProcessesPage compact />
      ) : tab === "accounts" ? (
        <BotsPage compact />
      ) : (
        <ConnectionsPage compact />
      )}
    </section>
  );
}

*/
export function LogsPage() {
  const { data, loading, error } = useData(
    useCallback(() => api<ApiData>("/api/logs/recent"), []),
    { framework: [], message: [], error: [], lifecycle: [] },
  );
  const rows = [
    ...(data.framework || []),
    ...(data.error || []),
    ...(data.lifecycle || []),
  ]
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
    .slice(-200);
  return (
    <section className="space-y-6">
      <Heading
        icon={Terminal}
        title="日志"
        detail="框架事件、QQ 生命周期和错误日志"
      />
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>实时事件流</CardTitle>
            <CardDescription>最近 {rows.length} 条记录</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="size-3.5" />
            刷新
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorText text={error} />
          ) : rows.length ? (
            <div className="max-h-[min(600px,60vh)] overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs text-slate-200">
              {rows.map((row: ApiData, index: number) => (
                <div
                  key={String(row.id || index) + String(row.timestamp)}
                  className="flex gap-3 border-b border-white/5 py-2 last:border-0"
                >
                  <span className="shrink-0 text-slate-500">
                    {row.timestamp || "—"}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold",
                      row.level === "ERROR"
                        ? "text-red-400"
                        : row.level === "WARNING"
                          ? "text-amber-400"
                          : "text-sky-300",
                    )}
                  >
                    {row.level || "INFO"}
                  </span>
                  <span className="min-w-0 break-words text-slate-300">
                    {row.content || row.message || row.type_label || "事件"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={Terminal} text="暂无日志记录" />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function SettingsPage() {
  const { data, loading, error } = useData(
    useCallback(() => api<ApiData>("/api/system/info"), []),
    {},
  );
  return (
    <section className="space-y-6">
      <Heading
        icon={Settings}
        title="系统设置"
        detail="查看 ElainaBot 运行环境与服务信息"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>运行环境</CardTitle>
            <CardDescription>当前框架进程的资源使用</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {loading ? (
              <Loading />
            ) : error ? (
              <ErrorText text={error} />
            ) : (
              <>
                <InfoRow
                  icon={Cpu}
                  label="处理器"
                  value={
                    (data.cpu_model || "未知") +
                    " · " +
                    (data.cpu_cores || "—") +
                    " 核"
                  }
                />
                <InfoRow
                  icon={Activity}
                  label="CPU 使用率"
                  value={(data.framework_cpu_percent || 0) + "%"}
                />
                <InfoRow
                  icon={Database}
                  label="框架内存"
                  value={(data.framework_memory_total || 0) + " MB"}
                />
                <InfoRow
                  icon={HardDrive}
                  label="磁盘使用率"
                  value={(data.disk_info?.percent || 0) + "%"}
                />
                <InfoRow
                  icon={Zap}
                  label="启动时间"
                  value={data.start_time || "未知"}
                />
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>面板信息</CardTitle>
            <CardDescription>ElainaBot WebUI</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-primary/5 p-4">
              <div className="flex items-center gap-3">
                <Logo className="size-11" />
                <div>
                  <p className="font-semibold">ElainaBot</p>
                  <p className="text-xs text-muted-foreground">
                    QQ 机器人框架
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              本面板采用 SnowLuma WebUI 的 React/Tailwind 结构重构，并针对
              ElainaBot 的 QQ 账号与 OneBot 接口进行了适配。
            </p>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Elaina Core. All rights reserved.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

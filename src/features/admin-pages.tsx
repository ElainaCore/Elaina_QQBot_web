import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  RefreshCw,
  RotateCw,
  Settings,
  ShieldCheck,
  Terminal,
  Trash2,
  Unlock,
} from "lucide-react";
import { api, type ApiData } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Busy, FeatureHeading, Notice, errorMessage } from "@/features/shared";
import { cn } from "@/lib/utils";
import { Logo } from "@/App";
import { JsonTree } from "@/components/ui/json-tree";
import { useAppDialog } from "@/components/ui/app-dialog";

const logTypes = [
  { id: "message", label: "消息" },
  { id: "lifecycle", label: "事件" },
  { id: "framework", label: "框架" },
  { id: "error", label: "错误" },
  { id: "login", label: "登录" },
] as const;

function responseValue(row: ApiData) {
  return row.raw_response ?? row.raw_data ?? row.raw_message ?? row;
}

function logRowKey(row: ApiData) {
  return [
    row.message_id || "",
    row.timestamp || "",
    row.bot_qq || row.source || "",
    row.group_id || "",
    row.user_id || "",
    row.direction || "",
    row.content || row.message || row.event_type || "",
  ].join("|");
}

function mergeLogRows(current: ApiData[], incoming: ApiData[], limit = 500) {
  const merged = new Map<string, ApiData>();
  for (const row of [...current, ...incoming]) merged.set(logRowKey(row), row);
  return Array.from(merged.values()).slice(-limit);
}

function LogRow({ row, tab }: { row: ApiData; tab: string }) {
  const isMessage = tab === "message";
  const outgoing = row.direction === "send";
  const senderQq = String(
    row.sender_qq ||
      (row.group_id ? row.user_id || (outgoing ? row.bot_qq : "") : row.user_id || ""),
  );
  const senderName = String(row.nickname || row.sender_name || row.sender || "");
  const senderLabel = senderName && senderName !== senderQq
    ? senderName + (senderQq ? "（" + senderQq + "）" : "")
    : senderQq ? "QQ " + senderQq : "";
  const location = String(
    row.location ||
      (row.group_id ? "群 " + row.group_id : row.user_id ? "QQ " + row.user_id : ""),
  );
  const baseTitle = String(row.content || row.message || row.type_label || row.event_type || row.source || "记录");
  const title = isMessage
    ? [outgoing ? "发送" : "接收", location, row.group_id && senderLabel ? senderLabel : "", baseTitle].filter(Boolean).join(" · ")
    : [row.type_label || row.event_type, location, row.content].filter(Boolean).join(" · ") || baseTitle;
  const tone =
    tab === "error"
      ? "border-red-200/70 bg-red-50/40"
      : tab === "message"
        ? "border-sky-200/70 bg-sky-50/30"
        : tab === "lifecycle"
          ? "border-violet-200/70 bg-violet-50/30"
          : "border-border/60 bg-card";
  return (
    <details
      className={cn(
        "group rounded-lg border p-3 transition-colors open:shadow-sm",
        tone,
      )}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-start gap-2 sm:flex-nowrap sm:gap-3 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        {isMessage && (outgoing ? <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-sky-600" /> : <ArrowDownLeft className="mt-0.5 size-4 shrink-0 text-emerald-600" />)}
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {row.timestamp || "—"}
        </span>
        <span className="min-w-0 basis-[calc(100%-3rem)] break-words text-sm font-medium sm:flex-1 sm:basis-auto">
          {title}
        </span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">原始响应</span>
      </summary>
      <div className="mt-3 space-y-2 border-t border-border/60 pt-3 sm:ml-7">
        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
          <span>
            {isMessage ? "方向：" : "级别："}
            {String(
              isMessage ? (outgoing ? "发送" : "接收") : row.level || "INFO",
            )}
          </span>
          {(row.bot_qq || row.source) && <span>机器人 QQ：{String(row.bot_qq || row.source)}</span>}
          {row.group_id && <span>群号：{String(row.group_id)}</span>}
          {row.group_id && senderLabel && <span>发送者：{senderLabel}</span>}
          {!row.group_id && row.user_id && <span>好友 QQ：{String(row.user_id)}</span>}
        </div>
        <JsonTree data={responseValue(row)} maxHeight="18rem" />
      </div>
    </details>
  );
}

export function LogsPage() {
  const [data, setData] = useState<ApiData>({
    framework: [],
    message: [],
    lifecycle: [],
    error: [],
  });
  const [login, setLogin] = useState<ApiData>({ data: [], stats: {} });
  const [tab, setTab] = useState<(typeof logTypes)[number]["id"]>("message");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [liveTransport, setLiveTransport] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const appendLiveLog = useCallback((payload: ApiData) => {
    const logType = String(payload.log_type || "");
    if (!["message", "lifecycle", "framework", "error"].includes(logType)) return;
    const entry = { ...payload };
    delete entry.log_type;
    if (logType === "message") {
      entry.source ||= entry.bot_qq || "";
      entry.location ||= entry.group_id ? "群 " + entry.group_id : entry.user_id ? "QQ " + entry.user_id : "";
      entry.nickname ||= entry.sender_name || entry.sender || "";
      entry.sender_qq ||= entry.group_id ? entry.user_id || (entry.direction === "send" ? entry.bot_qq : "") : entry.user_id || "";
    }
    setData((current) => ({
      ...current,
      [logType]: mergeLogRows(Array.isArray(current[logType]) ? current[logType] : [], [entry]),
    }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recent, loginData] = await Promise.all([
        api<ApiData>("/api/logs/recent"),
        api<ApiData>("/api/logs/login"),
      ]);
      setData((current) => {
        const next = { ...recent };
        for (const type of ["message", "lifecycle", "framework", "error"]) {
          const fetched = Array.isArray(recent[type]) ? recent[type] : [];
          const existing = Array.isArray(current[type]) ? current[type] : [];
          next[type] = mergeLogRows(fetched, existing);
        }
        return next;
      });
      setLogin(loginData);
    } catch (error) {
      setNotice(errorMessage(error, "日志读取失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let socketFailures = 0;

    const handleMessage = (raw: string) => {
      try {
        const message = JSON.parse(raw);
        if (message.type === "new_log" && message.data) appendLiveLog(message.data);
      } catch {
        // Ignore malformed push payloads and keep the live connection running.
      }
    };
    const schedule = (connect: () => void) => {
      if (disposed || reconnectTimer !== null) return;
      setLiveStatus("offline");
      reconnectTimer = window.setTimeout(() => { reconnectTimer = null; connect(); }, 2500);
    };
    const connectSse = () => {
      if (disposed) return;
      setLiveStatus("connecting");
      source = new EventSource("/api/sse/panel");
      source.onopen = () => { setLiveStatus("live"); setLiveTransport("SSE"); };
      source.onmessage = (event) => handleMessage(event.data);
      source.onerror = () => {
        source?.close();
        source = null;
        schedule(connectSse);
      };
    };
    const connectSocket = () => {
      if (disposed) return;
      setLiveStatus("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(protocol + "//" + window.location.host + "/ws/panel");
      socket.onopen = () => { socketFailures = 0; setLiveStatus("live"); setLiveTransport("WebSocket"); };
      socket.onmessage = (event) => handleMessage(String(event.data || ""));
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        socket = null;
        if (disposed) return;
        socketFailures += 1;
        if (socketFailures >= 2) connectSse();
        else schedule(connectSocket);
      };
    };

    connectSocket();
    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socket) { socket.onclose = null; socket.close(); }
      source?.close();
    };
  }, [appendLiveLog]);
  const rows = useMemo(
    () => (tab === "login" ? [] : Array.isArray(data[tab]) ? data[tab] : []),
    [data, tab],
  );
  const loginRows = Array.isArray(login.data) ? login.data : [];

  useEffect(() => {
    if (!autoScroll || tab === "login" || loading) return;
    let cancelled = false;
    const scrollLatest = () => {
      if (cancelled) return;
      const container = logContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
        container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
      }
    };
    const frame = window.requestAnimationFrame(() => {
      scrollLatest();
      window.setTimeout(scrollLatest, 80);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [autoScroll, loading, rows.length, tab]);

  const loginAction = async (path: string, ip: string) => {
    try {
      const result = await api<ApiData>(path, {
        method: "POST",
        body: JSON.stringify({ ip }),
      });
      setNotice(String(result.message || "操作完成"));
      await load();
    } catch (error) {
      setNotice(errorMessage(error, "操作失败"));
    }
  };

  return (
    <section className="space-y-6">
      <FeatureHeading
        icon={Terminal}
        title="日志"
        detail="消息、事件、框架、错误与登录记录"
      />
      {notice && <Notice text={notice} error={notice.includes("失败")} />}
      <div className="flex flex-wrap items-center gap-2">
        {logTypes.map((item) => {
          const count =
            item.id === "login"
              ? loginRows.length
              : Array.isArray(data[item.id])
                ? data[item.id].length
                : 0;
          return (
            <Button
              key={item.id}
              size="sm"
              variant={tab === item.id ? "default" : "outline"}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              <Badge
                variant={
                  item.id === "error"
                    ? "destructive"
                    : tab === item.id
                      ? "outline"
                      : "secondary"
                }
              >
                {count}
              </Badge>
              {item.id === "login" && login.stats?.banned ? (
                <Badge variant="destructive">{login.stats.banned} 限制</Badge>
              ) : null}
            </Button>
          );
        })}
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw className="size-3.5" />
          刷新
        </Button>
        <label className="flex w-full items-center gap-2 text-xs text-muted-foreground sm:ml-auto sm:w-auto">
          <input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} />
          自动滚动
        </label>
        <Badge variant={liveStatus === "live" ? "success" : "secondary"}>
          {liveStatus === "live" ? "实时 · " + liveTransport : liveStatus === "connecting" ? "正在连接" : "正在重连"}
        </Badge>
      </div>
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          {loading ? (
            <Busy />
          ) : tab === "login" ? (
            loginRows.length ? (
              <div className="space-y-2">
                {loginRows.map((row: ApiData, index: number) => (
                  <details
                    key={String(row.ip || index)}
                    className="group rounded-lg border border-border/60 bg-card p-3"
                  >
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3 [&::-webkit-details-marker]:hidden">
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {row.ip || "未知 IP"}
                          <Badge
                            variant={row.is_banned ? "destructive" : "success"}
                          >
                            {row.is_banned ? "已限制" : "正常"}
                          </Badge>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          失败 {row.fail_count ?? 0} 次 · 最近访问{" "}
                          {row.last_access || "无时间记录"}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        原始响应
                      </span>
                    </summary>
                    <div className="ml-7 mt-3 space-y-3 border-t border-border/60 pt-3">
                      <div className="flex gap-2">
                        {row.is_banned && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.preventDefault();
                              loginAction("/api/logs/unban", String(row.ip));
                            }}
                          >
                            <Unlock className="size-3.5" />
                            解封
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={(event) => {
                            event.preventDefault();
                            loginAction("/api/logs/delete-ip", String(row.ip));
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          删除记录
                        </Button>
                      </div>
                      <JsonTree
                        data={row.raw_response ?? row}
                        maxHeight="16rem"
                      />
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <Notice text="暂无登录记录" />
            )
          ) : rows.length ? (
            <div ref={logContainerRef} className="max-h-[min(680px,68vh)] space-y-2 overflow-auto pr-1">
              {rows.map((row: ApiData, index: number) => (
                <LogRow
                  key={String(row.id || index) + String(row.timestamp)}
                  row={row}
                  tab={tab}
                />
              ))}
            </div>
          ) : (
            <Notice text="暂无日志记录" />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-muted/60">
      <span className="text-muted-foreground">{label}</span>
      <span
        className="max-w-[65%] truncate text-right font-medium"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function SettingsPage() {
  const dialog = useAppDialog();
  const [system, setSystem] = useState<ApiData>({});
  const [dependencies, setDependencies] = useState<ApiData>({
    dependencies: [],
  });
  const [password, setPassword] = useState<ApiData>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([
      api<ApiData>("/api/system/info"),
      api<ApiData>("/api/system/dependencies"),
      api<ApiData>("/api/auth/password-status"),
    ])
      .then(([systemData, dependencyData, passwordData]) => {
        setSystem(systemData);
        setDependencies(dependencyData);
        setPassword(passwordData);
      })
      .catch((error) => setNotice(errorMessage(error, "系统信息读取失败")))
      .finally(() => setLoading(false));
  }, []);

  const restart = async () => {
    if (!await dialog.confirm({ title: "重启框架", description: "重启 ElainaBot？Web 面板会短暂断开。", confirmLabel: "重启", destructive: true })) return;
    try {
      const result = await api<ApiData>("/api/bot/restart", { method: "POST" });
      setNotice(String(result.message || "正在重启"));
    } catch (error) {
      setNotice(errorMessage(error, "重启失败"));
    }
  };

  return (
    <section className="space-y-6">
      <FeatureHeading
        icon={Settings}
        title="系统设置"
        detail="运行环境、依赖状态、安全提示与维护操作"
      />
      {notice && <Notice text={notice} error={notice.includes("失败")} />}
      {(password.is_default || password.is_weak) && (
        <div className="flex min-h-12 items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3.5 text-sm leading-6 text-amber-900 sm:items-center">
          <ShieldCheck className="size-5" />
          <span className="min-w-0 break-words">
            当前管理员密码为默认或弱密码，请在框架配置中修改后重启框架。
          </span>
        </div>
      )}
      {loading ? (
        <Busy />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>运行环境</CardTitle>
              <CardDescription>当前框架进程的资源使用</CardDescription>
            </CardHeader>
            <CardContent>
              <InfoRow
                label="处理器"
                value={
                  (system.cpu_model || "未知") +
                  " · " +
                  (system.cpu_cores || "—") +
                  " 核"
                }
              />
              <InfoRow
                label="CPU 使用率"
                value={(system.framework_cpu_percent || 0) + "%"}
              />
              <InfoRow
                label="框架内存"
                value={(system.framework_memory_total || 0) + " MB"}
              />
              <InfoRow
                label="磁盘使用率"
                value={(system.disk_info?.percent || 0) + "%"}
              />
              <InfoRow label="启动时间" value={system.start_time || "未知"} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>运行依赖</CardTitle>
              <CardDescription>
                Python {dependencies.python?.version || "未知"} · 要求{" "}
                {dependencies.python?.required || "—"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(dependencies.dependencies || []).map((item: ApiData) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                >
                  <span className="text-sm">{item.name}</span>
                  <Badge
                    variant={item.status === "ok" ? "success" : "destructive"}
                  >
                    {item.installed || "未安装"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>面板信息</CardTitle>
              <CardDescription>ElainaBot WebUI</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-primary/5 p-4">
                <Logo className="size-11" />
                <div>
                  <p className="font-semibold">ElainaBot</p>
                  <p className="text-xs text-muted-foreground">
                    QQ 机器人框架
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                SnowLuma 风格 React/Tailwind 面板，已接入 ElainaBot 的 QQ
                运行时、OneBot、插件、消息和维护接口。
              </p>
              <p className="text-xs text-muted-foreground">
                © {new Date().getFullYear()} Elaina Core. All rights reserved.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>维护操作</CardTitle>
              <CardDescription>重启会短暂断开所有面板连接</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={restart}>
                <RotateCw className="size-4" />
                重启框架
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}

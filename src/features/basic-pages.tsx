import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import {
  Copy,
  FileCode2,
  Globe2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Server,
  Trash2,
} from "lucide-react";
import { api, type ApiData } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDialog } from "@/components/ui/app-dialog";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Busy,
  EditorBox,
  FeatureHeading,
  Notice,
  errorMessage,
} from "@/features/shared";
import { cn } from "@/lib/utils";

type ConfigFieldKind = "text" | "number" | "boolean" | "list" | "textarea";
type ConfigFieldSpec = {
  section: string;
  key: string;
  label: string;
  kind?: ConfigFieldKind;
  detail?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
};

const visualConfigGroups: Array<{
  title: string;
  detail: string;
  fields: ConfigFieldSpec[];
}> = [
  {
    title: "基础服务",
    detail: "监听地址、面板显示与主人账号",
    fields: [
      {
        section: "server",
        key: "host",
        label: "监听地址",
        placeholder: "127.0.0.1",
      },
      {
        section: "server",
        key: "port",
        label: "服务端口",
        kind: "number",
        min: 1,
        max: 65535,
      },
      { section: "web", key: "framework_name", label: "框架名称" },
      {
        section: "web",
        key: "favicon_url",
        label: "面板图标地址",
        placeholder: "/web/logo.png",
      },
      {
        section: "owner",
        key: "ids",
        label: "主人 QQ",
        kind: "list",
        placeholder: "多个号码用逗号或换行分隔",
      },
      {
        section: "web",
        key: "trust_forwarded_headers",
        label: "信任代理请求头",
        kind: "boolean",
        detail: "仅在受信任的反向代理后启用",
      },
    ],
  },
  {
    title: "QQ 运行时",
    detail: "内置 QQ 的启动方式、通信与资源设置",
    fields: [
      {
        section: "embedded_qq",
        key: "enabled",
        label: "启用内置 QQ",
        kind: "boolean",
        detail: "随框架管理 QQ 运行时",
      },
      {
        section: "embedded_qq",
        key: "headless",
        label: "无界面运行",
        kind: "boolean",
        detail: "不显示 QQ 主窗口",
      },
      {
        section: "embedded_qq",
        key: "single_process",
        label: "单进程模式",
        kind: "boolean",
        detail: "减少辅助进程数量",
      },
      {
        section: "embedded_qq",
        key: "packet_verbose",
        label: "详细数据包日志",
        kind: "boolean",
        detail: "输出额外通信调试信息",
      },
      {
        section: "embedded_qq",
        key: "packet_o3_hook",
        label: "O3 Hook",
        kind: "boolean",
        detail: "启用兼容性 Hook",
      },
      {
        section: "embedded_qq",
        key: "swap_reclaim",
        label: "主动回收交换区",
        kind: "boolean",
        detail: "按目标内存进行资源回收",
      },
      {
        section: "embedded_qq",
        key: "bridge_port_start",
        label: "桥接起始端口",
        kind: "number",
        min: 1,
        max: 65535,
      },
      { section: "embedded_qq", key: "command", label: "启动命令" },
      { section: "embedded_qq", key: "qq_path", label: "QQ 可执行文件" },
      { section: "embedded_qq", key: "data_dir", label: "数据目录" },
      {
        section: "embedded_qq",
        key: "packet_backend",
        label: "数据包后端",
        placeholder: "auto",
      },
      {
        section: "embedded_qq",
        key: "rss_target_mb",
        label: "目标内存（MB）",
        kind: "number",
        min: 0,
      },
    ],
  },
  {
    title: "日志与依赖",
    detail: "持久化、批处理和 Python 依赖安装策略",
    fields: [
      { section: "logging", key: "dir", label: "日志目录" },
      {
        section: "logging",
        key: "retention_days",
        label: "保留天数",
        kind: "number",
        min: 1,
      },
      {
        section: "logging",
        key: "insert_interval",
        label: "写入间隔（秒）",
        kind: "number",
        min: 0,
        step: 0.1,
      },
      {
        section: "logging",
        key: "max_batch_size",
        label: "单批上限",
        kind: "number",
        min: 1,
      },
      {
        section: "logging",
        key: "max_queue_entries",
        label: "队列上限",
        kind: "number",
        min: 1,
      },
      {
        section: "logging",
        key: "wal_mode",
        label: "SQLite WAL 模式",
        kind: "boolean",
        detail: "提高并发读写能力",
      },
      {
        section: "pip",
        key: "auto_install",
        label: "自动安装依赖",
        kind: "boolean",
        detail: "缺少依赖时由框架自动调用 pip",
      },
      {
        section: "pip",
        key: "mirror",
        label: "PyPI 镜像",
        placeholder: "https://pypi.org/simple",
      },
    ],
  },
];

export function ConfigPage() {
  const [content, setContent] = useState("");
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>(
    {},
  );
  const [mode, setMode] = useState<"visual" | "yaml">("visual");
  const [ownerIdsText, setOwnerIdsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [restartRequired, setRestartRequired] = useState<string[]>([]);

  const load = () => {
    setLoading(true);
    api<ApiData>("/api/config")
      .then((data) => {
        setContent(String(data.settings || ""));
        const nextValues =
          data.values && typeof data.values === "object"
            ? (data.values as Record<string, Record<string, unknown>>)
            : {};
        setValues(nextValues);
        const ownerIds = nextValues.owner?.ids;
        setOwnerIdsText(Array.isArray(ownerIds) ? ownerIds.join(", ") : "");
        setNotice("");
      })
      .catch((error) => setNotice(errorMessage(error, "读取配置失败")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const finishSave = (data: ApiData) => {
    if (data.values && typeof data.values === "object") {
      const nextValues = data.values as Record<string, Record<string, unknown>>;
      setValues(nextValues);
      const ownerIds = nextValues.owner?.ids;
      setOwnerIdsText(Array.isArray(ownerIds) ? ownerIds.join(", ") : "");
    }
    setRestartRequired(
      Array.isArray(data.restart_required) ? data.restart_required : [],
    );
    setNotice(String(data.message || "配置已保存"));
  };

  const saveYaml = async () => {
    setSaving(true);
    try {
      const data = await api<ApiData>("/api/config/save", {
        method: "POST",
        body: JSON.stringify({ file: "settings", content }),
      });
      finishSave(data);
    } catch (error) {
      setNotice(errorMessage(error, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const saveVisual = async () => {
    const patch: Record<string, unknown> = {};
    for (const group of visualConfigGroups) {
      for (const field of group.fields) {
        const section = values[field.section];
        if (
          section &&
          Object.hasOwn(section, field.key) &&
          section[field.key] !== undefined
        ) {
          patch[field.section + "." + field.key] =
            field.kind === "list"
              ? ownerIdsText
                  .split(/[\\s,，]+/)
                  .map((item) => item.trim())
                  .filter(Boolean)
              : section[field.key];
        }
      }
    }
    setSaving(true);
    try {
      const data = await api<ApiData>("/api/config/visual", {
        method: "POST",
        body: JSON.stringify({ patch }),
      });
      finishSave(data);
    } catch (error) {
      setNotice(errorMessage(error, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const getValue = (field: ConfigFieldSpec) =>
    values[field.section]?.[field.key];
  const updateValue = (field: ConfigFieldSpec, value: unknown) => {
    setValues((current) => ({
      ...current,
      [field.section]: {
        ...(current[field.section] || {}),
        [field.key]: value,
      },
    }));
  };

  const renderField = (field: ConfigFieldSpec) => {
    const value = getValue(field);
    if (field.kind === "boolean") {
      return (
        <div
          key={field.section + field.key}
          className="flex min-h-14 items-center justify-between gap-4 rounded-md border border-border/60 px-3 py-2"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">{field.label}</span>
            <span className="block text-xs text-muted-foreground">
              {field.detail}
            </span>
          </span>
          <ToggleSwitch
            value={Boolean(value)}
            onChange={(next) => updateValue(field, next)}
            ariaLabel={field.label}
          />
        </div>
      );
    }
    if (field.kind === "textarea") {
      return (
        <label
          key={field.section + field.key}
          className="space-y-1.5 text-sm md:col-span-2 xl:col-span-3"
        >
          <span className="font-medium">{field.label}</span>
          <textarea
            rows={5}
            value={String(value ?? "")}
            onChange={(event) => updateValue(field, event.target.value)}
            className="w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
        </label>
      );
    }
    const displayValue =
      field.kind === "list" ? ownerIdsText : String(value ?? "");
    return (
      <label key={field.section + field.key} className="space-y-1.5 text-sm">
        <span className="font-medium">{field.label}</span>
        <Input
          type={field.kind === "number" ? "number" : "text"}
          value={displayValue}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={field.placeholder}
          onChange={(event) => {
            if (field.kind === "number") {
              updateValue(
                field,
                event.target.value === ""
                  ? undefined
                  : Number(event.target.value),
              );
            } else if (field.kind === "list") {
              setOwnerIdsText(event.target.value);
            } else {
              updateValue(field, event.target.value);
            }
          }}
        />
      </label>
    );
  };

  return (
    <section className="space-y-6">
      <FeatureHeading
        icon={FileCode2}
        title="框架配置"
        detail="可视化修改常用设置，或直接编辑完整 YAML；保存时自动备份"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border border-border bg-muted/40 p-1">
          <Button
            size="sm"
            variant={mode === "visual" ? "default" : "ghost"}
            onClick={() => setMode("visual")}
          >
            可视化
          </Button>
          <Button
            size="sm"
            variant={mode === "yaml" ? "default" : "ghost"}
            onClick={() => setMode("yaml")}
          >
            YAML
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-3.5" />
            重新读取
          </Button>
          <Button
            size="sm"
            disabled={loading || saving}
            onClick={mode === "visual" ? saveVisual : saveYaml}
          >
            <Save className="size-3.5" />
            {saving ? "保存中" : "保存"}
          </Button>
        </div>
      </div>
      {notice && <Notice text={notice} error={notice.includes("失败")} />}
      {restartRequired.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>以下配置需重启框架生效：</span>
          {restartRequired.map((item) => (
            <Badge key={item} variant="outline">
              {item}
            </Badge>
          ))}
        </div>
      )}
      {loading ? (
        <Busy />
      ) : mode === "yaml" ? (
        <Card>
          <CardHeader>
            <CardTitle>settings.yaml</CardTitle>
            <CardDescription>完整框架主配置，适合高级设置</CardDescription>
          </CardHeader>
          <CardContent>
            <EditorBox value={content} onChange={setContent} rows={26} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visualConfigGroups.map((group) => (
            <Card key={group.title}>
              <CardHeader>
                <CardTitle>{group.title}</CardTitle>
                <CardDescription>{group.detail}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.fields.map(renderField)}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

type ConnectionKind = "ws_reverse" | "ws_forward" | "http_server" | "http_client";

const connectionTypes: Record<ConnectionKind, { label: string; detail: string; mode: "server" | "client" }> = {
  ws_reverse: { label: "反向 WebSocket", detail: "框架监听端口，OneBot 实现端主动连接", mode: "server" },
  ws_forward: { label: "正向 WebSocket", detail: "框架主动连接 OneBot WebSocket 服务", mode: "client" },
  http_server: { label: "HTTP 上报", detail: "接收 OneBot 实现端推送的事件", mode: "server" },
  http_client: { label: "HTTP 调用", detail: "通过 HTTP 调用 OneBot 实现端 API", mode: "client" },
};

function newConnection(server: ApiData): ApiData {
  return {
    type: "ws_reverse",
    name: "反向 WebSocket",
    enable: true,
    host: String(server.host || "0.0.0.0"),
    port: Number(server.port || 5201),
    path: "/OneBotv11",
    url: "",
    token: "",
    secret: "",
    reconnect_interval: 5000,
  };
}

export function ConnectionsPage({
  compact = false,
  createSignal = 0,
}: {
  compact?: boolean;
  createSignal?: number;
}) {
  const dialog = useAppDialog();
  const [connections, setConnections] = useState<ApiData[]>([]);
  const [status, setStatus] = useState<ApiData[]>([]);
  const [server, setServer] = useState<ApiData>({ host: "0.0.0.0", port: 5201 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [editIndex, setEditIndex] = useState(-1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<ApiData>(() => newConnection({}));

  const load = () => {
    setLoading(true);
    api<ApiData>("/api/onebot/connections")
      .then((data) => {
        setConnections(Array.isArray(data.connections) ? data.connections : []);
        setStatus(Array.isArray(data.status) ? data.status : []);
        setServer(data.server || { host: "0.0.0.0", port: 5201 });
      })
      .catch((error) => setNotice(errorMessage(error, "读取连接失败")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const persist = async (next: ApiData[], message: string) => {
    setSaving(true);
    try {
      const data = await api<ApiData>("/api/onebot/connections", {
        method: "POST",
        body: JSON.stringify({ connections: next }),
      });
      setConnections(Array.isArray(data.connections) ? data.connections : next);
      setStatus(Array.isArray(data.status) ? data.status : []);
      setNotice(String(data.message || message));
      return true;
    } catch (error) {
      setNotice(errorMessage(error, "保存失败"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const uniqueName = (base: string, skippedIndex = editIndex) => {
    const names = new Set(connections.map((item, index) => (index === skippedIndex ? "" : String(item.name))));
    let name = base;
    let suffix = 2;
    while (names.has(name)) name = `${base} ${suffix++}`;
    return name;
  };

  const openAdd = () => {
    setEditIndex(-1);
    const next = newConnection(server);
    next.name = uniqueName(connectionTypes.ws_reverse.label, -1);
    setForm(next);
    setEditorOpen(true);
  };

  useEffect(() => {
    if (createSignal > 0) openAdd();
    // The signal is intentionally the only trigger; current server data is read when it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSignal]);

  const openEdit = (item: ApiData, index: number) => {
    setEditIndex(index);
    setForm({ ...newConnection(server), ...item });
    setEditorOpen(true);
  };

  const updateType = (type: ConnectionKind) => {
    const defaults = newConnection(server);
    defaults.type = type;
    defaults.name = uniqueName(connectionTypes[type].label);
    defaults.path = type === "ws_reverse" ? "/OneBotv11" : "/";
    defaults.url = type === "ws_forward" ? "ws://127.0.0.1:3001" : type === "http_client" ? "http://127.0.0.1:3000" : "";
    setForm({ ...form, ...defaults });
  };

  const saveForm = async () => {
    if (!String(form.name || "").trim()) {
      setNotice("请填写连接名称");
      return;
    }
    const meta = connectionTypes[form.type as ConnectionKind];
    if (meta.mode === "client" && !String(form.url || "").trim()) {
      setNotice("请填写连接地址");
      return;
    }
    const next = [...connections];
    if (editIndex >= 0) next[editIndex] = form;
    else next.push(form);
    if (await persist(next, "连接配置已保存")) setEditorOpen(false);
  };

  const remove = async (index: number) => {
    const item = connections[index];
    if (!await dialog.confirm({ title: "删除 OneBot 接入", description: `删除 OneBot 接入「${item.name}」？`, confirmLabel: "删除", destructive: true })) return;
    await persist(connections.filter((_, current) => current !== index), "连接已删除");
  };

  const toggle = async (index: number) => {
    const next = connections.map((item, current) => current === index ? { ...item, enable: !item.enable } : item);
    await persist(next, next[index].enable ? "连接已启用" : "连接已停用");
  };

  const runtimeStatus = (item: ApiData) => status.find((current) => current.name === item.name) || {};
  const endpoint = (item: ApiData) => {
    const type = item.type as ConnectionKind;
    if (connectionTypes[type]?.mode === "client") return String(item.url || "未填写地址");
    const host = String(item.host || server.host || "0.0.0.0").replace("0.0.0.0", "127.0.0.1");
    return `${type === "ws_reverse" ? "ws" : "http"}://${host}:${item.port || server.port}${item.path || "/"}`;
  };

  return (
    <section className="space-y-6">
      {!compact && (
        <FeatureHeading
          icon={Globe2}
          title="网络连接"
          detail="OneBot 正向、反向和 HTTP 接入配置"
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{connections.length} 个 OneBot 接入</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />刷新
          </Button>
          <Button size="sm" onClick={openAdd}><Plus className="size-3.5" />新建接入</Button>
        </div>
      </div>
      {notice && <Notice text={notice} error={notice.includes("失败") || notice.includes("请填写")} />}
      {loading ? <Busy /> : connections.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connections.map((item, index) => {
            const current = runtimeStatus(item);
            const connected = Boolean(current.connected || current.status === "connected");
            return (
              <Card key={`${item.name}:${index}`} className={!item.enable ? "opacity-65" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Server className="size-4" /></span>
                      <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{connectionTypes[item.type as ConnectionKind]?.label || item.type}</p></div>
                    </div>
                    <ToggleSwitch value={Boolean(item.enable)} onChange={() => toggle(index)} ariaLabel={`${item.name}启用状态`} disabled={saving} />
                  </div>
                  <button type="button" className="mt-4 flex w-full items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-left font-mono text-xs text-muted-foreground hover:text-foreground" onClick={() => navigator.clipboard?.writeText(endpoint(item))}>
                    <span className="min-w-0 flex-1 truncate">{endpoint(item)}</span><Copy className="size-3.5" />
                  </button>
                  <div className="mt-4 flex items-center gap-2">
                    <Badge variant={!item.enable ? "secondary" : connected ? "success" : "warning"}>{!item.enable ? "已停用" : connected ? "已连接" : "等待连接"}</Badge>
                    <span className="flex-1" />
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item, index)} aria-label="编辑接入"><Pencil className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => remove(index)} aria-label="删除接入"><Trash2 className="size-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center"><Globe2 className="mx-auto size-8 text-muted-foreground/40" /><p className="mt-3 text-sm text-muted-foreground">暂无 OneBot 接入</p><Button className="mt-4" size="sm" onClick={openAdd}><Plus className="size-3.5" />添加接入</Button></div>
      )}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogTitle>{editIndex >= 0 ? "编辑 OneBot 接入" : "添加 OneBot 接入"}</DialogTitle>
          <DialogDescription>配置保存后会立即重新加载连接。</DialogDescription>
          <div className="mt-6 space-y-4">
            <label className="block space-y-1.5 text-sm"><span className="font-medium">接入类型</span><select value={form.type} onChange={(event) => updateType(event.target.value as ConnectionKind)} disabled={editIndex >= 0} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">{Object.entries(connectionTypes).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select><span className="block text-xs text-muted-foreground">{connectionTypes[form.type as ConnectionKind]?.detail}</span></label>
            <label className="block space-y-1.5 text-sm"><span className="font-medium">名称</span><Input value={String(form.name || "")} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            {connectionTypes[form.type as ConnectionKind]?.mode === "client" ? (
              <label className="block space-y-1.5 text-sm"><span className="font-medium">连接地址</span><Input value={String(form.url || "")} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder={form.type === "ws_forward" ? "ws://127.0.0.1:3001" : "http://127.0.0.1:3000"} /></label>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span className="font-medium">监听地址</span><Input value={String(form.host || "")} onChange={(event) => setForm({ ...form, host: event.target.value })} /></label><label className="space-y-1.5 text-sm"><span className="font-medium">端口</span><Input type="number" min={1} max={65535} value={Number(form.port || 5201)} onChange={(event) => setForm({ ...form, port: Number(event.target.value) })} /></label><label className="space-y-1.5 text-sm sm:col-span-2"><span className="font-medium">路径</span><Input value={String(form.path || "")} onChange={(event) => setForm({ ...form, path: event.target.value })} /></label></div>
            )}
            <label className="block space-y-1.5 text-sm"><span className="font-medium">Access Token</span><Input type="password" value={String(form.token || "")} onChange={(event) => setForm({ ...form, token: event.target.value })} placeholder="可选" /></label>
            {form.type === "http_server" && <label className="block space-y-1.5 text-sm"><span className="font-medium">签名密钥</span><Input type="password" value={String(form.secret || "")} onChange={(event) => setForm({ ...form, secret: event.target.value })} placeholder="可选" /></label>}
            {form.type === "ws_forward" && <label className="block space-y-1.5 text-sm"><span className="font-medium">重连间隔（毫秒）</span><Input type="number" min={1000} value={Number(form.reconnect_interval || 5000)} onChange={(event) => setForm({ ...form, reconnect_interval: Number(event.target.value) })} /></label>}
            <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => setEditorOpen(false)}>取消</Button><Button onClick={saveForm} disabled={saving}>{saving ? "保存中" : "保存接入"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function ExtensionsPage({
  pages,
  selectedKey,
  loading,
  notice,
}: {
  pages: ApiData[];
  selectedKey: string;
  loading: boolean;
  notice: string;
}) {
  const frameCleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => frameCleanup.current?.(), []);

  const handleFrameLoad = (event: SyntheticEvent<HTMLIFrameElement>) => {
    frameCleanup.current?.();
    const frameDocument = event.currentTarget.contentDocument;
    const root = frameDocument?.documentElement;
    if (!root) return;
    if (frameDocument.head && !frameDocument.querySelector('meta[name="viewport"]')) {
      const viewport = frameDocument.createElement("meta");
      viewport.name = "viewport";
      viewport.content = "width=device-width, initial-scale=1";
      frameDocument.head.appendChild(viewport);
    }
    root.style.maxWidth = "100%";
    root.style.overflowX = "auto";
    if (frameDocument.body) {
      frameDocument.body.style.minWidth = "0";
      frameDocument.body.style.maxWidth = "100%";
    }
    const themeProperties = [
      "--bg",
      "--side",
      "--card",
      "--solid",
      "--deep",
      "--text",
      "--text2",
      "--muted",
      "--line",
      "--divider",
    ];
    let adjusting = false;
    const forceLight = () => {
      if (adjusting) return;
      adjusting = true;
      if (root.dataset.theme !== "light") root.dataset.theme = "light";
      if (root.style.colorScheme !== "light") root.style.colorScheme = "light";
      themeProperties.forEach((property) => {
        if (root.style.getPropertyValue(property)) root.style.removeProperty(property);
      });
      adjusting = false;
    };
    forceLight();
    const observer = new MutationObserver(forceLight);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
    frameCleanup.current = () => observer.disconnect();
  };

  const selected = pages.find((page) => String(page.key) === selectedKey);

  return (
    <section className="h-full min-h-0">
      {loading ? (
        <Busy />
      ) : notice ? (
        <Notice text={notice} error />
      ) : (
        selected
          ? <iframe key={selectedKey} src={"/api/web-pages/" + encodeURIComponent(selectedKey)} title={String(selected.label || selected.title || selected.name || selected.key)} onLoad={handleFrameLoad} className="block h-full min-h-[420px] w-full max-w-full border-0 bg-background md:min-h-0" />
          : <div className="grid h-full place-items-center"><Notice text={pages.length ? "请在主侧边栏选择扩展页面" : "暂无插件自定义页面"} /></div>
      )}
    </section>
  );
}

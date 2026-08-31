import { useEffect, useMemo, useState } from "react";
import { Boxes, ChevronRight, Code2, RefreshCw, Save, Settings2, Trash2, Upload, Users } from "lucide-react";
import { api, type ApiData } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Busy, EditorBox, FeatureHeading, Notice, errorMessage } from "@/features/shared";

type Editor = {
  path: string;
  name: string;
  content: string;
  format: string;
  kind: "source" | "config";
} | null;

function fileKey(file: ApiData) {
  const name = String(file.name || "");
  return name.endsWith(".py") ? name.slice(0, -3) : name;
}

export function PluginsPage() {
  const dialog = useAppDialog();
  const [plugins, setPlugins] = useState<ApiData[]>([]);
  const [modules, setModules] = useState<ApiData[]>([]);
  const [bots, setBots] = useState<string[]>([]);
  const [bindings, setBindings] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [search, setSearch] = useState("");
  const [fileView, setFileView] = useState<"main" | "all">("main");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const visiblePlugins = useMemo(() => {
    const query = search.trim().toLowerCase();
    return plugins.filter((item) => !query || JSON.stringify(item).toLowerCase().includes(query));
  }, [plugins, search]);
  const visibleModules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return modules.filter((item) => !query || JSON.stringify(item).toLowerCase().includes(query));
  }, [modules, search]);

  const load = () => {
    setLoading(true);
    Promise.all([
      api<ApiData>("/api/plugins/scan-dirs"),
      api<ApiData>("/api/modules/scan"),
      api<ApiData>("/api/plugins/bots"),
    ])
      .then(([pluginData, moduleData, bindingData]) => {
        setPlugins(Array.isArray(pluginData.dirs) ? pluginData.dirs : []);
        setModules(Array.isArray(moduleData.modules) ? moduleData.modules : []);
        setBots(Array.isArray(bindingData.bots) ? bindingData.bots.map(String) : []);
        setBindings(bindingData.plugin_bots && typeof bindingData.plugin_bots === "object" ? bindingData.plugin_bots : {});
      })
      .catch((error) => setNotice(errorMessage(error, "扫描扩展失败")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggle = async (kind: "plugin" | "module", item: ApiData, file?: ApiData) => {
    const name = String(kind === "plugin" ? item.directory : item.name);
    const enabled = file ? Boolean(file.enabled) : Boolean(item.enabled || item.persist_enabled);
    try {
      await api(kind === "plugin" ? "/api/plugins/toggle" : "/api/modules/toggle", {
        method: "POST",
        body: JSON.stringify({ name, file: file ? fileKey(file) : undefined, action: enabled ? "disable" : "enable" }),
      });
      await load();
    } catch (error) {
      setNotice(errorMessage(error, "启停失败"));
    }
  };

  const reload = async (name: string) => {
    try {
      const result = await api<ApiData>("/api/plugins/reload", { method: "POST", body: JSON.stringify({ name }) });
      setNotice(String(result.message || "插件已重载"));
      await load();
    } catch (error) {
      setNotice(errorMessage(error, "重载失败"));
    }
  };

  const readSource = async (file: ApiData) => {
    try {
      const data = await api<ApiData>("/api/plugins/read", { method: "POST", body: JSON.stringify({ path: file.path }) });
      setEditor({ path: String(file.path), name: String(file.name), content: String(data.content || ""), format: "python", kind: "source" });
    } catch (error) {
      setNotice(errorMessage(error, "读取源码失败"));
    }
  };

  const readConfig = async (file: ApiData) => {
    try {
      const data = await api<ApiData>("/api/config-file/read", { method: "POST", body: JSON.stringify({ path: file.path }) });
      setEditor({ path: String(file.path), name: String(file.name), content: String(data.raw || ""), format: String(data.format || file.format || "raw"), kind: "config" });
    } catch (error) {
      setNotice(errorMessage(error, "读取配置失败"));
    }
  };

  const openPluginConfig = async (plugin: ApiData) => {
    try {
      const data = await api<ApiData>("/api/plugins/config-files", { method: "POST", body: JSON.stringify({ name: plugin.directory }) });
      const file = Array.isArray(data.config_files) ? data.config_files[0] : null;
      if (file) await readConfig(file);
      else setNotice("该插件没有 YAML 或 JSON 配置文件");
    } catch (error) {
      setNotice(errorMessage(error, "读取配置失败"));
    }
  };

  const saveEditor = async () => {
    if (!editor) return;
    try {
      const path = editor.kind === "source" ? "/api/plugins/save" : "/api/config-file/save";
      const body = editor.kind === "source"
        ? { path: editor.path, content: editor.content }
        : { path: editor.path, content: editor.content, format: editor.format };
      const data = await api<ApiData>(path, { method: "POST", body: JSON.stringify(body) });
      setNotice(String(data.message || "文件已保存"));
    } catch (error) {
      setNotice(errorMessage(error, "保存失败"));
    }
  };

  const upload = async (kind: "plugin" | "module", file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    if (kind === "plugin" && file.name.toLowerCase().endsWith(".py")) form.append("directory", "alone");
    try {
      const data = await api<ApiData>(kind === "plugin" ? "/api/plugins/upload" : "/api/modules/upload", { method: "POST", body: form });
      setNotice(String(data.message || "上传成功"));
      await load();
    } catch (error) {
      setNotice(errorMessage(error, "上传失败"));
    }
  };

  const createPlugin = async () => {
    const directory = await dialog.prompt({ title: "新建插件", description: "请输入插件目录名。", placeholder: "例如 hello_plugin", confirmLabel: "下一步" });
    if (!directory) return;
    const filename = await dialog.prompt({ title: "入口文件", description: `设置「${directory}」的入口文件名。`, defaultValue: "main.py", confirmLabel: "创建" });
    if (!filename) return;
    try {
      const data = await api<ApiData>("/api/plugins/create", { method: "POST", body: JSON.stringify({ directory, filename }) });
      setNotice(String(data.message || "插件已创建"));
      await load();
    } catch (error) {
      setNotice(errorMessage(error, "创建失败"));
    }
  };

  const uninstall = async (name: string, type: "plugin" | "module") => {
    if (!await dialog.confirm({ title: "卸载扩展", description: "卸载 " + name + "？扩展文件将被移除，数据目录会保留。", confirmLabel: "卸载", destructive: true })) return;
    try {
      const data = await api<ApiData>("/api/market/uninstall", { method: "POST", body: JSON.stringify({ name, type, keep_data: true }) });
      setNotice(String(data.message || "扩展已卸载"));
      await load();
    } catch (error) {
      setNotice(errorMessage(error, "卸载失败"));
    }
  };

  const updateBinding = async (key: string, bot: string, checked: boolean) => {
    const current = Array.isArray(bindings[key]) ? bindings[key] : [];
    const next = checked ? Array.from(new Set([...current, bot])) : current.filter((value) => value !== bot);
    const updated = { ...bindings, [key]: next };
    setBindings(updated);
    try {
      await api("/api/plugins/bots", { method: "POST", body: JSON.stringify({ plugin_bots: updated }) });
      setNotice("机器人绑定已保存");
    } catch (error) {
      setNotice(errorMessage(error, "绑定保存失败"));
    }
  };

  const toggleExpanded = (key: string) =>
    setExpanded((current) => ({ ...current, [key]: !current[key] }));

  const pluginFiles = (plugin: ApiData) => {
    const files = Array.isArray(plugin.files) ? plugin.files : [];
    if (fileView === "all") return files;
    const entry = files.find((file: ApiData) => ["main.py", "index.py", "app.py"].includes(String(file.name || "")));
    return entry ? [entry] : files.slice(0, 1);
  };

  return <section className="space-y-4 sm:space-y-6">
    <FeatureHeading icon={Boxes} title="插件模块" detail="管理已加载的插件与模块" />
    <Card><CardContent className="flex min-w-0 flex-wrap items-center gap-2 p-3 sm:p-4">
      <Input className="min-w-0 flex-1 sm:w-[240px] sm:flex-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索插件或模块..." />
      <select value={fileView} onChange={(event) => setFileView(event.target.value as "main" | "all")} className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs sm:w-auto sm:flex-none"><option value="main">仅显示主入口</option><option value="all">显示全部文件</option></select>
      <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto"><Button size="sm" variant="outline" onClick={createPlugin}>新建插件</Button><label><input className="hidden" type="file" accept=".py,.zip" onChange={(event) => { upload("plugin", event.target.files?.[0]); event.currentTarget.value = ""; }} /><Button asChild size="sm" variant="outline"><span><Upload className="size-3.5" />上传插件</span></Button></label><label><input className="hidden" type="file" accept=".zip" onChange={(event) => { upload("module", event.target.files?.[0]); event.currentTarget.value = ""; }} /><Button asChild size="sm" variant="outline"><span><Upload className="size-3.5" />上传模块</span></Button></label><Button size="sm" variant="outline" onClick={load}><RefreshCw className="size-3.5" />刷新</Button></div>
    </CardContent></Card>
    {notice && <Notice text={notice} error={notice.includes("失败")} />}
    {loading ? <Busy /> : <Card className="min-w-0 overflow-hidden"><CardHeader className="border-b py-3 sm:py-4"><CardTitle className="text-sm">已安装扩展 <span className="ml-1 text-xs font-normal text-muted-foreground">{visiblePlugins.length + visibleModules.length} 个</span></CardTitle><CardDescription>插件和模块统一显示，点击条目查看文件、配置与运行状态</CardDescription></CardHeader><CardContent className="p-0">
      {visiblePlugins.map((plugin, index) => {
        const name = String(plugin.directory || index); const key = "p_" + name; const isOpen = Boolean(expanded[key]); const files = pluginFiles(plugin);
        return <div key={name} className="border-b last:border-b-0"><div className="flex min-w-0 items-center gap-2 px-3 py-2.5 sm:px-4"><button type="button" onClick={() => toggleExpanded(key)} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label={isOpen ? "收起插件" : "展开插件"}><ChevronRight className={isOpen ? "size-4 rotate-90 transition-transform" : "size-4 transition-transform"} /></button><div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Boxes className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-1.5"><p className="min-w-0 truncate text-sm font-medium" title={String(plugin.meta?.name || name)}>{plugin.meta?.name || name}</p><Badge variant="outline">插件</Badge><Badge variant={plugin.enabled ? "success" : "secondary"}>{plugin.enabled ? "运行中" : "未启用"}</Badge>{plugin.is_system && <Badge variant="secondary">系统</Badge>}</div><p className="truncate text-xs text-muted-foreground" title={String(plugin.description || plugin.meta?.description || "插件")}>{plugin.description || plugin.meta?.description || "插件"}</p></div><div className="flex shrink-0 items-center gap-0.5"><Button size="icon-sm" variant="ghost" onClick={() => openPluginConfig(plugin)} aria-label="配置插件"><Settings2 className="size-3.5" /></Button><Button size="icon-sm" variant="ghost" onClick={() => reload(name)} aria-label="重载插件"><RefreshCw className="size-3.5" /></Button><Button size="sm" variant={plugin.enabled ? "outline" : "default"} onClick={() => toggle("plugin", plugin)}>{plugin.enabled ? "停用" : "启用"}</Button>{!plugin.is_system && <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => uninstall(name, "plugin")} aria-label="卸载插件"><Trash2 className="size-3.5" /></Button>}</div></div>
          {isOpen && <div className="space-y-3 bg-muted/20 px-4 pb-3 pl-12 sm:pl-16"><p className="pt-3 text-xs text-muted-foreground">{plugin.description || plugin.meta?.description || "暂无描述"}</p>{bots.length > 0 && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2"><span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3.5" />绑定机器人</span>{bots.map((bot) => <label key={bot} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={(bindings[name] || []).includes(bot)} onChange={(event) => updateBinding(name, bot, event.target.checked)} />{bot}</label>)}</div>}{plugin.commands?.length ? <div className="border-t pt-2"><p className="mb-1.5 text-xs text-muted-foreground">命令 {plugin.commands.length} 个</p><div className="flex flex-wrap gap-1">{plugin.commands.slice(0, 12).map((command: ApiData, commandIndex: number) => <Badge key={String(command.name || commandIndex)} variant="outline">{command.name || command.pattern || "命令"}</Badge>)}</div></div> : null}<div className="space-y-1 border-t pt-2"><p className="text-xs text-muted-foreground">文件 {files.length}{fileView === "main" && (plugin.files || []).length > files.length ? "（主入口）" : ""}</p>{files.map((file: ApiData) => { const fileBindingKey = name + "/" + fileKey(file); return <div key={String(file.path || file.name)} className="flex min-w-0 flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"><span className="min-w-0 flex-1 truncate text-xs" title={String(file.name)}>{file.name}</span><div className="flex shrink-0 items-center gap-1">{bots.map((bot) => <label key={bot} className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="checkbox" checked={(bindings[fileBindingKey] || []).includes(bot)} onChange={(event) => updateBinding(fileBindingKey, bot, event.target.checked)} />{bot}</label>)}<Button size="sm" variant={file.enabled ? "outline" : "default"} onClick={() => toggle("plugin", plugin, file)}>{file.enabled ? "停用" : "启用"}</Button><Button size="icon-sm" variant="ghost" onClick={() => readSource(file)} aria-label="编辑源码"><Code2 className="size-3.5" /></Button></div></div>; })}</div></div>}
        </div>;
      })}
      {visibleModules.map((module, index) => {
        const name = String(module.name || index); const key = "m_" + name; const isOpen = Boolean(expanded[key]); const enabled = Boolean(module.enabled || module.persist_enabled);
        return <div key={name} className="border-b last:border-b-0"><div className="flex min-w-0 items-center gap-2 px-3 py-2.5 sm:px-4"><button type="button" onClick={() => toggleExpanded(key)} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label={isOpen ? "收起模块" : "展开模块"}><ChevronRight className={isOpen ? "size-4 rotate-90 transition-transform" : "size-4 transition-transform"} /></button><div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Boxes className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-1.5"><p className="min-w-0 truncate text-sm font-medium">{module.display_name || name}</p><Badge variant="outline">模块</Badge><Badge variant={enabled ? "success" : "secondary"}>{enabled ? "运行中" : "未启用"}</Badge>{module.version && <span className="text-[11px] text-muted-foreground">v{module.version}</span>}</div><p className="truncate text-xs text-muted-foreground">{module.description || "模块"}</p></div><div className="flex shrink-0 items-center gap-0.5">{module.config_files?.[0] && <Button size="icon-sm" variant="ghost" onClick={() => readConfig(module.config_files[0])} aria-label="配置模块"><Settings2 className="size-3.5" /></Button>}<Button size="sm" variant={enabled ? "outline" : "default"} onClick={() => toggle("module", module)}>{enabled ? "停用" : "启用"}</Button><Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => uninstall(name, "module")} aria-label="卸载模块"><Trash2 className="size-3.5" /></Button></div></div>{isOpen && <div className="space-y-2 bg-muted/20 px-4 pb-3 pl-12 sm:pl-16"><p className="pt-3 text-xs text-muted-foreground">{module.description || "暂无描述"}</p>{module.config_files?.length ? <div className="space-y-1 border-t pt-2">{module.config_files.map((file: ApiData) => <button key={String(file.path || file.name)} type="button" onClick={() => readConfig(file)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60"><Settings2 className="size-3.5 text-muted-foreground" />{file.name}</button>)}</div> : <p className="border-t pt-2 text-xs text-muted-foreground">暂无配置文件</p>}</div>}</div>;
      })}
      {!visiblePlugins.length && !visibleModules.length && <div className="p-6"><Notice text="暂无匹配的插件或模块" /></div>}
    </CardContent></Card>}

    {editor && <Card><CardHeader className="flex-row flex-wrap items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="break-words">{editor.name}</CardTitle><CardDescription className="break-all">{editor.path} · {editor.format.toUpperCase()}</CardDescription></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditor(null)}>关闭</Button><Button size="sm" onClick={saveEditor}><Save className="size-3.5" />保存</Button></div></CardHeader><CardContent><EditorBox value={editor.content} onChange={(content) => setEditor({ ...editor, content })} rows={24} /></CardContent></Card>}
  </section>;
}

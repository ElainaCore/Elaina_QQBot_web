import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  GitCommit,
  Globe2,
  Play,
  RefreshCw,
  Table2,
  TerminalSquare,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { api, type ApiData } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog";
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
  SelectBox,
  errorMessage,
} from "@/features/shared";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export function DatabasePage() {
  const dialog = useAppDialog();
  const [databases, setDatabases] = useState<ApiData[]>([]);
  const [path, setPath] = useState("");
  const [tables, setTables] = useState<ApiData[]>([]);
  const [table, setTable] = useState("");
  const [rows, setRows] = useState<ApiData[]>([]);
  const [columns, setColumns] = useState<ApiData[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sql, setSql] = useState("SELECT * FROM sqlite_master");
  const [result, setResult] = useState<ApiData | null>(null);
  const [notice, setNotice] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);

  useEffect(() => {
    api<ApiData>("/api/database/list")
      .then((data) =>
        setDatabases(Array.isArray(data.databases) ? data.databases : []),
      )
      .catch((error) => setNotice(errorMessage(error, "数据库列表读取失败")));
  }, []);

  const openDatabase = async (nextPath: string) => {
    try {
      setPath(nextPath);
      const data = await api<ApiData>("/api/database/tables", {
        method: "POST",
        body: JSON.stringify({ path: nextPath }),
      });
      setTables(Array.isArray(data.tables) ? data.tables : []);
      setTable("");
      setRows([]);
      setSelected([]);
      setShowTechnical(false);
    } catch (error) {
      setNotice(errorMessage(error, "表列表读取失败"));
    }
  };

  const query = async (nextTable = table, nextPage = page) => {
    if (!path || !nextTable) return;
    try {
      const data = await api<ApiData>("/api/database/query", {
        method: "POST",
        body: JSON.stringify({
          path,
          table: nextTable,
          page: nextPage,
          page_size: 50,
        }),
      });
      setTable(nextTable);
      setPage(nextPage);
      setRows(Array.isArray(data.data) ? data.data : []);
      setColumns(Array.isArray(data.columns) ? data.columns : []);
      setTotal(Number(data.total || 0));
      setSelected([]);
    } catch (error) {
      setNotice(errorMessage(error, "数据查询失败"));
    }
  };

  const deleteRows = async () => {
    if (
      !selected.length ||
      !(await dialog.confirm({
        title: "删除数据库记录",
        description: "删除选中的 " + selected.length + " 行？此操作不可撤销。",
        confirmLabel: "删除",
        destructive: true,
      }))
    )
      return;
    try {
      const data = await api<ApiData>("/api/database/delete", {
        method: "POST",
        body: JSON.stringify({ path, table, rowids: selected }),
      });
      setNotice("已删除 " + String(data.deleted || selected.length) + " 行");
      await query(table, page);
    } catch (error) {
      setNotice(errorMessage(error, "删除失败"));
    }
  };

  const executeSql = async () => {
    if (!path || !sql.trim()) return;
    try {
      setResult(
        await api<ApiData>("/api/database/sql", {
          method: "POST",
          body: JSON.stringify({ path, sql }),
        }),
      );
    } catch (error) {
      setNotice(errorMessage(error, "SQL 执行失败"));
    }
  };

  const databaseName = path.split(/[\/]/).pop()?.toLowerCase() || "";
  const visibleColumns = useMemo(() => {
    if (showTechnical) return columns;
    const names =
      databaseName.includes("framework") || databaseName.includes("error")
        ? new Set(["timestamp", "content", "source"])
        : databaseName.includes("message")
          ? new Set([
              "timestamp",
              "content",
              "source",
              "user_id",
              "group_id",
              "message_type",
            ])
          : databaseName.includes("lifecycle")
            ? new Set([
                "timestamp",
                "content",
                "source",
                "user_id",
                "group_id",
                "message_type",
              ])
            : new Set(
                columns
                  .map((column) => String(column.name))
                  .filter(
                    (name) =>
                      !["id", "raw_data", "extra", "level"].includes(name),
                  ),
              );
    const compact = columns.filter((column) => names.has(String(column.name)));
    return compact.length
      ? compact
      : columns.filter(
          (column) =>
            !["id", "raw_data", "extra"].includes(String(column.name)),
        );
  }, [columns, databaseName, showTechnical]);
  const columnLabels: Record<string, string> = {
    timestamp: "时间",
    content: "内容",
    source: "机器人 QQ",
    level: "级别",
    user_id: "QQ",
    group_id: "群号",
    message_id: "消息 ID",
    message_type: "类型",
    raw_data: "原始数据",
    extra: "附加数据",
    id: "ID",
  };

  const exportCsv = () => {
    if (!rows.length) return;
    const names = visibleColumns.map((column) => String(column.name));
    const quote = (value: unknown) =>
      '"' + String(value ?? "").replaceAll('"', '""') + '"';
    const csv =
      "\uFEFF" +
      [
        names.map(quote).join(","),
        ...rows.map((row) => names.map((name) => quote(row[name])).join(",")),
      ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = table + "-page-" + page + ".csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const pageCount = Math.max(1, Math.ceil(total / 50));
  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-4 lg:h-[calc(100dvh-7rem)] lg:overflow-hidden">
      <FeatureHeading
        icon={Database}
        title="数据库"
        detail="浏览表结构、分页查询、删除与导出记录"
      />
      {notice && <Notice text={notice} error={notice.includes("失败")} />}
      <div className="grid min-h-0 min-w-0 flex-1 gap-3 sm:gap-4 lg:grid-cols-[clamp(220px,24vw,280px)_minmax(0,1fr)] lg:grid-rows-1">
        <Card className="flex max-h-[38dvh] min-h-[220px] min-w-0 flex-col overflow-hidden lg:h-full lg:max-h-none lg:min-h-0">
          <CardHeader className="shrink-0">
            <CardTitle>数据库文件</CardTitle>
            <CardDescription>{databases.length} 个可用数据库</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
            {databases.map((db, index) => (
              <button
                key={String(db.path || index)}
                type="button"
                onClick={() => openDatabase(String(db.path))}
                className={cn(
                  "w-full rounded-lg border p-3 text-left text-xs hover:bg-muted/60",
                  path === db.path && "border-primary bg-primary/5",
                )}
              >
                <p className="truncate font-medium">{db.name || db.path}</p>
                <p className="mt-1 truncate text-muted-foreground">
                  {db.label || db.path}
                </p>
              </button>
            ))}
            {path && (
              <div className="border-t pt-3">
                {tables.map((item) => (
                  <Button
                    key={item.name}
                    size="sm"
                    variant={table === item.name ? "secondary" : "ghost"}
                    className="mr-1 mb-1"
                    onClick={() => query(String(item.name), 1)}
                  >
                    <Table2 className="size-3.5" />
                    {item.name} ({item.count})
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="flex min-h-[560px] min-w-0 flex-col overflow-hidden lg:h-full lg:min-h-0">
          <CardHeader className="shrink-0 flex-row flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="break-words">
                {table || "查询结果"}
              </CardTitle>
              <CardDescription className="break-all">
                {table
                  ? total + " 行 · 第 " + page + "/" + pageCount + " 页"
                  : path || "先选择一个数据库"}
              </CardDescription>
            </div>
            {table && (
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Button
                  size="icon"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => query(table, page - 1)}
                  title="上一页"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="flex h-9 items-center px-1 text-xs text-muted-foreground">
                  {page} / {pageCount}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  disabled={page >= pageCount}
                  onClick={() => query(table, page + 1)}
                  title="下一页"
                >
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  className="flex-1 sm:flex-none"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowTechnical((value) => !value)}
                >
                  {showTechnical ? "精简字段" : "显示技术字段"}
                </Button>
                <Button
                  className="flex-1 sm:flex-none"
                  size="sm"
                  variant="outline"
                  onClick={exportCsv}
                >
                  导出 CSV
                </Button>
                <Button
                  className="w-full text-destructive sm:w-auto"
                  size="sm"
                  variant="outline"
                  disabled={!selected.length}
                  onClick={deleteRows}
                >
                  <Trash2 className="size-3.5" />
                  删除选中
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-visible lg:overflow-hidden">
            {rows.length ? (
              <>
                <div className="min-h-[240px] max-w-full flex-1 overflow-auto overscroll-contain rounded-lg border sm:min-h-[280px]">
                  <table className="w-full min-w-[560px] text-left text-xs sm:min-w-[640px]">
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr>
                        <th className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={
                              selected.length === rows.length && rows.length > 0
                            }
                            onChange={(event) =>
                              setSelected(
                                event.target.checked
                                  ? rows.map((row) => Number(row._rowid))
                                  : [],
                              )
                            }
                          />
                        </th>
                        {visibleColumns.map((column) => (
                          <th
                            key={column.name}
                            className="whitespace-nowrap px-3 py-2"
                          >
                            {columnLabels[String(column.name)] ||
                              String(column.name)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row._rowid} className="border-t">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.includes(Number(row._rowid))}
                              onChange={(event) =>
                                setSelected(
                                  event.target.checked
                                    ? [...selected, Number(row._rowid)]
                                    : selected.filter(
                                        (id) => id !== Number(row._rowid),
                                      ),
                                )
                              }
                            />
                          </td>
                          {visibleColumns.map((column) => (
                            <td
                              key={column.name}
                              className={cn(
                                "max-w-[240px] px-3 py-2",
                                column.name === "content"
                                  ? "min-w-[260px] whitespace-pre-wrap break-words"
                                  : "truncate",
                              )}
                              title={String(row[column.name] ?? "")}
                            >
                              {String(row[column.name] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="min-h-[220px] flex-1 sm:min-h-[260px]">
                <Notice text="选择数据表以查看记录" />
              </div>
            )}
            <div className="shrink-0 border-t pt-3 sm:pt-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <TerminalSquare className="size-4" />
                SQL 查询
              </div>
              <EditorBox value={sql} onChange={setSql} rows={2} />
              <Button
                className="mt-2 w-full sm:w-auto"
                size="sm"
                disabled={!path}
                onClick={executeSql}
              >
                <Play className="size-3.5" />
                执行
              </Button>
              {result && (
                <pre className="mt-3 max-h-32 max-w-full overflow-auto rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function UpdatePage() {
  const dialog = useAppDialog();
  const [version, setVersion] = useState<ApiData | null>(null);
  const [check, setCheck] = useState<ApiData | null>(null);
  const [logs, setLogs] = useState<ApiData[]>([]);
  const [progress, setProgress] = useState<ApiData | null>(null);
  const [mirrors, setMirrors] = useState<string[]>([]);
  const [mirror, setMirror] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [skipBackup, setSkipBackup] = useState(false);
  const [uploadVersion, setUploadVersion] = useState("");
  const [uploadSkipBackup, setUploadSkipBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([
      api<ApiData>("/api/update/version"),
      api<ApiData>("/api/update/check"),
      api<ApiData>("/api/update/changelog"),
      api<ApiData>("/api/update/mirrors"),
    ])
      .then(([v, c, l, m]) => {
        setVersion(v.data || v);
        setCheck(c.data || c);
        setLogs(Array.isArray(l.data) ? l.data : []);
        setMirrors(Array.isArray(m.data?.mirrors) ? m.data.mirrors : []);
        setMirror(String(m.data?.custom_mirror || ""));
      })
      .catch((error) => setNotice(errorMessage(error, "版本信息读取失败")));
  }, []);
  useEffect(() => {
    const poll = () =>
      api<ApiData>("/api/update/progress")
        .then((data) => setProgress(data.data || null))
        .catch(() => undefined);
    poll();
    const timer = window.setInterval(poll, 2500);
    return () => window.clearInterval(timer);
  }, []);

  const saveMirror = async (value: string) => {
    setMirror(value);
    try {
      await api("/api/update/mirror", {
        method: "POST",
        body: JSON.stringify({ mirror: value }),
      });
    } catch (error) {
      setNotice(errorMessage(error, "镜像保存失败"));
    }
  };
  const start = async (targetVersion = "") => {
    if (
      !(await dialog.confirm({
        title: "在线更新",
        description: targetVersion
          ? "更新到版本 " + targetVersion.slice(0, 8) + "？更新期间服务可能短暂不可用。"
          : "开始在线更新？更新期间服务可能短暂不可用。",
        confirmLabel: "开始更新",
      }))
    )
      return;
    setBusy(true);
    try {
      const data = await api<ApiData>("/api/update/start", {
        method: "POST",
        body: JSON.stringify({
          mirror,
          skip_backup: skipBackup,
          ...(targetVersion ? { version: targetVersion } : {}),
        }),
      });
      setNotice(String(data.message || "更新已开始"));
    } catch (error) {
      setNotice(errorMessage(error, "更新启动失败"));
    } finally {
      setBusy(false);
    }
  };
  const upload = async () => {
    if (
      !file ||
      !(await dialog.confirm({
        title: "应用更新包",
        description: "使用 " + file.name + " 更新框架？",
        confirmLabel: "应用更新",
      }))
    )
      return;
    const form = new FormData();
    form.append("file", file);
    if (uploadVersion.trim()) form.append("version_name", uploadVersion.trim());
    form.append("skip_backup", uploadSkipBackup ? "true" : "false");
    setBusy(true);
    try {
      const data = await api<ApiData>("/api/update/upload", {
        method: "POST",
        body: form,
      });
      setNotice(String(data.message || "上传更新已开始"));
      setFile(null);
    } catch (error) {
      setNotice(errorMessage(error, "上传失败"));
    } finally {
      setBusy(false);
    }
  };
  const percent = Number(progress?.percent ?? progress?.progress ?? 0);
  const updating = Boolean(progress?.is_updating || progress?.running);
  const currentVersion = String(
    version?.version || version?.tag || version?.commit || "未知",
  );
  const latestVersion = String(check?.latest_version || "—");
  const updateStatus = check?.error
    ? "检查失败"
    : check?.has_update
      ? "有新版本"
      : "已是最新";
  const stageLabels: Record<string, string> = {
    checking: "检查中",
    downloading: "下载中",
    backing_up: "备份中",
    updating: "更新中",
    completed: "已完成",
    failed: "失败",
    preparing: "准备中",
    idle: "空闲",
  };
  const stage = String(progress?.stage || progress?.status || "idle");
  const stageLabel = stageLabels[stage] || stage;
  const mirrorLabel = (value: string) => {
    if (!value) return "GitHub 直连";
    try { return new URL(value).hostname; } catch { return value; }
  };

  return (
    <section className="space-y-4 pt-2 sm:space-y-6 sm:pt-3">
      <FeatureHeading
        icon={WandSparkles}
        title="框架更新"
        detail="检查版本、查看更新日志并选择在线或本地更新"
      />
      {notice && <Notice text={notice} error={notice.includes("失败")} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "当前版本", value: currentVersion, Icon: Download },
          { label: "最新版本", value: latestVersion, Icon: GitCommit },
          { label: "更新状态", value: updateStatus, Icon: check?.has_update ? AlertCircle : CheckCircle2 },
          { label: "更新时间", value: String(version?.update_time || "—"), Icon: RefreshCw },
        ].map(({ label, value, Icon }) => (
          <Card key={label} className="min-h-[92px] overflow-hidden"><CardContent className="flex min-h-[92px] items-center gap-3 p-5 pt-5 sm:p-5 sm:pt-5"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-xs leading-5 text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold leading-5" title={value}>{value}</p></div></CardContent></Card>
        ))}
      </div>

      {(check?.has_update || check?.error) && <Card className={cn("border-primary/30", check?.error && "border-destructive/30")}><CardContent className="flex flex-col gap-3 p-4 pt-4 sm:flex-row sm:items-center sm:p-4 sm:pt-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{check?.error ? "更新检查失败" : "发现新版本"}</p><Badge variant={check?.error ? "destructive" : "default"}>{check?.error ? "需要检查" : latestVersion}</Badge></div><p className="mt-1 break-words text-xs text-muted-foreground">{String(check?.error || check?.message || "可以在线更新到最新版本")}</p></div>{!check?.error && <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={skipBackup} onChange={(event) => setSkipBackup(event.target.checked)} />跳过备份</label><Button disabled={busy || updating} onClick={() => start()}><Download className="size-3.5" />一键更新到最新</Button></div>}</CardContent></Card>}

      {progress && stage !== "idle" && <Card><CardContent className="space-y-2 p-4 pt-4 sm:p-4 sm:pt-4"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><div className="flex items-center gap-2"><Badge variant={stage === "failed" ? "destructive" : stage === "completed" ? "success" : "default"}>{stageLabel}</Badge><span className="break-words text-muted-foreground">{String(progress.message || "等待更新状态")}</span></div><span>{Math.max(0, Math.min(100, percent)).toFixed(0)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full bg-primary transition-[width]", stage === "failed" && "bg-destructive", stage === "completed" && "bg-success")} style={{ width: Math.max(0, Math.min(100, percent)) + "%" }} /></div></CardContent></Card>}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0"><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>更新日志</CardTitle><CardDescription>{logs.length} 条记录</CardDescription></div><Button size="icon" variant="ghost" title="刷新页面以重新获取更新日志" onClick={() => window.location.reload()}><RefreshCw className="size-4" /></Button></CardHeader><CardContent className="max-h-[560px] space-y-0 overflow-y-auto overscroll-contain">{logs.length ? logs.slice(0, 40).map((item, index) => <div key={String(item.sha || index)} className="border-b py-3 first:pt-0 last:border-0"><div className="flex flex-wrap items-center gap-2"><code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-primary">{String(item.sha || "--------")}</code><span className="text-[11px] text-muted-foreground">{String(item.date || "")}</span></div><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-5">{String(item.message || "变更")}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{String(item.author || "未知作者")}</span><Button size="sm" variant="outline" disabled={busy || updating || !item.full_sha} onClick={() => start(String(item.full_sha || item.sha || ""))}>更新到此版本</Button></div></div>) : <Notice text="暂无更新日志" />}</CardContent></Card>

        <div className="min-w-0 space-y-4"><Card><CardHeader><div className="flex items-center gap-2"><Globe2 className="size-4 text-primary" /><CardTitle>镜像选择</CardTitle></div><CardDescription>当前：{mirrorLabel(mirror)}</CardDescription></CardHeader><CardContent className="space-y-3"><SelectBox value={mirror} onChange={saveMirror} className="w-full"><option value="">自动选择最快镜像</option>{mirrors.map((value) => <option key={value} value={value}>{mirrorLabel(value)}</option>)}</SelectBox><p className="break-all text-xs text-muted-foreground">{mirror || "未固定镜像，更新时自动选择可用线路。"}</p><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={skipBackup} onChange={(event) => setSkipBackup(event.target.checked)} />在线更新时跳过备份</label><Button className="w-full" disabled={busy || updating} onClick={() => start()}><Download className="size-3.5" />开始在线更新</Button></CardContent></Card>

          <Card><CardHeader><CardTitle>本地更新包</CardTitle><CardDescription>上传 ZIP 包并应用到当前框架</CardDescription></CardHeader><CardContent className="space-y-3"><label className="block"><input className="hidden" type="file" accept=".zip" onChange={(event) => setFile(event.target.files?.[0] || null)} /><Button asChild variant="outline" className="w-full"><span className="min-w-0"><Upload className="size-3.5" /><span className="truncate">{file?.name || "选择 ZIP 更新包"}</span></span></Button></label><Input value={uploadVersion} onChange={(event) => setUploadVersion(event.target.value)} placeholder="版本名称（可选）" /><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={uploadSkipBackup} onChange={(event) => setUploadSkipBackup(event.target.checked)} />本地更新时跳过备份</label><Button className="w-full" disabled={!file || busy || updating} onClick={upload}>上传并更新</Button></CardContent></Card></div>
      </div>
    </section>
  );
}

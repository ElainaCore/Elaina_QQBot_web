import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  Database,
  Download,
  Eye,
  EyeOff,
  FileSliders,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  PackageOpen,
  PlugZap,
  RefreshCw,
  Sparkles,
  Sun,
  Terminal,
  X,
} from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, type ApiData } from "@/api";
import { OverviewPage } from "@/pages";
import { AccessCenterPage } from "@/access-page";
import { LogsPage } from "@/features/admin-pages";
import {
  ConfigPage,
  DatabasePage,
  ExtensionsPage,
  MarketPage,
  MessagesPage,
  PluginsPage,
  UpdatePage,
} from "@/feature-pages";

export type Page =
  | "overview"
  | "access"
  | "messages"
  | "plugins"
  | "config"
  | "market"
  | "database"
  | "update"
  | "extensions"
  | "logs";
type Icon = ComponentType<{ className?: string }>;

const navigation: Array<{
  id: Page;
  label: string;
  detail: string;
  icon: Icon;
}> = [
  {
    id: "overview",
    label: "总览",
    detail: "主机与服务状态",
    icon: LayoutDashboard,
  },
  {
    id: "access",
    label: "接入中心",
    detail: "QQ 账号与 OneBot 接入",
    icon: PlugZap,
  },
  {
    id: "logs",
    label: "日志记录",
    detail: "消息、事件与运行日志",
    icon: Terminal,
  },
  {
    id: "messages",
    label: "消息列表",
    detail: "会话、历史与发送",
    icon: MessageSquare,
  },
  {
    id: "plugins",
    label: "插件模块",
    detail: "扩展管理与热重载",
    icon: Boxes,
  },
  {
    id: "extensions",
    label: "扩展页面",
    detail: "插件提供的面板页面",
    icon: PlugZap,
  },
  {
    id: "market",
    label: "插件市场",
    detail: "浏览、安装与卸载",
    icon: PackageOpen,
  },
  {
    id: "database",
    label: "数据库",
    detail: "查看表与执行查询",
    icon: Database,
  },
  {
    id: "config",
    label: "框架配置",
    detail: "编辑 settings.yaml",
    icon: FileSliders,
  },
  { id: "update", label: "框架更新", detail: "版本检查与升级", icon: Download },
];

function currentPage(): Page {
  const segment = window.location.pathname
    .replace(/^\/web\/?/, "")
    .split("/")[0];
  if (["processes", "bots", "connections"].includes(segment)) return "access";
  return navigation.some((item) => item.id === segment)
    ? (segment as Page)
    : "overview";
}

function usePage() {
  const [page, setPage] = useState<Page>(currentPage);
  const navigate = useCallback((next: Page) => {
    const suffix = next === "overview" ? "" : next + "/";
    window.history.pushState({}, "", "/web/" + suffix);
    setPage(next);
  }, []);
  useEffect(() => {
    const onPopState = () => setPage(currentPage());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  return [page, navigate] as const;
}

export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-10 items-center justify-center overflow-hidden",
        className,
      )}
    >
      <img
        src="/web/favicon.svg"
        alt="ElainaBot"
        className="size-9 object-contain"
      />
    </div>
  );
}

function Login({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [appearanceMode, setAppearanceMode] = useState<"auto" | "light" | "dark">(() => {
    const saved = window.localStorage.getItem("elaina_appearance_mode");
    return saved === "light" || saved === "dark" ? saved : "auto";
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyAppearance = () => {
      const dark = appearanceMode === "dark" || (appearanceMode === "auto" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.classList.toggle("light", !dark);
    };
    applyAppearance();
    media.addEventListener("change", applyAppearance);
    return () => media.removeEventListener("change", applyAppearance);
  }, [appearanceMode]);

  const chooseAppearance = (mode: "auto" | "light" | "dark") => {
    setAppearanceMode(mode);
    window.localStorage.setItem("elaina_appearance_mode", mode);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      onAuthed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <div className="pattern-layer pattern-layer-left" aria-hidden="true" />
      <div className="pattern-layer pattern-layer-right" aria-hidden="true" />
      <div className="appearance-switch" role="group" aria-label="外观模式">
        <button type="button" className={cn(appearanceMode === "auto" && "is-active")} onClick={() => chooseAppearance("auto")} title="跟随系统" aria-label="跟随系统">
          <Monitor className="size-4" />
        </button>
        <button type="button" className={cn(appearanceMode === "light" && "is-active")} onClick={() => chooseAppearance("light")} title="浅色模式" aria-label="浅色模式">
          <Sun className="size-4" />
        </button>
        <button type="button" className={cn(appearanceMode === "dark" && "is-active")} onClick={() => chooseAppearance("dark")} title="深色模式" aria-label="深色模式">
          <Moon className="size-4" />
        </button>
      </div>
      <section className="login-shell" aria-labelledby="login-title">
        <div className="brand-block">
          <div className="brand-mark"><img src="/web/favicon.svg" alt="" /></div>
          <div className="brand-title-row"><h1 id="login-title">ElainaBot v2</h1></div>
          <p>QQ 机器人框架 · 安全登录</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="admin-password">管理员密码</label>
          <div className="password-field">
            <KeyRound className="field-icon" aria-hidden="true" />
            <input id="admin-password" autoFocus type={passwordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入管理员密码" autoComplete="current-password" />
            <button type="button" className="visibility-button" onClick={() => setPasswordVisible((visible) => !visible)} title={passwordVisible ? "隐藏密码" : "显示密码"} aria-label={passwordVisible ? "隐藏密码" : "显示密码"}>
              {passwordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-button" type="submit" disabled={!password || busy}>
            <span>{busy ? "正在验证..." : "进入控制台"}</span>
            {busy ? <span className="loading-ring" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
          </button>
        </form>
        <p className="copyright">© {new Date().getFullYear()} Elaina Core. All rights reserved.</p>
      </section>
      <div className="help-wrap">
        <div id="login-help" className="help-panel" role="tooltip">请在项目目录的 <code>/config/settings.yaml</code> 中修改 <code>web.admin_password</code>，然后重启框架。</div>
        <button className="help-trigger" type="button" aria-describedby="login-help"><Sparkles className="size-4" /><span>登录遇到问题？</span></button>
      </div>
    </main>
  );
}

function Sidebar({
  page,
  navigate,
  close,
  collapsed = false,
  extensionPages,
  selectedExtension,
  extensionLoading,
  onSelectExtension,
}: {
  page: Page;
  navigate: (next: Page) => void;
  close?: () => void;
  collapsed?: boolean;
  extensionPages: ApiData[];
  selectedExtension: string;
  extensionLoading: boolean;
  onSelectExtension: (key: string) => void;
}) {
  const [extensionPickerOpen, setExtensionPickerOpen] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      <div className={cn("flex h-16 shrink-0 items-center gap-3 px-4", collapsed && "justify-center px-2")}>
        <Logo />
        {!collapsed && <div className="min-w-0">
          <div className="text-sm font-bold tracking-tight">ElainaBot</div>
          <div className="text-xs text-muted-foreground">QQ 机器人框架</div>
        </div>}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {navigation.map(({ id, label, detail, icon: NavIcon }) => (
          <div
            key={id}
            className={cn(
              "group relative flex w-full items-stretch rounded-lg text-sm transition-colors",
              page === id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
            )}
          >
            <button
              type="button"
              title={collapsed ? label : undefined}
              onClick={() => {
                navigate(id);
                close?.();
              }}
              className={cn(
                "flex min-w-0 flex-1 items-center py-2.5 text-left",
                collapsed && "justify-center px-0",
              )}
            >
              <span className={cn("grid shrink-0 place-items-center", collapsed ? "w-full" : "w-12")}>
                <NavIcon
                  className={cn("size-4", page === id && "text-primary")}
                />
              </span>
              {!collapsed && <span className="flex min-w-0 flex-1 flex-col">
                <span className="leading-tight">{label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {detail}
                </span>
              </span>}
            </button>
            {id === "extensions" && !collapsed && (
              <Popover.Root open={extensionPickerOpen} onOpenChange={setExtensionPickerOpen}>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="mr-2 grid size-8 shrink-0 self-center place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    aria-label="选择扩展页面"
                    title="选择扩展页面"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    side="right"
                    align="start"
                    sideOffset={8}
                    collisionPadding={12}
                    className="z-[70] w-60 max-w-[var(--radix-popover-content-available-width)] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none"
                  >
                    <div className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">选择扩展页面</div>
                    <div className="max-h-72 space-y-1 overflow-y-auto">
                      {extensionLoading ? (
                        <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" />
                          正在读取扩展…
                        </div>
                      ) : extensionPages.length ? (
                        extensionPages.map((extension, index) => {
                          const key = String(extension.key || index);
                          const extensionLabel = String(extension.label || extension.title || extension.name || extension.key);
                          const active = key === selectedExtension;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                onSelectExtension(key);
                                setExtensionPickerOpen(false);
                              }}
                              className={cn(
                                "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                                active && "bg-accent text-accent-foreground",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate">{extensionLabel}</span>
                              {active && <Check className="size-4 shrink-0 text-primary" />}
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-2 py-2 text-xs text-muted-foreground">暂无扩展页面</div>
                      )}
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}
            {page === id && (
              <span className="pointer-events-none absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
            )}
          </div>
        ))}
      </nav>
      {!collapsed && <div className="border-t border-sidebar-border px-4 py-4 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Elaina Core
      </div>}
    </aside>
  );
}

function Shell({
  page,
  navigate,
  logout,
}: {
  page: Page;
  navigate: (next: Page) => void;
  logout: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [extensionPages, setExtensionPages] = useState<ApiData[]>([]);
  const [selectedExtension, setSelectedExtension] = useState(() => window.localStorage.getItem("elaina_extension_page") || "");
  const [extensionLoading, setExtensionLoading] = useState(true);
  const [extensionNotice, setExtensionNotice] = useState("");
  const current = navigation.find((item) => item.id === page)!;
  const fullBleed = page === "extensions";
  const refresh = () => {
    setRefreshing(true);
    setReloadKey((value) => value + 1);
    window.setTimeout(() => setRefreshing(false), 450);
  };
  useEffect(() => {
    let active = true;
    setExtensionLoading(true);
    setExtensionNotice("");
    api<ApiData>("/api/web-pages")
      .then((data) => {
        if (!active) return;
        const nextPages = Array.isArray(data.pages) ? data.pages : [];
        setExtensionPages(nextPages);
        setSelectedExtension((currentKey) => {
          const nextKey = nextPages.some((item: ApiData) => String(item.key) === currentKey)
            ? currentKey
            : String(nextPages[0]?.key || "");
          if (nextKey) window.localStorage.setItem("elaina_extension_page", nextKey);
          else window.localStorage.removeItem("elaina_extension_page");
          return nextKey;
        });
      })
      .catch((error) => {
        if (active) setExtensionNotice(error instanceof Error ? error.message : "扩展页面读取失败");
      })
      .finally(() => {
        if (active) setExtensionLoading(false);
      });
    return () => { active = false; };
  }, [reloadKey]);
  const selectExtension = (key: string) => {
    setSelectedExtension(key);
    if (key) window.localStorage.setItem("elaina_extension_page", key);
    navigate("extensions");
    setMobileOpen(false);
  };
  const content =
    page === "overview" ? (
      <OverviewPage key={reloadKey} navigate={navigate} />
    ) : page === "access" ? (
      <AccessCenterPage key={reloadKey} />
    ) : page === "messages" ? (
      <MessagesPage key={reloadKey} />
    ) : page === "plugins" ? (
      <PluginsPage key={reloadKey} />
    ) : page === "config" ? (
      <ConfigPage key={reloadKey} />
    ) : page === "market" ? (
      <MarketPage key={reloadKey} />
    ) : page === "database" ? (
      <DatabasePage key={reloadKey} />
    ) : page === "update" ? (
      <UpdatePage key={reloadKey} />
    ) : page === "extensions" ? (
      <ExtensionsPage key={reloadKey} pages={extensionPages} selectedKey={selectedExtension} loading={extensionLoading} notice={extensionNotice} />
    ) : page === "logs" ? (
      <LogsPage key={reloadKey} />
    ) : (
      <OverviewPage key={reloadKey} navigate={navigate} />
    );

  return (
    <div className="flex h-[100dvh] w-full max-w-full overflow-hidden bg-sidebar text-foreground">
      <div className="hidden lg:block">
        <Sidebar page={page} navigate={navigate} collapsed={sidebarCollapsed} extensionPages={extensionPages} selectedExtension={selectedExtension} extensionLoading={extensionLoading} onSelectExtension={selectExtension} />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-black/20"
            aria-label="关闭导航"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[min(88vw,248px)] max-w-full">
            <Sidebar
              page={page}
              navigate={navigate}
              collapsed={false}
              close={() => setMobileOpen(false)}
              extensionPages={extensionPages}
              selectedExtension={selectedExtension}
              extensionLoading={extensionLoading}
              onSelectExtension={selectExtension}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-3"
              onClick={() => setMobileOpen(false)}
              aria-label="关闭导航"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background shadow-[0_0_18px_-6px_rgb(0_0_0/0.14)] lg:rounded-tl-2xl">
        <header className="flex h-16 min-w-0 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/90 px-2 backdrop-blur min-[360px]:px-3 sm:px-5 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="打开导航"
            >
              <Menu className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-label={sidebarCollapsed ? "展开导航" : "收起导航"}
              title={sidebarCollapsed ? "展开导航" : "收起导航"}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">
                {current.label}
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {current.detail}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
            <span className="mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <span className="size-2 rounded-full bg-emerald-500" />
              已连接
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={refresh}
              disabled={refreshing}
              aria-label="刷新"
            >
              <RefreshCw
                className={cn("size-4", refreshing && "animate-spin")}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              aria-label="退出登录"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>
        <main
          className={cn(
            "min-h-0 flex-1",
            fullBleed ? "overflow-hidden" : "overflow-y-auto",
          )}
        >
          <div
            className={cn(
              "w-full min-w-0",
              fullBleed
                ? "h-full max-w-none p-0"
                : "max-w-none px-2.5 py-3 min-[360px]:px-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6 2xl:px-8",
            )}
          >
            {content}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [page, navigate] = usePage();
  useEffect(() => {
    api("/api/auth/check")
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAuthed(false);
  };
  if (authed === null)
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-primary" />
      </main>
    );
  return authed ? (
    <Shell page={page} navigate={navigate} logout={logout} />
  ) : (
    <Login onAuthed={() => setAuthed(true)} />
  );
}

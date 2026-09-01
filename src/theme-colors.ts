export const COLOR_THEMES = {
  discord: { name: "清新蓝", accent: "#3b7bf7", foreground: "#ffffff" },
  dark: { name: "石墨灰", accent: "#2f6feb", foreground: "#ffffff" },
  midnight: { name: "梦幻紫", accent: "#7c5cf6", foreground: "#ffffff" },
  sakura: { name: "樱花粉", accent: "#f472b6", foreground: "#ffffff" },
  rose: { name: "玫瑰红", accent: "#e11d48", foreground: "#ffffff" },
  coral: { name: "珊瑚橙", accent: "#fb7185", foreground: "#ffffff" },
  orange: { name: "活力橙", accent: "#f97316", foreground: "#ffffff" },
  amber: { name: "琥珀金", accent: "#d97706", foreground: "#ffffff" },
  lemon: { name: "柠檬黄", accent: "#ca8a04", foreground: "#ffffff" },
  matcha: { name: "抹茶绿", accent: "#65a30f", foreground: "#ffffff" },
  forest: { name: "森林绿", accent: "#16a34a", foreground: "#ffffff" },
  emerald: { name: "翡翠绿", accent: "#10b981", foreground: "#ffffff" },
  teal: { name: "青碧", accent: "#0d9488", foreground: "#ffffff" },
  cyan: { name: "湖水青", accent: "#06b6d4", foreground: "#ffffff" },
  sky: { name: "天空蓝", accent: "#0ea5e9", foreground: "#ffffff" },
  indigo: { name: "深靛蓝", accent: "#4f46e5", foreground: "#ffffff" },
  grape: { name: "葡萄紫", accent: "#9333ea", foreground: "#ffffff" },
  magenta: { name: "绛紫", accent: "#c026d3", foreground: "#ffffff" },
  slate: { name: "板岩灰", accent: "#64748b", foreground: "#ffffff" },
  mocha: { name: "摩卡棕", accent: "#a47148", foreground: "#ffffff" },
} as const;

export type ColorThemeName = keyof typeof COLOR_THEMES;

export function storedColorTheme(): ColorThemeName {
  const saved = window.localStorage.getItem("elainaqq_theme");
  return saved && saved in COLOR_THEMES ? saved as ColorThemeName : "discord";
}

export function applyColorTheme(name: ColorThemeName) {
  const theme = COLOR_THEMES[name] || COLOR_THEMES.discord;
  const style = document.documentElement.style;
  document.documentElement.dataset.themeColor = name;
  style.setProperty("--primary", theme.accent);
  style.setProperty("--primary-foreground", theme.foreground);
  style.setProperty("--ring", theme.accent);
  style.setProperty("--sidebar-primary", theme.accent);
  style.setProperty("--sidebar-primary-foreground", theme.foreground);
  style.setProperty("--accent", "color-mix(in oklab, " + theme.accent + " 13%, var(--background))");
  style.setProperty("--accent-foreground", "color-mix(in oklab, " + theme.accent + " 72%, var(--foreground))");
  style.setProperty("--sidebar-accent", "color-mix(in oklab, " + theme.accent + " 12%, var(--sidebar))");
  style.setProperty("--sidebar-accent-foreground", "color-mix(in oklab, " + theme.accent + " 72%, var(--sidebar-foreground))");
  style.setProperty("--log-info", theme.accent);
}

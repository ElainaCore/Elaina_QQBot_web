import { defineStore } from 'pinia'
import { ref, computed, nextTick } from 'vue'

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16)
  const f = c => Math.max(0, Math.min(255, Math.round(pct >= 0 ? c + (255 - c) * pct : c * (1 + pct))))
  const [r, g, b] = [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)]
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

function mk(name, accent) {
  const n = parseInt(accent.slice(1), 16)
  return {
    name,
    bg: '#f5f6f9', bgPanel: '#ffffff', bgDeep: '#eef0f5', bgFloat: '#ffffff',
    text: '#1f2733', textSecondary: '#5b6675', textMuted: '#97a1b0',
    border: '#eef1f6',
    accent, accentHover: shade(accent, -0.15), accentLight: shade(accent, 0.25),
    accentSoft: `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, 0.1)`,
    success: '#22c55e', danger: '#ef4444', warning: '#f59e0b', info: accent,
  }
}

const THEMES = {
  discord: {
    name: '清新蓝',
    bg: '#f4f6fb', bgPanel: '#ffffff', bgDeep: '#f1f4f9', bgFloat: '#ffffff',
    text: '#1f2733', textSecondary: '#5b6675', textMuted: '#97a1b0',
    border: '#eef1f6',
    accent: '#3b7bf7', accentHover: '#2f6ae0', accentLight: '#6fa0fb',
    accentSoft: 'rgba(59, 123, 247, 0.1)',
    success: '#22c55e', danger: '#ef4444', warning: '#f59e0b', info: '#3b7bf7',
  },
  dark: {
    name: '石墨灰',
    bg: '#f5f6f8', bgPanel: '#ffffff', bgDeep: '#eef0f3', bgFloat: '#ffffff',
    text: '#1c2128', textSecondary: '#57606a', textMuted: '#8a93a0',
    border: '#eceef1',
    accent: '#2f6feb', accentHover: '#1f5fd8', accentLight: '#6398f5',
    accentSoft: 'rgba(47, 111, 235, 0.1)',
    success: '#2ea043', danger: '#e5484d', warning: '#d29922', info: '#2f6feb',
  },
  midnight: {
    name: '梦幻紫',
    bg: '#f8f6fe', bgPanel: '#ffffff', bgDeep: '#f3effb', bgFloat: '#ffffff',
    text: '#2a2150', textSecondary: '#6b5f93', textMuted: '#a094c0',
    border: '#efeafa',
    accent: '#7c5cf6', accentHover: '#6a49ee', accentLight: '#a48ff9',
    accentSoft: 'rgba(124, 92, 246, 0.1)',
    success: '#22c55e', danger: '#ef4444', warning: '#f59e0b', info: '#7c5cf6',
  },
  sakura: mk('樱花粉', '#f472b6'),
  rose: mk('玫瑰红', '#e11d48'),
  coral: mk('珊瑚橙', '#fb7185'),
  orange: mk('活力橙', '#f97316'),
  amber: mk('琥珀金', '#d97706'),
  lemon: mk('柠檬黄', '#ca8a04'),
  matcha: mk('抹茶绿', '#65a30f'),
  forest: mk('森林绿', '#16a34a'),
  emerald: mk('翡翠绿', '#10b981'),
  teal: mk('青碧', '#0d9488'),
  cyan: mk('湖水青', '#06b6d4'),
  sky: mk('天空蓝', '#0ea5e9'),
  indigo: mk('深靛蓝', '#4f46e5'),
  grape: mk('葡萄紫', '#9333ea'),
  magenta: mk('绛紫', '#c026d3'),
  slate: mk('板岩灰', '#64748b'),
  mocha: mk('摩卡棕', '#a47148'),
}

function darkVariant(t) {
  return {
    ...t,
    bg: '#14161b', bgPanel: '#1c1f26', bgDeep: '#181b21', bgFloat: '#242832',
    text: '#e6e9ef', textSecondary: '#a3adbd', textMuted: '#6b7484',
    border: '#2a2f3a',
    accentSoft: t.accentSoft.replace('0.1)', '0.18)'),
  }
}

export const useThemeStore = defineStore('theme', () => {
  const themeName = ref(localStorage.getItem('elainaqq_theme') || 'discord')
  const darkMode = ref(localStorage.getItem('elainaqq_dark') === '1')
  const theme = computed(() => {
    const t = THEMES[themeName.value] || THEMES.discord
    return darkMode.value ? darkVariant(t) : t
  })

  function setTheme(name) {
    themeName.value = name
    localStorage.setItem('elainaqq_theme', name)
    applyCSS(theme.value)
  }

  let activeVT = null
  function toggleDark(event) {
    const apply = () => {
      darkMode.value = !darkMode.value
      localStorage.setItem('elainaqq_dark', darkMode.value ? '1' : '0')
      applyCSS(theme.value)
    }
    if (activeVT) {
      try { activeVT.skipTransition() } catch {}
      apply()
      return
    }
    if (typeof document.startViewTransition !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply()
      return
    }
    const root = document.documentElement
    const x = event?.clientX ?? window.innerWidth / 2
    const y = event?.clientY ?? 0
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const toDark = !darkMode.value
    root.classList.toggle('vt-reverse', !toDark)
    root.classList.add('vt-active')
    const vt = document.startViewTransition(async () => {
      apply()
      await nextTick()
    })
    activeVT = vt
    let animation = null
    const cleanup = () => {
      root.classList.remove('vt-reverse', 'vt-active')
      try { animation?.cancel() } catch {}
      animation = null
      if (activeVT === vt) activeVT = null
    }
    const watchdog = setTimeout(() => {
      try { vt.skipTransition() } catch {}
      cleanup()
    }, 900)
    vt.finished.catch(() => {}).finally(() => {
      clearTimeout(watchdog)
      cleanup()
    })
    vt.ready.then(() => {
      const clip = [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
      animation = root.animate(
        { clipPath: toDark ? clip : [...clip].reverse() },
        {
          duration: 500,
          easing: 'ease-in-out',
          fill: 'forwards',
          pseudoElement: toDark ? '::view-transition-new(root)' : '::view-transition-old(root)',
        },
      )
      return animation.finished
    }).catch(() => {
      try { vt.skipTransition() } catch {}
    })
  }

  function applyCSS(t) {
    const s = document.documentElement.style
    s.setProperty('--bg', t.bg)
    s.setProperty('--bg2', t.bgPanel)
    s.setProperty('--bg3', t.bgDeep)
    s.setProperty('--bg-float', t.bgFloat)
    s.setProperty('--text', t.text)
    s.setProperty('--text2', t.textSecondary)
    s.setProperty('--text3', t.textMuted)
    s.setProperty('--border', t.border)
    s.setProperty('--accent', t.accent)
    s.setProperty('--accent-hover', t.accentHover)
    s.setProperty('--accent-light', t.accentLight)
    s.setProperty('--accent-soft', t.accentSoft)
    s.setProperty('--success', t.success)
    s.setProperty('--danger', t.danger)
    s.setProperty('--warning', t.warning)
    s.setProperty('--info', t.info)
    s.setProperty('--radius', '16px')
    s.setProperty('--radius-sm', '10px')
    if (darkMode.value) {
      s.setProperty('--shadow', '0 1px 2px rgba(0,0,0,.3), 0 4px 12px rgba(0,0,0,.35)')
      s.setProperty('--shadow-sm', '0 1px 2px rgba(0,0,0,.3), 0 1px 3px rgba(0,0,0,.35)')
      s.setProperty('--shadow-hover', '0 4px 10px rgba(0,0,0,.35), 0 10px 24px rgba(0,0,0,.4)')
    } else {
      s.setProperty('--shadow', '0 1px 2px rgba(16,24,40,.04), 0 4px 12px rgba(16,24,40,.05)')
      s.setProperty('--shadow-sm', '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)')
      s.setProperty('--shadow-hover', '0 4px 10px rgba(16,24,40,.06), 0 10px 24px rgba(16,24,40,.08)')
    }
    document.documentElement.style.colorScheme = darkMode.value ? 'dark' : 'light'
  }

  function naiveOverrides(t) {
    return {
      common: {
        primaryColor: t.accent, primaryColorHover: t.accentLight,
        primaryColorPressed: t.accentHover, primaryColorSuppl: t.accentLight,
        bodyColor: t.bg, baseColor: t.bgPanel, cardColor: t.bgPanel,
        modalColor: t.bgPanel, popoverColor: t.bgFloat,
        tableColor: t.bgPanel, tableColorHover: t.bgDeep,
        inputColor: t.bgPanel, inputColorDisabled: t.bgDeep,
        actionColor: t.bgDeep, tagColor: t.bgDeep,
        borderColor: t.border, dividerColor: t.border, hoverColor: t.bgDeep,
        textColorBase: t.text, textColor1: t.text,
        textColor2: t.textSecondary, textColor3: t.textMuted,
        placeholderColor: t.textMuted,
        successColor: t.success, errorColor: t.danger,
        warningColor: t.warning, infoColor: t.info,
        borderRadius: '12px', borderRadiusSmall: '8px',
      },
      Card: { colorEmbedded: t.bgDeep },
      DataTable: { thColor: t.bgDeep, tdColorHover: t.bgDeep },
      Menu: { itemTextColor: t.text, itemTextColorHover: t.accent, itemColorActive: t.bgDeep },
      Input: { color: t.bgPanel, colorFocus: t.bgFloat, textColor: t.text },
      Tag: { textColor: t.textSecondary },
    }
  }

  applyCSS(theme.value)

  return { themeName, darkMode, theme, setTheme, toggleDark, applyCSS, naiveOverrides, THEMES }
})

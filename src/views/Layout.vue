<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NAvatar, NButton, NDescriptions, NDescriptionsItem, NModal, NPopover,
  NSwitch, NTag,
} from 'naive-ui'
import { useAppStore } from '../stores/app'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { connect, disconnect, on, off } from '../utils/ws'
import axios from '../utils/axios'
import SvgIcon from '../components/SvgIcon.vue'

const router = useRouter()
const route = useRoute()
const app = useAppStore()
const auth = useAuthStore()
const themeStore = useThemeStore()

const logoSrc = '/web/favicon.svg'
const wsConnected = ref(false)
const mobileMenuOpen = ref(false)
const isMobile = ref(false)
const restarting = ref(false)
const showDefaultPwdWarning = ref(false)
const showRestart = ref(false)
const restartPhase = ref('confirm')
let restartTimer = null
let botRefreshTimer = null

const NAV_ITEMS = [
  { label: '仪表盘', key: 'Dashboard', icon: 'home' },
  { label: '机器人', key: 'Bots', icon: 'robot' },
  { label: '全局日志', key: 'Logs', icon: 'document-text' },
  { label: '插件模块', key: 'Plugins', icon: 'extension-puzzle' },
  { label: '数据库', key: 'Database', icon: 'server' },
  { label: '消息记录', key: 'Messages', icon: 'chatbubbles' },
  { label: '插件市场', key: 'Market', icon: 'storefront' },
  { label: '框架配置', key: 'Config', icon: 'settings' },
  { label: '框架更新', key: 'Update', icon: 'cloud-download' },
]

const currentRouteName = computed(() => route.name)
// 机器人详情弹窗
const showBotDetail = ref(false)
const detailBot = ref(null)
const togglingBot = ref('')

async function handleToggleBot(bot, enabled) {
  togglingBot.value = bot.bot_qq
  const ok = await app.toggleBot(bot.bot_qq, enabled)
  togglingBot.value = ''
  if (ok) {
    window.$message?.success(enabled ? '机器人已启用' : '机器人已关闭')
  } else {
    window.$message?.error('操作失败')
  }
}

function navigate(name) {
  router.push({ name })
  mobileMenuOpen.value = false
}

function navigateCustom(key) {
  router.push({ name: 'CustomPage', params: { key } })
  mobileMenuOpen.value = false
}

function openRestart() {
  restartPhase.value = 'confirm'
  showRestart.value = true
}

function closeRestart() {
  if (restartPhase.value === 'restarting') return
  clearTimeout(restartTimer)
  showRestart.value = false
}

async function handleRestart() {
  restartPhase.value = 'restarting'
  restarting.value = true
  try {
    await axios.post('/api/bot/restart')
  } catch {}
  const start = Date.now()
  let wentDown = false
  const poll = async () => {
    try {
      await axios.get('/api/auth/check', { timeout: 3000 })
      if (wentDown || Date.now() - start > 8000) {
        restartPhase.value = 'done'
        restarting.value = false
        restartTimer = setTimeout(() => location.reload(), 1200)
        return
      }
    } catch {
      wentDown = true
    }
    if (Date.now() - start > 120000) {
      restartPhase.value = 'failed'
      restarting.value = false
      return
    }
    restartTimer = setTimeout(poll, 1500)
  }
  restartTimer = setTimeout(poll, 1500)
}

function stepClass(n) {
  const phase = restartPhase.value
  if (phase === 'restarting') return n === 1 ? 'done' : n === 2 ? 'active' : ''
  if (phase === 'done') return 'done'
  if (phase === 'failed') return n === 1 ? 'done' : n === 2 ? 'fail' : ''
  return ''
}

function reloadNow() {
  location.reload()
}

function handleResize() { isMobile.value = window.innerWidth < 768 }
function onWsOpen() { wsConnected.value = true }
function onWsClose() { wsConnected.value = false }

function fetchBotDetail(bot) {
  detailBot.value = bot
  showBotDetail.value = true
}

function goConfig() { router.push({ name: 'Config' }) }

async function checkDefaultPassword() {
  // 以后端实际配置为准, 避免本地缓存的弱密码标记导致"默认密码"误报
  try {
    const res = await axios.get('/api/auth/password-status')
    const weak = !!(res.data?.is_default || res.data?.is_weak)
    showDefaultPwdWarning.value = weak
    if (!weak) localStorage.removeItem('elainaqq_weak_pwd')
    return
  } catch {}
  // 接口异常时回退到本地标记
  if (auth.isWeakPassword) showDefaultPwdWarning.value = true
}

async function clearCache() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister()))
    }
    localStorage.clear()
    sessionStorage.clear()
    // 强制绕过浏览器 HTTP 缓存重新加载
    window.location.href = window.location.pathname + '?_t=' + Date.now()
  } catch { window.location.href = window.location.pathname + '?_t=' + Date.now() }
}

function handleLogout() {
  auth.logout()
  router.push('/login')
}

onMounted(async () => {
  handleResize()
  window.addEventListener('resize', handleResize)
  await app.ensureBots()
  botRefreshTimer = window.setInterval(() => {
    if (!document.hidden) app.fetchBots()
  }, 2000)
  app.fetchSystemInfo()
  await app.fetchWebPages()
  connect()
  on('open', onWsOpen)
  on('close', onWsClose)
  checkDefaultPassword()
})

onUnmounted(() => {
  clearTimeout(restartTimer)
  clearInterval(botRefreshTimer)
  window.removeEventListener('resize', handleResize)
  off('open', onWsOpen)
  off('close', onWsClose)
  disconnect()
})
</script>

<template>
  <div class="layout-root">
    <!-- 移动端遮罩层 -->
    <div v-if="mobileMenuOpen" class="mobile-overlay" @click="mobileMenuOpen = false" />

    <!-- 侧边栏 -->
    <aside :class="['sidebar', { open: mobileMenuOpen, collapsed: app.sidebarCollapsed && !isMobile }]">
      <div class="sidebar-logo">
        <img class="logo-icon" :src="logoSrc" alt="ElainaQQ" />
        <span v-if="!app.sidebarCollapsed || isMobile">ElainaQQ</span>
      </div>

      <nav class="sidebar-nav">
        <a v-for="item in NAV_ITEMS" :key="item.key"
          :class="['nav-item', { active: currentRouteName === item.key }]"
          @click="navigate(item.key)">
          <SvgIcon :name="item.icon" :size="18" />
          <span v-if="!app.sidebarCollapsed || isMobile">{{ item.label }}</span>
        </a>

        <template v-if="app.webPages.length">
          <div v-if="!app.sidebarCollapsed || isMobile" class="nav-divider">扩展页面</div>
          <a v-for="page in app.webPages" :key="page.key"
            :class="['nav-item', { active: route.params.key === page.key && route.name === 'CustomPage' }]"
            @click="navigateCustom(page.key)">
            <SvgIcon name="extension-puzzle" :size="18" />
            <span v-if="!app.sidebarCollapsed || isMobile" class="nav-label-with-badge">
              {{ page.label }}
              <SvgIcon :name="page.source === 'module' ? 'cube' : 'link'" :size="12" class="nav-badge" />
            </span>
          </a>
        </template>
      </nav>

      <div v-if="!isMobile" class="sidebar-toggle" @click="app.sidebarCollapsed = !app.sidebarCollapsed">
        <SvgIcon :name="app.sidebarCollapsed ? 'chevron-forward' : 'chevron-back'" :size="16" />
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="main-area">
      <header class="topbar">
        <div class="topbar-left">
          <button v-if="isMobile" class="hamburger" @click="mobileMenuOpen = !mobileMenuOpen">
            <SvgIcon name="menu" :size="22" />
          </button>

          <!-- 多机器人选择器 -->
          <n-popover v-if="app.bots.length > 1" trigger="click" placement="bottom-start">
            <template #trigger>
              <div class="bot-selector">
                <template v-if="app.isAllBots">
                  <span class="ws-dot online" />
                  <span class="bot-name">全部机器人</span>
                  <span class="bot-qq">{{ app.bots.length }} 个</span>
                </template>
                <template v-else>
                  <img v-if="app.currentBot?.avatar" :src="app.currentBot.avatar" class="bot-avatar-tiny" />
                  <span v-else class="bot-avatar-letter">{{ (app.currentBot?.name || '?').charAt(0) }}</span>
                  <span :class="['ws-dot', app.currentBot?.connected ? 'online' : app.currentBot?.connection_type === 'Webhook' ? 'waiting' : 'offline']" />
                  <span class="bot-name">{{ app.currentBot?.name || '未知' }}</span>
                  <n-tag :bordered="false" size="tiny" :type="app.currentBot?.connection_type === 'Webhook' ? 'info' : 'success'" style="font-size:10px">
                    {{ app.currentBot?.connection_type === 'Embedded QQ' ? 'QQ' : app.currentBot?.connection_type === 'Webhook' ? 'WH' : 'WS' }}
                  </n-tag>
                </template>
                <SvgIcon name="chevron-forward" :size="14" style="transform:rotate(90deg);opacity:0.5" />
              </div>
            </template>
            <div class="bot-switch-list">
              <div :class="['bot-switch-item', { active: app.isAllBots }]" @click="app.switchBot('')">
                <span class="ws-dot online" />
                <span class="bot-name">全部机器人</span>
                <span class="bot-qq">{{ app.bots.length }} 个</span>
              </div>
              <div v-for="bot in app.bots" :key="bot.bot_qq"
                :class="['bot-switch-item', { active: bot.bot_qq === app.currentBotId, disabled: bot.enabled === false }]"
                @click="bot.enabled !== false && app.switchBot(bot.bot_qq)">
                <img v-if="bot.avatar" :src="bot.avatar" class="bot-avatar-tiny" :style="bot.enabled === false ? 'opacity:0.4' : ''" />
                <span v-else class="bot-avatar-letter" :style="bot.enabled === false ? 'opacity:0.4' : ''">{{ (bot.name || bot.bot_qq).charAt(0) }}</span>
                <span v-if="bot.enabled !== false" :class="['ws-dot', bot.connected ? 'online' : bot.connection_type === 'Webhook' ? 'waiting' : 'offline']" />
                <span v-else class="ws-dot offline" />
                <span class="bot-info-col">
                  <span class="bot-name" :style="bot.enabled === false ? 'opacity:0.5' : ''">{{ bot.name || bot.bot_qq }}</span>
                  <span class="bot-qq">{{ bot.bot_qq }}</span>
                </span>
                <n-tag v-if="bot.enabled !== false" :bordered="false" size="tiny" :type="bot.connection_type === 'Webhook' ? 'info' : 'success'" style="font-size:10px;flex-shrink:0">
                  {{ bot.connection_type === 'Embedded QQ' ? 'QQ' : bot.connection_type === 'Webhook' ? 'WH' : 'WS' }}
                </n-tag>
                <n-tag v-else :bordered="false" size="tiny" type="warning" style="font-size:10px;flex-shrink:0">已关闭</n-tag>
                <n-switch size="small" :value="bot.enabled !== false" :loading="togglingBot === bot.bot_qq"
                  @click.stop @update:value="v => handleToggleBot(bot, v)" />
                <n-button quaternary circle size="tiny" @click.stop="fetchBotDetail(bot)" title="详情" style="flex-shrink:0">
                  <template #icon><SvgIcon name="information-circle" :size="14" /></template>
                </n-button>
              </div>
            </div>
          </n-popover>

          <!-- 单机器人状态 -->
          <div v-else-if="app.bots.length === 1" class="bot-selector">
            <template v-if="app.bots[0].enabled !== false">
              <img v-if="app.bots[0].avatar" :src="app.bots[0].avatar" class="bot-avatar-tiny" />
              <span v-else class="bot-avatar-letter">{{ (app.bots[0].name || '?').charAt(0) }}</span>
              <span :class="['ws-dot', app.bots[0].connected ? 'online' : app.bots[0].connection_type === 'Webhook' ? 'waiting' : 'offline']" />
              <span class="bot-name">{{ app.bots[0].name || '未知' }}</span>
              <n-tag :bordered="false" size="tiny" :type="app.bots[0].connection_type === 'Webhook' ? 'info' : 'success'" style="font-size:10px">
                {{ app.bots[0].connection_type === 'Embedded QQ' ? 'QQ' : app.bots[0].connection_type === 'Webhook' ? 'WH' : 'WS' }}
              </n-tag>
            </template>
            <template v-else>
              <span class="bot-avatar-letter" style="opacity:0.4">{{ (app.bots[0].name || '?').charAt(0) }}</span>
              <span class="ws-dot offline" />
              <span class="bot-name" style="opacity:0.5">{{ app.bots[0].name || '未知' }}</span>
              <n-tag :bordered="false" size="tiny" type="warning" style="font-size:10px">已关闭</n-tag>
            </template>
            <n-switch size="small" :value="app.bots[0].enabled !== false" :loading="togglingBot === app.bots[0].bot_qq"
              @update:value="v => handleToggleBot(app.bots[0], v)" style="margin-left:4px" />
            <n-button quaternary circle size="tiny" @click="fetchBotDetail(app.bots[0])" title="详情">
              <template #icon><SvgIcon name="information-circle" :size="14" /></template>
            </n-button>
          </div>

          <span :class="['ws-dot ws-main', wsConnected ? 'online' : 'offline']" title="WebSocket" />
        </div>

        <div class="topbar-right">
          <!-- 代码仓库入口 -->
          <a href="https://github.com/ElainaCore/Elaina_QQBot" target="_blank" rel="noopener"
            title="GitHub" class="github-link">
            <SvgIcon name="github" :size="18" />
          </a>

          <!-- 深色模式 -->
          <n-button quaternary circle size="small"
            :title="themeStore.darkMode ? '切换日间模式' : '切换夜间模式'"
            @click="themeStore.toggleDark($event)">
            <template #icon><SvgIcon :name="themeStore.darkMode ? 'sunny' : 'moon'" :size="18" /></template>
          </n-button>

          <!-- 主题选择器 -->
          <n-popover trigger="click" placement="bottom-end">
            <template #trigger>
              <n-button quaternary circle size="small" title="主题">
                <template #icon><SvgIcon name="color-palette" :size="18" /></template>
              </n-button>
            </template>
            <div class="theme-picker">
              <div v-for="(t, key) in themeStore.THEMES" :key="key"
                :class="['theme-opt', { active: themeStore.themeName === key }]"
                @click="themeStore.setTheme(key)">
                <span class="theme-dot" :style="{ background: t.accent }" />
                {{ t.name }}
              </div>
            </div>
          </n-popover>

          <!-- 清除缓存 -->
          <n-button quaternary circle size="small" title="清除缓存" @click="clearCache">
            <template #icon><SvgIcon name="trash" :size="18" /></template>
          </n-button>

          <!-- 重启框架 -->
          <n-button quaternary circle size="small" :loading="restarting" title="重启框架" @click="openRestart">
            <template #icon><SvgIcon name="refresh" :size="18" /></template>
          </n-button>

          <!-- 退出登录 -->
          <n-button quaternary circle size="small" @click="handleLogout">
            <template #icon><SvgIcon name="log-out" :size="18" /></template>
          </n-button>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- 默认密码警告弹窗 -->
    <n-modal v-model:show="showDefaultPwdWarning" preset="dialog" type="warning"
      title="安全提醒" positive-text="前往修改" @positive-click="goConfig" closable mask-closable>
      检测到当前 Web 面板使用的是默认密码，存在安全风险，请尽快修改。
    </n-modal>

    <!-- 重启确认弹窗 -->
    <n-modal v-model:show="showRestart"
      :mask-closable="restartPhase !== 'restarting'"
      :close-on-esc="restartPhase !== 'restarting'">
      <div class="restart-modal">
        <div class="restart-head">
          <div class="restart-icon" :class="restartPhase"><SvgIcon name="refresh" :size="22" /></div>
          <div>
            <div class="restart-title">{{ restartPhase === 'done' ? '重启成功' : restartPhase === 'failed' ? '重启超时' : '重启框架' }}</div>
            <div class="restart-sub">{{ restartPhase === 'confirm' ? '重启期间服务将暂时不可用' : restartPhase === 'restarting' ? '正在等待框架重新上线...' : restartPhase === 'done' ? '框架已恢复，即将自动刷新页面' : '长时间未检测到框架恢复，请检查后台日志' }}</div>
          </div>
        </div>
        <div class="restart-steps">
          <div class="restart-step" :class="stepClass(1)">
            <span class="restart-step-num"><i>1</i></span>
            <div><b>发送重启指令</b><span>通知框架优雅退出并重新拉起进程</span></div>
          </div>
          <div class="restart-step" :class="stepClass(2)">
            <span class="restart-step-num"><i>2</i></span>
            <div><b>等待框架重启</b><span>自动轮询接口状态，直到服务重新响应</span></div>
          </div>
          <div class="restart-step" :class="stepClass(3)">
            <span class="restart-step-num"><i>3</i></span>
            <div><b>自动刷新页面</b><span>重启成功后自动刷新，无需手动操作</span></div>
          </div>
        </div>
        <div class="restart-actions">
          <template v-if="restartPhase === 'confirm'">
            <button class="restart-btn ghost" @click="closeRestart">取消</button>
            <button class="restart-btn primary" @click="handleRestart">确认重启</button>
          </template>
          <template v-else-if="restartPhase === 'restarting'">
            <button class="restart-btn primary" disabled>重启中，请勿关闭页面...</button>
          </template>
          <template v-else-if="restartPhase === 'done'">
            <button class="restart-btn primary" @click="reloadNow">立即刷新</button>
          </template>
          <template v-else>
            <button class="restart-btn ghost" @click="closeRestart">关闭</button>
            <button class="restart-btn primary" @click="handleRestart">重试</button>
          </template>
        </div>
      </div>
    </n-modal>

    <!-- 机器人详情弹窗 -->
    <n-modal v-model:show="showBotDetail" preset="card" title="机器人详情"
      :style="{ width: isMobile ? '95vw' : '600px', maxWidth: '600px', background: 'var(--bg2)' }">
      <div v-if="detailBot" class="bot-detail">
        <div class="bd-header">
          <n-avatar v-if="detailBot.avatar" :src="detailBot.avatar" :size="72" round />
          <div v-else class="bd-avatar-placeholder">{{ (detailBot.name || detailBot.bot_qq).charAt(0) }}</div>
          <div class="bd-header-info">
            <div class="bd-name">{{ detailBot.name || '未知机器人' }}</div>
            <div class="bd-sub">QQ: {{ detailBot.qq || detailBot.bot_qq }}</div>
            <div class="bd-sub">OneBot v11 协议机器人</div>
          </div>
        </div>

        <n-descriptions :column="2" label-placement="left" size="small" class="bd-info">
          <n-descriptions-item label="机器人开关">
            <n-switch size="small" :value="detailBot.enabled !== false" :loading="togglingBot === detailBot.bot_qq"
              @update:value="v => handleToggleBot(detailBot, v)" />
          </n-descriptions-item>
          <n-descriptions-item label="状态">
            <n-tag :type="detailBot.connected ? 'success' : 'error'" size="small">
              {{ detailBot.connected ? '已连接' : '未连接' }}
            </n-tag>
          </n-descriptions-item>
          <n-descriptions-item label="连接方式">{{ detailBot.connection_type || 'WebSocket' }}</n-descriptions-item>
        </n-descriptions>
      </div>
    </n-modal>
  </div>
</template>

<style scoped src="../styles/Layout.css"></style>

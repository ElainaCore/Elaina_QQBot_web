<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage, useDialog } from 'naive-ui'
import { useAppStore } from '../stores/app'
import { on, off } from '../utils/ws'
import axios from '../utils/axios'
import SvgIcon from '../components/SvgIcon.vue'
import Network from './Network.vue'

const msg = useMessage()
const dialog = useDialog()
const app = useAppStore()
const route = useRoute()
const router = useRouter()

const loading = ref(false)
const bots = ref([])
const embeddedBots = ref([])
const showAddBot = ref(false)
const showQrCode = ref(false)
const currentQrBot = ref(null)
const qrCodeData = ref('')
const qrCodeUrl = ref('')
const qrStatus = ref('waiting')
const qrRefreshing = ref(false)
const newBotForm = ref({ bot_id: '', nickname: '' })
const qqStatus = ref(null)
const qqBusy = ref(false)
const qqVersionKey = ref('')
const qqProgress = ref(null)
const activeView = ref(route.query.view === 'network' ? 'network' : 'accounts')
const showAccessType = ref(false)
const networkPanel = ref(null)

const qrImageSrc = computed(() => {
  if (!qrCodeData.value) return ''
  return qrCodeData.value.startsWith('data:') ? qrCodeData.value : 'data:image/png;base64,' + qrCodeData.value
})

// 轮询定时器
let statusTimer = null
let qqProgressTimer = null

const allBots = computed(() => {
  const embedded = embeddedBots.value.map(b => ({
    ...b,
    source: 'embedded',
    status_text: getStatusText(b.status),
    status_type: getStatusType(b.status)
  }))
  const external = bots.value.filter(b => !embedded.some(e => e.bot_qq === b.bot_qq)).map(b => ({
    ...b,
    source: 'external',
    status_text: b.connected ? '在线' : '离线',
    status_type: b.connected ? 'success' : 'default'
  }))
  return [...embedded, ...external]
})

const qqVersionOptions = computed(() => (qqStatus.value?.available_versions || [])
  .filter(item => item.compatible)
  .map(item => ({
    label: item.platform + ' ' + item.arch + ' · ' + (item.package || 'package') + ' · ' + item.version,
    value: item.key
  })))

function getStatusText(status) {
  const map = {
    online: '在线',
    offline: '离线',
   logging_in: '登录中...',
    authorizing: '已确认登录，初始化中...',
   error: '错误',
    not_installed: '未安装 QQ',
    waiting_qr: '等待扫码'
  }
  return map[status] || status || '未知'
}

function getStatusType(status) {
  const map = {
    online: 'success',
    offline: 'default',
   logging_in: 'info',
    authorizing: 'info',
   error: 'error',
    not_installed: 'warning',
    waiting_qr: 'warning'
  }
  return map[status] || 'default'
}

function formatMemory(bot) {
  if (!bot?.pid) return '未运行'
  const rss = Number(bot.memory_rss_mb ?? bot.memory_mb ?? 0)
  const pss = Number(bot.memory_pss_mb ?? 0)
  if (pss > 0) return `${rss.toFixed(1)} MB RSS / ${pss.toFixed(1)} MB PSS`
  return `${rss.toFixed(1)} MB RSS`
}

async function fetchBots() {
  loading.value = true
  try {
    const res = await axios.get('/api/bots')
    if (res.data?.success) {
      bots.value = res.data.bots || []
    }
  } catch (e) {
    msg.error('获取机器人列表失败')
  } finally {
    loading.value = false
  }
}

async function fetchEmbeddedStatus() {
  try {
    const res = await axios.get('/api/embedded/status')
    if (res.data?.success) {
      embeddedBots.value = res.data.bots || []

      // 检查当前显示的 QR 码状态
      if (currentQrBot.value) {
        const bot = embeddedBots.value.find(b => b.bot_id === currentQrBot.value.bot_id)
        if (bot) {
          currentQrBot.value = bot
          qrCodeUrl.value = bot.qrcode_url || ''
          if (bot.status === 'online') {
            qrStatus.value = 'success'
            msg.success(`账号 ${bot.qq} 登录成功`)
            setTimeout(() => {
              showQrCode.value = false
              currentQrBot.value = null
            }, 2000)
          } else if (bot.status === 'error') {
            qrStatus.value = 'error'
          } else if (bot.qrcode) {
            qrCodeData.value = bot.qrcode
            qrStatus.value = 'waiting'
         } else if (bot.qrcode_url) {
           qrStatus.value = 'waiting'
          } else if (bot.status === 'authorizing') {
            qrCodeData.value = ''
            qrStatus.value = 'authorizing'
         }
        }
      }
    }
  } catch (e) {
    console.error('获取内置机器人状态失败', e)
  }
}

function stopQQProgressPolling() {
  if (qqProgressTimer) {
    clearInterval(qqProgressTimer)
    qqProgressTimer = null
  }
}

function startQQProgressPolling() {
  stopQQProgressPolling()
  const poll = () => pollQQProgress()
  qqProgressTimer = setInterval(poll, 800)
  poll()
}

async function pollQQProgress() {
  const versionKey = qqProgress.value?.version_key
  if (!versionKey) return
  try {
    const res = await axios.get('/api/qq/progress', { params: { version_key: versionKey } })
    const progress = res.data?.progress
    if (!progress) {
      qqBusy.value = false
      stopQQProgressPolling()
      return
    }
    qqProgress.value = progress
    if (progress.state === 'completed') {
      qqBusy.value = false
      stopQQProgressPolling()
      await fetchQQStatus(false)
      msg.success(progress.message || (progress.operation === 'download' ? 'QQ 安装包下载完成' : 'QQ 安装完成'))
    } else if (progress.state === 'failed' || progress.state === 'manual') {
      qqBusy.value = false
      stopQQProgressPolling()
      msg.error(progress.message || 'QQ 任务失败')
    }
  } catch (e) {
    console.error('获取 QQ 任务进度失败', e)
  }
}

async function fetchQQStatus(resumeProgress = true) {
  try {
    const res = await axios.get('/api/qq/status')
    if (res.data?.success) {
      qqStatus.value = res.data.status || null
      qqVersionKey.value = qqVersionKey.value || qqStatus.value?.recommended?.key || qqVersionOptions.value[0]?.value || ''
      const progress = res.data.progress
      if (progress && progress.state === 'running' && resumeProgress) {
        qqProgress.value = progress
        qqBusy.value = true
        startQQProgressPolling()
      } else if (!progress || progress.state !== 'running') {
        qqProgress.value = progress || null
        if (!progress || progress.state !== 'running') stopQQProgressPolling()
      }
    }
  } catch (e) {
    console.error('获取 QQ 安装状态失败', e)
  }
}

async function installQQ() {
  const versionKey = qqVersionKey.value || qqStatus.value?.recommended?.key
  if (!versionKey) {
    msg.warning('当前系统没有可用的 QQ 安装包')
    return
  }
  qqBusy.value = true
  try {
    const res = await axios.post('/api/qq/install', { version_key: versionKey, auto_download: true })
    if (res.data?.success) {
      qqProgress.value = res.data.job || null
      msg.info('QQ 安装任务已开始，请等待进度完成')
      startQQProgressPolling()
    } else {
      qqBusy.value = false
      msg.error(res.data?.error || 'QQ 安装失败')
    }
  } catch (e) {
    qqBusy.value = false
    msg.error(e.response?.data?.error || e.message || 'QQ 安装失败')
  }
}

async function downloadQQ() {
  const versionKey = qqVersionKey.value || qqStatus.value?.recommended?.key
  if (!versionKey) {
    msg.warning('当前系统没有可用的 QQ 安装包')
    return
  }
  qqBusy.value = true
  try {
    const res = await axios.post('/api/qq/download', { version_key: versionKey })
    if (res.data?.success) {
      qqProgress.value = res.data.job || null
      msg.info('QQ 下载任务已开始，请等待进度完成')
      startQQProgressPolling()
    } else {
      qqBusy.value = false
      msg.error(res.data?.error || 'QQ 下载失败')
    }
  } catch (e) {
    qqBusy.value = false
    msg.error(e.response?.data?.error || e.message || 'QQ 下载失败')
  }
}

async function cleanupQQ() {
  const versionKey = qqVersionKey.value || qqStatus.value?.recommended?.key
  qqBusy.value = true
  try {
    const res = await axios.post('/api/qq/cleanup', { version_key: versionKey || null })
    if (res.data?.success) {
      msg.success(res.data.message || 'QQ 安装缓存已清理')
      qqStatus.value = res.data.status || qqStatus.value
    } else {
      msg.error(res.data?.error || '清理失败')
    }
  } catch (e) {
    msg.error(e.response?.data?.error || e.message || '清理失败')
  } finally {
    qqBusy.value = false
    await fetchQQStatus()
  }
}

function uninstallQQ() {
  const versionKey = qqVersionKey.value || qqStatus.value?.recommended?.key
  dialog.warning({
    title: '卸载 QQ',
    content: '将停止内置 QQ，并卸载框架管理的 QQ。系统目录中由其他程序安装的 QQ 不会被强制删除，是否继续？',
    positiveText: '确认卸载',
    negativeText: '取消',
    onPositiveClick: async () => {
      qqBusy.value = true
      try {
        const res = await axios.post('/api/qq/uninstall', { version_key: versionKey || null })
        if (res.data?.success) {
          msg.success(res.data.message || 'QQ 已卸载')
        } else {
          msg.warning(res.data?.error || 'QQ 未完全卸载')
        }
      } catch (e) {
        msg.error(e.response?.data?.error || e.message || 'QQ 卸载失败')
      } finally {
        qqBusy.value = false
        await fetchQQStatus()
        await fetchEmbeddedStatus()
      }
    }
  })
}

async function createEmbeddedBot() {
  if (!newBotForm.value.bot_id.trim()) {
    msg.warning('请输入机器人 ID')
    return
  }

  loading.value = true
  try {
    const res = await axios.post('/api/embedded/bots', {
      bot_id: newBotForm.value.bot_id,
      nickname: newBotForm.value.nickname
    })
    if (res.data?.success) {
      msg.success('创建成功')
      showAddBot.value = false
      newBotForm.value = { bot_id: '', nickname: '' }
      await fetchEmbeddedStatus()
      await fetchBots()
    } else {
      msg.error(res.data?.error || '创建失败')
    }
  } catch (e) {
    msg.error(e.response?.data?.error || '创建失败')
  } finally {
    loading.value = false
  }
}

async function startBot(bot) {
  loading.value = true
  try {
    const res = await axios.post('/api/embedded/start', { bot_id: bot.bot_id })
    if (res.data?.success) {
      if (res.data.code === 'qq_not_installed') {
        msg.warning(res.data.message || '请先在机器人页面安装 QQ')
        await fetchQQStatus()
        return
      }
      msg.info('正在启动...')
      currentQrBot.value = res.data.bot
      qrCodeData.value = res.data.bot?.qrcode || ''
      qrCodeUrl.value = res.data.bot?.qrcode_url || ''
      qrStatus.value = 'loading'
      showQrCode.value = true

      // 开始轮询状态
      await fetchEmbeddedStatus()
    } else {
      msg.error(res.data?.error || '启动失败')
    }
  } catch (e) {
    msg.error(e.response?.data?.error || '启动失败')
  } finally {
    loading.value = false
  }
}

async function stopBot(bot) {
  dialog.warning({
    title: '停止机器人',
    content: `确定停止机器人 ${bot.name || bot.bot_qq} 吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const res = await axios.post('/api/embedded/stop', { bot_id: bot.bot_id })
        if (res.data?.success) {
          msg.success('已停止')
          if (currentQrBot.value?.bot_id === bot.bot_id) closeQrDialog()
          await fetchEmbeddedStatus()
          await fetchBots()
        } else {
          msg.error(res.data?.error || '停止失败')
        }
      } catch (e) {
        msg.error(e.response?.data?.error || '停止失败')
      }
    }
  })
}

function deleteBot(bot) {
  dialog.warning({
    title: '删除 QQ 账号',
    content: '确定删除 ' + (bot.name || bot.bot_qq) + ' 吗？这会移除账号占位和自动登录配置，但保留本地 QQ 会话目录，之后仍可重新创建并登录。',
    positiveText: '删除账号',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const res = await axios.post('/api/embedded/delete', { bot_id: bot.bot_id, cleanup_data: false })
        if (res.data?.success) {
          msg.success('QQ 账号已删除')
          if (currentQrBot.value?.bot_id === bot.bot_id) closeQrDialog()
          await fetchEmbeddedStatus()
          await fetchBots()
        } else {
          msg.error(res.data?.error || '删除失败')
        }
      } catch (e) {
        msg.error(e.response?.data?.error || e.message || '删除失败')
      }
    }
  })
}

async function refreshQrCode() {
  const botId = currentQrBot.value?.bot_id
  if (!botId || qrRefreshing.value) return
  qrRefreshing.value = true
  qrCodeData.value = ''
  qrCodeUrl.value = ''
  qrStatus.value = 'loading'
  try {
    const res = await axios.post('/api/embedded/qr/refresh', { bot_id: botId })
    if (!res.data?.success) throw new Error(res.data?.error || '刷新二维码失败')
    await fetchEmbeddedStatus()
  } catch (e) {
    qrStatus.value = 'error'
    msg.error(e.response?.data?.error || e.message || '刷新二维码失败')
  } finally {
    qrRefreshing.value = false
  }
}

function openAddDialog() {
  showAccessType.value = true
}

function openEmbeddedDialog() {
  newBotForm.value = { bot_id: '', nickname: '' }
  showAddBot.value = true
}

function setView(view) {
  activeView.value = view
  const query = { ...route.query }
  if (view === 'network') query.view = 'network'
  else delete query.view
  router.replace({ name: 'Bots', query })
}

async function chooseAccessType(type) {
  showAccessType.value = false
  if (type === 'embedded') {
    setView('accounts')
    openEmbeddedDialog()
    return
  }
  setView('network')
  await nextTick()
  networkPanel.value?.openAdd()
}

async function refreshCurrentView() {
  if (activeView.value === 'network') {
    await networkPanel.value?.fetchData()
    return
  }
  await Promise.all([fetchBots(), fetchEmbeddedStatus(), fetchQQStatus()])
}

function closeQrDialog() {
  showQrCode.value = false
  currentQrBot.value = null
  qrCodeData.value = ''
  qrCodeUrl.value = ''
  qrStatus.value = 'waiting'
}

async function copyQrCodeUrl() {
  if (!qrCodeUrl.value) return
  try {
    await navigator.clipboard.writeText(qrCodeUrl.value)
    msg.success('二维码链接已复制')
  } catch (e) {
    msg.error('复制二维码链接失败')
  }
}

onMounted(() => {
  fetchBots()
  fetchEmbeddedStatus()
  fetchQQStatus()

  // 每 2 秒轮询一次状态
  statusTimer = setInterval(() => {
    fetchEmbeddedStatus()
  }, 2000)

  // 监听 WebSocket 事件
  on('bot_status', (data) => {
    fetchEmbeddedStatus()
    fetchBots()
  })
})

watch(() => route.query.view, value => {
  activeView.value = value === 'network' ? 'network' : 'accounts'
})

onUnmounted(() => {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
  stopQQProgressPolling()
  off('bot_status')
})
</script>

<template>
  <div class="bots-page">
    <div class="ui-page-head">
      <div class="ui-page-head-main">
        <div class="ui-page-icon"><SvgIcon name="robot" :size="24" /></div>
        <div>
          <h1 class="ui-page-title">机器人接入</h1>
          <div class="ui-page-sub">统一管理内置 QQ 账号与 OneBot 网络接入</div>
        </div>
      </div>
      <div class="ui-page-actions">
        <n-button size="small" tertiary :loading="loading" @click="refreshCurrentView">
          <template #icon><SvgIcon name="refresh" :size="15" /></template>
          刷新
        </n-button>
        <n-button size="small" type="primary" @click="openAddDialog">
          <template #icon><SvgIcon name="plus" :size="15" /></template>
          添加接入
        </n-button>
      </div>
    </div>

    <div class="access-switcher">
      <button :class="['access-tab', { active: activeView === 'accounts' }]" @click="setView('accounts')">
        <SvgIcon name="people" :size="16" />
        QQ 账号
        <span class="access-count">{{ allBots.length }}</span>
      </button>
      <button :class="['access-tab', { active: activeView === 'network' }]" @click="setView('network')">
        <SvgIcon name="link" :size="16" />
        网络接入
      </button>
    </div>

    <template v-if="activeView === 'accounts'">
    <div v-if="qqStatus" class="qq-install-panel">
      <div class="qq-install-copy">
        <strong>内置 QQ 运行时</strong>
        <span v-if="qqStatus.qq_executable">已安装：{{ qqStatus.qq_executable }}</span>
        <span v-else>未检测到 QQ，可按当前系统一键下载并安装官方 QQNT</span>
        <span v-if="qqStatus.managed_install" class="qq-managed-state">由框架管理，可卸载和清理</span>
      </div>
      <div class="qq-install-actions">
        <n-select
          v-model:value="qqVersionKey"
          :options="qqVersionOptions"
          size="small"
          style="min-width: 260px"
          placeholder="选择 QQ 安装包"
        />
        <n-button size="small" tertiary :loading="qqBusy" @click="downloadQQ">
          <template #icon><SvgIcon name="cloud-download" :size="15" /></template>
          下载
        </n-button>
        <n-button type="primary" size="small" :loading="qqBusy" @click="installQQ">
          <template #icon><SvgIcon name="download" :size="15" /></template>
          一键安装 QQ
        </n-button>
        <n-button size="small" tertiary :loading="qqBusy" @click="cleanupQQ">
          <template #icon><SvgIcon name="trash" :size="15" /></template>
          清理安装包
        </n-button>
        <n-button v-if="qqStatus.qq_executable || qqStatus.managed_install" size="small" tertiary type="error" :loading="qqBusy" @click="uninstallQQ">
          <template #icon><SvgIcon name="close-circle" :size="15" /></template>
          卸载 QQ
        </n-button>
      </div>
      <div v-if="qqProgress" class="qq-progress">
        <div class="qq-progress-head">
          <span>{{ qqProgress.message || '正在处理 QQ 任务' }}</span>
          <span>{{ qqProgress.indeterminate ? '处理中' : Math.round(qqProgress.percent || 0) + '%' }}</span>
        </div>
        <n-progress
          type="line"
          :percentage="Math.max(0, Math.min(100, Number(qqProgress.percent || 0)))"
          :status="qqProgress.state === 'failed' ? 'error' : qqProgress.state === 'completed' ? 'success' : 'default'"
          :show-indicator="false"
          :processing="qqProgress.state === 'running'"
          :indeterminate="!!qqProgress.indeterminate"
          :height="8"
          border-radius="4"
        />
        <div v-if="qqProgress.total" class="qq-progress-meta">
          {{ Math.round((qqProgress.downloaded || 0) / 1024 / 1024) }} MB / {{ Math.round(qqProgress.total / 1024 / 1024) }} MB
        </div>
      </div>
      <n-alert
        v-if="qqStatus.headless?.linux_requires_xvfb"
        type="warning"
        :bordered="false"
        class="qq-install-note"
      >
        Linux 无显示环境时建议先安装 xvfb，框架会用 xvfb-run 启动无头 QQ。
      </n-alert>
    </div>

    <n-spin :show="loading">
      <div class="bots-grid">
        <div v-if="allBots.length === 0" class="empty-state">
          <SvgIcon name="robot" :size="64" />
          <p>暂无机器人</p>
          <n-button type="primary" @click="openAddDialog">添加第一个机器人</n-button>
        </div>

        <div v-for="bot in allBots" :key="bot.bot_qq" class="bot-card">
          <div class="bot-header">
            <div class="bot-avatar">
              <img v-if="bot.avatar" :src="bot.avatar" :alt="bot.name" />
              <SvgIcon v-else name="person" :size="32" />
            </div>
            <div class="bot-info">
              <div class="bot-name">{{ bot.name || bot.bot_qq }}</div>
              <div class="bot-qq">QQ: {{ bot.qq || bot.bot_qq }}</div>
              <n-tag :type="bot.status_type" size="small">{{ bot.status_text }}</n-tag>
            </div>
          </div>

          <div class="bot-meta">
            <div class="meta-item">
              <span class="meta-label">连接类型</span>
              <span class="meta-value">{{ bot.connection_type || '未知' }}</span>
            </div>
            <div v-if="bot.source === 'embedded'" class="meta-item">
              <span class="meta-label">进程内存</span>
              <span class="meta-value">{{ formatMemory(bot) }}<small v-if="bot.memory_processes"> · {{ bot.memory_processes }} 个进程</small></span>
            </div>
            <div v-if="bot.source === 'embedded' && bot.error" class="meta-item error">
              <span class="meta-label">错误</span>
              <span class="meta-value">{{ bot.error }}</span>
            </div>
          </div>

          <div class="bot-actions">
            <n-button
              v-if="bot.source === 'embedded' && !['online', 'logging_in', 'authorizing'].includes(bot.status)"
              type="primary"
              size="small"
              @click="startBot(bot)"
            >
              启动登录
            </n-button>
            <n-button
              v-if="bot.source === 'embedded' && ['online', 'logging_in', 'authorizing', 'waiting_qr', 'error'].includes(bot.status)"
              type="warning"
              size="small"
              @click="stopBot(bot)"
            >
              停止
            </n-button>
            <n-button
              v-if="bot.source === 'embedded'"
              type="error"
              tertiary
              size="small"
              @click="deleteBot(bot)"
            >
              <template #icon><SvgIcon name="trash" :size="14" /></template>
              删除
            </n-button>
            <n-button
              v-if="bot.source === 'external'"
              type="default"
              size="small"
              @click="setView('network')"
            >
              管理接入
            </n-button>
          </div>
        </div>
      </div>
    </n-spin>
    </template>

    <Network v-else ref="networkPanel" embedded />

    <n-modal v-model:show="showAccessType" preset="card" title="选择接入方式" style="width:min(520px,94vw)" :bordered="false">
      <div class="access-methods">
        <button class="access-method" @click="chooseAccessType('embedded')">
          <span class="access-method-icon"><SvgIcon name="qr-code" :size="24" /></span>
          <span class="access-method-copy">
            <strong>内置 QQ 登录</strong>
            <small>框架直接启动 QQ，扫码登录并保存账号会话</small>
          </span>
          <SvgIcon name="chevron-forward" :size="18" />
        </button>
        <button class="access-method" @click="chooseAccessType('network')">
          <span class="access-method-icon"><SvgIcon name="link" :size="24" /></span>
          <span class="access-method-copy">
            <strong>OneBot 网络接入</strong>
            <small>使用正反向 WebSocket 或 HTTP 连接已有实现端</small>
          </span>
          <SvgIcon name="chevron-forward" :size="18" />
        </button>
      </div>
    </n-modal>

    <!-- 添加机器人对话框 -->
    <n-modal
      v-model:show="showAddBot"
      preset="dialog"
      title="添加内置机器人"
      positive-text="创建"
      negative-text="取消"
      @positive-click="createEmbeddedBot"
    >
      <n-form :model="newBotForm" label-placement="left" label-width="80">
        <n-form-item label="机器人 ID" required>
          <n-input
            v-model:value="newBotForm.bot_id"
            placeholder="用于标识的唯一 ID，如: bot1"
          />
        </n-form-item>
        <n-form-item label="昵称">
          <n-input
            v-model:value="newBotForm.nickname"
            placeholder="可选，方便识别"
          />
        </n-form-item>
      </n-form>
      <n-alert type="info" :bordered="false" style="margin-top: 12px">
        创建后启动即可扫码登录。框架会自动探测本机 QQ，也可通过 <code>embedded_qq.qq_path</code> 指定路径。
      </n-alert>
    </n-modal>

    <!-- 二维码登录对话框 -->
    <n-modal
      v-model:show="showQrCode"
      preset="dialog"
      title="扫码登录"
      :show-icon="false"
      :closable="true"
      :mask-closable="false"
      @close="closeQrDialog"
    >
      <div class="qr-dialog">
       <div v-if="qrStatus === 'loading'" class="qr-loading">
         <n-spin size="large" />
         <p>正在生成二维码...</p>
       </div>

        <div v-else-if="qrStatus === 'authorizing'" class="qr-loading">
          <n-spin size="large" />
          <p>手机已确认，正在初始化 QQ...</p>
        </div>

        <div v-else-if="qrStatus === 'waiting'" class="qr-content">
          <div v-if="qrCodeData" class="qr-code-wrapper">
            <img :src="qrImageSrc" alt="QR Code" class="qr-code" />
          </div>
          <div v-if="qrCodeUrl" class="qr-url-fallback">
            <a :href="qrCodeUrl" target="_blank" rel="noreferrer">打开二维码链接</a>
            <n-button text size="small" @click="copyQrCodeUrl">复制链接</n-button>
          </div>
          <div v-if="!qrCodeData" class="qr-loading">
            <n-spin size="large" />
            <p>等待二维码...</p>
          </div>
          <div class="qr-tips">
            <n-alert type="info" :bordered="false">
              <template #icon><SvgIcon name="information-circle" :size="18" /></template>
              请使用手机 QQ 扫描二维码登录
            </n-alert>
            <n-alert v-if="currentQrBot?.error" type="error" :bordered="false">
              {{ currentQrBot.error }}
            </n-alert>
            <div class="qr-bot-info">
              <p><strong>机器人 ID:</strong> {{ currentQrBot?.bot_id }}</p>
              <p v-if="currentQrBot?.nickname"><strong>昵称:</strong> {{ currentQrBot.nickname }}</p>
            </div>
          </div>
        </div>

        <div v-else-if="qrStatus === 'success'" class="qr-success">
          <div class="success-icon">
            <SvgIcon name="checkmark-circle" :size="64" color="var(--success)" />
          </div>
          <p class="success-text">登录成功！</p>
          <p class="success-qq">QQ: {{ currentQrBot?.uin }}</p>
        </div>

        <div v-else-if="qrStatus === 'error'" class="qr-error">
          <div class="error-icon">
            <SvgIcon name="close-circle" :size="64" color="var(--danger)" />
          </div>
          <p class="error-text">登录失败</p>
          <p class="error-detail">{{ currentQrBot?.error }}</p>
          <n-button type="primary" @click="closeQrDialog">关闭</n-button>
        </div>
      </div>

      <template #action>
        <n-button v-if="['loading', 'waiting'].includes(qrStatus)" tertiary :loading="qrRefreshing" @click="refreshQrCode">
          <template #icon><SvgIcon name="refresh" :size="15" /></template>
          刷新二维码
        </n-button>
        <n-button v-if="['loading', 'waiting', 'authorizing'].includes(qrStatus)" @click="closeQrDialog">取消</n-button>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.bots-page {
  width: 100%;
}

.access-switcher {
  display: flex;
  gap: 4px;
  width: fit-content;
  margin-bottom: 18px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg2);
}

.access-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 7px 13px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text2);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.access-tab:hover { color: var(--text); background: var(--bg3); }
.access-tab.active { color: var(--accent); background: var(--accent-soft); }
.access-count {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 9px;
  background: var(--bg3);
  color: var(--text3);
  font-size: 10px;
  text-align: center;
}

.qq-install-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  margin-bottom: 20px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg2);
}

.qq-install-copy {
  display: flex;
  flex: 1 1 320px;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--text2);
  font-size: 12px;
}

.qq-install-copy strong {
  color: var(--text);
  font-size: 14px;
}

.qq-managed-state {
  color: var(--success);
  font-size: 11px;
}

.qq-install-actions {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.qq-install-note {
  flex: 1 0 100%;
}
.qq-progress {
  flex: 1 0 100%;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg3);
}
.qq-progress-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 7px;
  color: var(--text2);
  font-size: 12px;
}
.qq-progress-head span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qq-progress-head span:last-child {
  flex-shrink: 0;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.qq-progress-meta {
  margin-top: 6px;
  color: var(--text3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.access-method-modal { width: min(520px, 94vw); }
.access-methods { display: grid; gap: 10px; }
.access-method {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg2);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: border-color .15s, background .15s, transform .15s;
}
.access-method:hover { border-color: var(--accent); background: var(--accent-soft); transform: translateY(-1px); }
.access-method-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 9px;
  color: var(--accent);
  background: var(--accent-soft);
  flex-shrink: 0;
}
.access-method-copy { display: flex; flex: 1; flex-direction: column; gap: 3px; min-width: 0; }
.access-method-copy strong { font-size: 14px; }
.access-method-copy small { color: var(--text3); font-size: 12px; line-height: 1.45; }

.bots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 80px 20px;
  color: var(--text3);
}

.empty-state p {
  margin: 16px 0 24px;
  font-size: 14px;
}

.bot-card {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s;
}

.bot-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--accent);
}

.bot-header {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.bot-avatar {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: var(--bg3);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.bot-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bot-info {
  flex: 1;
  min-width: 0;
}

.bot-name {
  color: var(--text);
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bot-qq {
  color: var(--text3);
  font-size: 12px;
  margin-bottom: 6px;
}

.bot-meta {
  margin-bottom: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.meta-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 13px;
}

.meta-label {
  color: var(--text3);
}

.meta-value {
  color: var(--text);
  font-weight: 500;
}

.meta-item.error .meta-value {
  color: var(--danger);
  font-size: 12px;
}

.bot-actions {
  display: flex;
  gap: 8px;
}

.bot-actions button {
  flex: 1;
}

/* QR 码对话框 */
.qr-dialog {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qr-loading {
  text-align: center;
  padding: 40px 20px;
}

.qr-loading p {
  margin-top: 16px;
  color: var(--text2);
  font-size: 14px;
}

.qr-content {
  width: 100%;
  text-align: center;
}

.qr-code-wrapper {
  display: inline-block;
  padding: 20px;
  background: white;
  border-radius: 12px;
  margin-bottom: 20px;
}

.qr-code {
  width: 240px;
  height: 240px;
  display: block;
}

.qr-url-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: -8px 0 16px;
  font-size: 12px;
}

.qr-url-fallback a {
  max-width: 280px;
  color: var(--primary);
  word-break: break-all;
}

.qr-tips {
  text-align: left;
}

.qr-bot-info {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg3);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text2);
}

.qr-bot-info p {
  margin: 4px 0;
}

.qr-success,
.qr-error {
  text-align: center;
  padding: 40px 20px;
}

.success-icon,
.error-icon {
  margin-bottom: 16px;
}

.success-text,
.error-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 8px;
}

.success-qq,
.error-detail {
  font-size: 14px;
  color: var(--text2);
  margin: 0;
}

.error-detail {
  color: var(--danger);
  margin-bottom: 20px;
}

@media (max-width: 768px) {
  .bots-grid {
    grid-template-columns: 1fr;
  }

  .access-switcher { width: 100%; }
  .access-tab { flex: 1; justify-content: center; }
  .qq-install-actions { width: 100%; }
  .qq-install-actions .n-select { flex: 1; min-width: 0 !important; }
  .qq-install-actions .n-button { flex: 1; }

  .qr-code {
    width: 200px;
    height: 200px;
  }
}
</style>

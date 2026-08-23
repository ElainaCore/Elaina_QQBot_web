<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import axios from '../utils/axios'
import { on, off } from '../utils/ws'
import { useAppStore } from '../stores/app'
import SvgIcon from '../components/SvgIcon.vue'

const app = useAppStore()
const sys = computed(() => app.systemInfo || {})
const depsInfo = ref(null)
const networkHistory = ref([])
const diskHistory = ref([])
const activeMonitor = ref('network')
const selectedSample = ref(null)
const historyLimit = 24
let timer
let lastSampleAt = 0

const dashboardCards = computed(() => [
  { label: '在线机器人', value: sys.value.bots_count ?? app.bots.filter(bot => bot.connected).length, icon: 'robot', color: 'c-blue' },
  { label: '插件处理器', value: sys.value.plugins_count ?? 0, icon: 'extension-puzzle', color: 'c-purple' },
  { label: '当前请求', value: formatCount(sys.value.requests?.active), icon: 'stats-chart', color: 'c-green' },
  { label: 'QQ 账号', value: app.bots.length, icon: 'people', color: 'c-orange' },
])

const activeHistory = computed(() => activeMonitor.value === 'disk' ? diskHistory.value : networkHistory.value)
const activeSeries = computed(() => activeMonitor.value === 'disk'
  ? [{ key: 'read', label: '读取', tone: 'pink' }, { key: 'write', label: '写入', tone: 'cyan' }]
  : [{ key: 'tx', label: '上行', tone: 'green' }, { key: 'rx', label: '下行', tone: 'orange' }])
const activePeak = computed(() => peak(activeHistory.value, activeSeries.value.map(item => item.key)))
const activeLabels = computed(() => axisLabels(activeHistory.value))
const chartTitle = computed(() => activeMonitor.value === 'disk' ? '实时磁盘吞吐' : '实时网络流量')
const emptyChartText = computed(() => activeMonitor.value === 'disk' ? '等待采集磁盘数据...' : '等待采集网络数据...')
const monitorMetrics = computed(() => activeMonitor.value === 'disk'
  ? [
      { label: '读取', value: formatRate(sys.value.disk_io?.read_rate), tone: 'pink' },
      { label: '写入', value: formatRate(sys.value.disk_io?.write_rate), tone: 'cyan' },
      { label: '每秒读取', value: numberOf(sys.value.disk_io?.read_iops).toFixed(1) + ' 次' },
      { label: '每秒写入', value: numberOf(sys.value.disk_io?.write_iops).toFixed(1) + ' 次' },
    ]
  : [
      { label: '上行', value: formatRate(sys.value.network_io?.tx_rate), tone: 'green' },
      { label: '下行', value: formatRate(sys.value.network_io?.rx_rate), tone: 'orange' },
      { label: '当前请求', value: formatCount(sys.value.requests?.active) },
      { label: '总请求', value: formatCount(sys.value.requests?.total) },
    ])
const monitorTotals = computed(() => activeMonitor.value === 'disk'
  ? [
      { label: '累计读取', value: formatBytes(sys.value.disk_io?.total_read) },
      { label: '累计写入', value: formatBytes(sys.value.disk_io?.total_write) },
      { label: '读/写延迟', value: formatLatency(sys.value.disk_io?.read_latency_ms) + ' / ' + formatLatency(sys.value.disk_io?.write_latency_ms) },
    ]
  : [
      { label: '总发送', value: formatBytes(sys.value.network_io?.total_tx) },
      { label: '总接收', value: formatBytes(sys.value.network_io?.total_rx) },
    ])
const selectedDetails = computed(() => {
  const sample = selectedSample.value
  if (!sample) return []
  return activeMonitor.value === 'disk'
    ? [
        { label: '读取', value: formatRate(sample.read), tone: 'pink' },
        { label: '写入', value: formatRate(sample.write), tone: 'cyan' },
        { label: '读取 IOPS', value: numberOf(sample.readIops).toFixed(1) + ' 次/s' },
        { label: '写入 IOPS', value: numberOf(sample.writeIops).toFixed(1) + ' 次/s' },
        { label: '读取延迟', value: formatLatency(sample.readLatency) },
        { label: '写入延迟', value: formatLatency(sample.writeLatency) },
      ]
    : [
        { label: '上行', value: formatRate(sample.tx), tone: 'green' },
        { label: '下行', value: formatRate(sample.rx), tone: 'orange' },
        { label: '发送包', value: numberOf(sample.packetsTx).toFixed(1) + ' 个/s' },
        { label: '接收包', value: numberOf(sample.packetsRx).toFixed(1) + ' 个/s' },
      ]
})

function numberOf(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function formatCount(value) {
  return numberOf(value).toLocaleString('zh-CN')
}

function formatMemory(value) {
  if (value === null || value === undefined) return '-'
  const mb = numberOf(value)
  return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB'
}

function formatBytes(value) {
  if (value === null || value === undefined) return '-'
  let amount = numberOf(value)
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unit = 0
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit += 1
  }
  const digits = unit === 0 || amount >= 10 ? 0 : 1
  return amount.toFixed(digits) + ' ' + units[unit]
}

function formatRate(value) {
  return value === null || value === undefined ? '-' : formatBytes(value) + '/s'
}

function formatLatency(value) {
  return value === null || value === undefined ? '-' : numberOf(value).toFixed(1) + ' ms'
}

function formatUptime(seconds) {
  if (!seconds) return '-'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days) return days + '天' + hours + '时' + minutes + '分'
  return hours ? hours + '时' + minutes + '分' : minutes + '分'
}

function ringColor(value) {
  if (!value) return 'var(--accent)'
  if (value > 90) return 'var(--danger)'
  return value > 70 ? 'var(--warning)' : 'var(--success)'
}

function peak(samples, keys) {
  return Math.max(1, ...samples.flatMap(sample => keys.map(key => numberOf(sample[key]))))
}

function axisLabels(samples) {
  if (!samples.length) return []
  const last = samples.length - 1
  return [...new Set([0, Math.floor(last / 2), last])].map(index => samples[index])
}

function chartPoints(samples, key, maximum) {
  if (!samples.length) return ''
  return samples.map((sample, index) => {
    const x = 16 + index * 728 / Math.max(1, samples.length - 1)
    const y = 200 - numberOf(sample[key]) / maximum * 188
    return x.toFixed(1) + ',' + y.toFixed(1)
  }).join(' ')
}

function areaPoints(samples, key, maximum) {
  const points = chartPoints(samples, key, maximum)
  return points ? points + ' 744,200 16,200' : ''
}

function chartPosition(index, count) {
  return 16 + index * 728 / Math.max(1, count - 1)
}

function setMonitorMode(mode) {
  if (activeMonitor.value === mode) return
  activeMonitor.value = mode
  selectedSample.value = null
}

function selectSampleAt(index) {
  const samples = activeHistory.value
  const sample = samples[index]
  if (!sample) return
  const position = chartPosition(index, samples.length) / 760 * 100
  selectedSample.value = {
    ...sample,
    position,
    tooltipPosition: Math.min(82, Math.max(18, position)),
  }
}

function selectChartSample(event) {
  const samples = activeHistory.value
  if (!samples.length) return
  const bounds = event.currentTarget.getBoundingClientRect()
  const svgX = (event.clientX - bounds.left) / Math.max(1, bounds.width) * 760
  const ratio = Math.min(1, Math.max(0, (svgX - 16) / 728))
  selectSampleAt(Math.round(ratio * Math.max(0, samples.length - 1)))
}

function selectLatestSample() {
  selectSampleAt(activeHistory.value.length - 1)
}

function collectSample(data) {
  if (!data || Date.now() - lastSampleAt < 1000) return
  lastSampleAt = Date.now()
  const label = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  const network = data.network_io || {}
  const disk = data.disk_io || {}
  networkHistory.value = [...networkHistory.value, {
    label,
    tx: numberOf(network.tx_rate),
    rx: numberOf(network.rx_rate),
    packetsTx: numberOf(network.packets_tx_rate),
    packetsRx: numberOf(network.packets_rx_rate),
  }].slice(-historyLimit)
  diskHistory.value = [...diskHistory.value, {
    label,
    read: numberOf(disk.read_rate),
    write: numberOf(disk.write_rate),
    readIops: numberOf(disk.read_iops),
    writeIops: numberOf(disk.write_iops),
    readLatency: numberOf(disk.read_latency_ms),
    writeLatency: numberOf(disk.write_latency_ms),
  }].slice(-historyLimit)
}

async function refreshSystemInfo() {
  collectSample(await app.fetchSystemInfo())
}

function onSystemInfo(data) {
  app.systemInfo = data
  collectSample(data)
}

async function fetchDependencies() {
  try {
    const response = await axios.get('/api/system/dependencies')
    depsInfo.value = response.data
  } catch {
    depsInfo.value = null
  }
}

const statusText = { low: '版本偏低', high: '版本偏高', missing: '未安装' }
const abnormalDependencies = computed(() => {
  if (!depsInfo.value) return []
  const items = []
  if (depsInfo.value.python?.status !== 'ok') items.push('Python ' + (statusText[depsInfo.value.python?.status] || '异常'))
  for (const dependency of depsInfo.value.dependencies || []) {
    if (dependency.status !== 'ok') items.push(dependency.name + ' ' + (statusText[dependency.status] || '异常'))
  }
  return items
})

onMounted(() => {
  on('system_info', onSystemInfo)
  app.ensureBots()
  refreshSystemInfo()
  fetchDependencies()
  timer = setInterval(refreshSystemInfo, 5000)
})

onUnmounted(() => {
  off('system_info', onSystemInfo)
  clearInterval(timer)
})
</script>

<template>
  <div class="dash">
    <div class="ui-stat-grid stat-grid">
      <div v-for="item in dashboardCards" :key="item.label" :class="['ui-stat', item.color]">
        <div class="ui-stat-top"><div class="ui-stat-ic"><SvgIcon :name="item.icon" :size="17" /></div><div class="ui-stat-label">{{ item.label }}</div></div>
        <div class="ui-stat-val">{{ item.value }}</div>
        <SvgIcon :name="item.icon" :size="68" class="ui-stat-wm" />
      </div>
    </div>

    <div class="main-row">
      <div class="system-column">
        <div class="system-grid">
          <section class="panel resource-card">
            <header class="panel-header"><span class="panel-title"><SvgIcon name="chip" :size="15" />CPU</span><span class="panel-note" :title="sys.cpu_model">{{ sys.cpu_model || '-' }}</span></header>
            <div class="resource-body">
              <div class="progress-ring"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" stroke-width="5" /><circle cx="36" cy="36" r="30" fill="none" :stroke="ringColor(sys.cpu_percent)" stroke-width="5" stroke-linecap="round" stroke-dasharray="188.5" :stroke-dashoffset="188.5 - 188.5 * (sys.cpu_percent || 0) / 100" transform="rotate(-90 36 36)" /></svg><span>{{ Math.round(sys.cpu_percent || 0) }}%</span></div>
              <div class="resource-info"><div>系统 <b>{{ numberOf(sys.cpu_percent).toFixed(1) }}%</b></div><div>框架 <b>{{ numberOf(sys.framework_cpu_percent).toFixed(1) }}%</b></div><div>核心 <b>{{ sys.cpu_cores || '-' }}</b></div></div>
            </div>
          </section>

          <section class="panel resource-card">
            <header class="panel-header"><span class="panel-title"><SvgIcon name="memory" :size="15" />内存</span><span class="panel-note">{{ formatMemory(sys.memory_total) }}</span></header>
            <div class="resource-body">
              <div class="progress-ring"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" stroke-width="5" /><circle cx="36" cy="36" r="30" fill="none" :stroke="ringColor(sys.memory_percent)" stroke-width="5" stroke-linecap="round" stroke-dasharray="188.5" :stroke-dashoffset="188.5 - 188.5 * (sys.memory_percent || 0) / 100" transform="rotate(-90 36 36)" /></svg><span>{{ Math.round(sys.memory_percent || 0) }}%</span></div>
              <div class="resource-info"><div>系统 <b>{{ numberOf(sys.memory_percent).toFixed(1) }}%</b></div><div>已用 <b>{{ formatMemory(sys.memory_used) }}</b></div><div>框架 RSS <b>{{ formatMemory(sys.framework_memory_total) }}</b></div></div>
            </div>
          </section>
        </div>

        <section class="panel dependencies-panel">
          <header class="panel-header"><span class="panel-title"><SvgIcon name="cube" :size="15" />运行环境</span><span v-if="!depsInfo" class="panel-note">加载中...</span><span v-else-if="abnormalDependencies.length" class="dependency-warning" :title="abnormalDependencies.join('、')">{{ abnormalDependencies.join('、') }}</span><span v-else class="dependency-ok">版本正常</span></header>
          <div v-if="!depsInfo" class="empty-state">等待获取依赖信息...</div>
          <div v-else class="dependency-grid">
            <div :class="['dependency-item', { bad: depsInfo.python?.status !== 'ok' }]">
              <i :class="depsInfo.python?.status === 'ok' ? 'ok' : 'bad'"></i><b>Python</b><span>{{ depsInfo.python?.version || '-' }}</span><small>要求 {{ depsInfo.python?.required || '不限' }}</small>
            </div>
            <div v-for="dependency in depsInfo.dependencies" :key="dependency.name" :class="['dependency-item', { bad: dependency.status !== 'ok' }]">
              <i :class="dependency.status === 'ok' ? 'ok' : 'bad'"></i><b>{{ dependency.name }}</b><span>{{ dependency.installed || '未安装' }}</span><small>要求 {{ dependency.required || '不限' }}</small>
            </div>
          </div>
        </section>

        <section class="panel disk-panel">
          <header class="panel-header"><span class="panel-title"><SvgIcon name="folder" :size="15" />磁盘空间</span><span class="panel-note">数据目录</span></header>
          <div v-if="sys.disk_info" class="resource-body">
            <div class="progress-ring"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" stroke-width="5" /><circle cx="36" cy="36" r="30" fill="none" :stroke="ringColor(sys.disk_info.percent)" stroke-width="5" stroke-linecap="round" stroke-dasharray="188.5" :stroke-dashoffset="188.5 - 188.5 * (sys.disk_info.percent || 0) / 100" transform="rotate(-90 36 36)" /></svg><span>{{ Math.round(sys.disk_info.percent || 0) }}%</span></div>
            <div class="disk-details"><span>总计 <b>{{ formatBytes(sys.disk_info.total) }}</b></span><span>已用 <b>{{ formatBytes(sys.disk_info.used) }}</b></span><span>可用 <b>{{ formatBytes(sys.disk_info.free) }}</b></span></div>
          </div>
        </section>
      </div>

      <div class="monitor-column">
        <section class="panel runtime-panel">
          <header class="panel-header"><span class="panel-title"><SvgIcon name="rocket" :size="15" />运行状态</span></header>
          <div class="runtime-grid">
            <div class="runtime-item"><span class="runtime-icon blue"><SvgIcon name="time" :size="18" /></span><span><small>启动时间</small><b>{{ sys.start_time || '-' }}</b></span></div>
            <div class="runtime-item"><span class="runtime-icon purple"><SvgIcon name="flame" :size="18" /></span><span><small>框架运行</small><b>{{ formatUptime(sys.uptime) }}</b></span></div>
            <div class="runtime-item"><span class="runtime-icon green"><SvgIcon name="server" :size="18" /></span><span><small>系统运行</small><b>{{ formatUptime(sys.system_uptime) }}</b></span></div>
            <div class="runtime-item"><span class="runtime-icon orange"><SvgIcon name="stats-chart" :size="18" /></span><span><small>请求速率</small><b>{{ numberOf(sys.requests?.rate).toFixed(2) }}/s</b></span></div>
          </div>
        </section>

        <section class="panel monitor-panel">
          <header class="monitor-header">
            <div class="monitor-tabs" role="tablist" aria-label="监控类型">
              <button type="button" :class="{ active: activeMonitor === 'network' }" role="tab" :aria-selected="activeMonitor === 'network'" @click="setMonitorMode('network')">流量</button>
              <button type="button" :class="{ active: activeMonitor === 'disk' }" role="tab" :aria-selected="activeMonitor === 'disk'" @click="setMonitorMode('disk')">磁盘 IO</button>
            </div>
          </header>
          <div class="metric-grid">
            <div v-for="metric in monitorMetrics" :key="metric.label" class="metric"><i v-if="metric.tone" :class="metric.tone"></i><span>{{ metric.label }}</span><b>{{ metric.value }}</b></div>
          </div>
          <div class="chart-title"><span>{{ chartTitle }}</span><span><template v-for="series in activeSeries" :key="series.key"><i :class="series.tone"></i>{{ series.label }}</template></span></div>
          <div class="chart-row">
            <div class="chart-scale"><span>{{ formatRate(activePeak) }}</span><span>{{ formatRate(activePeak * .75) }}</span><span>{{ formatRate(activePeak * .5) }}</span><span>{{ formatRate(activePeak * .25) }}</span><span>0 B/s</span></div>
            <div class="chart-plot" role="button" tabindex="0" aria-label="查看监控采样详情" @click="selectChartSample" @keydown.enter.prevent="selectLatestSample" @keydown.space.prevent="selectLatestSample">
              <i v-for="line in 5" :key="line" class="grid-line" :style="{ top: ((line - 1) * 25) + '%' }"></i>
              <svg viewBox="0 0 760 220" preserveAspectRatio="none">
                <template v-for="series in activeSeries" :key="series.key">
                  <polygon :points="areaPoints(activeHistory, series.key, activePeak)" :class="'fill-' + series.tone" />
                  <polyline :points="chartPoints(activeHistory, series.key, activePeak)" :class="'stroke-' + series.tone" />
                </template>
              </svg>
              <span v-if="!activeHistory.length" class="empty-state">{{ emptyChartText }}</span>
              <template v-if="selectedSample">
                <i class="chart-selection-line" :style="{ left: selectedSample.position + '%' }"></i>
                <div class="chart-tooltip" :style="{ left: selectedSample.tooltipPosition + '%' }" @click.stop>
                  <b>{{ selectedSample.label }}</b>
                  <span v-for="detail in selectedDetails" :key="detail.label"><i v-if="detail.tone" :class="detail.tone"></i>{{ detail.label }}<strong>{{ detail.value }}</strong></span>
                </div>
              </template>
            </div>
          </div>
          <div class="chart-labels"><span v-for="item in activeLabels" :key="item.label">{{ item.label }}</span></div>
          <footer class="monitor-totals"><span v-for="item in monitorTotals" :key="item.label">{{ item.label }} <b>{{ item.value }}</b></span></footer>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/Dashboard.css"></style>

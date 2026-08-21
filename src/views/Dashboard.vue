<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'
import { on, off } from '../utils/ws'
import SvgIcon from '../components/SvgIcon.vue'

const app = useAppStore()
const sys = computed(() => app.systemInfo || {})
const dashboardCards = computed(() => [
  { label: '在线机器人', value: sys.value?.bots_count ?? app.bots.filter(item => item.connected).length, icon: 'robot', color: 'c-blue' },
  { label: '插件处理器', value: sys.value?.plugins_count ?? 0, icon: 'extension-puzzle', color: 'c-purple' },
  { label: 'QQ 账号', value: app.bots.length, icon: 'people', color: 'c-green' },
  { label: '框架运行', value: fmtUptime(sys.value?.uptime), icon: 'time', color: 'c-orange' },
])

const ringColor = (value) => !value ? 'var(--accent)' : value > 90 ? 'var(--danger)' : value > 70 ? 'var(--warning)' : 'var(--success)'
const fmtMem = (value) => !value ? '-' : value > 1024 ? (value / 1024).toFixed(1) + ' GB' : Math.round(value) + ' MB'
const fmtBytes = (value) => {
  if (!value) return '-'
  const gb = value / 1024 ** 3
  return gb >= 1 ? gb.toFixed(1) + ' GB' : (value / 1024 ** 2).toFixed(0) + ' MB'
}
function fmtUptime(seconds) {
  if (!seconds) return '-'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return days > 0 ? days + '天' + hours + '时' + minutes + '分' : hours > 0 ? hours + '时' + minutes + '分' : minutes + '分'
}

function onSysInfo(data) {
  app.systemInfo = data
}

let timer
onMounted(() => {
  on('system_info', onSysInfo)
  app.ensureBots()
  app.fetchSystemInfo()
  timer = setInterval(() => app.fetchSystemInfo(), 10000)
})
onUnmounted(() => {
  off('system_info', onSysInfo)
  clearInterval(timer)
})
</script>

<template>
  <div class="dash">
    <div class="ui-stat-grid stat-grid">
      <div v-for="item in dashboardCards" :key="item.label" :class="['ui-stat', item.color]">
        <div class="ui-stat-top">
          <div class="ui-stat-ic"><SvgIcon :name="item.icon" :size="17" /></div>
          <div class="ui-stat-label">{{ item.label }}</div>
        </div>
        <div class="ui-stat-val">{{ item.value }}</div>
        <SvgIcon :name="item.icon" :size="68" class="ui-stat-wm" />
      </div>
    </div>
    <div class="resource-grid">
      <div class="res-card">
        <div class="res-header"><span class="res-title"><SvgIcon name="chip" :size="15" class="res-title-ic" />CPU</span><span class="res-sub" :title="sys?.cpu_model || ''">{{ sys?.cpu_model || '-' }}</span></div>
        <div class="res-body">
          <div class="progress-ring">
            <svg viewBox="0 0 72 72" aria-hidden="true">
              <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" stroke-width="5" />
              <circle cx="36" cy="36" r="30" fill="none" :stroke="ringColor(sys?.cpu_percent)" stroke-width="5" stroke-linecap="round" stroke-dasharray="188.5" :stroke-dashoffset="188.5 - 188.5 * (sys?.cpu_percent || 0) / 100" transform="rotate(-90 36 36)" />
            </svg>
            <span class="ring-text">{{ Math.round(sys?.cpu_percent || 0) }}%</span>
          </div>
          <div class="res-info">
            <div>系统 <b>{{ (sys?.cpu_percent || 0).toFixed(1) }}%</b></div>
            <div>框架 <b>{{ (sys?.framework_cpu_percent || 0).toFixed(1) }}%</b></div>
            <div>核心 <b>{{ sys?.cpu_cores || '-' }}</b></div>
          </div>
        </div>
      </div>

      <div class="res-card">
        <div class="res-header"><span class="res-title"><SvgIcon name="memory" :size="15" class="res-title-ic" />内存</span><span class="res-sub">{{ fmtMem(sys?.memory_total) }}</span></div>
        <div class="res-body">
          <div class="progress-ring">
            <svg viewBox="0 0 72 72" aria-hidden="true">
              <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" stroke-width="5" />
              <circle cx="36" cy="36" r="30" fill="none" :stroke="ringColor(sys?.memory_percent)" stroke-width="5" stroke-linecap="round" stroke-dasharray="188.5" :stroke-dashoffset="188.5 - 188.5 * (sys?.memory_percent || 0) / 100" transform="rotate(-90 36 36)" />
            </svg>
            <span class="ring-text">{{ Math.round(sys?.memory_percent || 0) }}%</span>
          </div>
          <div class="res-info">
            <div>系统 <b>{{ (sys?.memory_percent || 0).toFixed(1) }}%</b> · {{ fmtMem(sys?.memory_used) }}</div>
            <div>框架 <b>{{ (sys?.framework_memory_percent || 0).toFixed(1) }}%</b> · {{ (sys?.framework_memory_total || 0).toFixed(1) }} MB</div>
          </div>
        </div>
      </div>

      <div class="res-card">
        <div class="res-header"><span class="res-title"><SvgIcon name="folder" :size="15" class="res-title-ic" />磁盘</span><span class="res-sub">数据目录</span></div>
        <div v-if="sys?.disk_info" class="res-body">
          <div class="progress-ring">
            <svg viewBox="0 0 72 72" aria-hidden="true">
              <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" stroke-width="5" />
              <circle cx="36" cy="36" r="30" fill="none" :stroke="ringColor(sys?.disk_info?.percent)" stroke-width="5" stroke-linecap="round" stroke-dasharray="188.5" :stroke-dashoffset="188.5 - 188.5 * (sys?.disk_info?.percent || 0) / 100" transform="rotate(-90 36 36)" />
            </svg>
            <span class="ring-text">{{ Math.round(sys?.disk_info?.percent || 0) }}%</span>
          </div>
          <div class="res-info">
            <div>总计 <b>{{ fmtBytes(sys.disk_info.total) }}</b></div>
            <div>已用 <b>{{ fmtBytes(sys.disk_info.used) }}</b></div>
            <div>可用 <b>{{ fmtBytes(sys.disk_info.free) }}</b></div>
          </div>
        </div>
      </div>

      <div class="res-card runtime-card">
        <div class="res-header"><span class="res-title"><SvgIcon name="rocket" :size="15" class="res-title-ic" />运行状态</span></div>
        <div class="res-info-full">
          <div>启动时间 <b>{{ sys?.start_time || '-' }}</b></div>
          <div>框架运行 <b>{{ fmtUptime(sys?.uptime) }}</b></div>
          <div>系统运行 <b>{{ fmtUptime(sys?.system_uptime) }}</b></div>
          <div>在线机器人 <b>{{ sys?.bots_count ?? 0 }}</b></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash { width: 100%; }
.stat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 14px; }
.resource-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.res-card { min-width: 0; padding: 18px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg2); box-shadow: var(--shadow-sm); }
.res-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; color: var(--text); font-size: 14px; font-weight: 600; }
.res-title { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; flex-shrink:0; }
.res-title-ic { color:var(--accent); }
.res-sub { max-width: 68%; overflow: hidden; color: var(--text3); font-size: 11px; font-weight: 400; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.res-body { display: flex; align-items: center; gap: 14px; min-height: 76px; }
.progress-ring { position: relative; width: 66px; height: 66px; flex: 0 0 66px; }
.progress-ring svg { width: 100%; height: 100%; }
.ring-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text); font-size: 12px; font-weight: 600; }
.res-info { min-width: 0; color: var(--text2); font-size: 12px; line-height: 1.8; }
.res-info b, .res-info-full b { color: var(--text); font-weight: 600; }
.res-info-full { color: var(--text2); font-size: 12px; line-height: 2; overflow: hidden; }
.res-info-full div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 900px) { .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 767px) { .resource-grid { grid-template-columns: 1fr; } }
</style>

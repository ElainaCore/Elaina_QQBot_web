<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAppStore } from '../stores/app'
import { on, off } from '../utils/ws'
import axios from '../utils/axios'

const app = useAppStore()
const MAX = 500
const TABS = [
  { key: 'message', label: '消息' }, { key: 'lifecycle', label: '事件' },
  { key: 'framework', label: '框架' }, { key: 'error', label: '错误' },
  { key: 'login', label: '登录日志' },
]
const EVENT_LABELS = {
  group_add: '机器人入群', group_del: '机器人退群',
  group_member_add: '群成员增加', group_member_del: '群成员减少', group_member_info: '群成员信息更新',
  group_join_request: '加群申请', group_upload: '群文件上传', group_admin: '群管理员变动',
  group_decrease: '群成员减少', group_increase: '群成员增加', group_ban: '群禁言变动',
  friend_add: '好友新增', friend_del: '好友删除', group_recall: '群消息撤回', friend_recall: '好友消息撤回',
  notify: '群内提醒', group_card: '群名片变更', offline_file: '离线文件',
  online_file_receive: '接收在线文件', online_file_send: '发送在线文件', client_status: '客户端状态变更',
  essence: '精华消息变更', group_name: '群名称变更', group_msg_emoji_like: '消息表情回应',
  group_gray_tip: '群灰色提示', friend_poke: '好友戳一戳', poke: '戳一戳', lucky_king: '红包运气王',
  honor: '群荣誉变更', title: '群头衔变更', group_msg_reject: '关闭主动消息',
  group_msg_receive: '开启主动消息', subscribe_status: '订阅开启', subscribe_close: '订阅关闭',
  message_reaction_add: '添加消息表态', message_reaction_remove: '取消消息表态', guild_update: '频道更新',
  bot_online: '机器人上线', bot_offline: '机器人离线', robot_online: '机器人上线', robot_offline: '机器人离线',
  elaina_red_packet: '红包事件', 'request.friend': '好友申请', 'request.group': '加群申请',
  'meta_event.lifecycle': '连接生命周期', 'meta_event.heartbeat': '连接心跳', lifecycle: '连接生命周期', heartbeat: '连接心跳',
}
const EVENT_SUBTYPE_LABELS = {
  'notify.poke': '戳一戳', 'notify.lucky_king': '红包运气王', 'notify.honor': '群荣誉变更',
  'notify.title': '群头衔变更', 'notify.group_name': '群名称变更', 'notify.input_status': '输入状态变更',
  'notify.profile_like': '个人资料获赞', 'notify.gray_tip': '群灰色提示',
  'group_ban.ban': '群成员禁言', 'group_ban.lift_ban': '解除群成员禁言',
  'group_increase.approve': '同意入群', 'group_increase.invite': '邀请入群',
  'group_decrease.leave': '群成员退群', 'group_decrease.kick': '群成员被移出', 'group_decrease.kick_me': '机器人被移出群',
  'group_admin.set': '设置群管理员', 'group_admin.unset': '取消群管理员',
  'essence.add': '设为精华消息', 'essence.delete': '移出精华消息',
  'client_status.online': '客户端上线', 'client_status.offline': '客户端离线',
  'online_file_receive.cancel': '取消接收在线文件', 'online_file_send.receive': '在线文件已接收',
  'online_file_send.refuse': '在线文件被拒收', 'request.group.add': '加群申请', 'request.group.invite': '群邀请',
  'meta_event.lifecycle.enable': 'OneBot 已启用', 'meta_event.lifecycle.disable': 'OneBot 已停用',
  'meta_event.lifecycle.connect': 'OneBot 已连接',
}
const tab = ref('message')
const autoScroll = ref(true)
const messages = ref([]), framework = ref([]), errors = ref([]), lifecycle = ref([]), logins = ref([])
const logContainer = ref(null)
const expandedRaw = ref({})
const expandedErr = ref({})
const expandedMsg = ref({})

function escapeHtml(s) {
  const text = s == null ? '' : String(s)
  return text ? text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<span class="t-nl">↵</span>') : ''
}
function fmtMsgContent(s) {
  const text = s == null ? '' : String(s)
  if (!text) return ''
  const ki = text.indexOf('\n[keyboard] ')
  if (ki === -1) return escapeHtml(text)
  const body = text.slice(ki + 12)
  let short = body
  if (body.startsWith('{')) {
    try { const kb = JSON.parse(body); const rows = kb?.content?.rows || []; short = rows.flatMap(r => (r.buttons||[]).map(b => b?.render_data?.label || '?')).join(' | ') } catch {}
  }
  return escapeHtml(text.slice(0, ki)) + '<span class="t-nl">↵</span>[keyboard] ' + escapeHtml(short)
}
function toggleMsg(i) { expandedMsg.value[i] = !expandedMsg.value[i] }
function toggleErr(i, type) { expandedErr.value[i] = expandedErr.value[i] === type ? null : type }
function fmtJson(s) { if (!s) return ''; try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s } }
function fmtCtx(v) { if (!v) return '无'; if (typeof v === 'string') try { return JSON.stringify(JSON.parse(v), null, 2) } catch { return v } return JSON.stringify(v, null, 2) }
function normalizeLogs(value) { return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [] }
function eventLabel(entry) {
  const type = String(entry?.event_type || entry?.type || '').trim().toLowerCase().replace(/^notice\./, '')
  const serverLabel = String(entry?.type_label || '').trim()
  if (serverLabel && /[\u3400-\u9fff]/.test(serverLabel) && serverLabel.toLowerCase() !== type) return serverLabel
  let subType = String(entry?.sub_type || '').trim().toLowerCase()
  if (!subType && entry?.raw_message) {
    try { subType = String(JSON.parse(entry.raw_message)?.sub_type || '').trim().toLowerCase() } catch {}
  }
  return EVENT_SUBTYPE_LABELS[`${type}.${subType}`] || EVENT_LABELS[type] || '未知事件'
}

const filteredMessages = computed(() => app.currentBotId ? messages.value.filter(m => m.bot_qq === app.currentBotId) : messages.value)
const filteredLifecycle = computed(() => app.currentBotId ? lifecycle.value.filter(m => m.bot_qq === app.currentBotId) : lifecycle.value)
const currentLogs = computed(() =>
  tab.value === 'message' ? filteredMessages.value
  : tab.value === 'framework' ? framework.value
  : tab.value === 'lifecycle' ? filteredLifecycle.value
  : tab.value === 'login' ? logins.value
  : errors.value
)

const pendingLogs = []
let flushTimer = 0
let scrollFrame = 0

function appendLogs(type, entries) {
  const arr = type === 'message' ? messages : type === 'framework' ? framework : (type === 'lifecycle' || type === 'event') ? lifecycle : errors
  arr.value = [...arr.value, ...entries].slice(-MAX)
}
function flushLogs() {
  flushTimer = 0
  if (!pendingLogs.length) return
  const grouped = new Map()
  for (const [type, entry] of pendingLogs.splice(0)) {
    if (!grouped.has(type)) grouped.set(type, [])
    grouped.get(type).push(entry)
  }
  for (const [type, entries] of grouped) appendLogs(type, entries)
}
function queueLog(type, entry) {
  pendingLogs.push([type, entry])
  if (!flushTimer) flushTimer = window.setTimeout(flushLogs, 50)
}
function onNewLog(data) {
  if (!data) return
  const eventBot = String(data.bot_qq || '')
  if (app.currentBotId && eventBot && eventBot !== String(app.currentBotId)) return
  const t = data.log_type || 'message'
  const e = { ...data }
  delete e.log_type
  queueLog(t, e)
}
function onInit() { if (!messages.value.length) fetchLogs() }
function clearAll() { pendingLogs.length = 0; messages.value = []; framework.value = []; errors.value = []; lifecycle.value = []; logins.value = []; expandedRaw.value = {}; expandedErr.value = {}; expandedMsg.value = {} }

async function fetchLogs() {
  try {
    const res = await axios.get('/api/logs/recent', { params: { bot_qq: app.currentBotId || '' } })
    messages.value = normalizeLogs(res.data.message)
    framework.value = normalizeLogs(res.data.framework)
    errors.value = normalizeLogs(res.data.error)
    lifecycle.value = normalizeLogs(res.data.lifecycle)
  } catch {}
  fetchLoginLogs()
}
async function fetchLoginLogs() {
  try {
    const res = await axios.get('/api/logs/login')
    logins.value = normalizeLogs(res.data.data).map(r => ({ ...r, timestamp: r.last_access ? String(r.last_access).replace('T', ' ').slice(0, 19) : '' }))
  } catch {}
}

function scheduleScroll() {
  if (!autoScroll.value) return
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  nextTick(() => {
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0
      const el = logContainer.value
      if (el) el.scrollTop = el.scrollHeight
    })
  })
}
watch([tab, () => currentLogs.value.length, autoScroll], scheduleScroll)

onMounted(() => { fetchLogs(); on('new_log', onNewLog); on('init', onInit) })
onUnmounted(() => { off('new_log', onNewLog); off('init', onInit); if (flushTimer) clearTimeout(flushTimer); if (scrollFrame) cancelAnimationFrame(scrollFrame); pendingLogs.length = 0 })
watch(() => app.currentBotId, () => fetchLogs())
</script>

<template>
  <div class="log-page">
    <div class="log-toolbar">
      <div class="log-tabs ui-pills">
        <button v-for="t in TABS" :key="t.key" :class="['ui-pill', { active: tab === t.key }]" @click="tab = t.key">{{ t.label }}</button>
      </div>
      <div class="log-actions">
        <label class="auto-label"><input type="checkbox" v-model="autoScroll" /> 自动滚动 </label>
        <button class="tool-btn" @click="clearAll">清空</button>
      </div>
    </div>
    <div class="terminal" ref="logContainer">
      <div v-if="!currentLogs.length" class="term-empty">等待日志...</div>
      <div v-for="(e, i) in currentLogs" :key="i" class="term-line">
        <!-- 消息日志 -->
        <template v-if="tab === 'message'">
          <span class="t-time">{{ e.timestamp }}</span>
          <span v-if="e.bot_name" class="t-bot">[{{ e.bot_name }}]</span>
          <span v-if="e.bot_qq" class="t-bot-qq">QQ:{{ e.bot_qq }}</span>
          <span v-if="e.direction === 'send'" class="t-dir t-dir-send">发送</span>
          <span v-else-if="e.direction === 'receive'" class="t-dir t-dir-recv">接收</span>
          <span v-if="e.user_id" class="t-uid">U:{{ e.user_id }}</span>
          <span v-if="e.group_id" class="t-gid">G:{{ e.group_id }}</span>
          <span class="t-content" v-html="fmtMsgContent(e.content)" />
          <span v-if="e.raw_message" :class="['t-expand-btn', { active: expandedMsg[i] }]" @click="toggleMsg(i)">原始事件</span>
          <div v-if="expandedMsg[i] && e.raw_message" class="t-detail"><pre class="t-traceback">{{ fmtJson(e.raw_message) }}</pre></div>
        </template>
        <!-- 框架日志 -->
        <template v-else-if="tab === 'framework'">
          <span class="t-time">{{ e.timestamp }}</span>
          <span :class="['t-level', (e.level || 'INFO').toLowerCase()]">{{ e.level || 'INFO' }}</span>
          <span v-if="e.source" class="t-source">[{{ e.source }}]</span>
          <span class="t-content">{{ e.content || e.message || '' }}</span>
        </template>
        <!-- 生命周期日志 -->
        <template v-else-if="tab === 'lifecycle'">
          <span class="t-time">{{ e.timestamp }}</span>
          <span v-if="e.bot_qq" class="t-bot">[{{ e.bot_qq }}]</span>
          <span :class="['t-lc-type', 't-lc-' + (e.event_type || e.type || '')]">{{ eventLabel(e) }}</span>
          <span v-if="e.user_id" class="t-uid">U:{{ e.user_id }}</span>
          <span v-if="e.group_id" class="t-gid">G:{{ e.group_id }}</span>
          <span v-if="e.raw_message || e.content" :class="['t-expand-btn', { active: expandedRaw[i] }]" @click="expandedRaw[i] = !expandedRaw[i]">原始响应</span>
          <div v-if="expandedRaw[i] && (e.raw_message || e.content)" class="t-detail"><pre class="t-traceback">{{ fmtJson(e.raw_message || e.content) }}</pre></div>
        </template>
        <!-- 登录日志 -->
        <template v-else-if="tab === 'login'">
          <span class="t-time">{{ e.timestamp }}</span>
          <span class="t-login-ip">{{ e.ip }}</span>
          <span :class="['t-login-status', e.is_banned ? 'banned' : 'ok']">{{ e.is_banned ? '已封禁' : '正常' }}</span>
          <span v-if="e.fail_count" class="t-login-fail">失败 {{ e.fail_count }} 次</span>
          <span v-if="e.first_access" class="t-login-first">首次: {{ e.first_access.replace('T',' ').slice(0,19) }}</span>
        </template>
        <!-- 错误日志 -->
        <template v-else>
          <span class="t-time">{{ e.timestamp }}</span>
          <span class="t-level error">ERROR</span>
          <span v-if="e.bot_qq && e.bot_qq !== '0000'" class="t-bot-qq">({{ e.bot_qq }})</span>
          <span v-if="e.module_type || e.module_name" class="t-source"> [{{ [e.module_type, e.module_name].filter(Boolean).join(':') }}] </span>
          <div class="t-err-actions">
            <span :class="['t-expand-btn', { active: expandedErr[i] === 'raw' }]" @click="toggleErr(i, 'raw')">原始消息</span>
            <span :class="['t-expand-btn', { active: expandedErr[i] === 'payload' }]" @click="toggleErr(i, 'payload')">发送内容</span>
            <span :class="['t-expand-btn', { active: expandedErr[i] === 'resp' }]" @click="toggleErr(i, 'resp')">响应对象</span>
          </div>
          <div v-if="expandedErr[i]" class="t-detail">
            <pre v-if="expandedErr[i] === 'raw'" class="t-traceback">{{ e.content || '无' }}</pre>
            <pre v-else-if="expandedErr[i] === 'payload'" class="t-traceback">{{ fmtCtx(e.context) }}</pre>
            <pre v-else-if="expandedErr[i] === 'resp'" class="t-traceback">{{ e.traceback || '无' }}</pre>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-page {
  display:flex;
  flex-direction:column;
  height:calc(100vh - 100px)
}
.log-toolbar {
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:8px;
  flex-wrap:wrap;
  gap:8px
}
.log-actions {
  display:flex;
  align-items:center;
  gap:10px
}
.auto-label {
  color:var(--text2);
  font-size:12px;
  cursor:pointer;
  display:flex;
  align-items:center;
  gap:4px
}
.auto-label input {
  accent-color:var(--accent)
}
.tool-btn {
  padding:4px 10px;
  border:1px solid var(--border);
  border-radius:4px;
  background:transparent;
  color:var(--text2);
  cursor:pointer;
  font-size:12px
}
.tool-btn:hover {
  color:var(--text);
  border-color:var(--text3)
}
.terminal {
  flex:1;
  min-height:0;
  overflow-y:auto;
  background:var(--bg2);
  border:1px solid var(--border);
  border-radius:var(--radius);
  box-shadow:var(--shadow-sm);
  font-family:Cascadia Code,Fira Code,Consolas,Monaco,monospace;
  font-size:13px;
  line-height:1.7;
  padding:10px 4px
}
.term-empty {
  color:var(--text3);
  text-align:center;
  padding:40px 0
}
.term-line {
  padding:1px 12px;
  white-space:pre-wrap;
  word-break:break-all
}
.term-line:hover {
  background:#5865f20f
}
.t-time {
  color:var(--text3);
  margin-right:6px
}
.t-bot {
  color:var(--info);
  margin-right:4px
}
.t-bot-qq {
  color:var(--text3);
  margin-right:6px;
  font-size:12px
}
.t-uid {
  color:var(--success);
  margin-right:6px
}
.t-gid {
  color:var(--warning);
  margin-right:6px
}
.t-content {
  color:var(--text)
}
.t-nl {
  color:var(--text3);
  font-size:10px;
  margin:0 1px;
  opacity:.6
}
.t-dir {
  font-size:10px;
  padding:0 4px;
  border-radius:3px;
  margin-right:4px;
  font-weight:600;
  line-height:16px;
  display:inline-block
}
.t-dir-send {
  color:#2e7d32;
  background:#e8f5e9
}
.t-dir-recv {
  color:#1565c0;
  background:#e3f2fd
}
.t-level {
  padding:0 4px;
  border-radius:3px;
  margin-right:6px;
  font-size:11px;
  font-weight:600
}
.t-level.info {
  color:var(--info)
}
.t-level.debug {
  color:var(--text3)
}
.t-level.warning {
  color:var(--warning)
}
.t-level.error {
  color:var(--danger)
}
.t-level.critical {
  color:#fff;
  background:var(--danger)
}
.t-source {
  color:var(--text2);
  margin-right:6px
}
.t-err {
  color:var(--danger)
}
.t-expand-btn {
  color:var(--accent);
  font-size:11px;
  margin-left:8px;
  cursor:pointer;
  border:1px solid var(--accent);
  border-radius:3px;
  padding:0 4px;
  -webkit-user-select:none;
  -moz-user-select:none;
  user-select:none;
  white-space:nowrap
}
.t-expand-btn:hover,.t-expand-btn.active {
  background:var(--accent);
  color:#fff
}
.t-detail {
  margin:4px 0 2px 20px;
  padding:0;
  border-radius:6px;
  overflow:hidden
}
.t-ctx {
  margin-bottom:6px
}
.t-ctx-item {
  display:flex;
  gap:6px;
  font-size:12px;
  line-height:1.6
}
.t-ctx-key {
  color:var(--warning);
  font-weight:600;
  flex-shrink:0
}
.t-ctx-val {
  color:var(--text);
  word-break:break-all
}
.t-traceback {
  margin:0;
  padding:10px 12px;
  font-size:12px;
  line-height:1.6;
  background:#1e1e1e;
  border-radius:6px;
  color:#d4d4d4;
  font-family:Cascadia Code,Fira Code,Consolas,monospace;
  white-space:pre-wrap;
  word-break:break-all;
  max-height:300px;
  overflow-y:auto
}
.t-err-actions {
  display:inline-flex;
  gap:4px;
  margin-left:6px
}
.t-lc-type {
  font-size:11px;
  padding:0 5px;
  border-radius:3px;
  margin-right:6px;
  font-weight:600;
  display:inline-block
}
.t-lc-group_add {
  color:#1b5e20;
  background:#e8f5e9
}
.t-lc-group_del {
  color:#b71c1c;
  background:#ffebee
}
.t-lc-group_member_add {
  color:#00695c;
  background:#e0f2f1
}
.t-lc-group_member_del {
  color:#880e4f;
  background:#fce4ec
}
.t-lc-friend_add {
  color:#1565c0;
  background:#e3f2fd
}
.t-lc-friend_del {
  color:#e65100;
  background:#fff3e0
}
.t-lc-group_msg_reject {
  color:#bf360c;
  background:#fbe9e7
}
.t-lc-group_msg_receive {
  color:#6a1b9a;
  background:#f3e5f5
}
.t-lc-MESSAGE_REACTION_ADD {
  color:#283593;
  background:#e8eaf6
}
.t-lc-MESSAGE_REACTION_REMOVE {
  color:#455a64;
  background:#eceff1
}
.t-lc-GUILD_UPDATE {
  color:#00838f;
  background:#e0f7fa
}
.t-login-ip {
  color:var(--accent);
  font-weight:600;
  margin-right:8px
}
.t-login-status {
  font-size:11px;
  padding:0 5px;
  border-radius:3px;
  font-weight:600;
  margin-right:6px
}
.t-login-status.ok {
  color:#2e7d32;
  background:#e8f5e9
}
.t-login-status.banned {
  color:#c62828;
  background:#ffebee
}
.t-login-fail {
  color:var(--warning);
  font-size:12px;
  margin-right:6px
}
.t-login-first {
  color:var(--text2);
  font-size:11px
}
@media(max-width:767px) {
  .terminal {
  font-size:11px;
  -webkit-overflow-scrolling:touch
}
.log-toolbar {
  flex-direction:column;
  align-items:stretch;
  gap:8px
}
.log-toolbar > * {
  width:100%
}
}
</style>

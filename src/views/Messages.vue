<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { NInput, NModal, NRadioButton, NRadioGroup } from 'naive-ui'
import { useAppStore } from '../stores/app'
import { on, off } from '../utils/ws'
import axios from '../utils/axios'
import { parseMessageReference } from '../utils/messageReference'
import { atLabel, isCostlyUrl, parseMedia, parseSegments, renderContent } from '../utils/messageRender'
import { openExternalUrl, safeMediaUrl } from '../utils/url'

const app = useAppStore()
let _unmounted = false
const nickCache = {}
const PAGE = 50
const isMobile = ref(window.innerWidth < 768)
const mobileView = ref('list')
const chatType = ref('group')
const chatDays = ref(1)
const chatSearch = ref('')
const chats = ref([])
const page = ref(1)
const total = ref(0)
const current = ref(null)
const history = ref([])
const historyRef = ref(null)
const msgType = ref('text')
const msgText = ref('')
const imgFile = ref(null)
const sending = ref(false)
const sendErr = ref('')
const recalling = ref('')
const rawDataMsg = ref(null)
const quotedMsg = ref(null)
const oldestDate = ref('')
const hasMore = ref(true)
const loadingOlder = ref(false)
const mediaFileType = ref('1')
const imgPreview = ref('')
const mobileTypeOpen = ref(false)
const mobileMediaOpen = ref(false)
const msgTypeOptions = [
  { value: 'text', label: '普通消息' },
  { value: 'media', label: '富媒体' },
]
const mediaTypeOptions = [
  { value: '1', label: '图片' },
  { value: '2', label: '视频' },
  { value: '3', label: '语音' },
  { value: '4', label: '文件' },
]

const apiChatType = computed(() => chatType.value)
const groupRoles = ref({})
const remarkInput = ref('')
const remarkQqInput = ref('')
const remarkEditing = ref(null)
const remarkModalVisible = ref(false)
const addRemarkModalVisible = ref(false)
const addRemarkOpenid = ref('')
const addRemarkName = ref('')
const addRemarkQq = ref('')
const placeholder = computed(() => msgType.value === 'media' ? '输入资源 URL... (Ctrl+Enter 发送)' : '输入消息内容... (Ctrl+Enter 发送)')
const quotedPreview = computed(() => quotedMsg.value ? buildQuotePreview(quotedMsg.value) : '')
const mobileMsgTypeLabel = computed(() => msgTypeOptions.find(o => o.value === msgType.value)?.label || 'MD')
const mobileMediaTypeLabel = computed(() => mediaTypeOptions.find(o => o.value === mediaFileType.value)?.label || '图片')
function handleResize() { isMobile.value = window.innerWidth < 768 }
function goBackToList() { mobileView.value = 'list'; current.value = null }
function closeMobileTypeMenu() { mobileTypeOpen.value = false; mobileMediaOpen.value = false }
function selectMobileMsgType(value) { msgType.value = value; closeMobileTypeMenu() }
function selectMobileMediaType(value) { mediaFileType.value = value; closeMobileTypeMenu() }
function getBotAvatar(bot_qq) { const bot = app.bots.find(b => b.bot_qq === bot_qq); return bot?.avatar || '' }
function qqAvatar(qq) { return `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=100` }
function groupQqAvatar(qq) { return `https://p.qlogo.cn/gh/${qq}/${qq}/100/` }
// OneBot 的 user_id 均为真实 QQ 号，头像统一使用 QQ 头像服务。
function chatKey(chat) { return String(chat?.bot_qq || '') + ':' + String(chat?.chat_id || '') }
function avatarUrl(_bot_qq, uid) { return qqAvatar(uid) }
const openUrl = openExternalUrl
const lightboxSrc = ref('')
function previewImg(src) { const url = safeMediaUrl(src); if (url) lightboxSrc.value = url }
function closeLightbox() { lightboxSrc.value = '' }
function revealImg(e) { const el = e.currentTarget; const src = safeMediaUrl(el.dataset.src); if (src) { const img = document.createElement('img'); img.src = src; img.className = 'bubble-media-img'; img.style.cssText = 'max-width:160px;max-height:120px;width:auto;height:auto;border-radius:6px;display:block;cursor:pointer'; img.referrerPolicy = 'no-referrer'; img.loading = 'lazy'; img.onclick = () => previewImg(src); el.replaceWith(img) } }
function shortTime(t) { return t ? (t.length > 10 ? t.slice(11, 16) : t) : '' }
function stripYear(t) { if (!t) return ''; const m = t.match(/^\d{4}-(\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?)$/); return m ? m[1] : t }

function isAuditId(id) { return id && id.startsWith('msg_auditid_') }
function canRecall(m) { return !!m.message_id && !isAuditId(m.message_id) }
function canQuote(m) { return !!m.message_id && !isAuditId(m.message_id) && !m._recalled && !m._audit_rejected }
function showRaw(m) { rawDataMsg.value = rawDataMsg.value === m ? null : m }
function formatRaw(m) {
  if (m.raw_message) {
    try { return JSON.stringify(JSON.parse(m.raw_message), null, 2) } catch {}
    return m.raw_message
  }
  return JSON.stringify({ message_id: m.message_id, user_id: m.user_id, content: m.content, timestamp: m.timestamp, source: m.source, is_self: m.is_self, bot_qq: m.bot_qq }, null, 2)
}

function quoteAuthor(m) { return m.is_self ? '我' : (m.nickname || m.user_id || '未知用户') }
function buildQuotePreview(m) {
  if (m._segments) {
    const t = m._segments.map(s => s.kind === 'text' ? s.text : s.kind === 'at' ? atLabel(s) : s.kind === 'image' ? '[图片]' : s.kind === 'audio' ? '[语音]' : s.kind === 'video' ? '[视频]' : (s.text || '')).join('')
    return t.replace(/\s+/g, ' ').trim() || '空消息'
  }
  if (m._media) return [m._media.type ? `[${m._media.type}]` : '[媒体]', m._media.text, m._media.src].filter(Boolean).join(' ')
  return String(m.content || '').replace(/\n\[keyboard\] [\s\S]*$/, '').replace(/\s+/g, ' ').trim() || '空消息'
}
function quoteTargetText(q) { return q?.text || (q?.id ? `ID: ${q.id}` : '引用消息') }
function prepareMessage(m) {
  m._segments = parseSegments(m)
  m._media = m._segments ? null : parseMedia(m.content)
  m._recalled = !!m.recalled
  m._quote = parseMessageReference(m)
  return m
}
function resolveMessageReferences(messages) {
  const byReferenceId = {}, byMessageId = {}
  for (const m of messages) {
    if (m.reference_id) byReferenceId[m.reference_id] = m
    if (m.message_id) byMessageId[m.message_id] = m
  }
  for (const m of messages) {
    const q = m._quote
    if (!q?.id) continue
    const target = byReferenceId[q.id] || byMessageId[q.id]
    if (!target || target === m) continue
    q.author = quoteAuthor(target)
    q.text = buildQuotePreview(target)
    q.message_id = target.message_id || ''
  }
}
function quoteMsg(m) {
  if (!canQuote(m)) return
  quotedMsg.value = m
}
function clearQuote() { quotedMsg.value = null }

async function recallMsg(m) {
  if (recalling.value || !m.message_id) return
  recalling.value = m.message_id
  try {
    const res = await axios.post('/api/message/recall', {
      chat_type: apiChatType.value,
      chat_id: current.value?.chat_id || '',
      bot_qq: m.bot_qq || app.currentBotId || '',
      message_id: m.message_id,
    })
    if (res.data?.success) {
      m._recalled = true
    } else {
      sendErr.value = res.data?.message || '撤回失败'
    }
  } catch (e) {
    sendErr.value = e.response?.data?.message || e.message || '撤回失败'
  } finally {
    recalling.value = ''
  }
}
let _fetchTimer = null
async function fetchChats() {
  if (_unmounted) return
  try {
    const res = await axios.post('/api/message/chats', { type: chatType.value, search: chatSearch.value, bot_qq: app.currentBotId || '', page: page.value, page_size: PAGE, days: chatDays.value })
    if (_unmounted) return
    chats.value = res.data?.data?.chats || []
    total.value = res.data?.data?.total || chats.value.length
  } catch { if (!_unmounted) { chats.value = []; total.value = 0 } }
}

function memberInfo(uid) { return groupRoles.value[uid] || {} }
// 优先用消息自带的 sender.role (OneBot 群消息携带), 退回成员列表
function msgRole(m) { return String(m.role || memberInfo(m.user_id).role || '') }
function roleLabel(r) {
  if (r === 'owner') return '群主'
  if (r === 'admin') return '管理'
  if (r) return '群员'
  return ''
}
function roleClass(r) {
  if (r === 'owner') return 'role-owner'
  if (r === 'admin') return 'role-admin'
  return 'role-member'
}
// 机器人 QQ 号段判定 (这些号段/号码为机器人账号)
function isBotQq(uid) {
  const n = Number(uid)
  if (!n) return false
  return (n >= 2854000000 && n <= 2855000000) ||
    (n >= 3889000000 && n <= 3890000000) ||
    (n >= 4010000000 && n <= 4019999999) ||
    n === 3328144510 || n === 66600000
}
function isBot(uid) { return !!memberInfo(uid).is_bot || isBotQq(uid) }

const _rolesCache = {}
const _ROLES_CACHE_TTL = 120000
async function fetchGroupRoles(groupId) {
  if (!groupId) { groupRoles.value = {}; return }
  const cached = _rolesCache[groupId]
  if (cached && Date.now() - cached.ts < _ROLES_CACHE_TTL) { groupRoles.value = cached.data; return }
  try {
    const res = await axios.post('/api/message/group-roles', { group_id: groupId })
    const data = res.data?.data || {}
    _rolesCache[groupId] = { data, ts: Date.now() }
    groupRoles.value = data
  } catch { groupRoles.value = {} }
}

async function setRemark() {
  if (!remarkEditing.value) return
  try {
    await axios.post('/api/message/remarks', { group_id: remarkEditing.value, remark: remarkInput.value.trim(), group_qq: remarkQqInput.value.trim() })
    remarkModalVisible.value = false
    remarkEditing.value = null
    remarkInput.value = ''
    remarkQqInput.value = ''
    fetchChats()
  } catch {}
}

function startRemark(c) {
  remarkEditing.value = c.chat_id
  remarkInput.value = c.remark || ''
  remarkQqInput.value = c.group_qq || ''
  remarkModalVisible.value = true
}
function cancelRemark() {
  remarkModalVisible.value = false
  remarkEditing.value = null
  remarkInput.value = ''
  remarkQqInput.value = ''
}

function openAddRemark() {
  addRemarkOpenid.value = ''
  addRemarkName.value = ''
  addRemarkQq.value = ''
  addRemarkModalVisible.value = true
}
async function submitAddRemark() {
  const openid = addRemarkOpenid.value.trim()
  if (!openid) return
  try {
    await axios.post('/api/message/remarks', { group_id: openid, remark: addRemarkName.value.trim(), group_qq: addRemarkQq.value.trim() })
    addRemarkModalVisible.value = false
    fetchChats()
  } catch {}
}
function cancelAddRemark() {
  addRemarkModalVisible.value = false
}
function fetchChatsDebounced() {
  if (_fetchTimer) clearTimeout(_fetchTimer)
  _fetchTimer = setTimeout(() => { _fetchTimer = null; fetchChats() }, 350)
}

let _selectId = 0
async function selectChat(chat) {
  const myId = ++_selectId
  current.value = chat; msgText.value = ''; sendErr.value = ''; imgFile.value = null; quotedMsg.value = null
  hasMore.value = true; oldestDate.value = ''; loadingOlder.value = false; groupRoles.value = {}
  if (isMobile.value) mobileView.value = 'chat'
  history.value = []
  try {
    const res = await axios.post('/api/message/history', { chat_type: apiChatType.value, chat_id: chat.chat_id, bot_qq: app.currentBotId || chat.bot_qq || '' })
    if (myId !== _selectId) return
    const msgs = res.data?.data?.messages || []
    for (const m of msgs) prepareMessage(m)
    resolveMessageReferences(msgs)
    history.value = msgs
    if (apiChatType.value === 'group') fetchGroupRoles(chat.chat_id)
    oldestDate.value = res.data?.data?.oldest_date || ''
    hasMore.value = res.data?.data?.has_more !== false
    await nextTick(); scrollBottom(); watchImgLoads()
  } catch { if (myId === _selectId) { history.value = []; hasMore.value = false } }
}

async function loadOlder() {
  if (loadingOlder.value || !hasMore.value || !current.value || !oldestDate.value) return
  loadingOlder.value = true
  try {
    const res = await axios.post('/api/message/history', {
      chat_type: apiChatType.value, chat_id: current.value.chat_id,
      bot_qq: app.currentBotId || current.value.bot_qq || '', before_date: oldestDate.value,
    })
    const msgs = res.data?.data?.messages || []
    if (!msgs.length) { hasMore.value = false; return }
    for (const m of msgs) prepareMessage(m)
    const el = historyRef.value
    const prevH = el ? el.scrollHeight : 0
    history.value = [...msgs, ...history.value]
    resolveMessageReferences(history.value)
    oldestDate.value = res.data?.data?.oldest_date || oldestDate.value
    hasMore.value = res.data?.data?.has_more !== false
    await nextTick()
    if (el) el.scrollTop = el.scrollHeight - prevH
  } catch { hasMore.value = false }
  finally { loadingOlder.value = false }
}

function onHistoryScroll() {
  const el = historyRef.value
  if (el && el.scrollTop < 60 && hasMore.value && !loadingOlder.value) loadOlder()
}

function isNearBottom() { const el = historyRef.value; if (!el) return true; return el.scrollHeight - el.scrollTop - el.clientHeight < 80 }
function scrollBottom() { const el = historyRef.value; if (el) el.scrollTop = el.scrollHeight }

let _autoScroll = false
function watchImgLoads() {
  _autoScroll = true
  const el = historyRef.value; if (!el) return
  const stop = () => { _autoScroll = false; el.removeEventListener('wheel', stop); el.removeEventListener('touchmove', stop) }
  el.addEventListener('wheel', stop, { once: true, passive: true })
  el.addEventListener('touchmove', stop, { once: true, passive: true })
  const handler = () => { if (_autoScroll) scrollBottom() }
  el.querySelectorAll('img').forEach(img => { if (!img.complete) img.addEventListener('load', handler, { once: true }) })
  setTimeout(stop, 3000)
}

async function getNick(uid) {
  if (!uid) return '未知用户'; if (nickCache[uid]) return nickCache[uid]
  try { const n = (await axios.post('/api/message/nickname', { user_id: uid })).data?.data?.nickname || `用户${uid.slice(-6)}`; nickCache[uid] = n; return n } catch { return `用户${uid.slice(-6)}` }
}

async function onNewLog(data) {
  if (!data || _unmounted) return
  if (data.log_type === 'audit') { onAuditLog(data); return }
  if (data.log_type === 'lifecycle') { onLifecycleLog(data); return }
  if (data.log_type !== 'message') return; fetchChatsDebounced(); if (!current.value) return
  const gid = data.group_id || '', uid = data.user_id || '', cid = current.value.chat_id
  const eventBot = String(data.bot_qq || '')
  const currentBot = String(app.currentBotId || current.value.bot_qq || '')
  if (eventBot && currentBot && eventBot !== currentBot) return
  if ((apiChatType.value === 'group' && gid === cid) || (apiChatType.value === 'user' && uid === cid && !gid)) {
    const isSelf = data.direction === 'send'
    const nick = isSelf ? (data.bot_name || 'Bot') : await getNick(uid)
    if (_unmounted) return
    const item = prepareMessage({ id: history.value.length, message_id: data.message_id || '', reference_id: data.reference_id || '', user_id: uid, bot_qq: data.bot_qq || currentBot, nickname: nick, content: data.content || '', timestamp: data.timestamp || '', is_self: isSelf, source: data.source || '', raw_message: data.raw_message || '' })
    history.value.push(item)
    resolveMessageReferences(history.value)
    if (isNearBottom()) nextTick(scrollBottom)
  }
}

async function onLifecycleLog(data) {
  if (!current.value || apiChatType.value !== 'group') return
  const evtType = data.type || ''
  if (evtType !== 'group_member_add' && evtType !== 'group_member_del') return
  const gid = data.group_id || '', uid = data.user_id || '', cid = current.value.chat_id
  if (gid !== cid) return
  const nick = await getNick(uid)
  if (_unmounted) return
  history.value.push({
    id: `lc_rt_${Date.now()}`,
    message_id: '', reference_id: '', user_id: uid,
    bot_qq: data.bot_qq || app.currentBot?.bot_qq || current.value.bot_qq || '',
    nickname: nick, content: '', timestamp: data.timestamp || '',
    is_self: false, source: '', raw_message: '', recalled: false,
    event_type: evtType === 'group_member_add' ? 'member_add' : 'member_remove',
  })
  if (isNearBottom()) nextTick(scrollBottom)
}

function onAuditLog(data) {
  if (!data.audit_id) return
  const m = history.value.find(msg => msg.message_id === data.audit_id)
  if (m) {
    if (data.passed && data.message_id) {
      m.message_id = data.message_id
    } else if (!data.passed) {
      m._audit_rejected = true
    }
  }
}

function onImgSelect(e) { const f = e.target.files?.[0]; if (f) { clearImg(); imgFile.value = f; imgPreview.value = URL.createObjectURL(f) }; e.target.value = '' }
function clearImg() { if (imgPreview.value) URL.revokeObjectURL(imgPreview.value); imgFile.value = null; imgPreview.value = '' }

function onKeydown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }

async function sendMsg() {
  if (sending.value || !current.value) return
  sending.value = true; sendErr.value = ''
  try {
    const content = msgText.value.trim()
    if (!content && !imgFile.value) { sending.value = false; return }
    const fd = new FormData()
    fd.append('chat_type', apiChatType.value); fd.append('chat_id', current.value.chat_id)
    fd.append('bot_qq', app.currentBotId || current.value.bot_qq || '')
    fd.append('msg_type', msgType.value); fd.append('content', content)
    if (quotedMsg.value) {
      if (quotedMsg.value.reference_id) fd.append('message_reference_id', quotedMsg.value.reference_id)
      if (quotedMsg.value.message_id) fd.append('quote_message_id', quotedMsg.value.message_id)
    }
    if (imgFile.value && msgType.value === 'text') fd.append('image', imgFile.value)
    if (msgType.value === 'media') fd.append('media_file_type', mediaFileType.value)
    const res = await axios.post('/api/message/send', fd)
    if (res.data?.success) { msgText.value = ''; clearImg(); clearQuote() }
    else sendErr.value = res.data?.message || '发送失败'
  } catch (e) { sendErr.value = e.response?.data?.message || e.message || '发送失败' }
  finally { sending.value = false }
}

watch(chatType, () => { current.value = null; quotedMsg.value = null; history.value = []; chats.value = []; oldestDate.value = ''; hasMore.value = true; page.value = 1; remarkEditing.value = null; groupRoles.value = {}; fetchChats() })
watch(chatDays, () => { page.value = 1; fetchChats() })
watch(chatSearch, () => { page.value = 1; fetchChatsDebounced() })
watch(() => app.currentBotId, () => { current.value = null; quotedMsg.value = null; history.value = []; oldestDate.value = ''; hasMore.value = true; page.value = 1; fetchChats() })

onMounted(() => { fetchChats(); on('new_log', onNewLog); window.addEventListener('resize', handleResize); document.addEventListener('click', closeMobileTypeMenu) })
onUnmounted(() => { _unmounted = true; off('new_log', onNewLog); window.removeEventListener('resize', handleResize); document.removeEventListener('click', closeMobileTypeMenu); clearImg(); if (_fetchTimer) { clearTimeout(_fetchTimer); _fetchTimer = null } })
</script>

<template>
  <div class="msg-page">
    <div class="msg-layout">
      <!-- 会话列表 -->
      <div :class="['chat-list-panel', { 'mobile-hidden': isMobile && mobileView !== 'list' }]">
        <div class="panel-header">
          <span>聊天列表</span>
          <n-radio-group v-model:value="chatType" size="tiny">
            <n-radio-button value="group">群</n-radio-button>
            <n-radio-button value="user">好友</n-radio-button>
          </n-radio-group>
          <n-radio-group v-model:value="chatDays" size="tiny" class="days-sel">
            <n-radio-button :value="1">1天</n-radio-button>
            <n-radio-button :value="2">2天</n-radio-button>
            <n-radio-button :value="3">3天</n-radio-button>
          </n-radio-group>
        </div>
        <n-input v-model:value="chatSearch" placeholder="搜索..." size="small" clearable class="chat-search" />
        <div class="chat-items">
          <div v-for="c in chats" :key="chatKey(c)" :class="['chat-item', { active: current && chatKey(current) === chatKey(c) }]" @click="selectChat(c)">
            <div class="chat-avatar-wrap">
              <img v-if="chatType === 'user' && c.chat_id" class="chat-avatar" :src="qqAvatar(c.chat_id)" loading="lazy" @error="e => e.target.style.display='none'" />
              <img v-else-if="chatType === 'group' && c.chat_id" class="chat-avatar" :src="groupQqAvatar(c.chat_id)" loading="lazy" @error="e => e.target.style.display='none'" />
              <img v-else-if="app.isAllBots && c.bot_qq && getBotAvatar(c.bot_qq)" class="chat-avatar" :src="getBotAvatar(c.bot_qq)" loading="lazy" @error="e => e.target.style.display='none'" />
              <div v-else class="chat-avatar-fallback">{{ (c.nickname || c.chat_id || '?').charAt(0) }}</div>
              <span v-if="c.is_full_access" class="chat-avatar-badge">全</span>
            </div>
            <div class="chat-info">
              <div class="chat-nick">{{ c.nickname || c.chat_id }}</div>
              <div v-if="c.nickname && c.nickname !== c.chat_id" class="chat-id">{{ c.chat_id }}</div>
              <div class="chat-preview">{{ c.last_content || '' }}</div>
            </div>
            <div class="chat-meta">
              <div class="chat-time">{{ shortTime(c.last_time) }}</div>
              <div v-if="c.msg_count" class="chat-count">{{ c.msg_count }}</div>
              <button v-if="chatType !== 'user'" class="remark-btn" title="备注" @click.stop="startRemark(c)">✎</button>
            </div>
          </div>
          <div v-if="!chats.length" class="chat-empty">暂无聊天</div>
        </div>
        <div v-if="total > PAGE" class="chat-pager">
          <button :disabled="page <= 1" @click="page--; fetchChats()">&lt;</button>
          <span>{{ page }} / {{ Math.ceil(total / PAGE) }}</span>
          <button :disabled="page >= Math.ceil(total / PAGE)" @click="page++; fetchChats()">&gt;</button>
        </div>
      </div>

      <!-- 历史消息面板 -->
      <div :class="['chat-history-panel', { 'mobile-hidden': isMobile && mobileView !== 'chat' }]">
        <template v-if="current">
          <div class="panel-header">
            <button v-if="isMobile" class="mobile-back-btn" @click="goBackToList">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span>{{ current.nickname || current.chat_id }}</span>
            <span v-if="current.nickname && current.nickname !== current.chat_id" class="panel-header-remark">({{ current.chat_id }})</span>
            <span v-if="current.bot_qq" class="panel-header-bot">QQ: {{ current.bot_qq }}</span>
          </div>
          <div class="history-body" ref="historyRef" @scroll="onHistoryScroll">
            <div v-if="loadingOlder" class="history-hint">加载中...</div>
            <div v-else-if="!hasMore && history.length" class="history-hint">没有更多消息了</div>
            <template v-for="m in history" :key="m.id">
            <div v-if="m.event_type" class="event-wrap">
              <div class="event-box">
                <img v-if="m.user_id" class="event-avatar" :src="avatarUrl(m.bot_qq, m.user_id)" loading="lazy" @error="e => e.target.style.display='none'" />
                <div v-else class="event-avatar-fallback">{{ (m.nickname || '?').charAt(0) }}</div>
                <span class="event-uid">{{ m.user_id }}</span>
                <span class="event-text">{{ m.event_type === 'member_add' ? '已加入本群' : '已退出本群' }}</span>
              </div>
            </div>
            <div v-else :class="['bubble-wrap', { self: m.is_self === true }]">
              <div class="bubble-avatar-wrap">
                <img v-if="m.is_self && m.bot_qq" class="msg-avatar" :src="qqAvatar(m.bot_qq)" loading="lazy" @error="e => e.target.style.display='none'" />
                <div v-else-if="m.is_self" class="msg-avatar-bot">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="1.5" fill="currentColor" /><circle cx="15" cy="11" r="1.5" fill="currentColor" /><path d="M12 2v2M6 20l2-2M18 20l-2-2" /></svg>
                </div>
                <img v-else-if="m.user_id" class="msg-avatar" :src="avatarUrl(m.bot_qq, m.user_id)" loading="lazy" @error="e => e.target.style.display='none'" />
                <div v-else class="msg-avatar-fallback">{{ (m.nickname || '?').charAt(0) }}</div>
              </div>
              <div class="bubble-main">
                <div class="bubble-name">
                  {{ m.nickname }}
                  <span v-if="m.bot_qq" class="bubble-bot-tag">QQ:{{ m.bot_qq }}</span>
                  <span v-if="m.source === 'web_panel'" class="bubble-src-tag">Web</span>
                  <span v-if="msgRole(m) && !m.is_self && apiChatType === 'group'" :class="['bubble-role-tag', roleClass(msgRole(m))]">{{ roleLabel(msgRole(m)) }}</span>
                  <span v-if="isBot(m.user_id) && !m.is_self && apiChatType === 'group'" class="bubble-role-tag role-bot">Bot</span>
                  <span v-if="m.user_id && !m.is_self" class="bubble-uid">{{ m.user_id }}</span>
                </div>
                <div class="bubble-row">
                  <div :class="['bubble', { 'bubble-self': m.is_self }]">
                    <div v-if="m._quote" class="bubble-quote-ref">
                      <div class="bubble-quote-author">引用 {{ m._quote.author || '消息' }}</div>
                      <div class="bubble-quote-content">{{ quoteTargetText(m._quote) }}</div>
                    </div>
                    <span v-if="m._recalled" class="recalled-tag">已撤回</span>
                    <span v-else-if="m._audit_rejected" class="recalled-tag audit-reject">审核未通过</span>
                    <span v-else-if="m.is_self && isAuditId(m.message_id)" class="audit-tag">审核中</span>
                    <div v-if="m._segments" class="bubble-segs" style="word-break:break-all;overflow-wrap:anywhere;white-space:pre-wrap">
                      <template v-for="(seg, si) in m._segments" :key="si">
                        <span v-if="seg.kind === 'text'">{{ seg.text }}</span>
                        <span v-else-if="seg.kind === 'at'" class="bubble-at">{{ atLabel(seg) }}</span>
                        <template v-else-if="seg.kind === 'image'">
                          <span v-if="isCostlyUrl(seg.src)" class="bubble-media-placeholder" :data-src="seg.src" @click="revealImg($event)">🖼 点击加载图片 (外部存储)</span>
                          <img v-else :src="seg.src" class="bubble-media-img" style="max-width:160px;max-height:120px;width:auto;height:auto" referrerpolicy="no-referrer" @click="previewImg(seg.src)" @error="e => e.target.style.display='none'" loading="lazy" />
                        </template>
                        <audio v-else-if="seg.kind === 'audio'" :src="seg.src" controls preload="none" class="bubble-media-audio" />
                        <video v-else-if="seg.kind === 'video'" :src="seg.src" controls preload="none" class="bubble-media-video" />
                        <span v-else-if="seg.kind === 'tag'" class="bubble-media-text">{{ seg.text }}</span>
                      </template>
                    </div>
                    <template v-else-if="m._media">
                      <span v-if="m._media.text" class="bubble-media-text">{{ m._media.text }}</span>
                      <template v-if="['图片','media'].includes(m._media.type)">
                        <span v-if="isCostlyUrl(m._media.src)" class="bubble-media-placeholder" :data-src="m._media.src" @click="revealImg($event)">🖼 点击加载图片 (外部存储)</span>
                        <img v-else :src="m._media.src" class="bubble-media-img" style="max-width:160px;max-height:120px;width:auto;height:auto" referrerpolicy="no-referrer" @click="previewImg(m._media.src)" @error="e => e.target.style.display='none'" loading="lazy" />
                      </template>
                      <audio v-else-if="m._media.type === '语音'" :src="m._media.src" controls preload="none" class="bubble-media-audio" />
                      <video v-else-if="m._media.type === '视频'" :src="m._media.src" controls preload="none" class="bubble-media-video" />
                      <a v-else :href="m._media.src" target="_blank" rel="noopener noreferrer" class="bubble-media-link"> 📁 {{ m._media.src.split('/').pop() }}</a>
                    </template>
                    <div v-else v-html="renderContent(m.content)" style="word-break:break-all;overflow-wrap:anywhere;white-space:pre-wrap" />
                  </div>
                  <div class="bubble-actions">
                    <button v-if="canQuote(m)" class="action-btn" title="引用这条消息" @click="quoteMsg(m)">引</button>
                    <button class="action-btn" title="原始数据" @click="showRaw(m)">{ }</button>
                    <button v-if="canRecall(m) && !m._recalled" class="action-btn recall" :disabled="recalling === m.message_id" title="撤回" @click="recallMsg(m)">
                      {{ recalling === m.message_id ? '...' : '↩' }}
                    </button>
                  </div>
                </div>
                <span class="bubble-ts">{{ stripYear(m.timestamp) }}</span>
                <pre v-if="rawDataMsg === m" class="raw-data-box">{{ formatRaw(m) }}</pre>
              </div>
            </div>
            </template>
            <div v-if="!history.length" class="chat-empty" style="padding-top:48px">暂无消息记录，可在下方发送消息</div>
          </div>

          <!-- 消息发送区 -->
          <div class="send-area">
            <div v-if="quotedMsg" class="quote-preview">
              <div class="quote-main">
                <span class="quote-title">引用 {{ quoteAuthor(quotedMsg) }}</span>
                <span class="quote-text">{{ quotedPreview }}</span>
              </div>
              <button class="quote-clear" title="取消引用" @click="clearQuote">×</button>
            </div>
            <div class="send-toolbar">
              <select v-model="msgType" class="send-type-select"><option value="text">普通消息</option><option value="media">富媒体</option></select>
              <select v-if="msgType === 'media'" v-model="mediaFileType" class="send-type-select"><option value="1">图片</option><option value="2">视频</option><option value="3">语音</option><option value="4">文件</option></select>
              <label v-if="msgType === 'text'" class="send-img-label" title="选择图片">
                <input type="file" accept="image/*" @change="onImgSelect" hidden />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="send-icon"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" /><path d="M21 15l-5-5L5 21" /></svg>
              </label>
              <span v-if="imgFile" class="send-img-tag">
                <img v-if="imgPreview" :src="imgPreview" class="send-img-preview" /> {{ imgFile.name }}
                <span class="send-img-remove" @click="clearImg">×</span>
              </span>
            </div>

            <!-- 普通消息发送 -->
            <div class="send-input-row">
              <div class="mobile-type-menu" @click.stop>
                <button type="button" class="mobile-type-trigger" @click="mobileTypeOpen = !mobileTypeOpen">
                  <span>{{ mobileMsgTypeLabel }}</span><span class="mobile-type-caret"></span>
                </button>
                <div v-if="mobileTypeOpen" class="mobile-type-options">
                  <button v-for="opt in msgTypeOptions" :key="opt.value" type="button" :class="{ active: msgType === opt.value }" @click="selectMobileMsgType(opt.value)">{{ opt.label }}</button>
                </div>
              </div>
              <div v-if="msgType === 'media'" class="mobile-type-menu mobile-media-menu" @click.stop>
                <button type="button" class="mobile-type-trigger" @click="mobileMediaOpen = !mobileMediaOpen">
                  <span>{{ mobileMediaTypeLabel }}</span><span class="mobile-type-caret"></span>
                </button>
                <div v-if="mobileMediaOpen" class="mobile-type-options">
                  <button v-for="opt in mediaTypeOptions" :key="opt.value" type="button" :class="{ active: mediaFileType === opt.value }" @click="selectMobileMediaType(opt.value)">{{ opt.label }}</button>
                </div>
              </div>
              <textarea v-model="msgText" class="send-input" rows="2" :placeholder="placeholder" @keydown="onKeydown" />
              <button class="send-btn" @click="sendMsg" :disabled="sending">{{ sending ? '...' : '发送' }}</button>
            </div>
            <div v-if="msgType === 'media'" class="send-hint"> 输入资源 URL, 将以富媒体消息 ({{ { '1':'图片','2':'视频','3':'语音','4':'文件' }[mediaFileType] }}) 发送 </div>
            <div v-if="sendErr" class="send-error">{{ sendErr }}</div>
          </div>
        </template>

        <div v-else class="no-chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--text3);margin-bottom:12px"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          <div>选择一个聊天查看消息</div>
        </div>
      </div>
    </div>
    <div v-if="lightboxSrc" class="lightbox-overlay" @click="closeLightbox">
      <img :src="lightboxSrc" class="lightbox-img" referrerpolicy="no-referrer" @click.stop />
      <span class="lightbox-close" @click="closeLightbox">&times;</span>
    </div>

    <n-modal v-model:show="remarkModalVisible" preset="dialog" title="群备注" positive-text="保存" negative-text="取消" @positive-click="setRemark" @negative-click="cancelRemark" style="width:380px">
      <div style="padding:8px 0">
        <div style="margin-bottom:8px;font-size:13px;color:var(--text2)">群号: {{ remarkEditing }}</div>
        <n-input v-model:value="remarkInput" placeholder="备注名称（留空则清除备注）" @keydown.enter="setRemark(); remarkModalVisible = false" />
      </div>
    </n-modal>

    <n-modal v-model:show="addRemarkModalVisible" preset="dialog" title="添加群备注" positive-text="保存" negative-text="取消" @positive-click="submitAddRemark" @negative-click="cancelAddRemark" style="width:380px">
      <div style="padding:8px 0">
        <n-input v-model:value="addRemarkOpenid" placeholder="群号" style="margin-bottom:8px" autofocus />
        <n-input v-model:value="addRemarkName" placeholder="备注名称" @keydown.enter="submitAddRemark(); addRemarkModalVisible = false" />
      </div>
    </n-modal>
  </div>
</template>

<style scoped src="../styles/Messages.css"></style>

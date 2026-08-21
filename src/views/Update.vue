<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDialog } from 'naive-ui'
import axios from '../utils/axios'
import SvgIcon from '../components/SvgIcon.vue'

const dialog = useDialog()
const ver = ref({})
const check = ref(null)
const checking = ref(false)
const updating = ref(false)
const skipBackup = ref(false)
const progress = ref({ stage: 'idle', message: '', progress: 0, is_updating: false })
const logs = ref([])
const logsLoading = ref(false)
const logsError = ref('')
const mirrors = ref([])
const tested = ref([])
const testing = ref(false)
const customMirror = ref('')
const uploadFile = ref(null)
const uploadFileRef = ref(null)
const uploadVersion = ref('')
const uploadSkip = ref(false)
const uploading = ref(false)
const uploadMsg = ref('')
const uploadErr = ref(false)

const STAGE_MAP = { checking: '检查中', downloading: '下载中', backing_up: '备份中', updating: '更新中', completed: '完成', failed: '失败', preparing: '准备中' }
const stageLabel = computed(() => STAGE_MAP[progress.value.stage] || progress.value.stage)
const statusText = computed(() => {
  if (checking.value) return '检查中'
  if (!check.value) return '未检查'
  return check.value.has_update ? '有新版本' : '已是最新'
})
const statCards = computed(() => [
  { label: '当前版本', value: ver.value.version || 'unknown', icon: 'cloud-download', color: 'c-blue' },
  { label: '最新版本', value: check.value?.latest_version || '—', icon: 'rocket', color: 'c-purple' },
  { label: '更新状态', value: statusText.value, icon: 'alert-circle', color: check.value?.has_update ? 'c-orange' : 'c-green' },
  { label: '更新时间', value: ver.value.update_time || '—', icon: 'time', color: 'c-teal' },
])

const mergedMirrors = computed(() => {
  if (tested.value.length) {
    const set = new Set(tested.value.map(m => m.mirror))
    const rest = testing.value ? mirrors.value.filter(m => !set.has(m)).map(m => ({ mirror: m, latency: 0, success: false, _tested: false })) : []
    if (!set.has('') && testing.value) rest.push({ mirror: '', latency: 0, success: false, _tested: false })
    return [...tested.value, ...rest]
  }
  const list = mirrors.value.map(m => ({ mirror: m, latency: 0, success: false, _tested: false }))
  list.push({ mirror: '', latency: 0, success: false, _tested: false })
  return list
})

function mirrorName(m) { if (!m) return 'GitHub 直连'; try { return new URL(m).hostname } catch { return m } }

async function fetchVersion() { try { const r = await axios.get('/api/update/version'); ver.value = r.data?.data || {}; customMirror.value = ver.value.custom_mirror || '' } catch {} }
async function checkUpdate() { checking.value = true; try { const r = await axios.get('/api/update/check'); check.value = r.data?.data || null } catch (e) { check.value = { has_update: false, error: e.message } } finally { checking.value = false } }
async function fetchLogs() {
  logsLoading.value = true; logsError.value = ''
  try { const r = await axios.get('/api/update/changelog'); if (r.data?.success === false) { logsError.value = r.data?.message || 'API 请求失败'; logs.value = [] } else logs.value = r.data?.data || [] }
  catch (e) { logsError.value = e.response?.data?.message || e.message || '获取失败'; logs.value = [] }
  finally { logsLoading.value = false }
}

async function startUpdate(version) {
  updating.value = true; progress.value = { stage: 'preparing', message: '准备中...', progress: 0, is_updating: true }
  try { const params = { skip_backup: skipBackup.value }; version ? params.version = version : params.force = true; await axios.post('/api/update/start', params); pollProgress() }
  catch (e) { progress.value = { stage: 'failed', message: e.response?.data?.message || e.message || '启动更新失败', progress: 0, is_updating: false }; updating.value = false }
}

let pollId = 0
async function pollProgress() {
  const id = ++pollId
  while (id === pollId) {
    try {
      const d = (await axios.get('/api/update/progress')).data?.data
      if (id !== pollId) return
      if (d) progress.value = d
      if (!d?.is_updating) {
        updating.value = false
        if (d?.stage === 'completed') {
          await fetchVersion()
          dialog.success({ title: '更新完成', content: '更新完成，请重启框架后刷新浏览器。', positiveText: '知道了' })
        }
        return
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

async function fetchMirrors() { try { const r = await axios.get('/api/update/mirrors'); mirrors.value = r.data?.data?.mirrors || []; if (r.data?.data?.custom_mirror) customMirror.value = r.data.data.custom_mirror } catch {} }
async function saveMirror() { try { await axios.post('/api/update/mirror', { mirror: customMirror.value }) } catch {} }

function testMirrors() {
  testing.value = true; tested.value = []
  const token = localStorage.getItem('elaina_token') || ''
  const es = new EventSource(`/api/update/test-mirrors?token=${token}`)
  es.onmessage = e => { try { const d = JSON.parse(e.data); if (d.done) { es.close(); testing.value = false; return }; tested.value = [...tested.value, { ...d, _tested: true }].sort((a, b) => a.success === b.success ? a.latency - b.latency : a.success ? -1 : 1) } catch {} }
  es.onerror = () => { es.close(); testing.value = false }
}

function onFileChange(e) { uploadFile.value = e.target.files?.[0] || null; uploadMsg.value = '' }
async function uploadUpdate() {
  if (!uploadFile.value) return; uploading.value = true; uploadMsg.value = ''; uploadErr.value = false
  try { const fd = new FormData(); fd.append('file', uploadFile.value); if (uploadVersion.value) fd.append('version_name', uploadVersion.value); fd.append('skip_backup', uploadSkip.value ? 'true' : 'false'); const r = await axios.post('/api/update/upload', fd, { timeout: 120000 }); uploadMsg.value = r.data?.message || '上传成功'; pollProgress() }
  catch (e) { uploadMsg.value = e.response?.data?.message || e.message || '上传失败'; uploadErr.value = true }
  finally { uploading.value = false }
}

onMounted(() => { fetchVersion(); checkUpdate(); fetchLogs(); fetchMirrors() })
onUnmounted(() => { pollId++ })
</script>

<template>
  <div class="upd-page">
    <div class="ui-stat-grid upd-stats">
      <div v-for="item in statCards" :key="item.label" :class="['ui-stat', item.color]">
        <div class="ui-stat-top">
          <div class="ui-stat-ic"><SvgIcon :name="item.icon" :size="17" /></div>
          <div class="ui-stat-label">{{ item.label }}</div>
        </div>
        <div class="ui-stat-val upd-stat-val">{{ item.value }}</div>
        <SvgIcon :name="item.icon" :size="68" class="ui-stat-wm" />
      </div>
    </div>

    <div v-if="check?.has_update || check?.error" class="upd-card">
      <div class="upd-card-header">
        <span class="upd-title"><SvgIcon name="refresh" :size="15" class="upd-title-ic" />{{ check.has_update ? '发现新版本' : '更新检查失败' }}</span>
        <template v-if="check.has_update">
          <span class="upd-badge upd-badge-new">有新版本</span>
          <span v-if="check.latest_version" class="upd-ver">最新: {{ check.latest_version }}</span>
        </template>
      </div>
      <div v-if="check.has_update" class="upd-card-actions">
        <button class="btn btn-primary" @click="startUpdate()" :disabled="updating">一键更新到最新</button>
        <label class="upd-check"><input type="checkbox" v-model="skipBackup" /> 跳过备份</label>
      </div>
      <div v-if="check.error" class="upd-error">{{ check.error }}</div>
    </div>

    <div v-if="progress.is_updating || progress.stage === 'completed' || progress.stage === 'failed'" class="upd-card">
      <div class="upd-card-header">
        <span :class="['upd-badge', { 'upd-badge-new': progress.is_updating, 'upd-badge-ok': progress.stage === 'completed', 'upd-badge-err': progress.stage === 'failed' }]">{{ stageLabel }}</span>
      </div>
      <div class="upd-progress-bar"><div class="upd-progress-fill" :style="{ width: progress.progress + '%' }" /></div>
      <div class="upd-progress-msg">{{ progress.message }}</div>
    </div>

    <div class="upd-cols">
      <div class="upd-card upd-col-log">
        <div class="upd-card-header">
          <span class="upd-title"><SvgIcon name="document-text" :size="15" class="upd-title-ic" />更新日志</span>
          <span class="upd-spacer" />
          <button class="btn btn-xs" @click="fetchLogs" :disabled="logsLoading">{{ logsLoading ? '加载...' : '刷新' }}</button>
        </div>
        <div class="upd-log-wrap">
        <div class="upd-log-list">
          <div v-for="log in logs" :key="log.sha" class="upd-log-item">
            <div class="upd-log-sha">
              <a v-if="log.url" :href="log.url" target="_blank" class="upd-log-link" :title="'在 GitHub 上查看 ' + log.sha"><code>{{ log.sha }}</code></a>
              <code v-else>{{ log.sha }}</code>
              <span class="upd-log-date">{{ log.date }}</span>
            </div>
            <div class="upd-log-msg">{{ log.message }}</div>
            <div class="upd-log-author">{{ log.author }}</div>
            <div class="upd-log-actions"><button class="btn btn-xs" @click="startUpdate(log.full_sha)" :disabled="updating" title="更新到此版本">更新到此版本</button></div>
          </div>
          <div v-if="logsError" class="upd-error">{{ logsError }}</div>
          <div v-else-if="!logs.length && !logsLoading" class="upd-empty">暂无更新日志</div>
        </div>
        </div>
      </div>

      <div class="upd-col-right">
        <div class="upd-card">
          <div class="upd-card-header">
            <span class="upd-title"><SvgIcon name="globe" :size="15" class="upd-title-ic" />镜像选择</span>
            <span v-if="customMirror" class="upd-cur-mirror">当前: {{ mirrorName(customMirror) }}</span>
            <span class="upd-spacer" />
            <button class="btn btn-xs" @click="testMirrors" :disabled="testing">{{ testing ? '测速中...' : '测速' }}</button>
          </div>
          <div class="upd-mirror-custom">
            <input v-model="customMirror" placeholder="自定义镜像 URL (留空=自动选择最快)" class="upd-input" />
            <button class="btn btn-xs" @click="saveMirror">保存</button>
            <button v-if="customMirror" class="btn btn-xs" @click="customMirror = ''; saveMirror()">清除</button>
          </div>
          <div class="upd-mirror-list">
            <div v-for="(m, i) in mergedMirrors" :key="m.mirror || 'direct'" :class="['upd-mirror-item', { 'upd-mirror-active': customMirror === m.mirror }]">
              <span class="upd-mirror-rank">{{ i + 1 }}</span>
              <span class="upd-mirror-name" :title="m.mirror || 'GitHub 直连'">{{ mirrorName(m.mirror) }}</span>
              <span v-if="m._tested" :class="['upd-mirror-latency', { ok: m.success, fail: !m.success }]">{{ m.success ? m.latency + 's' : '超时' }}</span>
              <span v-else-if="testing" class="upd-mirror-testing">测速中...</span>
              <button class="btn btn-xs" @click="customMirror = m.mirror; saveMirror()">使用</button>
            </div>
          </div>
        </div>

        <div class="upd-card">
          <div class="upd-card-header"><span class="upd-title"><SvgIcon name="upload" :size="15" class="upd-title-ic" />上传更新包</span></div>
          <div class="upd-upload-body">
            <input type="file" ref="uploadFileRef" accept=".zip" @change="onFileChange" class="upd-file-input" />
            <input v-model="uploadVersion" placeholder="版本名 (可选)" class="upd-input" />
            <label class="upd-check"><input type="checkbox" v-model="uploadSkip" /> 跳过备份</label>
            <button class="btn btn-primary btn-sm" @click="uploadUpdate" :disabled="!uploadFile || uploading">{{ uploading ? '上传中...' : '上传并更新' }}</button>
            <div v-if="uploadMsg" :class="['upd-upload-msg', { err: uploadErr }]">{{ uploadMsg }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upd-page { width:100% }
.upd-stats { grid-template-columns:repeat(4,minmax(0,1fr)) }
.upd-stat-val { font-size:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.upd-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow-sm); padding:18px 20px; margin-bottom:14px }
.upd-card-header { display:flex; align-items:center; gap:10px; margin-bottom:12px; font-size:14px; color:var(--text) }
.upd-title { display:inline-flex; align-items:center; gap:6px; font-weight:600; white-space:nowrap; flex-shrink:0 }
.upd-title-ic { color:var(--accent) }
.upd-spacer { flex:1 }
.upd-card-actions { display:flex; align-items:center; gap:12px }
.upd-badge { font-size:11px; padding:2px 10px; border-radius:10px; font-weight:600 }
.upd-badge-new { background:#58a6ff22; color:#58a6ff }
.upd-badge-ok { background:#3fb95022; color:#3fb950 }
.upd-badge-err { background:#f8514922; color:#f85149 }
.upd-ver { color:var(--text2); font-size:12px }
.upd-error { color:#f85149; font-size:12px; margin-top:6px }
.upd-progress-bar { height:6px; background:var(--border); border-radius:3px; overflow:hidden; margin-bottom:6px }
.upd-progress-fill { height:100%; background:var(--accent); border-radius:3px; transition:width .3s }
.upd-progress-msg { color:var(--text2); font-size:12px }
.upd-check { display:flex; align-items:center; gap:4px; font-size:12px; color:var(--text2); cursor:pointer }
.upd-check input { accent-color:var(--accent) }
.upd-cols { display:flex; gap:12px; align-items:stretch }
.upd-col-log { flex:1; min-width:0; min-height:0; display:flex; flex-direction:column }
.upd-col-right { width:380px; flex-shrink:0; display:flex; flex-direction:column; gap:12px }
.upd-log-wrap { flex:1; min-height:0; position:relative }
.upd-log-list { position:absolute; inset:0; overflow-y:auto }
.upd-log-item { padding:8px 0; border-bottom:1px solid var(--border) }
.upd-log-item:last-child { border-bottom:none }
.upd-log-sha { display:flex; align-items:center; gap:8px; margin-bottom:2px }
.upd-log-sha code { font-size:11px; background:var(--bg3); padding:1px 6px; border-radius:4px; color:var(--accent) }
.upd-log-link { text-decoration:none }
.upd-log-link:hover code { background:rgba(var(--accent-rgb,99,102,241),.2); cursor:pointer }
.upd-log-date { color:var(--text3); font-size:11px }
.upd-log-msg { color:var(--text); font-size:13px; line-height:1.5; word-break:break-word }
.upd-log-author { color:var(--text3); font-size:11px; margin-top:2px }
.upd-log-actions { margin-top:4px }
.upd-empty { color:var(--text3); text-align:center; padding:20px 0; font-size:12px }
.upd-mirror-custom { display:flex; gap:6px; margin-bottom:8px }
.upd-input { flex:1; background:var(--bg3); border:1px solid var(--border); border-radius:6px; padding:4px 8px; font-size:12px; color:var(--text); outline:none }
.upd-input:focus { border-color:var(--accent) }
.upd-mirror-list { max-height:260px; overflow-y:auto }
.upd-mirror-item { display:flex; align-items:center; gap:6px; padding:4px 0; font-size:12px; border-bottom:1px solid var(--border) }
.upd-mirror-item:last-child { border-bottom:none }
.upd-mirror-active { background:var(--accent-light, rgba(88,166,255,.08)); border-radius:4px }
.upd-mirror-rank { color:var(--text3); font-weight:600; width:20px; text-align:center; flex-shrink:0 }
.upd-mirror-name { flex:1; color:var(--text2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.upd-cur-mirror { font-size:11px; color:var(--accent); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.upd-mirror-latency { flex-shrink:0; font-weight:600; font-size:11px }
.upd-mirror-latency.ok { color:#3fb950 }
.upd-mirror-latency.fail { color:#f85149 }
.upd-mirror-testing { flex-shrink:0; font-size:11px; color:var(--text3); animation:pulse 1s infinite }
@keyframes pulse { 0%,to { opacity:1 } 50% { opacity:.4 } }
.upd-upload-body { display:flex; flex-direction:column; gap:8px }
.upd-file-input { font-size:12px; color:var(--text2) }
.upd-upload-msg { font-size:12px }
.upd-upload-msg.err { color:#f85149 }
.btn { background:var(--bg3); border:1px solid var(--border); border-radius:6px; padding:6px 14px; cursor:pointer; color:var(--text); font-size:13px; transition:all .15s; white-space:nowrap }
.btn:hover:not(:disabled) { border-color:var(--accent); color:var(--accent) }
.btn:disabled { opacity:.4; cursor:default }
.btn-primary { background:var(--accent); color:#fff; border-color:var(--accent) }
.btn-primary:hover:not(:disabled) { opacity:.85; color:#fff }
.btn-sm { padding:4px 12px; font-size:12px }
.btn-xs { padding:2px 8px; font-size:11px }
@media(max-width:767px) { .upd-stats { grid-template-columns:repeat(2,minmax(0,1fr)) } .upd-cols { flex-direction:column } .upd-log-wrap { min-height:320px } .upd-col-right { width:100% } .upd-card-header { flex-wrap:wrap; gap:8px } .upd-card-actions { flex-wrap:wrap } }
</style>

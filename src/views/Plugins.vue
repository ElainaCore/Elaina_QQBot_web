<script setup>
import { h, ref, reactive, computed, defineComponent, onMounted, watch } from 'vue'
import { useMessage } from 'naive-ui'
import axios from '../utils/axios'
import { useAppStore } from '../stores/app'
import SvgIcon from '../components/SvgIcon.vue'
import { safeExternalUrl } from '../utils/url'

const msg = useMessage()
const appStore = useAppStore()
const dirs = ref([])
const modules = ref([])
const search = ref('')
const mode = ref('all')
const fileView = ref(localStorage.getItem('elainaqq_plugins_file_view') || 'main')
watch(fileView, value => localStorage.setItem('elainaqq_plugins_file_view', value))
const loading = ref(false)
const expanded = reactive({})
const botBindOpen = reactive({})
const MAX_EDIT = 50 * 1024

function configFormat(file) {
  const provided = String(file?.format || '').trim().toLowerCase()
  if (provided) return provided
  const name = String(file?.name || file?.path || '').toLowerCase()
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml'
  if (name.endsWith('.json')) return 'json'
  return 'raw'
}

function normalizeConfigFiles(value) {
  return (Array.isArray(value) ? value : [])
    .filter(file => file && typeof file === 'object')
    .map(file => ({
      ...file,
      name: String(file.name || ''),
      path: String(file.path || ''),
      format: configFormat(file),
      size: Number(file.size) || 0,
    }))
}

function normalizePluginDirs(value) {
  return (Array.isArray(value) ? value : []).filter(item => item && typeof item === 'object').map(item => ({
    ...item,
    directory: String(item.directory || ''),
    files: Array.isArray(item.files) ? item.files.filter(file => file && typeof file === 'object') : [],
    commands: Array.isArray(item.commands) ? item.commands.filter(command => command && typeof command === 'object') : [],
  }))
}

function normalizeModules(value) {
  return (Array.isArray(value) ? value : []).filter(item => item && typeof item === 'object').map(item => ({
    ...item,
    name: String(item.name || ''),
    display_name: String(item.display_name || item.name || ''),
    config_files: normalizeConfigFiles(item.config_files),
  }))
}

function formatLabel(value) { return String(value || 'raw').toUpperCase() }

// 代码编辑弹窗
const editor = reactive({ show: false, filename: '', content: '', originalContent: '', path: '', readonly: false, modified: false, saving: false })
// 配置编辑弹窗
const cfgEditor = reactive({ show: false, filename: '', path: '', format: 'raw', raw: '', parsed: null, comments: {}, viewMode: 'visual', modified: false, saving: false })

// 递归配置节点组件
const ConfigNode = defineComponent({
  name: 'ConfigNode',
  props: { data: { required: true }, path: { type: Array, default: () => [] }, comments: { type: Object, default: () => ({}) } },
  emits: ['update'],
  setup(props, { emit }) {
    function update(p, v) { emit('update', p, v) }
    function comment(p) { return props.comments[p.join('.')] || '' }
    return () => {
      const d = props.data
      if (d == null) return h('div', { class: 'cfg-row' }, [h('span', { class: 'cfg-key' }, props.path.length ? props.path[props.path.length - 1] : 'null'), h('span', { class: 'cfg-val null' }, 'null')])
      if (typeof d === 'object' && !Array.isArray(d)) {
        const entries = Object.entries(d)
        return h('div', { class: 'cfg-section' }, entries.map(([k, v]) => {
          const np = [...props.path, k], c = comment(np)
          return v !== null && typeof v === 'object'
            ? h('details', { class: 'cfg-group', open: true }, [
                h('summary', { class: 'cfg-group-title' }, [k, c ? h('span', { class: 'cfg-comment' }, c) : null]),
                h(ConfigNode, { data: v, path: np, comments: props.comments, onUpdate: update })
              ])
            : h(ConfigNode, { data: v, path: np, comments: props.comments, onUpdate: update })
        }))
      }
      if (Array.isArray(d)) {
        const items = d.map((v, i) => {
          const np = [...props.path, i]
          return h('div', { class: 'cfg-array-item' }, [
            h('span', { class: 'cfg-idx' }, `[${i}]`),
            h(ConfigNode, { data: v, path: np, comments: props.comments, onUpdate: update }),
            h('button', { class: 'cfg-arr-btn remove', title: '删除', onClick: () => { const a = [...d]; a.splice(i, 1); update(props.path, a) } }, '×')
          ])
        })
        const defVal = () => {
          if (!d.length) return ''
          const f = d[0]
          if (f && typeof f === 'object' && !Array.isArray(f)) return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'boolean' ? false : typeof v === 'number' ? 0 : '']))
          return typeof f === 'boolean' ? false : typeof f === 'number' ? 0 : ''
        }
        items.push(h('button', { class: 'cfg-arr-btn add', onClick: () => update(props.path, [...d, defVal()]) }, '+ 添加'))
        return h('div', { class: 'cfg-section' }, items)
      }
      const key = props.path.length ? props.path[props.path.length - 1] : ''
      const cmt = comment(props.path), isBool = typeof d === 'boolean', isNum = typeof d === 'number'
      return h('div', { class: 'cfg-row' }, [
        h('span', { class: 'cfg-key' }, String(key)),
        isBool
          ? h('label', { class: 'cfg-toggle' }, [h('input', { type: 'checkbox', checked: d, onChange: e => update(props.path, e.target.checked) }), h('span', { class: 'cfg-toggle-slider' }), h('span', { class: 'cfg-toggle-label' }, d ? 'true' : 'false')])
          : h('input', { class: 'cfg-input' + (isNum ? ' num' : ''), type: isNum ? 'number' : 'text', value: String(d), onInput: e => { let v = e.target.value; if (isNum) v = Number(v) || 0; update(props.path, v) } }),
        cmt ? h('span', { class: 'cfg-comment' }, cmt) : null,
      ])
    }
  }
})

// 计算列表
const filteredModules = computed(() => {
  if (mode.value === 'plugin') return []
  const q = search.value.toLowerCase()
  let list = modules.value
  if (q) list = list.filter(m => (m.name || '').toLowerCase().includes(q) || (m.display_name || '').toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q))
  return list
})
const filteredDirs = computed(() => {
  if (mode.value === 'module') return []
  const q = search.value.toLowerCase()
  if (!q) return dirs.value
  return dirs.value.filter(d => (d.directory || '').toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q) || (d.files || []).some(f => (f.name || '').toLowerCase().includes(q)) || (d.commands || []).some(c => (c.name || '').toLowerCase().includes(q)))
})
const allItems = computed(() => [...filteredModules.value, ...filteredDirs.value])
const sortedDirs = computed(() => [...filteredDirs.value].sort((a, b) => Number(a.is_large) - Number(b.is_large)))

function cleanPattern(s) {
  if (typeof s !== 'string' || !s) return ''
  return s
    .replace(/^\^/, '').replace(/\$$/, '')
    .replace(/\(\?:([^|)]+)(?:\|[^)]*)*\)/g, '$1')
    .replace(/\(([^|)]+)(?:\|[^)]+)+\)/g, '$1')
    .replace(/\\s\*/g, '').replace(/\\s\+/g, ' ')
    .replace(/\([^)]*\)\?/g, '').replace(/\([^)]*\)/g, '…')
    .replace(/-\?/g, '').replace(/\?/g, '')
    .replace(/\\/g, '').replace(/…+/g, '…').trim()
}
function fmtSize(s) { return s < 1024 ? s + ' B' : s < 1024 * 1024 ? (s / 1024).toFixed(1) + ' KB' : (s / (1024 * 1024)).toFixed(1) + ' MB' }
function toggle(key) { expanded[key] = !expanded[key] }
function fileBase(f) { let n = f.name; if (n.endsWith('.py')) n = n.slice(0, -3); return n }
function entryFile(d) { return d.files.find(f => ['main.py', 'index.py', 'app.py'].includes(f.name)) }
function entryDisabled(d) { if (!d.is_large) return false; const entry = entryFile(d); return entry ? !entry.enabled : false }
function visibleFiles(d) {
  if (!d.is_large || fileView.value === 'all') return d.files
  const entry = entryFile(d)
  return entry ? [entry] : d.files.filter(file => !isSubFile(file))
}
async function toggleDir(d) {
  const entry = entryFile(d)
  if (!entry) { msg.error('未找到主入口文件'); return }
  await toggleFile(entry, d)
}
function isSubFile(f) { return f.name.startsWith('app/') }
function toggleBotBind(key) { botBindOpen[key] = !botBindOpen[key] }

async function fetchAll() {
  loading.value = true
  try {
    const [s, t] = await Promise.all([axios.get('/api/plugins/scan-dirs'), axios.get('/api/modules/scan')])
    dirs.value = normalizePluginDirs(s.data.dirs).map(d => ({ ...d, files: d.files.map(f => ({ ...f, name: String(f.name || ''), _toggling: false })) }))
    modules.value = normalizeModules(t.data.modules).map(m => ({ ...m, _toggling: false, persist_enabled: m.persist_enabled ?? false }))
    // 默认全部折叠
  } catch { msg.error('获取列表失败') } finally { loading.value = false }
}

async function toggleFile(file, dir) {
  file._toggling = true
  try {
    const action = file.enabled ? 'disable' : 'enable'
    const res = await axios.post('/api/plugins/toggle', { name: dir.directory, file: fileBase(file), action })
    if (res.data.success) {
      file.enabled = !file.enabled
      const ef = dir.files.find(f => ['main.py','index.py','app.py'].includes(f.name))
      dir.enabled = ef ? ef.enabled : dir.files.some(f => f.enabled)
      msg.success(`${file.name} 已${file.enabled ? '启用' : '禁用'}`)
    } else msg.error(res.data.message || '操作失败')
  } catch { msg.error('操作失败') } finally { file._toggling = false }
}

async function toggleModule(mod) {
  mod._toggling = true
  const action = mod.persist_enabled ? 'disable' : 'enable'
  try {
    const res = await axios.post('/api/modules/toggle', { name: mod.name, action })
    if (res.data.success) { mod.persist_enabled = !mod.persist_enabled; mod.enabled = mod.persist_enabled; msg.success(`模块 ${mod.display_name} 已${mod.persist_enabled ? '开启' : '关闭'}`); setTimeout(() => fetchAll(), 500) }
    else msg.error(res.data.message || '操作失败')
  } catch { msg.error('模块切换失败') } finally { mod._toggling = false }
}

async function uploadPlugin(e) { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (!f.name.endsWith('.py') && !f.name.endsWith('.zip')) { msg.error('仅支持 .py 或 .zip 文件'); return }; const fd = new FormData(); fd.append('file', f); if (f.name.endsWith('.py')) fd.append('directory', 'alone'); try { const r = await axios.post('/api/plugins/upload', fd, f.name.endsWith('.zip') ? { timeout: 120000 } : {}); r.data.success ? (msg.success(r.data.message || '上传成功'), await fetchAll()) : msg.error(r.data.message || '上传失败') } catch { msg.error('上传失败') } }
async function uploadModule(e) { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (!f.name.endsWith('.zip')) { msg.error('模块仅支持 .zip 格式'); return }; const fd = new FormData(); fd.append('file', f); try { const r = await axios.post('/api/modules/upload', fd); r.data.success ? (msg.success(r.data.message || '模块上传成功'), await fetchAll()) : msg.error(r.data.message || '上传失败') } catch { msg.error('模块上传失败') } }

// ── 卸载 ──
const uninstallConfirm = reactive({ show: false, name: '', type: 'plugin', keepData: true, loading: false })

function showUninstall(name, type) {
  Object.assign(uninstallConfirm, { show: true, name, type, keepData: true, loading: false })
}

async function doUninstall() {
  uninstallConfirm.loading = true
  try {
    const res = await axios.post('/api/market/uninstall', { name: uninstallConfirm.name, type: uninstallConfirm.type, keep_data: uninstallConfirm.keepData })
    if (res.data.success) { msg.success(res.data.message || '已卸载'); uninstallConfirm.show = false; await fetchAll() }
    else msg.error(res.data.message || '卸载失败')
  } catch { msg.error('卸载请求失败') }
  finally { uninstallConfirm.loading = false }
}

async function readFile(file) {
  if (!file.path) { msg.error('无文件路径'); return }
  try {
    const res = await axios.post('/api/plugins/read', { path: file.path })
    if (!res.data.success) { msg.error(res.data.message || '读取失败'); return }
    const content = res.data.content || '', size = new Blob([content]).size
    Object.assign(editor, { show: true, filename: res.data.filename || file.name, content, originalContent: content, path: file.path, readonly: size > MAX_EDIT, modified: false, saving: false })
  } catch { msg.error('读取失败') }
}
async function saveFile() {
  if (editor.readonly || editor.saving) return
  editor.saving = true
  try { const r = await axios.post('/api/plugins/save', { path: editor.path, content: editor.content }); r.data.success ? (msg.success('保存成功，重载后生效'), editor.originalContent = editor.content, editor.modified = false) : msg.error(r.data.message || '保存失败') }
  catch { msg.error('保存失败') } finally { editor.saving = false }
}
function closeEditor() { if (editor.modified && !confirm('有未保存的修改，确定关闭？')) return; editor.show = false }

async function readConfig(file) {
  try {
    const res = await axios.post('/api/config-file/read', { path: file.path })
    if (!res.data.success) { msg.error(res.data.message || '读取失败'); return }
    const format = configFormat({ ...file, format: res.data.format })
    const canVisual = ['yaml', 'json'].includes(format) && res.data.parsed !== null
    Object.assign(cfgEditor, { show: true, filename: String(res.data.filename || file.name || ''), path: String(file.path || ''), format, raw: String(res.data.raw || ''), parsed: res.data.parsed !== null && res.data.parsed !== undefined ? JSON.parse(JSON.stringify(res.data.parsed)) : null, comments: res.data.comments && typeof res.data.comments === 'object' ? res.data.comments : {}, viewMode: canVisual ? 'visual' : 'raw', modified: false, saving: false })
  } catch { msg.error('读取配置失败') }
}
function openModuleConfig(mod) { expanded['m_' + mod.name] = true; if (mod.config_files?.length === 1) readConfig(mod.config_files[0]) }
async function openDirConfig(dir) {
  const key = 'cfg_' + dir.directory
  if (expanded[key]) { expanded[key] = false; return }
  try {
    const res = await axios.post('/api/plugins/config-files', { name: dir.directory })
    const files = normalizeConfigFiles(res.data.config_files)
    if (res.data.success && files.length) { dir._config_files = files; files.length === 1 ? readConfig(files[0]) : (expanded[key] = true) }
    else msg.info('暂无配置文件')
  } catch { msg.error('获取配置失败') }
}
function onCfgUpdate(path, value) {
  if (!cfgEditor.parsed) return
  let obj = cfgEditor.parsed
  for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]]
  obj[path[path.length - 1]] = value
  cfgEditor.modified = true
  if (cfgEditor.format === 'json') cfgEditor.raw = JSON.stringify(cfgEditor.parsed, null, 2)
  else if (cfgEditor.format === 'yaml') cfgEditor.raw = toYaml(cfgEditor.parsed)
}
function toYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent)
  if (obj == null) return pad + 'null\n'
  if (typeof obj !== 'object') return typeof obj === 'string' ? (obj === '' ? "''" : /[:#\[\]{}|>&*!?,]/.test(obj) || /^\s|\s$/.test(obj) ? (obj.includes("'") ? `"${obj.replace(/"/g, '\\"')}"` : `'${obj}'`) : obj) : String(obj)
  let out = ''
  if (Array.isArray(obj)) { if (!obj.length) return pad + '[]\n'; for (const v of obj) out += typeof v === 'object' && v !== null ? pad + '-\n' + toYaml(v, indent + 1) : pad + '- ' + toYaml(v) + '\n' }
  else { for (const [k, v] of Object.entries(obj)) out += typeof v === 'object' && v !== null ? pad + k + ':\n' + toYaml(v, indent + 1) : pad + k + ': ' + toYaml(v) + '\n' }
  return out
}
async function saveCfg() {
  if (cfgEditor.saving) return
  cfgEditor.saving = true
  try {
    const content = cfgEditor.viewMode === 'visual' && cfgEditor.parsed && cfgEditor.format === 'json' ? JSON.stringify(cfgEditor.parsed, null, 2) : cfgEditor.raw
    const r = await axios.post('/api/config-file/save', { path: cfgEditor.path, content, format: cfgEditor.format })
    r.data.success ? (msg.success(r.data.message || '保存成功'), cfgEditor.modified = false) : msg.error(r.data.message || '保存失败')
  } catch { msg.error('保存失败') } finally { cfgEditor.saving = false }
}
function closeCfg() { if (cfgEditor.modified && !confirm('有未保存的修改，确定关闭？')) return; cfgEditor.show = false }

async function saveBotBindings() {
  const map = {}
  for (const d of dirs.value) { if (d.allowed_bots?.length) map[d.directory] = [...d.allowed_bots]; for (const f of d.files) if (f.allowed_bots?.length) map[`${d.directory}/${fileBase(f)}`] = [...f.allowed_bots] }
  try { await axios.post('/api/plugins/bots', { plugin_bots: map }) } catch { msg.error('保存机器人绑定失败') }
}
function bindDirBot(dir, botQq, checked) { if (!dir.allowed_bots) dir.allowed_bots = []; checked ? (!dir.allowed_bots.includes(botQq) && dir.allowed_bots.push(botQq)) : (dir.allowed_bots = dir.allowed_bots.filter(b => b !== botQq)); saveBotBindings() }
function bindFileBot(dir, file, botQq, checked) { if (!file.allowed_bots) file.allowed_bots = []; checked ? (!file.allowed_bots.includes(botQq) && file.allowed_bots.push(botQq)) : (file.allowed_bots = file.allowed_bots.filter(b => b !== botQq)); saveBotBindings() }

onMounted(() => { appStore.fetchBots(); fetchAll() })
</script>

<template>
  <div class="plugins-page">
    <div class="ui-page-head">
      <div class="ui-page-head-main">
        <div class="ui-page-icon"><SvgIcon name="extension-puzzle" :size="24" /></div>
        <div>
          <h1 class="ui-page-title">插件模块</h1>
          <div class="ui-page-sub">管理已加载的插件与模块</div>
        </div>
      </div>
    </div>
    <div class="plugins-toolbar">
      <div class="toolbar-left">
        <select v-model="mode" class="p-select"><option value="all">全部</option><option value="plugin">插件</option><option value="module">模块</option></select>
        <select v-model="fileView" class="p-select" title="大型插件文件显示方式"><option value="main">仅显示主入口</option><option value="all">显示全部文件</option></select>
        <label v-if="mode !== 'module'" class="p-btn upload-btn"><SvgIcon name="upload" :size="14" /><span>上传插件</span><input type="file" accept=".py,.zip" hidden @change="uploadPlugin" /></label>
        <label v-if="mode !== 'plugin'" class="p-btn upload-btn"><SvgIcon name="upload" :size="14" /><span>上传模块</span><input type="file" accept=".zip" hidden @change="uploadModule" /></label>
      </div>
      <div class="toolbar-right">
        <button class="p-btn" @click="fetchAll" :disabled="loading"><SvgIcon name="refresh" :size="14" /><span>刷新</span></button>
        <div class="p-search-wrap">
          <SvgIcon name="search" :size="14" class="p-search-icon" />
          <input v-model="search" class="p-search" placeholder="搜索插件或模块..." />
        </div>
      </div>
    </div>

    <div v-if="loading" class="p-loading">加载中...</div>
    <div v-else-if="!allItems.length" class="p-empty">暂无{{ mode === 'module' ? '模块' : mode === 'plugin' ? '插件' : '内容' }}</div>
    <div v-else class="plugins-list">
      <!-- 模块列表 -->
      <div v-for="m in filteredModules" :key="'m_' + m.name" class="p-dir mod-card">
        <div class="p-dir-head" @click="toggle('m_' + m.name)">
          <div class="p-dir-left">
            <SvgIcon :name="expanded['m_'+m.name] ? 'chevron-forward' : 'chevron-back'" :size="14" :style="{ transform: expanded['m_'+m.name] ? 'rotate(90deg)' : 'rotate(0)', transition: '.15s' }" />
            <SvgIcon name="cube" :size="14" style="color:var(--accent)" />
            <span class="p-dir-name">{{ m.display_name }}</span>
            <span class="p-tag module-tag">模块</span>
            <span :class="['p-tag', m.enabled ? 'ok' : 'off']">{{ m.enabled ? '运行中' : '未启用' }}</span>
            <span v-if="m.error" class="p-tag off" :title="m.error">异常</span>
            <span class="p-tag">v{{ m.version }}</span>
          </div>
          <div class="p-dir-right" @click.stop>
            <span v-if="m.description" class="p-dir-desc">{{ m.description }}</span>
            <label class="p-switch-sm module-switch" :title="m.persist_enabled ? '关闭模块' : '开启模块'">
              <input type="checkbox" :checked="m.persist_enabled" :disabled="m._toggling" @change="toggleModule(m)" /><span />
            </label>
            <span v-if="m.config_files?.length" class="p-tag config-tag" @click="openModuleConfig(m)"><SvgIcon name="settings" :size="10" /> 配置 </span>
            <span class="p-tag uninstall-tag" @click="showUninstall(m.name, 'module')"><SvgIcon name="trash" :size="10" /> 卸载</span>
          </div>
        </div>
        <div v-if="expanded['m_' + m.name]" class="p-dir-files">
          <div v-if="!m.config_files?.length" class="p-empty-inline">暂无配置文件</div>
          <div v-for="cf in m.config_files" :key="cf.path" class="p-file">
            <div class="p-file-left">
              <SvgIcon name="file" :size="13" />
              <span class="p-file-name">{{ cf.name }}</span>
              <span :class="['p-tag', 'fmt-' + configFormat(cf)]">{{ formatLabel(configFormat(cf)) }}</span>
              <span class="p-file-size">{{ fmtSize(cf.size) }}</span>
            </div>
            <div class="p-file-actions">
              <button class="p-act-btn sm" @click="readConfig(cf)" title="编辑配置"><SvgIcon name="settings" :size="13" /></button>
            </div>
          </div>
        </div>
      </div>

      <!-- 插件目录 -->
      <div v-for="d in sortedDirs" :key="d.directory" class="p-dir">
        <div class="p-dir-head" @click="toggle(d.directory)">
          <div class="p-dir-left">
            <SvgIcon :name="expanded[d.directory] ? 'chevron-forward' : 'chevron-back'" :size="14" :style="{ transform: expanded[d.directory] ? 'rotate(90deg)' : 'rotate(0)', transition: '.15s' }" />
            <SvgIcon name="extension-puzzle" :size="14" style="color:var(--text2)" />
            <span class="p-dir-name">{{ d.is_large ? (d.meta?.name || d.directory) : d.directory }}</span>
            <span class="p-tag plugin-tag">插件</span>
            <span v-if="d.is_system" class="p-tag">系统</span>
            <span :class="['p-tag', d.enabled ? 'ok' : 'off']">{{ d.enabled ? '已加载' : '未加载' }}</span>
            <span v-if="d.is_large && d.meta?.version" class="p-tag">v{{ d.meta.version }}</span>
            <span v-else-if="!d.is_large" class="p-tag">{{ d.files.length }} 个文件</span>
            <span v-else class="p-tag">{{ d.files.length }} 个文件</span>
          </div>
          <div class="p-dir-right" @click.stop>
            <span v-if="d.is_large && d.meta?.author" class="p-meta-author">{{ d.meta.author }}</span>
            <span v-if="d.is_large && (d.meta?.description || d.description)" class="p-dir-desc">{{ d.meta?.description || d.description }}</span>
            <a v-if="d.is_large && safeExternalUrl(d.meta?.github)" class="p-meta-link" :href="safeExternalUrl(d.meta.github)" target="_blank" rel="noopener noreferrer" @click.stop title="GitHub"><SvgIcon name="globe" :size="12" /></a>
            <label v-if="d.is_large && entryFile(d)" class="p-switch-sm module-switch" :title="entryDisabled(d) ? '启用插件' : '禁用插件'">
              <input type="checkbox" :checked="!entryDisabled(d)" :disabled="entryFile(d)._toggling" @change="toggleDir(d)" /><span />
            </label>
            <span class="p-tag config-tag" @click="openDirConfig(d)"><SvgIcon name="settings" :size="10" /> 配置 </span>
            <span :class="['p-tag bot-bind-tag', { active: d.allowed_bots?.length }]" @click="toggleBotBind(d.directory)">
              <SvgIcon name="people" :size="10" /> {{ d.allowed_bots?.length ? d.allowed_bots.length + '个机器人' : '全部机器人' }}
            </span>
            <span v-if="d.is_large && !d.is_system" class="p-tag uninstall-tag" @click="showUninstall(d.directory, 'plugin')"><SvgIcon name="trash" :size="10" /> 卸载</span>
          </div>
        </div>
        <!-- 目录级机器人绑定 -->
        <div v-if="botBindOpen[d.directory]" class="bot-bind-panel" @click.stop>
          <div class="bot-bind-title">选择允许触发的机器人 (不选 = 全部)</div>
          <label v-for="bot in appStore.bots" :key="bot.bot_qq" class="bot-bind-item">
            <input type="checkbox" :checked="(d.allowed_bots || []).includes(bot.bot_qq)" @change="e => bindDirBot(d, bot.bot_qq, e.target.checked)" />
            <img v-if="bot.avatar" :src="bot.avatar" class="bot-bind-avatar" />
            <span>{{ bot.name || bot.bot_qq }}</span><span class="bot-bind-id">{{ bot.bot_qq }}</span>
          </label>
        </div>
        <!-- 插件命令 -->
        <div v-if="d.commands?.length && expanded[d.directory]" class="p-dir-cmds">
          <span v-for="cmd in d.commands" :key="cmd.pattern" :class="['p-cmd-tag', { owner: cmd.owner_only, group: cmd.group_only && !cmd.owner_only }]" :title="(cmd.owner_only ? '[主人专用] ' : cmd.group_only ? '[群聊专用] ' : '[所有人] ') + (cmd.name ? cmd.name + ' | ' : '') + (cmd.desc ? cmd.pattern + ' — ' + cmd.desc : cmd.pattern)">
            <SvgIcon :name="cmd.owner_only ? 'shield' : cmd.group_only ? 'group' : 'globe'" :size="11" /> {{ cmd.name || cleanPattern(cmd.pattern) }}
          </span>
        </div>
        <!-- 配置文件 -->
        <div v-if="expanded['cfg_' + d.directory] && d._config_files?.length" class="p-dir-files">
          <div v-for="cf in d._config_files" :key="cf.path" class="p-file">
            <div class="p-file-left">
              <SvgIcon name="settings" :size="13" />
              <span class="p-file-name">{{ cf.name }}</span>
              <span :class="['p-tag', 'fmt-' + configFormat(cf)]">{{ formatLabel(configFormat(cf)) }}</span>
              <span class="p-file-size">{{ fmtSize(cf.size) }}</span>
            </div>
            <div class="p-file-actions">
              <button class="p-act-btn sm" @click="readConfig(cf)" title="编辑配置"><SvgIcon name="settings" :size="13" /></button>
            </div>
          </div>
        </div>
        <!-- 插件文件 -->
        <div v-if="expanded[d.directory]" class="p-dir-files">
          <template v-for="f in visibleFiles(d)" :key="f.path">
            <div :class="['p-file', { 'p-file-greyed': entryDisabled(d) && isSubFile(f) }]">
              <div class="p-file-left"><SvgIcon name="file" :size="13" /><span class="p-file-name">{{ f.name }}</span><span v-if="!d.is_large && f.meta?.name" class="p-file-meta">({{ f.meta.name }}<template v-if="f.meta?.version"> v{{ f.meta.version }}</template>)</span><span class="p-file-size">{{ fmtSize(f.size) }}</span><span class="p-file-time">{{ f.last_modified }}</span></div>
              <div class="p-file-actions">
                <span v-if="!d.is_large" :class="['p-tag bot-bind-tag sm', { active: f.allowed_bots?.length }]" @click.stop="toggleBotBind(d.directory + '/' + fileBase(f))" :title="f.allowed_bots?.length ? '已绑定 ' + f.allowed_bots.length + ' 个机器人' : '全部机器人'">
                  <SvgIcon name="people" :size="9" /> {{ f.allowed_bots?.length || '全部' }}
                </span>
                <label v-if="!d.is_large" class="p-switch-sm" :title="f.enabled ? '禁用' : '启用'"><input type="checkbox" :checked="f.enabled" :disabled="f._toggling" @change="toggleFile(f, d)" /><span /></label>
                <button class="p-act-btn sm" @click="readFile(f)" title="查看代码"><SvgIcon name="code" :size="13" /></button>
                <button v-if="!d.is_large && !d.is_system" class="p-act-btn sm danger-btn" @click.stop="showUninstall(d.directory === 'alone' ? fileBase(f) : d.directory, 'plugin')" title="卸载"><SvgIcon name="trash" :size="13" /></button>
              </div>
            </div>
            <!-- 文件级机器人绑定 -->
            <div v-if="!d.is_large && botBindOpen[d.directory + '/' + fileBase(f)]" class="bot-bind-panel file-level" @click.stop>
              <div class="bot-bind-title">{{ f.name }} — 选择允许触发的机器人</div>
              <label v-for="bot in appStore.bots" :key="bot.bot_qq" class="bot-bind-item">
                <input type="checkbox" :checked="(f.allowed_bots || []).includes(bot.bot_qq)" @change="e => bindFileBot(d, f, bot.bot_qq, e.target.checked)" />
                <img v-if="bot.avatar" :src="bot.avatar" class="bot-bind-avatar" />
                <span>{{ bot.name || bot.bot_qq }}</span><span class="bot-bind-id">{{ bot.bot_qq }}</span>
              </label>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 卸载确认弹窗 -->
    <div v-if="uninstallConfirm.show" class="p-modal-overlay" @click.self="uninstallConfirm.show = false">
      <div class="p-uninstall-confirm">
        <div class="p-uninstall-title">确认卸载</div>
        <div class="p-uninstall-msg">确定卸载 <b>{{ uninstallConfirm.name }}</b> 吗？</div>
        <label class="p-uninstall-check">
          <input type="checkbox" v-model="uninstallConfirm.keepData" />
          <span>保留插件数据</span>
        </label>
        <div class="p-uninstall-btns">
          <button class="p-btn" @click="uninstallConfirm.show = false">取消</button>
          <button class="p-btn danger" @click="doUninstall" :disabled="uninstallConfirm.loading">{{ uninstallConfirm.loading ? '卸载中...' : '卸载' }}</button>
        </div>
      </div>
    </div>

    <!-- 代码编辑弹窗 -->
    <div v-if="editor.show" class="p-modal-overlay" @click.self="closeEditor">
      <div class="p-modal">
        <div class="p-modal-head">
          <div class="p-modal-title"><SvgIcon name="file" :size="16" /><span>{{ editor.filename }}</span><span v-if="editor.readonly" class="p-tag warn">只读 (文件过大)</span><span v-if="editor.modified" class="p-tag accent">已修改</span></div>
          <div class="p-modal-actions">
            <button v-if="!editor.readonly && editor.modified" class="p-btn save-btn" @click="saveFile"><SvgIcon name="save" :size="14" /> 保存 </button>
            <button class="p-btn close-btn" @click="closeEditor"><SvgIcon name="x" :size="14" /> 关闭 </button>
          </div>
        </div>
        <div class="p-modal-body"><textarea v-model="editor.content" class="p-code-editor" spellcheck="false" :readonly="editor.readonly" @input="editor.modified = true" /></div>
      </div>
    </div>

    <!-- 配置编辑弹窗 -->
    <div v-if="cfgEditor.show" class="p-modal-overlay" @click.self="closeCfg">
      <div class="p-modal cfg-modal">
        <div class="p-modal-head">
          <div class="p-modal-title">
            <SvgIcon name="settings" :size="16" />
            <span>{{ cfgEditor.filename }}</span>
            <span :class="['p-tag', 'fmt-' + configFormat(cfgEditor)]">{{ formatLabel(cfgEditor.format) }}</span>
            <span v-if="cfgEditor.modified" class="p-tag accent">已修改</span>
          </div>
          <div class="p-modal-actions">
            <div v-if="cfgEditor.format === 'yaml' || cfgEditor.format === 'json'" class="cv-mode-tabs">
              <button :class="['cv-mode-tab', { active: cfgEditor.viewMode === 'visual' }]" @click="cfgEditor.viewMode = 'visual'"><SvgIcon name="grid" :size="12" /> 可视化</button>
              <button :class="['cv-mode-tab', { active: cfgEditor.viewMode === 'raw' }]" @click="cfgEditor.viewMode = 'raw'"><SvgIcon name="code" :size="12" /> 源码</button>
            </div>
            <button v-if="cfgEditor.modified" class="p-btn save-btn" @click="saveCfg"><SvgIcon name="save" :size="14" /> 保存</button>
            <button class="p-btn close-btn" @click="closeCfg"><SvgIcon name="x" :size="14" /> 关闭</button>
          </div>
        </div>
        <div class="p-modal-body cfg-body">
          <div v-if="cfgEditor.viewMode === 'visual' && cfgEditor.parsed" class="cfg-visual">
            <ConfigNode :data="cfgEditor.parsed" :path="[]" :comments="cfgEditor.comments" @update="onCfgUpdate" />
          </div>
          <textarea v-else v-model="cfgEditor.raw" class="p-code-editor cfg-editor" spellcheck="false" @input="cfgEditor.modified = true" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/Plugins.scoped.css"></style>

<style src="../styles/Plugins.global.css"></style>

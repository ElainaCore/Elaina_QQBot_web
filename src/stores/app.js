import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from '../utils/axios'

export const useAppStore = defineStore('app', () => {
  const bots = ref([])
  const currentBotId = ref('')
  const currentBot = computed(() =>
    (currentBotId.value && bots.value.find(b => b.bot_qq === currentBotId.value)) || null
  )
  const isAllBots = computed(() => !currentBotId.value)
  const systemInfo = ref(null)
  const sidebarCollapsed = ref(false)
  const webPages = ref([])

  let _botsPromise = null
  async function fetchBots() {
    try {
      const res = await axios.get('/api/bots')
      bots.value = res.data.bots || []
      if (currentBotId.value && !bots.value.some(bot => bot.bot_qq === currentBotId.value)) {
        const renamed = bots.value.find(bot => bot.bot_id === currentBotId.value)
        if (renamed) switchBot(renamed.bot_qq)
      }
      if (bots.value.length === 1 && !currentBotId.value) {
        switchBot(bots.value[0].bot_qq)
      }
    } catch {
    } finally {
      _botsPromise = null
    }
  }
  // 首次加载去重，避免多个视图同时请求机器人列表。
  function ensureBots() {
    if (!_botsPromise) _botsPromise = fetchBots()
    return _botsPromise
  }

  function switchBot(bot_qq) {
    currentBotId.value = bot_qq
    localStorage.setItem('elainaqq_bot', bot_qq)
  }

  async function fetchSystemInfo() {
    try {
      const res = await axios.get('/api/system/info')
      systemInfo.value = res.data
      return res.data
    } catch {}
    return null
  }

  async function fetchWebPages() {
    try {
      const res = await axios.get('/api/web-pages')
      webPages.value = res.data.pages || []
    } catch {}
  }

  async function toggleBot(bot_qq, enabled) {
    try {
      await axios.post('/api/bots/toggle', { bot_qq, enabled })
      await fetchBots()
      return true
    } catch {
      return false
    }
  }

  return {
    bots, currentBotId, currentBot, isAllBots,
    systemInfo, sidebarCollapsed, webPages,
    fetchBots, ensureBots, switchBot, fetchSystemInfo, fetchWebPages, toggleBot,
  }
})

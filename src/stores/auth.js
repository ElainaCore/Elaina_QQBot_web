import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from '../utils/axios'

localStorage.removeItem('elainaqq_token')

export const useAuthStore = defineStore('auth', () => {
  const loggedIn = ref(false)
  const checked = ref(false)
  const isLoggedIn = computed(() => loggedIn.value)
  const isWeakPassword = ref(localStorage.getItem('elainaqq_weak_pwd') === '1')

  async function login(password) {
    try {
      const res = await axios.post('/api/auth/login', { password })
      if (res.data.success) {
        loggedIn.value = true
        checked.value = true
        const weak = res.data.is_weak === true
        isWeakPassword.value = weak
        if (weak) localStorage.setItem('elainaqq_weak_pwd', '1')
        else localStorage.removeItem('elainaqq_weak_pwd')
        return true
      }
      throw new Error(res.data.error || '登录失败')
    } catch (e) {
      const msg = e.response?.data?.error || e.message || '登录失败'
      throw new Error(msg)
    }
  }

  function logout() {
    loggedIn.value = false
    checked.value = true
    localStorage.removeItem('elainaqq_weak_pwd')
    isWeakPassword.value = false
    axios.post('/api/auth/logout').catch(() => {})
  }

  async function checkSession() {
    try {
      loggedIn.value = (await axios.get('/api/auth/check')).data.success === true
    } catch {
      loggedIn.value = false
    }
    checked.value = true
    return loggedIn.value
  }

  return { checked, isLoggedIn, isWeakPassword, login, logout, checkSession }
})

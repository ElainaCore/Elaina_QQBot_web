import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { guest: true },
  },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    meta: { auth: true },
    children: [
      { path: '', name: 'Dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'bots', name: 'Bots', component: () => import('../views/Bots.vue') },
      { path: 'logs', name: 'Logs', component: () => import('../views/Logs.vue') },
      { path: 'plugins', name: 'Plugins', component: () => import('../views/Plugins.vue') },
      { path: 'messages', name: 'Messages', component: () => import('../views/Messages.vue') },
      { path: 'market', name: 'Market', component: () => import('../views/Market.vue') },
      { path: 'update', name: 'Update', component: () => import('../views/Update.vue') },
      { path: 'database', name: 'Database', component: () => import('../views/Database.vue') },
      { path: 'network', redirect: { name: 'Bots', query: { view: 'network' } } },
      { path: 'config', name: 'Config', component: () => import('../views/Config.vue') },
      { path: 'custom/:key', name: 'CustomPage', component: () => import('../views/CustomPage.vue') },
    ],
  },
]

const router = createRouter({
  history: createWebHistory('/web/'),
  routes,
})

router.beforeEach(async to => {
  const auth = useAuthStore()
  if (!auth.checked) await auth.checkSession()
  if (to.meta.auth && !auth.isLoggedIn) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guest && auth.isLoggedIn) return { name: 'Dashboard' }
  return true
})

export default router

<script setup>
import { computed } from 'vue'
import { darkTheme, NConfigProvider, NDialogProvider, NMessageProvider, NNotificationProvider } from 'naive-ui'
import { useThemeStore } from './stores/theme'

const themeStore = useThemeStore()
const overrides = computed(() => themeStore.naiveOverrides(themeStore.theme))
const naiveTheme = computed(() => themeStore.darkMode ? darkTheme : null)
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="overrides">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <router-view />
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
@media(max-width:767px) {
  html,body { overflow-x:hidden; -webkit-text-size-adjust:100% }
  input,select,textarea { font-size:16px !important }
  .n-modal { max-width:95vw !important }
  .n-card { max-width:100% !important }
  .n-data-table { font-size:12px }
  .n-descriptions { font-size:12px }
}
</style>

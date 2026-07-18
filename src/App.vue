<script setup lang="ts">
import { HappyProvider } from '@antdv-next/happy-work-theme'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { error } from '@tauri-apps/plugin-log'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useEventListener } from '@vueuse/core'
import { ConfigProvider, theme } from 'antdv-next'
import { isString } from 'es-toolkit'
import isURL from 'is-url'
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'

import { useTauriListen } from './composables/useTauriListen'
import { useWindowState } from './composables/useWindowState'
import { LANGUAGE, LISTEN_KEY } from './constants'
import { getAntdLocale } from './locales/index.ts'
import { hideWindow, showWindow } from './plugins/window'
import { useAppStore } from './stores/app'
import { useBuddyStore } from './stores/buddy'
import { useCatStore } from './stores/cat'
import { useGeneralStore } from './stores/general'
import { useModelStore } from './stores/model'
import { useShortcutStore } from './stores/shortcut.ts'
import { useStatsStore } from './stores/stats'

const appStore = useAppStore()
const modelStore = useModelStore()
const catStore = useCatStore()
const generalStore = useGeneralStore()
const shortcutStore = useShortcutStore()
const statsStore = useStatsStore()
const buddyStore = useBuddyStore()
const appWindow = getCurrentWebviewWindow()
const { isRestored, restoreState } = useWindowState()
const { darkAlgorithm, defaultAlgorithm } = theme
const { locale } = useI18n()

// ── Buddy auto-connect + stats push timer ──
let pushTimer: ReturnType<typeof setInterval> | null = null

function startBuddyPushTimer() {
  stopBuddyPushTimer()
  pushTimer = setInterval(() => {
    buddyStore.pushStats({
      key_presses: statsStore.todayKeyPresses,
      mouse_clicks: statsStore.todayMouseClicks,
      active_sec: statsStore.todayActiveSeconds,
    })
  }, 2000)
}

watch(() => buddyStore.connected, (connected) => {
  if (connected) {
    startBuddyPushTimer()
  } else {
    stopBuddyPushTimer()
  }
})

function stopBuddyPushTimer() {
  if (pushTimer) {
    clearInterval(pushTimer)
    pushTimer = null
  }
}

async function autoConnectBuddy() {
  if (buddyStore.connected) return
  const { networkName, networkSecret, peerUri, nickname } = buddyStore
  if (!networkName || !networkSecret || !peerUri || !nickname) return

  try {
    await buddyStore.start()
  } catch (e: any) {
    buddyStore.error = typeof e === 'string' ? e : String(e)
  }
}

onMounted(async () => {
  await appStore.$tauri.start()
  await appStore.init()
  await modelStore.$tauri.start()
  await modelStore.init()
  await catStore.$tauri.start()
  catStore.init()
  await generalStore.$tauri.start()
  await generalStore.init()
  await shortcutStore.$tauri.start()
  shortcutStore.init()
  await statsStore.$tauri.start()
  statsStore.init()
  await restoreState()

  autoConnectBuddy()
})

useTauriListen(LISTEN_KEY.APP_EXITING, async () => {
  await statsStore.$tauri.saveNow()
  await appStore.$tauri.saveNow()
  await modelStore.$tauri.saveNow()
  await catStore.$tauri.saveNow()
  await generalStore.$tauri.saveNow()
  await shortcutStore.$tauri.saveNow()

  stopBuddyPushTimer()
  if (buddyStore.connected) {
    await buddyStore.stop()
  }
})

watch(() => generalStore.appearance.language, (value) => {
  locale.value = value ?? LANGUAGE.EN_US
})

useTauriListen(LISTEN_KEY.SHOW_WINDOW, ({ payload }) => {
  if (appWindow.label !== payload) return

  showWindow()
})

useTauriListen(LISTEN_KEY.HIDE_WINDOW, ({ payload }) => {
  if (appWindow.label !== payload) return

  hideWindow()
})

useEventListener('unhandledrejection', ({ reason }) => {
  const message = isString(reason) ? reason : JSON.stringify(reason)

  error(message)
})

useEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest('a')

  if (!link) return

  const { href, target } = link

  if (target === '_blank') return

  event.preventDefault()

  if (!isURL(href)) return

  openUrl(href)
})
</script>

<template>
  <HappyProvider
    v-slot="{ wave }"
    enabled
  >
    <ConfigProvider
      :locale="getAntdLocale(generalStore.appearance.language)"
      :theme="{
        algorithm: generalStore.appearance.isDark ? darkAlgorithm : defaultAlgorithm,
      }"
      :wave="wave"
    >
      <RouterView v-if="isRestored" />
    </ConfigProvider>
  </HappyProvider>
</template>

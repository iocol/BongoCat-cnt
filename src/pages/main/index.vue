<script setup lang="ts">
import type { MotionInfo } from 'easy-live2d'

import { convertFileSrc } from '@tauri-apps/api/core'
import { PhysicalSize } from '@tauri-apps/api/dpi'
import { Menu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { sep } from '@tauri-apps/api/path'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { exists, readDir } from '@tauri-apps/plugin-fs'
import { useDebounceFn, useEventListener } from '@vueuse/core'
import { round } from 'es-toolkit'
import { nth } from 'es-toolkit/compat'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { useAppMenu } from '@/composables/useAppMenu'
import { useDevice } from '@/composables/useDevice'
import { useGamepad } from '@/composables/useGamepad'
import { useModel } from '@/composables/useModel'
import { useTauriListen } from '@/composables/useTauriListen'
import { LISTEN_KEY } from '@/constants'
import { hideWindow, setAlwaysOnTop, setTaskbarVisibility, showWindow } from '@/plugins/window'
import { useBuddyStore } from '@/stores/buddy'
import { useCatStore } from '@/stores/cat'
import { useGeneralStore } from '@/stores/general.ts'
import { useModelStore } from '@/stores/model'
import { useStatsStore } from '@/stores/stats'
import { isImage } from '@/utils/is'
import live2d from '@/utils/live2d'
import { join } from '@/utils/path'
import { isWindows } from '@/utils/platform'
import { clearObject } from '@/utils/shared'

const { startListening } = useDevice()
const appWindow = getCurrentWebviewWindow()
const { modelSize, handleLoad, handleDestroy, handleResize, handleKeyChange } = useModel()
const catStore = useCatStore()
const { getBaseMenu, getExitMenu } = useAppMenu()
const modelStore = useModelStore()
const generalStore = useGeneralStore()
const resizing = ref(false)
const backgroundImagePath = ref<string>()
const { stickActive } = useGamepad()

const statsStore = useStatsStore()
const buddyStore = useBuddyStore()
const showStats = ref(false)
const statsPage = ref(0)
const MAX_STATS_PAGE = 1
const isGamepadMode = computed(() => modelStore.currentModel?.mode === 'gamepad')

const hasOnlineBuddies = computed(() => {
  return buddyStore.peers.some(p => p.online)
})

const topPeers = computed(() => {
  return [...buddyStore.peers]
    .filter(p => p.online)
    .sort((a, b) => (b.today.key_presses + b.today.mouse_clicks) - (a.today.key_presses + a.today.mouse_clicks))
    .slice(0, 3)
})

onMounted(() => {
  startListening()
})

onUnmounted(handleDestroy)

// ---- Pause Live2D rendering when window is hidden or unfocused ----
function updateRenderState() {
  const visible = catStore.window.visible && document.visibilityState === 'visible'
  if (visible) {
    live2d.resume()
  } else {
    live2d.pause()
  }
}

watch(() => catStore.window.visible, updateRenderState)
useEventListener('visibilitychange', updateRenderState)

const debouncedResize = useDebounceFn(async () => {
  await handleResize()

  resizing.value = false
}, 100)

useEventListener('resize', () => {
  resizing.value = true

  debouncedResize()
})

watch(() => modelStore.currentModel, async (model) => {
  if (!model) return

  await handleLoad()

  const path = join(model.path, 'resources', 'background.png')

  const existed = await exists(path)

  backgroundImagePath.value = existed ? convertFileSrc(path) : void 0

  clearObject([modelStore.supportKeys, modelStore.pressedKeys])

  const resourcePath = join(model.path, 'resources')
  const groups = ['left-keys', 'right-keys']

  for await (const groupName of groups) {
    const groupDir = join(resourcePath, groupName)
    const files = await readDir(groupDir).catch(() => [])
    const imageFiles = files.filter(file => isImage(file.name))

    for (const file of imageFiles) {
      const fileName = file.name.split('.')[0]

      modelStore.supportKeys[fileName] = join(groupDir, file.name)
    }
  }

  modelStore.modelReady = true
}, { deep: true, immediate: true })

watch([() => catStore.window.scale, modelSize], async ([scale, modelSize]) => {
  if (!modelSize) return

  const { width, height } = modelSize

  appWindow.setSize(
    new PhysicalSize({
      width: Math.round(width * (scale / 100)),
      height: Math.round(height * (scale / 100)),
    }),
  )
}, { immediate: true })

watch([modelStore.pressedKeys, stickActive], ([keys, stickActive]) => {
  const dirs = Object.values(keys).map((path) => {
    return nth(path.split(sep()), -2)!
  })

  const hasLeft = dirs.some(dir => dir.startsWith('left'))
  const hasRight = dirs.some(dir => dir.startsWith('right'))

  handleKeyChange(true, stickActive.left || hasLeft)
  handleKeyChange(false, stickActive.right || hasRight)
}, { deep: true })

watch(() => catStore.window.visible, async (value) => {
  value ? showWindow() : hideWindow()
})

watch(() => catStore.window.passThrough, (value) => {
  appWindow.setIgnoreCursorEvents(value)
}, { immediate: true })

watch(() => catStore.window.alwaysOnTop, setAlwaysOnTop, { immediate: true })

watch(() => generalStore.app.taskbarVisible, setTaskbarVisibility, { immediate: true })

watch(() => catStore.model.motionSound, live2d.setMotionSoundEnabled, { immediate: true })

watch(() => catStore.model.maxFPS, live2d.setMaxFPS, { immediate: true })

useTauriListen<MotionInfo>(LISTEN_KEY.START_MOTION, ({ payload }) => {
  live2d.startMotion(payload)
})

useTauriListen<number>(LISTEN_KEY.SET_EXPRESSION, ({ payload }) => {
  live2d.setExpression(payload)
})

function handleMouseDown() {
  appWindow.startDragging()
}

async function handleContextmenu(event: MouseEvent) {
  event.preventDefault()

  if (event.shiftKey) return

  const menu = await Menu.new({
    items: [
      ...await getBaseMenu(),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      ...await getExitMenu(),
    ],
  })

  // Temporarily disable always-on-top on Windows so the context menu is not covered
  if (isWindows && catStore.window.alwaysOnTop) {
    setAlwaysOnTop(false)
  }

  await menu.popup()

  // Restore always-on-top after the menu is closed
  if (!isWindows || !catStore.window.alwaysOnTop) return

  setAlwaysOnTop(true)
}

function handleMouseMove(event: MouseEvent) {
  const { buttons, shiftKey, movementX, movementY } = event

  if (buttons !== 2 || !shiftKey) return

  const delta = (movementX + movementY) * 0.5
  const nextScale = Math.max(10, Math.min(catStore.window.scale + delta, 500))

  catStore.window.scale = round(nextScale)
}

function formatNumber(n: number): string {
  if (n >= 10000000) {
    return `${(n / 10000).toFixed(2)}w`
  }
  if (n >= 100000) {
    return `${(n / 1000).toFixed(2)}k`
  }
  return n.toLocaleString()
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h${m}m`
  return `${m}m`
}

function handleStatsClick() {
  if (!showStats.value) return

  statsPage.value = (statsPage.value + 1) % (MAX_STATS_PAGE + 1)
}

function handleStatsContextMenu(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()

  showStats.value = !showStats.value
  if (showStats.value) {
    statsPage.value = 0
  }
}
</script>

<template>
  <div
    class="relative size-screen overflow-hidden children:(absolute size-full)"
    :class="{ '-scale-x-100': catStore.model.mirror }"
    :style="{
      opacity: catStore.window.opacity / 100,
      borderRadius: `${catStore.window.radius}%`,
    }"
    @contextmenu="handleContextmenu"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
  >
    <img
      v-if="backgroundImagePath"
      class="object-cover"
      :src="backgroundImagePath"
    >

    <canvas id="live2dCanvas" />

    <img
      v-for="path in modelStore.pressedKeys"
      :key="path"
      class="object-cover"
      :src="convertFileSrc(path)"
    >

    <div
      v-show="resizing || !modelStore.modelReady"
      class="flex items-center justify-center bg-black"
    >
      <span class="text-center text-[10vw] text-[#fff]">
        {{ resizing ? $t('pages.main.hints.redrawing') : $t('pages.main.hints.switching') }}
      </span>
    </div>

    <!-- 统计面板 -->
    <div
      v-if="statsStore.display.visible"
      class="stats-panel !h-auto !w-auto"
      :class="statsStore.display.position"
      @click="handleStatsClick"
      @contextmenu.stop.prevent="handleStatsContextMenu"
      @mousedown.stop
    >
      <span
        v-if="isGamepadMode"
        :class="{ 'pill-glow': hasOnlineBuddies }"
      >
        <span class="stat-pill">🎮{{ formatNumber(statsStore.todayGamepadPresses) }} 🕹️{{ formatTime(statsStore.todayGamepadStickSeconds) }}</span>
      </span>
      <span
        v-else
        :class="{ 'pill-glow': hasOnlineBuddies }"
      >
        <span class="stat-pill">⌨️{{ formatNumber(statsStore.todayKeyPresses) }} 🖱️{{ formatNumber(statsStore.todayMouseClicks) }}</span>
      </span>

      <!-- 详细统计 -->
      <Transition name="expand">
        <div
          v-if="showStats && statsPage === 0"
          class="stats-detail"
        >
          <template v-if="isGamepadMode">
            <div class="detail-section">
              <div class="detail-title">
                🎮 {{ $t('pages.main.stats.gamepadToday') }}
              </div>
              <div class="detail-row">
                <span>{{ $t('pages.main.stats.gamepadPresses') }}</span>
                <span class="detail-num">{{ formatNumber(statsStore.todayGamepadPresses) }}</span>
              </div>
              <div class="detail-row">
                <span>{{ $t('pages.main.stats.gamepadStickTime') }}</span>
                <span class="detail-num">{{ formatTime(statsStore.todayGamepadStickSeconds) }}</span>
              </div>
            </div>
            <div class="detail-section">
              <div class="detail-title">
                🕰️ {{ $t('pages.main.stats.lastTime') }}
              </div>
              <div class="detail-row">
                <span>{{ $t('pages.main.stats.gamepadPresses') }}</span>
                <span class="detail-num">{{ formatNumber(statsStore.lastGamepadPresses) }}</span>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="detail-section">
              <div class="detail-title">
                📅 {{ $t('pages.main.stats.activeToday') }}
              </div>
              <div class="detail-row">
                <span class="detail-num">{{ formatTime(statsStore.todayActiveSeconds) }}</span>
              </div>
            </div>
            <div class="detail-section">
              <div class="detail-title">
                🕰️ {{ $t('pages.main.stats.lastTime') }}
              </div>
              <div class="detail-row">
                <span>{{ $t('pages.main.stats.keys') }}</span>
                <span class="detail-num">{{ formatNumber(statsStore.lastKeyPresses) }}</span>
              </div>
              <div class="detail-row">
                <span>{{ $t('pages.main.stats.clicks') }}</span>
                <span class="detail-num">{{ formatNumber(statsStore.lastMouseClicks) }}</span>
              </div>
            </div>
          </template>
        </div>
      </Transition>

      <!-- 好友榜 -->
      <Transition name="expand">
        <div
          v-if="showStats && statsPage === 1"
          class="stats-detail"
        >
          <div
            v-if="topPeers.length === 0"
            class="detail-row"
          >
            <span>{{ $t('pages.main.stats.noBuddies') }}</span>
          </div>

          <template v-else>
            <div
              v-for="(peer, idx) in topPeers"
              :key="peer.virtual_ip"
              class="detail-peer-row"
            >
              <div class="peer-line">
                <span class="peer-name">{{ ['🥇', '🥈', '🥉'][idx] }} {{ peer.nickname }}</span>
                <span class="peer-time">⏱️{{ formatTime(peer.today.active_sec) }}</span>
              </div>
              <div class="peer-line peer-stats">
                <span class="detail-num">⌨️{{ formatNumber(peer.today.key_presses) }}</span>
                <span class="detail-num">🖱️{{ formatNumber(peer.today.mouse_clicks) }}</span>
              </div>
            </div>
          </template>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
@property --angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

.stats-panel {
  position: absolute;
  z-index: 10;
  user-select: none;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;

  &.top-left {
    top: 4px !important;
    left: 4px !important;
    bottom: auto !important;
    right: auto !important;
  }

  &.top-right {
    top: 4px !important;
    right: 4px !important;
    bottom: auto !important;
    left: auto !important;
  }

  &.bottom-left {
    bottom: 4px !important;
    left: 4px !important;
    top: auto !important;
    right: auto !important;
  }

  &.bottom-right {
    bottom: 4px !important;
    right: 4px !important;
    top: auto !important;
    left: auto !important;
  }
}

.pill-glow {
  position: relative;
  display: inline-flex;
  align-self: flex-start;

  &::before {
    content: '';
    position: absolute;
    inset: -1.5px;
    padding: 1.5px;
    border-radius: 11.5px;
    background: conic-gradient(from var(--angle, 0deg), #ff6b9d, #c471f5, #6bc5f5, #5ce6b0, #ffd93d, #ff6b9d);
    animation: pill-glow 3s linear infinite;
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask-composite: exclude;
  }
}

.stat-pill {
  display: inline-flex;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 10px;
  font-family: 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  line-height: 1.6;
  background: rgba(0, 0, 0, 0.4);
}

@keyframes pill-glow {
  to {
    --angle: 360deg;
  }
}

.stats-detail {
  margin-top: 4px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 4px;

  &:last-child {
    margin-bottom: 0;
  }
}

.detail-title {
  font-size: 10px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.03em;
  margin-bottom: 1px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 1px 4px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.detail-num {
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
}

.detail-peer-row {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.7);
  font-variant-numeric: tabular-nums;

  .peer-line {
    display: flex;
    justify-content: space-between;
  }

  .peer-stats {
    justify-content: flex-start;
    gap: 8px;
  }

  .peer-name {
    font-size: 10px;
    color: rgba(255, 165, 80, 0.95);
  }

  .peer-time {
    color: rgba(255, 255, 255, 0.7);
    font-size: 9px;
    font-weight: 400;
  }
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.15s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  padding: 0 8px;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 100px;
}
</style>

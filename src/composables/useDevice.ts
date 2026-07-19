import { invoke } from '@tauri-apps/api/core'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { isNil } from 'es-toolkit'
import { Ticker } from 'pixi.js'
import { onMounted, onUnmounted, ref, watch } from 'vue'

import { useAppStore } from '@/stores/app'
import { useCatStore } from '@/stores/cat'
import { useModelStore } from '@/stores/model'
import { useStatsStore } from '@/stores/stats'
import { inBetween } from '@/utils/is'
import { isMac, isWindows } from '@/utils/platform'

import { INVOKE_KEY, LISTEN_KEY, WINDOW_LABEL } from '../constants'
import { useModel } from './useModel'
import { useTauriListen } from './useTauriListen'

interface MouseButtonEvent {
  kind: 'MousePress' | 'MouseRelease'
  value: string
}

export interface CursorPoint {
  x: number
  y: number
}

interface MouseMoveEvent {
  kind: 'MouseMove'
  value: CursorPoint
}

interface KeyboardEvent {
  kind: 'KeyboardPress' | 'KeyboardRelease'
  value: string
}

type DeviceEvent = MouseButtonEvent | MouseMoveEvent | KeyboardEvent

const DAMPING_DECAY = 0.75
const appWindow = getCurrentWebviewWindow()

export function useDevice() {
  const modelStore = useModelStore()
  const releaseTimers = new Map<string, NodeJS.Timeout>()
  const appStore = useAppStore()
  const catStore = useCatStore()
  const statsStore = useStatsStore()
  const latestCursorPoint = ref<CursorPoint>()
  const smoothedCursorPoint = ref<CursorPoint>()
  const scaleFactor = ref(1)
  const { handlePress, handleRelease, handleMouseChange, handleMouseMove } = useModel()

  // Reusable objects to avoid per-frame allocations
  const _current = { x: 0, y: 0 }
  const _destination = { x: 0, y: 0 }
  const _interpolated = { x: 0, y: 0 }

  // Track currently held keys/mouse buttons so repeat events don't double-count
  const pressedKeys = new Set<string>()
  const pressedMouse = new Set<string>()

  const tickerCallback = (ticker: Ticker) => {
    const dest = latestCursorPoint.value

    if (!dest) return

    const cur = smoothedCursorPoint.value ?? dest

    const alpha = 1 - DAMPING_DECAY ** (ticker.deltaMS / (1000 / 60))

    _current.x = cur.x
    _current.y = cur.y
    _destination.x = dest.x
    _destination.y = dest.y

    _interpolated.x = _current.x + (_destination.x - _current.x) * alpha
    _interpolated.y = _current.y + (_destination.y - _current.y) * alpha

    if (Math.hypot(_destination.x - _interpolated.x, _destination.y - _interpolated.y) < 0.5) {
      smoothedCursorPoint.value = { x: _destination.x, y: _destination.y }

      latestCursorPoint.value = void 0
    } else {
      smoothedCursorPoint.value = { x: _interpolated.x, y: _interpolated.y }
    }

    handleCursorMove(smoothedCursorPoint.value)
  }

  onMounted(async () => {
    scaleFactor.value = isMac ? await appWindow.scaleFactor() : 1

    appWindow.onScaleChanged(({ payload }) => {
      if (!isMac) return

      scaleFactor.value = payload.scaleFactor
    })
  })

  onUnmounted(() => {
    Ticker.shared.remove(tickerCallback)
  })

  watch(() => catStore.model.ignoreMouse, (value) => {
    if (value) {
      return Ticker.shared.remove(tickerCallback)
    }

    return Ticker.shared.add(tickerCallback)
  }, { immediate: true })

  const startListening = () => {
    invoke(INVOKE_KEY.START_DEVICE_LISTENING)
  }

  const getSupportedKey = (key: string) => {
    let nextKey = key

    const unsupportedKey = !modelStore.supportKeys[nextKey]

    if (key.startsWith('F') && unsupportedKey) {
      nextKey = key.replace(/F(\d+)/, 'Fn')
    }

    for (const item of ['Meta', 'Shift', 'Alt', 'Control']) {
      if (key.startsWith(item) && unsupportedKey) {
        const regex = new RegExp(`^(${item}).*`)
        nextKey = key.replace(regex, '$1')
      }
    }

    return nextKey
  }

  const onHideOnHover = (() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let wasInWindow = false

    return (x: number, y: number) => {
      const { x: winX, y: winY, width, height } = appStore.windowState[WINDOW_LABEL.MAIN] ?? {}

      if (isNil(winX) || isNil(winY) || isNil(width) || isNil(height)) return

      const isInWindow = inBetween(x, winX, winX + width)
        && inBetween(y, winY, winY + height)

      if (isInWindow === wasInWindow) return

      if (timer) {
        clearTimeout(timer)

        timer = void 0
      }

      if (isInWindow) {
        timer = setTimeout(() => {
          document.body.style.setProperty('opacity', '0')

          appWindow.setIgnoreCursorEvents(true)
        }, catStore.window.hideOnHoverDelay * 1000)
      } else {
        document.body.style.setProperty('opacity', 'unset')

        appWindow.setIgnoreCursorEvents(catStore.window.passThrough)
      }

      wasInWindow = isInWindow
    }
  })()

  // Reusable PhysicalPosition to avoid allocation per frame
  let _pos: PhysicalPosition | null = null

  const handleCursorMove = async (cursorPoint: CursorPoint) => {
    const x = cursorPoint.x * scaleFactor.value
    const y = cursorPoint.y * scaleFactor.value

    if (!_pos || _pos.x !== x || _pos.y !== y) {
      _pos = new PhysicalPosition(x, y)
    }
    handleMouseMove(_pos)

    if (!catStore.window.hideOnHover) return

    onHideOnHover(x, y)
  }

  const handleAutoRelease = (key: string, delay = 100) => {
    handlePress(key)

    if (releaseTimers.has(key)) {
      clearTimeout(releaseTimers.get(key))
    }

    const timer = setTimeout(() => {
      handleRelease(key)

      releaseTimers.delete(key)
    }, delay)

    releaseTimers.set(key, timer)
  }

  useTauriListen<DeviceEvent>(LISTEN_KEY.DEVICE_CHANGED, ({ payload }) => {
    const { kind, value } = payload

    if (kind === 'KeyboardPress' || kind === 'KeyboardRelease') {
      if (kind === 'KeyboardPress') {
        // Only count on first press, not on auto-repeat
        if (!pressedKeys.has(value)) {
          pressedKeys.add(value)
          statsStore.incrementKeyPress()
        }
      } else {
        pressedKeys.delete(value)
      }

      const nextValue = getSupportedKey(value)

      if (!nextValue) return

      if (nextValue === 'CapsLock') {
        return handleAutoRelease(nextValue)
      }

      if (kind === 'KeyboardPress') {
        if (isWindows) {
          const delay = catStore.model.autoReleaseDelay * 1000

          return handleAutoRelease(nextValue, delay)
        }

        return handlePress(nextValue)
      }

      return handleRelease(nextValue)
    }

    switch (kind) {
      case 'MousePress':
        // Only count on first press, not on hold-repeat
        if (!pressedMouse.has(value)) {
          pressedMouse.add(value)
          statsStore.incrementMouseClick()
        }
        return handleMouseChange(value)
      case 'MouseRelease':
        pressedMouse.delete(value)
        return handleMouseChange(value, false)
      case 'MouseMove':
        return latestCursorPoint.value = value
    }
  })

  return {
    startListening,
  }
}

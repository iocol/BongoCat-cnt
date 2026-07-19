import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export interface DailyRecord {
  keyPresses: number
  mouseClicks: number
  activeSeconds: number
  gamepadPresses: number
  gamepadStickSeconds: number
}

export interface StatsStore {
  display: {
    visible: boolean
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  }
}

export const useStatsStore = defineStore('stats', () => {
  const display = reactive<StatsStore['display']>({
    visible: true,
    position: 'bottom-left',
  })

  // ---- persisted fields ----
  const todayDate = ref('')
  const todayActiveSeconds = ref(0)
  const todayKeyPresses = ref(0)
  const todayMouseClicks = ref(0)
  const todayGamepadPresses = ref(0)
  const todayGamepadStickSeconds = ref(0)
  const lastKeyPresses = ref(0)
  const lastMouseClicks = ref(0)
  const lastGamepadPresses = ref(0)
  const dailyRecords = reactive<Record<string, DailyRecord>>({})

  // ---- internal timer ----
  let timerInterval: ReturnType<typeof setInterval> | null = null
  let saveTimer: ReturnType<typeof setInterval> | null = null
  const IDLE_THRESHOLD = 5000
  const lastActivityTime = ref(0)
  const lastGamepadStickTime = ref(0)

  /** Get local date string YYYY-MM-DD */
  const getLocalDateString = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  const notifyActivity = () => {
    lastActivityTime.value = Date.now()
  }

  /**
   * Archive current today values to dailyRecords.
   */
  const archiveRecord = () => {
    const date = todayDate.value || getLocalDateString()
    dailyRecords[date] = {
      keyPresses: todayKeyPresses.value,
      mouseClicks: todayMouseClicks.value,
      activeSeconds: todayActiveSeconds.value,
      gamepadPresses: todayGamepadPresses.value,
      gamepadStickSeconds: todayGamepadStickSeconds.value,
    }
  }

  /**
   * Check and handle date change.
   * When the date changes, archive the previous day and reset counters.
   */
  const checkDailyReset = () => {
    const today = getLocalDateString()

    if (!todayDate.value) {
      todayDate.value = today
      return
    }

    if (todayDate.value === today) {
      return
    }

    // Date changed: archive previous day and reset
    archiveRecord()

    lastKeyPresses.value = todayKeyPresses.value
    lastMouseClicks.value = todayMouseClicks.value
    lastGamepadPresses.value = todayGamepadPresses.value

    todayActiveSeconds.value = 0
    todayKeyPresses.value = 0
    todayMouseClicks.value = 0
    todayGamepadPresses.value = 0
    todayGamepadStickSeconds.value = 0
    todayDate.value = today
  }

  const startTimer = () => {
    if (timerInterval) return
    timerInterval = setInterval(() => {
      checkDailyReset()
      const now = Date.now()
      if (lastActivityTime.value > 0 && now - lastActivityTime.value < IDLE_THRESHOLD) {
        todayActiveSeconds.value++
      }
      if (lastGamepadStickTime.value > 0 && now - lastGamepadStickTime.value < IDLE_THRESHOLD) {
        todayGamepadStickSeconds.value++
      }
    }, 1000)
  }

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  // Periodic persist - explicit saveNow avoids saveOnChange race on slow machines
  const startSaveTimer = () => {
    if (saveTimer) return
    saveTimer = setInterval(() => {
      archiveRecord()
      // $tauri.saveNow() is called in App.vue on exit; this is belt-and-suspenders
    }, 30000)
  }

  const stopSaveTimer = () => {
    if (saveTimer) {
      clearInterval(saveTimer)
      saveTimer = null
    }
  }

  const incrementKeyPress = () => {
    todayKeyPresses.value++
    notifyActivity()
  }

  const incrementMouseClick = () => {
    todayMouseClicks.value++
    notifyActivity()
  }

  const incrementGamepadPress = () => {
    todayGamepadPresses.value++
    notifyActivity()
  }

  const notifyGamepadStickActivity = () => {
    lastGamepadStickTime.value = Date.now()
    notifyActivity()
  }

  const stopGamepadStickTimer = () => {
    lastGamepadStickTime.value = 0
  }

  const resetAll = () => {
    const today = getLocalDateString()
    todayActiveSeconds.value = 0
    todayKeyPresses.value = 0
    todayMouseClicks.value = 0
    todayGamepadPresses.value = 0
    todayGamepadStickSeconds.value = 0
    lastKeyPresses.value = 0
    lastMouseClicks.value = 0
    lastGamepadPresses.value = 0
    Object.keys(dailyRecords).forEach((key) => {
      delete dailyRecords[key]
    })
    todayDate.value = today
  }

  const init = () => {
    checkDailyReset()
    archiveRecord()
    startTimer()
    startSaveTimer()
  }

  return {
    display,
    todayDate,
    todayActiveSeconds,
    todayKeyPresses,
    todayMouseClicks,
    todayGamepadPresses,
    todayGamepadStickSeconds,
    lastKeyPresses,
    lastMouseClicks,
    lastGamepadPresses,
    dailyRecords,
    getLocalDateString,
    incrementKeyPress,
    incrementMouseClick,
    incrementGamepadPress,
    notifyGamepadStickActivity,
    stopGamepadStickTimer,
    resetAll,
    init,
    stopTimer,
    stopSaveTimer,
  }
}, {
  tauri: {
    filterKeys: ['lastActivityTime', 'lastGamepadStickTime'],
  },
})

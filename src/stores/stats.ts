import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

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

  // ---- 持久化字段 ----
  const todayDate = ref('')
  const todayActiveSeconds = ref(0)
  const todayKeyPresses = ref(0)
  const todayMouseClicks = ref(0)
  const lastKeyPresses = ref(0)
  const lastMouseClicks = ref(0)

  // ---- 内部计时 ----
  let timerInterval: ReturnType<typeof setInterval> | null = null
  const IDLE_THRESHOLD = 5000
  const lastActivityTime = ref(0)

  /** 获取北京时间 YYYY-MM-DD */
  const getBeijingDateString = () => {
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const Beijing = new Date(utc + 8 * 3600000)
    return `${Beijing.getFullYear()}-${String(Beijing.getMonth() + 1).padStart(2, '0')}-${String(Beijing.getDate()).padStart(2, '0')}`
  }

  const notifyActivity = () => {
    lastActivityTime.value = Date.now()
  }

  /**
   * 检查并处理日期切换。
   * 无论应用连续运行跨天，还是停多天后重新打开，都会将上一次的数据归档到「上次记录」。
   */
  const checkDailyReset = () => {
    const today = getBeijingDateString()

    if (!todayDate.value || todayDate.value === today) {
      todayDate.value = today
      return
    }

    // 日期已变化：将上一次的数据归档到上次记录
    lastKeyPresses.value = todayKeyPresses.value
    lastMouseClicks.value = todayMouseClicks.value

    // 重置今日数据
    todayActiveSeconds.value = 0
    todayKeyPresses.value = 0
    todayMouseClicks.value = 0
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
    }, 1000)
  }

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
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

  const resetAll = () => {
    todayActiveSeconds.value = 0
    todayKeyPresses.value = 0
    todayMouseClicks.value = 0
    lastKeyPresses.value = 0
    lastMouseClicks.value = 0
    todayDate.value = getBeijingDateString()
  }

  const init = () => {
    checkDailyReset()
    startTimer()
  }

  return {
    display,
    todayDate,
    todayActiveSeconds,
    todayKeyPresses,
    todayMouseClicks,
    lastKeyPresses,
    lastMouseClicks,
    incrementKeyPress,
    incrementMouseClick,
    resetAll,
    init,
    stopTimer,
  }
}, {
  tauri: {
    filterKeys: ['lastActivityTime'],
  },
})

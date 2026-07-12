import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export interface DailyRecord {
  keyPresses: number
  mouseClicks: number
  activeSeconds: number
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

  // ---- 持久化字段 ----
  const todayDate = ref('')
  const todayActiveSeconds = ref(0)
  const todayKeyPresses = ref(0)
  const todayMouseClicks = ref(0)
  const lastKeyPresses = ref(0)
  const lastMouseClicks = ref(0)
  const dailyRecords = reactive<Record<string, DailyRecord>>({})

  // ---- 内部计时 ----
  let timerInterval: ReturnType<typeof setInterval> | null = null
  const IDLE_THRESHOLD = 5000
  const lastActivityTime = ref(0)

  /** 获取本地日期字符串 YYYY-MM-DD */
  const getLocalDateString = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  const notifyActivity = () => {
    lastActivityTime.value = Date.now()
  }

  /**
   * 将指定日期的数据归档到日历记录中。
   */
  const archiveRecord = (date: string) => {
    dailyRecords[date] = {
      keyPresses: todayKeyPresses.value,
      mouseClicks: todayMouseClicks.value,
      activeSeconds: todayActiveSeconds.value,
    }
  }

  /**
   * 检查并处理日期切换。
   * 无论应用连续运行跨天，还是停多天后重新打开，都会将上一次的数据归档到日历记录与「上次记录」。
   */
  const checkDailyReset = () => {
    const today = getLocalDateString()

    if (!todayDate.value) {
      todayDate.value = today
      return
    }

    if (todayDate.value === today) {
      archiveRecord(today)
      return
    }

    // 日期已变化：将前一天的数据归档到日历记录和上次记录
    archiveRecord(todayDate.value)

    lastKeyPresses.value = todayKeyPresses.value
    lastMouseClicks.value = todayMouseClicks.value

    // 重置今日数据
    todayActiveSeconds.value = 0
    todayKeyPresses.value = 0
    todayMouseClicks.value = 0
    todayDate.value = today

    archiveRecord(today)
  }

  const startTimer = () => {
    if (timerInterval) return
    timerInterval = setInterval(() => {
      checkDailyReset()
      const now = Date.now()
      if (lastActivityTime.value > 0 && now - lastActivityTime.value < IDLE_THRESHOLD) {
        todayActiveSeconds.value++
        archiveRecord(todayDate.value || getLocalDateString())
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
    archiveRecord(todayDate.value || getLocalDateString())
    notifyActivity()
  }

  const incrementMouseClick = () => {
    todayMouseClicks.value++
    archiveRecord(todayDate.value || getLocalDateString())
    notifyActivity()
  }

  const resetAll = () => {
    const today = getLocalDateString()
    todayActiveSeconds.value = 0
    todayKeyPresses.value = 0
    todayMouseClicks.value = 0
    lastKeyPresses.value = 0
    lastMouseClicks.value = 0
    Object.keys(dailyRecords).forEach((key) => {
      delete dailyRecords[key]
    })
    todayDate.value = today
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
    dailyRecords,
    getLocalDateString,
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

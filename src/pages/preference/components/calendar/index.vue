<script setup lang="ts">
import { LeftOutlined, RightOutlined } from '@antdv-next/icons'
import { Button } from 'antdv-next'
import { computed, ref } from 'vue'

import { useStatsStore } from '@/stores/stats'

interface MonthStats {
  keyPresses: number
  mouseClicks: number
  activeSeconds: number
  daysWithRecord: number
}

const emit = defineEmits<{
  (e: 'back'): void
}>()

const statsStore = useStatsStore()

const today = computed(() => {
  return statsStore.getLocalDateString()
})

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth() + 1)

function goToday() {
  const now = new Date()
  currentYear.value = now.getFullYear()
  currentMonth.value = now.getMonth() + 1
}

function prevMonth() {
  if (currentMonth.value === 1) {
    currentMonth.value = 12
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

function nextMonth() {
  if (currentMonth.value === 12) {
    currentMonth.value = 1
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

const monthTitle = computed(() => {
  return `${currentYear.value}年 ${currentMonth.value}月`
})

/**
 * 根据年月日获取本地日期字符串 YYYY-MM-DD。
 */
function getLocalDateString(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * 获取指定日期的实时或存档记录，优先使用实时今日数据。
 */
function getRecord(dateStr: string, todayStr: string) {
  return dateStr === todayStr
    ? {
        keyPresses: statsStore.todayKeyPresses,
        mouseClicks: statsStore.todayMouseClicks,
        activeSeconds: statsStore.todayActiveSeconds,
      }
    : statsStore.dailyRecords[dateStr]
}

const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const todayStr = today.value
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startDayOfWeek = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const days: Array<{ date: number, dateString: string, isCurrentMonth: boolean, record?: { keyPresses: number, mouseClicks: number, activeSeconds: number } }> = []

  // 补充上个月的日期，用于填充第一行
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i
    days.push({
      date: day,
      dateString: getLocalDateString(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1, day),
      isCurrentMonth: false,
    })
  }

  // 当月日期
  for (let i = 1; i <= daysInMonth; i++) {
    const dateString = getLocalDateString(year, month, i)
    days.push({
      date: i,
      dateString,
      isCurrentMonth: true,
      record: getRecord(dateString, todayStr),
    })
  }

  // 补充下个月的日期，填满 42 个格子（6 行 x 7 列）
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    days.push({
      date: i,
      dateString: getLocalDateString(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, i),
      isCurrentMonth: false,
    })
  }

  return days
})

const monthStats = computed<MonthStats>(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const todayStr = today.value

  let keyPresses = 0
  let mouseClicks = 0
  let activeSeconds = 0
  let daysWithRecord = 0

  // 遍历当月所有日期
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = getLocalDateString(year, month, day)
    const record = getRecord(dateStr, todayStr)

    if (record) {
      keyPresses += record.keyPresses
      mouseClicks += record.mouseClicks
      activeSeconds += record.activeSeconds
      daysWithRecord++
    }
  }

  return { keyPresses, mouseClicks, activeSeconds, daysWithRecord }
})

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
</script>

<template>
  <div class="calendar-container">
    <div class="calendar-header">
      <Button
        class="back-button"
        type="text"
        @click="emit('back')"
      >
        <template #icon>
          <span class="text-base">←</span>
        </template>
        {{ $t('pages.preference.cat.buttons.backToSettings') }}
      </Button>
    </div>

    <div class="calendar-toolbar">
      <div class="month-navigation">
        <Button
          class="nav-button"
          shape="circle"
          size="small"
          type="text"
          @click="prevMonth"
        >
          <LeftOutlined />
        </Button>

        <div class="month-title">
          {{ monthTitle }}
        </div>

        <Button
          class="nav-button"
          shape="circle"
          size="small"
          type="text"
          @click="nextMonth"
        >
          <RightOutlined />
        </Button>
      </div>

      <Button
        class="today-button"
        size="small"
        type="primary"
        @click="goToday"
      >
        <template #icon>
          <span>📅</span>
        </template>
        {{ $t('pages.preference.cat.buttons.today') }}
      </Button>
    </div>

    <div class="month-stats-container">
      <div class="month-stats-title">
        📊 {{ monthTitle }} 统计
      </div>
      <div class="month-stats-grid">
        <div class="month-stat-item">
          <span class="month-stat-icon">⌨️</span>
          <div class="month-stat-content">
            <div class="month-stat-value">
              {{ formatNumber(monthStats.keyPresses) }}
            </div>
            <div class="month-stat-label">
              按键
            </div>
          </div>
        </div>
        <div class="month-stat-item">
          <span class="month-stat-icon">🖱️</span>
          <div class="month-stat-content">
            <div class="month-stat-value">
              {{ formatNumber(monthStats.mouseClicks) }}
            </div>
            <div class="month-stat-label">
              点击
            </div>
          </div>
        </div>
        <div class="month-stat-item">
          <span class="month-stat-icon">⏱</span>
          <div class="month-stat-content">
            <div class="month-stat-value">
              {{ formatTime(monthStats.activeSeconds) }}
            </div>
            <div class="month-stat-label">
              活跃
            </div>
          </div>
        </div>
        <div class="month-stat-item">
          <span class="month-stat-icon">📅</span>
          <div class="month-stat-content">
            <div class="month-stat-value">
              {{ monthStats.daysWithRecord }}
            </div>
            <div class="month-stat-label">
              天
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="calendar-grid">
      <div class="weekday-header">
        <div
          v-for="day in ['日', '一', '二', '三', '四', '五', '六']"
          :key="day"
          class="weekday-cell"
        >
          {{ day }}
        </div>
      </div>

      <div class="days-grid">
        <div
          v-for="day in calendarDays"
          :key="day.dateString"
          class="day-cell"
          :class="{
            'is-today': day.isCurrentMonth && day.dateString === today,
            'other-month': !day.isCurrentMonth,
            'has-record': day.record,
          }"
        >
          <div class="day-number">
            {{ day.date }}
          </div>

          <div
            v-if="day.record"
            class="day-stats"
          >
            <div class="stat-line">
              <span class="stat-icon">⌨️</span>
              <span class="stat-value">{{ formatNumber(day.record.keyPresses) }}</span>
            </div>
            <div class="stat-line">
              <span class="stat-icon">🖱️</span>
              <span class="stat-value">{{ formatNumber(day.record.mouseClicks) }}</span>
            </div>
            <div class="stat-line">
              <span class="stat-icon">⏱</span>
              <span class="stat-value">{{ formatTime(day.record.activeSeconds) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.calendar-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  background: var(--ant-color-fill-quaternary);
  border-radius: 16px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.calendar-header {
  margin-bottom: 16px;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--ant-color-text);
  background: transparent;
  transition: all 0.2s ease;

  &:hover {
    background: var(--ant-color-fill-tertiary);
  }
}

.calendar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.month-navigation {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--ant-color-text);
  background: var(--ant-color-fill-tertiary);
  border-radius: 50%;
  transition: all 0.2s ease;

  &:hover {
    background: var(--ant-color-fill-secondary);
  }
}

.month-title {
  min-width: 120px;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--ant-color-text);
}

.today-button {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 8px;
}

.calendar-grid {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.weekday-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  margin-bottom: 8px;
}

.weekday-cell {
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--ant-color-text-secondary);
  padding: 8px 0;
}

.days-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(6, 1fr);
  gap: 8px;
  min-height: 0;
}

.day-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 6px;
  border-radius: 12px;
  background: var(--ant-color-bg-elevated);
  border: 1px solid var(--ant-color-border-secondary);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
  z-index: 1;

  &:hover {
    transform: scale(1.08);
    z-index: 10;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    background: var(--ant-color-bg-container);
  }

  &.other-month {
    opacity: 0.4;
    background: transparent;
    border-color: transparent;
  }

  &.is-today {
    border-color: var(--ant-color-primary);
    background: var(--ant-color-primary-bg);

    .day-number {
      color: var(--ant-color-primary);
      font-weight: 700;
    }
  }

  &.has-record {
    background: var(--ant-color-bg-elevated);
  }
}

.day-number {
  font-size: 13px;
  font-weight: 500;
  color: var(--ant-color-text);
  flex-shrink: 0;
  line-height: 1.2;
}

.day-stats {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  min-height: 0;
  overflow: hidden;
}

.stat-line {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  line-height: 1.3;
  color: var(--ant-color-text-secondary);
}

.stat-icon {
  font-size: 10px;
  flex-shrink: 0;
}

.stat-value {
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.month-stats-container {
  background: var(--ant-color-bg-elevated);
  border-radius: 12px;
  padding: 8px 12px;
  margin-bottom: 16px;
  border: 1px solid var(--ant-color-border-secondary);
}

.month-stats-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ant-color-text);
  margin-bottom: 6px;
}

.month-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.month-stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.month-stat-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.month-stat-content {
  display: flex;
  flex-direction: column;
}

.month-stat-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--ant-color-text);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.month-stat-label {
  font-size: 10px;
  color: var(--ant-color-text-secondary);
  line-height: 1.2;
}
</style>

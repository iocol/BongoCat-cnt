import { defineStore } from 'pinia'
import { ref } from 'vue'

export type HotKey = 'visibleCat' | 'mirrorMode' | 'penetrable' | 'alwaysOnTop'

export const useShortcutStore = defineStore('shortcut', () => {
  const visibleCat = ref('')
  const visiblePreference = ref('')
  const mirrorMode = ref('')
  const penetrable = ref('')
  const alwaysOnTop = ref('')

  const init = () => {
    // 快捷键的注册由 shortcut 页面组件通过 useKeyPress 处理，
    // 此处保留 init 以便与其他 store 保持一致的初始化流程。
  }

  return {
    visibleCat,
    visiblePreference,
    mirrorMode,
    penetrable,
    alwaysOnTop,
    init,
  }
})

import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export interface CatStore {
  model: {
    mirror: boolean
    mouseMirror: boolean
    motionSound: boolean
    behavior: boolean
    autoReleaseDelay: number
    maxFPS: number
    ignoreMouse: boolean
  }
  window: {
    visible: boolean
    passThrough: boolean
    alwaysOnTop: boolean
    scale: number
    opacity: number
    radius: number
    hideOnHover: boolean
    hideOnHoverDelay: number
    keepInScreen: boolean
  }
}

export const useCatStore = defineStore('cat', () => {
  /* ------------ deprecated fields ------------ */

  /** @deprecated use `model.mirror` */
  const mirrorMode = ref(false)

  /** @deprecated use `model.mouseMirror` */
  const mouseMirror = ref(false)

  /** @deprecated use `window.passThrough` */
  const penetrable = ref(false)

  /** @deprecated use `window.alwaysOnTop` */
  const alwaysOnTop = ref(true)

  /** @deprecated use `window.scale` */
  const scale = ref(100)

  /** @deprecated use `window.opacity` */
  const opacity = ref(100)

  /** @deprecated Used to mark migrated, will be removed */
  const migrated = ref(false)

  const model = reactive<CatStore['model']>({
    mirror: false,
    mouseMirror: false,
    motionSound: true,
    behavior: true,
    autoReleaseDelay: 3,
    maxFPS: 30,
    ignoreMouse: false,
  })

  const window = reactive<CatStore['window']>({
    visible: true,
    passThrough: false,
    alwaysOnTop: false,
    scale: 100,
    opacity: 100,
    radius: 0,
    hideOnHover: false,
    hideOnHoverDelay: 0,
    keepInScreen: true,
  })

  const init = () => {
    if (migrated.value) return

    model.mirror = mirrorMode.value
    model.mouseMirror = mouseMirror.value

    window.visible = true
    window.passThrough = penetrable.value
    window.alwaysOnTop = alwaysOnTop.value
    window.scale = scale.value
    window.opacity = opacity.value

    migrated.value = true
  }

  return {
    migrated,
    model,
    window,
    init,
  }
})

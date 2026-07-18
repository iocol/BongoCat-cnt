import { invoke } from '@tauri-apps/api/core'

const COMMAND = {
  IS_ENABLED: 'is_autostart_enabled',
  ENABLE: 'enable_autostart',
  DISABLE: 'disable_autostart',
}

export function isEnabled() {
  return invoke<boolean>(COMMAND.IS_ENABLED)
}

export function enable() {
  return invoke<void>(COMMAND.ENABLE)
}

export function disable() {
  return invoke<void>(COMMAND.DISABLE)
}

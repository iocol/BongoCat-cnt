import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { INVOKE_KEY, LISTEN_KEY } from '@/constants'

const STORAGE_KEY = 'bongocat-buddy-config'

export interface TodayStats {
  key_presses: number
  mouse_clicks: number
  active_sec: number
}

export interface PeerInfo {
  nickname: string
  virtual_ip: string
  online: boolean
  today: TodayStats
  first_seen_at: number
  last_seen_at: number
}

export interface BuddyStatus {
  connected: boolean
  virtual_ip: string | null
  nickname: string
  peers: PeerInfo[]
}

function loadConfig(): { networkName: string, networkSecret: string, peerUri: string, nickname: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { networkName: '', networkSecret: '', peerUri: '', nickname: '' }
}

function saveConfig(config: { networkName: string, networkSecret: string, peerUri: string, nickname: string }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch { /* ignore */ }
}

export const useBuddyStore = defineStore('buddy', () => {
  const saved = loadConfig()

  const networkName = ref(saved.networkName)
  const networkSecret = ref(saved.networkSecret)
  const peerUri = ref(saved.peerUri)
  const nickname = ref(saved.nickname)

  // ── Runtime state ──
  const connected = ref(false)
  const virtualIp = ref<string | null>(null)
  const peers = ref<PeerInfo[]>([])
  const error = ref<string | null>(null)

  // ── Persist config on change ──
  watch([networkName, networkSecret, peerUri, nickname], () => {
    saveConfig({
      networkName: networkName.value,
      networkSecret: networkSecret.value,
      peerUri: peerUri.value,
      nickname: nickname.value,
    })
  }, { deep: false })

  // ── Status polling ──
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let unlistenError: (() => void) | null = null
  let unlistenPeers: (() => void) | null = null

  const refresh = async () => {
    try {
      const status = await invoke<BuddyStatus>(INVOKE_KEY.GET_BUDDY_STATUS)
      connected.value = status.connected
      virtualIp.value = status.virtual_ip
      peers.value = status.peers
    } catch {
      // ignore poll errors
    }
  }

  const startPolling = () => {
    stopPolling()
    refresh()
    pollTimer = setInterval(refresh, 5000)

    listen<string>(LISTEN_KEY.BUDDY_ERROR, ({ payload }) => {
      error.value = payload
    }).then((u) => {
      unlistenError = u.unlisten
    })

    listen<PeerInfo[]>(LISTEN_KEY.BUDDY_PEERS_UPDATED, ({ payload }) => {
      peers.value = payload
    }).then((u) => {
      unlistenPeers = u.unlisten
    })
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    unlistenError?.()
    unlistenError = null
    unlistenPeers?.()
    unlistenPeers = null
  }

  // ── Actions ──

  const start = async () => {
    error.value = null
    await invoke(INVOKE_KEY.START_BUDDY, {
      config: {
        network_name: networkName.value,
        network_secret: networkSecret.value,
        peer_uri: peerUri.value,
        nickname: nickname.value,
      },
    })
    startPolling()
  }

  const stop = async () => {
    stopPolling()
    await invoke(INVOKE_KEY.STOP_BUDDY)
    connected.value = false
    virtualIp.value = null
    // Keep peers in the list even after disconnect.
  }

  const pushStats = async (stats: TodayStats) => {
    if (!connected.value) return
    try {
      await invoke(INVOKE_KEY.PUSH_STATS, { stats })
    } catch {
      // peer push failures are non-fatal
    }
  }

  const removePeer = async (virtualIp: string) => {
    try {
      await invoke(INVOKE_KEY.REMOVE_BUDDY_PEER, { virtualIp })
      peers.value = peers.value.filter(p => p.virtual_ip !== virtualIp)
    } catch {
      // ignore
    }
  }

  const getStatus = async (): Promise<BuddyStatus> => {
    return invoke<BuddyStatus>(INVOKE_KEY.GET_BUDDY_STATUS)
  }

  return {
    networkName,
    networkSecret,
    peerUri,
    nickname,
    connected,
    virtualIp,
    peers,
    error,
    start,
    stop,
    pushStats,
    removePeer,
    getStatus,
    startPolling,
    stopPolling,
  }
})

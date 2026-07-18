<script setup lang="ts">
import { Button, Flex, Input, Tag } from 'antdv-next'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import ProListItem from '@/components/pro-list-item/index.vue'
import ProList from '@/components/pro-list/index.vue'
import { useBuddyStore } from '@/stores/buddy'

const buddyStore = useBuddyStore()
const { networkName, networkSecret, peerUri, nickname, connected, virtualIp, peers } = storeToRefs(buddyStore)

const showSecret = ref(false)
const connecting = ref(false)

// ── Connection ──
async function handleConnect() {
  connecting.value = true
  try {
    await buddyStore.start()
  } catch (e: any) {
    buddyStore.error = typeof e === 'string' ? e : String(e)
  } finally {
    connecting.value = false
  }
}

async function handleDisconnect() {
  await buddyStore.stop()
}

// ── Status text ──
const statusText = computed(() => {
  if (connecting.value) return '🟡 连接中...'
  if (connected.value) return `🟢 已连接 · IP: ${virtualIp.value}`
  return '⚪ 未连接'
})

// ── Peer display helpers ──
function formatNum(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}分钟`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时${m % 60}分钟`
  const d = Math.floor(h / 24)
  return `${d}天${h % 24}小时`
}

function offlineDuration(peer: { online: boolean, last_seen_at: number }): string {
  if (peer.online) return ''
  const now = Math.floor(Date.now() / 1000)
  const secs = Math.max(0, now - peer.last_seen_at)
  return formatDuration(secs)
}

onMounted(async () => {
  try {
    const status = await buddyStore.getStatus()
    if (status.connected) {
      connected.value = true
      virtualIp.value = status.virtual_ip
      peers.value = status.peers
      buddyStore.startPolling()
    }
  } catch {
    // Not connected
  }
})

onUnmounted(() => {
  buddyStore.stopPolling()
})
</script>

<template>
  <Flex
    class="buddy-page"
    gap="large"
    vertical
  >
    <!-- ── Network settings ── -->
    <ProList :title="$t('pages.preference.buddy.title')">
      <ProListItem :title="$t('pages.preference.buddy.labels.networkName')">
        <Input
          v-model:value="networkName"
          :disabled="connected"
          :placeholder="$t('pages.preference.buddy.placeholders.networkName')"
          style="width: 260px"
        />
      </ProListItem>

      <ProListItem :title="$t('pages.preference.buddy.labels.networkSecret')">
        <Flex
          align="center"
          gap="small"
        >
          <Input
            v-model:value="networkSecret"
            :disabled="connected"
            :placeholder="$t('pages.preference.buddy.placeholders.networkSecret')"
            style="width: 220px"
            :type="showSecret ? 'text' : 'password'"
          />
          <Button
            size="small"
            @click="showSecret = !showSecret"
          >
            {{ showSecret ? '🙈' : '👁' }}
          </Button>
        </Flex>
      </ProListItem>

      <ProListItem :title="$t('pages.preference.buddy.labels.peerUri')">
        <Input
          v-model:value="peerUri"
          :disabled="connected"
          :placeholder="$t('pages.preference.buddy.placeholders.peerUri')"
          style="width: 260px"
        />
      </ProListItem>

      <ProListItem :title="$t('pages.preference.buddy.labels.nickname')">
        <Input
          v-model:value="nickname"
          :disabled="connected"
          :placeholder="$t('pages.preference.buddy.placeholders.nickname')"
          style="width: 260px"
        />
      </ProListItem>

      <ProListItem :title="$t('pages.preference.buddy.labels.status')">
        <Flex
          align="center"
          gap="small"
        >
          <span class="text-3.5">{{ statusText }}</span>
          <Button
            v-if="!connected"
            :loading="connecting"
            size="small"
            type="primary"
            @click="handleConnect"
          >
            {{ $t('pages.preference.buddy.buttons.connect') }}
          </Button>
          <Button
            v-else
            danger
            size="small"
            @click="handleDisconnect"
          >
            {{ $t('pages.preference.buddy.buttons.disconnect') }}
          </Button>
        </Flex>
      </ProListItem>
    </ProList>

    <!-- ── Error display ── -->
    <div
      v-if="buddyStore.error"
      class="bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400 p-3 text-3.5 rounded-lg"
    >
      {{ buddyStore.error }}
    </div>

    <!-- ── Peer list (independently scrollable) ── -->
    <ProList :title="`好友列表 (${peers.length})`">
      <div
        class="buddy-peer-list h-72 max-h-72 flex flex-col overflow-y-auto b-1 b-solid p-2 bg-elevated b-border-sec rounded-lg"
      >
        <div
          v-if="peers.length === 0"
          class="p-4 text-center text-3.5 color-text-tertiary"
        >
          {{ connected ? '暂无在线好友' : '未连接服务器' }}
        </div>

        <ProListItem
          v-for="(peer, idx) in peers"
          :key="peer.virtual_ip"
          class="mb-2 flex-shrink-0 last:mb-0"
          :title="`${idx + 1}. ${peer.nickname}`"
        >
          <template #description>
            <Flex
              align="center"
              gap="small"
              wrap="wrap"
            >
              <Tag :color="peer.online ? 'green' : 'default'">
                {{ peer.online ? '在线' : '离线' }}
              </Tag>
              <span class="color-text-tertiary">
                <span>⌨️{{ formatNum(peer.today.key_presses) }}</span>
                <span class="ml-2">🖱️{{ formatNum(peer.today.mouse_clicks) }}</span>
                <span class="ml-2">⏱️{{ formatDuration(peer.today.active_sec) }}</span>
              </span>
              <span
                v-if="!peer.online"
                class="color-text-tertiary"
              >
                离线 {{ offlineDuration(peer) }}
              </span>
            </Flex>
          </template>

          <Button
            danger
            size="small"
            @click="buddyStore.removePeer(peer.virtual_ip)"
          >
            清除
          </Button>
        </ProListItem>
      </div>
    </ProList>
  </Flex>
</template>

<style scoped>
.buddy-peer-list::-webkit-scrollbar {
  width: 6px;
}
.buddy-peer-list::-webkit-scrollbar-thumb {
  background-color: var(--ant-color-text-quaternary);
  border-radius: 3px;
}
</style>

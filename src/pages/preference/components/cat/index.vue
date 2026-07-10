<script setup lang="ts">
import { Divider, Flex, InputNumber, Slider, SpaceAddon, SpaceCompact, Switch } from 'antdv-next'

import ProListItem from '@/components/pro-list-item/index.vue'
import ProList from '@/components/pro-list/index.vue'
import { useCatStore } from '@/stores/cat'
import { useStatsStore } from '@/stores/stats'
import { isWindows } from '@/utils/platform'

const emit = defineEmits<{
  (e: 'openCalendar'): void
}>()

const catStore = useCatStore()
const statsStore = useStatsStore()
</script>

<template>
  <ProList :title="$t('pages.preference.cat.labels.modelSettings')">
    <ProListItem
      :description="$t('pages.preference.cat.hints.mirrorMode')"
      :title="$t('pages.preference.cat.labels.mirrorMode')"
    >
      <Switch v-model:checked="catStore.model.mirror" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.mouseMirror')"
      :title="$t('pages.preference.cat.labels.mouseMirror')"
    >
      <Switch v-model:checked="catStore.model.mouseMirror" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.ignoreMouse')"
      :title="$t('pages.preference.cat.labels.ignoreMouse')"
    >
      <Switch v-model:checked="catStore.model.ignoreMouse" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.motionSound')"
      :title="$t('pages.preference.cat.labels.motionSound')"
    >
      <Switch v-model:checked="catStore.model.motionSound" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.behavior')"
      :title="$t('pages.preference.cat.labels.behavior')"
    >
      <Switch v-model:checked="catStore.model.behavior" />
    </ProListItem>

    <ProListItem
      v-if="isWindows"
      :description="$t('pages.preference.cat.hints.autoReleaseDelay')"
      :title="$t('pages.preference.cat.labels.autoReleaseDelay')"
    >
      <SpaceCompact>
        <InputNumber
          v-model:value="catStore.model.autoReleaseDelay"
          class="w-20"
        />

        <SpaceAddon>s</SpaceAddon>
      </SpaceCompact>
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.maxFPS')"
      :title="$t('pages.preference.cat.labels.maxFPS')"
    >
      <InputNumber
        v-model:value="catStore.model.maxFPS"
        class="w-20"
        :min="0"
      />
    </ProListItem>
  </ProList>

  <ProList :title="$t('pages.preference.cat.labels.windowSettings')">
    <ProListItem
      :description="$t('pages.preference.cat.hints.passThrough')"
      :title="$t('pages.preference.cat.labels.passThrough')"
    >
      <Switch v-model:checked="catStore.window.passThrough" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.alwaysOnTop')"
      :title="$t('pages.preference.cat.labels.alwaysOnTop')"
    >
      <Switch v-model:checked="catStore.window.alwaysOnTop" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.hideOnHover')"
      :title="$t('pages.preference.cat.labels.hideOnHover')"
    >
      <Flex align="center">
        <Switch v-model:checked="catStore.window.hideOnHover" />

        <Flex
          align="center"
          class="overflow-hidden transition-all"
          :class="[catStore.window.hideOnHover ? 'w-28 opacity-100' : 'w-0 opacity-0']"
        >
          <Divider type="vertical" />

          <SpaceCompact>
            <InputNumber
              v-model:value="catStore.window.hideOnHoverDelay"
              class="w-16"
              :min="0"
            />

            <SpaceAddon>s</SpaceAddon>
          </SpaceCompact>
        </Flex>
      </Flex>
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.keepInScreen')"
      :title="$t('pages.preference.cat.labels.keepInScreen')"
    >
      <Switch v-model:checked="catStore.window.keepInScreen" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.windowSize')"
      :title="$t('pages.preference.cat.labels.windowSize')"
    >
      <SpaceCompact>
        <InputNumber
          v-model:value="catStore.window.scale"
          class="w-20"
          :max="500"
          :min="1"
        />

        <SpaceAddon>%</SpaceAddon>
      </SpaceCompact>
    </ProListItem>

    <ProListItem :title="$t('pages.preference.cat.labels.windowRadius')">
      <SpaceCompact>
        <InputNumber
          v-model:value="catStore.window.radius"
          class="w-20"
          :min="0"
        />

        <SpaceAddon>%</SpaceAddon>
      </SpaceCompact>
    </ProListItem>

    <ProListItem
      :title="$t('pages.preference.cat.labels.opacity')"
      vertical
    >
      <Slider
        v-model:value="catStore.window.opacity"
        class="m-0!"
        :max="100"
        :min="10"
        :tooltip="{
          formatter(value) {
            return `${value}%`
          },
        }"
      />
    </ProListItem>
  </ProList>

  <ProList :title="$t('pages.preference.cat.labels.statsSettings')">
    <ProListItem
      :description="$t('pages.preference.cat.hints.showStats')"
      :title="$t('pages.preference.cat.labels.showStats')"
    >
      <Switch v-model:checked="statsStore.display.visible" />
    </ProListItem>

    <ProListItem
      v-if="statsStore.display.visible"
      :description="$t('pages.preference.cat.hints.statsPosition')"
      :title="$t('pages.preference.cat.labels.statsPosition')"
    >
      <select
        v-model="statsStore.display.position"
        class="border-gray-300 px-2 py-1 border text-sm rounded dark:border-gray-600 dark:bg-gray-800"
      >
        <option value="top-left">
          {{ $t('pages.preference.cat.options.topLeft') }}
        </option>
        <option value="top-right">
          {{ $t('pages.preference.cat.options.topRight') }}
        </option>
        <option value="bottom-left">
          {{ $t('pages.preference.cat.options.bottomLeft') }}
        </option>
        <option value="bottom-right">
          {{ $t('pages.preference.cat.options.bottomRight') }}
        </option>
      </select>
    </ProListItem>

    <ProListItem
      v-if="statsStore.display.visible"
      :title="$t('pages.preference.cat.labels.resetStats')"
    >
      <button
        class="bg-red-500 hover:bg-red-600 px-3 py-1 text-white text-sm rounded"
        @click="statsStore.resetAll()"
      >
        {{ $t('pages.preference.cat.buttons.resetAll') }}
      </button>
    </ProListItem>

    <ProListItem :title="$t('pages.preference.cat.labels.calendarRecord')">
      <button
        class="bg-[--ant-color-primary] px-3 py-1 text-white transition-colors text-sm rounded hover:bg-[--ant-color-primary-hover]"
        @click="emit('openCalendar')"
      >
        📅 {{ $t('pages.preference.cat.buttons.openCalendar') }}
      </button>
    </ProListItem>
  </ProList>
</template>

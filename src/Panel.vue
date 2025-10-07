<template>
  <div class="example-extension-settings tw-space-y-3">
    <div class="inline-drawer tw-rounded-lg tw-border tw-border-slate-700 tw-bg-slate-800/40">
      <div class="inline-drawer-toggle inline-drawer-header tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2">
        <b class="tw-text-slate-200">{{ t`SocketIO 中转服务` }}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>

      <div class="inline-drawer-content tw-p-3 tw-space-y-3">
        <div class="flex-container tw-flex tw-items-center tw-gap-2">
          <label class="checkbox_label tw-flex tw-items-center tw-gap-2">
            <input v-model="settings.socket_enabled" type="checkbox" />
            <span>{{ t`启用 SocketIO 中转` }}</span>
          </label>
          <button
            type="button"
            class="tw-ml-1 tw-text-xs tw-text-slate-400 hover:tw-text-slate-200 tw-underline"
            @click="tipEnabled = !tipEnabled"
            aria-label="这是什么"
          >
            Tips
          </button>
        </div>
        <p v-if="tipEnabled" class="tw-text-xs tw-text-slate-400">
          {{ t`开启后，酒馆将通过 SocketIO 或兼容 ws 的服务，暴露 OpenAI 风格接口，实现中转。` }}
        </p>

        <div class="flex-container tw-grid tw-grid-cols-12 tw-items-center tw-gap-2">
          <label class="tw-col-span-3">{{ t`服务器 URL` }}</label>
          <input
            v-model="settings.server_url"
            class="text_pole tw-col-span-9 tw-w-full tw-rounded tw-border tw-border-slate-700 tw-bg-slate-900 tw-px-2 tw-py-1 tw-text-slate-100"
            placeholder="http://localhost:3001"
          />
          <button
            type="button"
            class="tw-col-span-12 tw-text-left tw-text-xs tw-text-slate-400 hover:tw-text-slate-200 tw-underline"
            @click="tipServer = !tipServer"
            aria-label="这是什么"
          >
            Tips
          </button>
        </div>
        <p v-if="tipServer" class="tw-text-xs tw-text-slate-400">
          {{ t`你的中转服务基础地址。例如使用 Socket.IO 服务时可为 http://host:port。` }}
        </p>

        <div class="flex-container tw-grid tw-grid-cols-12 tw-items-center tw-gap-2">
          <label class="tw-col-span-3">{{ t`命名空间` }}</label>
          <input
            v-model="settings.namespace"
            class="text_pole tw-col-span-9 tw-w-full tw-rounded tw-border tw-border-slate-700 tw-bg-slate-900 tw-px-2 tw-py-1 tw-text-slate-100"
            placeholder="/st"
          />
          <button
            type="button"
            class="tw-col-span-12 tw-text-left tw-text-xs tw-text-slate-400 hover:tw-text-slate-200 tw-underline"
            @click="tipNS = !tipNS"
            aria-label="这是什么"
          >
            Tips
          </button>
        </div>
        <p v-if="tipNS" class="tw-text-xs tw-text-slate-400">
          {{ t`SocketIO 命名空间，以 / 开头。若服务端不使用命名空间，可留空或填 /。` }}
        </p>

        <div class="flex-container tw-grid tw-grid-cols-12 tw-items-center tw-gap-2">
          <label class="tw-col-span-3">{{ t`鉴权 Token（可选）` }}</label>
          <input
            v-model="settings.auth_token"
            class="text_pole tw-col-span-9 tw-w-full tw-rounded tw-border tw-border-slate-700 tw-bg-slate-900 tw-px-2 tw-py-1 tw-text-slate-100"
            placeholder=""
          />
          <button
            type="button"
            class="tw-col-span-12 tw-text-left tw-text-xs tw-text-slate-400 hover:tw-text-slate-200 tw-underline"
            @click="tipToken = !tipToken"
            aria-label="这是什么"
          >
            Tips
          </button>
        </div>
        <p v-if="tipToken" class="tw-text-xs tw-text-slate-400">
          {{ t`若中转服务需要鉴权，这里填写服务端要求的 Token，将作为 Socket.IO 连接时的 auth 传递。` }}
        </p>

        <div class="flex-container tw-flex tw-items-center tw-gap-2">
          <label class="checkbox_label tw-flex tw-items-center tw-gap-2">
            <input v-model="settings.use_stream" type="checkbox" />
            <span>{{ t`启用流式响应（OpenAI SSE 兼容）` }}</span>
          </label>
          <button
            type="button"
            class="tw-ml-1 tw-text-xs tw-text-slate-400 hover:tw-text-slate-200 tw-underline"
            @click="tipStream = !tipStream"
            aria-label="这是什么"
          >
            Tips
          </button>
        </div>
        <p v-if="tipStream" class="tw-text-xs tw-text-slate-400">
          {{ t`勾选后，结果将以流的方式分段推送（delta 片段），与 OpenAI SSE 行为一致；关闭则一次性返回完整结果。` }}
        </p>

        <div class="flex-container tw-flex tw-items-center tw-justify-between tw-gap-2">
          <span>
            {{ t`状态` }}:
            <b :style="{ color: connected ? 'limegreen' : 'orangered' }">
              {{ connected ? t`已连接` : t`未连接` }}
            </b>
          </span>
          <input
            class="menu_button tw-px-3 tw-py-1 tw-rounded tw-border tw-border-slate-600 tw-bg-slate-700 hover:tw-bg-slate-600 tw-text-slate-100"
            type="submit"
            :value="connected ? t`断开` : t`连接`"
            @click="toggleConnection"
          />
        </div>

        <hr class="sysHR" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '@/store/settings';
import { storeToRefs } from 'pinia';
import { connectRelay, disconnectRelay, isConnected, onRelayStatus } from '@/SocketIO';
import { ref, watch } from 'vue';

const { settings } = storeToRefs(useSettingsStore());
const connected = ref(false);

// Tips toggles
const tipEnabled = ref(false);
const tipServer = ref(false);
const tipNS = ref(false);
const tipToken = ref(false);
const tipStream = ref(false);

function applyConnected(val: boolean) {
  connected.value = val;
}

onRelayStatus(applyConnected);

async function ensureConnection() {
  if (settings.value.socket_enabled) {
    try {
      await connectRelay({
        url: settings.value.server_url,
        namespace: settings.value.namespace,
        token: settings.value.auth_token,
        stream: settings.value.use_stream,
      });
      toastr.success('SocketIO 已连接');
    } catch (e) {
      console.error(e);
      toastr.error('SocketIO 连接失败，请检查服务器与命名空间');
      applyConnected(false);
    }
  } else {
    disconnectRelay();
    applyConnected(false);
  }
}

watch(
  () => [settings.value.socket_enabled, settings.value.server_url, settings.value.namespace, settings.value.auth_token],
  () => {
    // 当配置变化时尝试重连或断开
    ensureConnection();
  },
  { immediate: true },
);

function toggleConnection() {
  if (connected.value) {
    disconnectRelay();
    applyConnected(false);
    toastr.info('SocketIO 已断开');
  } else {
    ensureConnection();
  }
}
</script>

<style scoped></style>

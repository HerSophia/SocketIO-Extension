<template>
  <div class="example-extension-settings sx-stack-md">
    <div class="inline-drawer sx-card">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>{{ t`SocketIO 中转服务` }}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>

      <div class="inline-drawer-content sx-stack-md">
        <div class="sx-row">
          <label class="checkbox_label">
            <input v-model="settings.socket_enabled" type="checkbox" />
            <span>{{ t`启用 SocketIO 中转` }}</span>
          </label>
          <button
            type="button"
            class="sx-link-btn"
            @click="tipEnabled = !tipEnabled"
            aria-label="这是什么"
          >
            Tips
          </button>
        </div>
        <p v-if="tipEnabled" class="sx-hint">
          {{ t`开启后，酒馆将通过 SocketIO 或兼容 ws 的服务，暴露 OpenAI 风格接口，实现中转。` }}
        </p>

        <div class="sx-grid">
          <label class="sx-col-label">{{ t`服务器 URL` }}</label>
          <input
            v-model="settings.server_url"
            class="text_pole sx-input"
            placeholder="http://localhost:3001"
          />
          <button
            type="button"
            class="sx-col-full sx-link-btn"
            @click="tipServer = !tipServer"
            aria-label="这是什么"
          >
            Tips
          </button>
        </div>
        <p v-if="tipServer" class="sx-hint">
          {{ t`你的中转服务基础地址。例如使用 Socket.IO 服务时可为 http://host:port。` }}
        </p>

        <div class="sx-grid">
          <label class="sx-col-label">{{ t`命名空间` }}</label>
          <input
            v-model="settings.namespace"
            class="text_pole sx-input"
            placeholder="/st"
          />
          <button
            type="button"
            class="sx-col-full sx-link-btn"
            @click="tipNS = !tipNS"
            aria-label="这是什么"
          >
            Tips
          </button>
        </div>
        <p v-if="tipNS" class="sx-hint">
          {{ t`SocketIO 命名空间，以 / 开头。若服务端不使用命名空间，可留空或填 /。` }}
        </p>

        <div class="sx-grid">
          <label class="sx-col-label">{{ t`鉴权 Token（可选）` }}</label>
          <input
            v-model="settings.auth_token"
            class="text_pole sx-input"
            placeholder=""
          />
          <button
            type="button"
            class="sx-col-full sx-link-btn"
            @click="tipToken = !tipToken"
            aria-label="这是什么"
          >
            Tips
          </button>
        </div>
        <p v-if="tipToken" class="sx-hint">
          {{ t`若中转服务需要鉴权，这里填写服务端要求的 Token，将作为 Socket.IO 连接时的 auth 传递。` }}
        </p>

        <div class="sx-row">
          <label class="checkbox_label">
            <input v-model="settings.use_stream" type="checkbox" />
            <span>{{ t`启用流式响应（OpenAI SSE 兼容）` }}</span>
          </label>
          <button
            type="button"
            class="sx-link-btn"
            @click="tipStream = !tipStream"
            aria-label="这是什么"
          >
            Tips
          </button>
        </div>
        <p v-if="tipStream" class="sx-hint">
          {{ t`勾选后，结果将以流的方式分段推送（delta 片段），与 OpenAI SSE 行为一致；关闭则一次性返回完整结果。` }}
        </p>

        <div class="sx-row sx-justify-between">
          <span>
            {{ t`状态` }}:
            <b :style="{ color: connected ? 'limegreen' : 'orangered' }">
              {{ connected ? t`已连接` : t`未连接` }}
            </b>
          </span>
          <input
            class="menu_button sx-cta"
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
import { connectRelay, disconnectRelay, onRelayStatus } from '@/SocketIO';
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

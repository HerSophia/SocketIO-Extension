<template>
  <div class="example-extension-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>{{ t`SocketIO 中转服务` }}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <div class="flex-container">
          <label class="checkbox_label">
            <input v-model="settings.socket_enabled" type="checkbox" />
            <span>{{ t`启用 SocketIO 中转` }}</span>
          </label>
        </div>

        <div class="flex-container">
          <label>{{ t`服务器 URL` }}</label>
          <input v-model="settings.server_url" class="text_pole" placeholder="http://localhost:3001" />
        </div>

        <div class="flex-container">
          <label>{{ t`命名空间` }}</label>
          <input v-model="settings.namespace" class="text_pole" placeholder="/st" />
        </div>

        <div class="flex-container">
          <label>{{ t`鉴权 Token（可选）` }}</label>
          <input v-model="settings.auth_token" class="text_pole" placeholder="" />
        </div>

        <div class="flex-container">
          <label class="checkbox_label">
            <input v-model="settings.use_stream" type="checkbox" />
            <span>{{ t`启用流式响应（OpenAI SSE 兼容）` }}</span>
          </label>
        </div>

        <div class="flex-container">
          <span>{{ t`状态` }}: <b :style="{ color: connected ? 'limegreen' : 'orangered' }">{{ connected ? t`已连接` : t`未连接` }}</b></span>
          <input class="menu_button" type="submit" :value="connected ? t`断开` : t`连接`" @click="toggleConnection" />
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
  () => [
    settings.value.socket_enabled,
    settings.value.server_url,
    settings.value.namespace,
    settings.value.auth_token,
  ],
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

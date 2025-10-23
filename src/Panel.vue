<template>
<<<<<<< HEAD
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
          <button type="button" class="sx-link-btn" @click="tipEnabled = !tipEnabled" aria-label="这是什么">
            Tips
          </button>
        </div>
        <p v-if="tipEnabled" class="sx-hint">
          {{ t`开启后，酒馆将通过 SocketIO 或兼容 ws 的服务，暴露 OpenAI 风格接口，实现中转。` }}
        </p>

        <div class="sx-grid">
          <label class="sx-col-label">{{ t`服务器 URL` }}</label>
          <input v-model="settings.server_url" class="text_pole sx-input" placeholder="http://localhost:3001" />
          <button type="button" class="sx-col-full sx-link-btn" @click="tipServer = !tipServer" aria-label="这是什么">
            Tips
          </button>
        </div>
        <p v-if="tipServer" class="sx-hint">
          {{ t`你的中转服务基础地址。例如使用 Socket.IO 服务时可为 http://host:port。` }}
        </p>

        <div class="sx-grid">
          <label class="sx-col-label">{{ t`命名空间` }}</label>
          <input v-model="settings.namespace" class="text_pole sx-input" placeholder="/st" />
          <button type="button" class="sx-col-full sx-link-btn" @click="tipNS = !tipNS" aria-label="这是什么">
            Tips
          </button>
        </div>
        <p v-if="tipNS" class="sx-hint">
          {{ t`SocketIO 命名空间，以 / 开头。若服务端不使用命名空间，可留空或填 /。` }}
        </p>

        <div class="sx-grid">
          <label class="sx-col-label">{{ t`鉴权 Token（可选）` }}</label>
          <input v-model="settings.auth_token" class="text_pole sx-input" placeholder="" />
          <button type="button" class="sx-col-full sx-link-btn" @click="tipToken = !tipToken" aria-label="这是什么">
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
          <button type="button" class="sx-link-btn" @click="tipStream = !tipStream" aria-label="这是什么">Tips</button>
        </div>
        <p v-if="tipStream" class="sx-hint">
          {{ t`勾选后，结果将以流的方式分段推送（delta 片段），与 OpenAI SSE 行为一致；关闭则一次性返回完整结果。` }}
        </p>

        <div class="sx-grid">
          <label class="sx-col-label">{{ t`生成方法` }}</label>
          <select v-model="settings.default_method" class="sx-input">
            <option value="generate">generate</option>
            <option value="generateRaw">generateRaw</option>
          </select>
          <button type="button" class="sx-col-full sx-link-btn" @click="tipMethod = !tipMethod" aria-label="这是什么">
            Tips
          </button>
        </div>
        <p v-if="tipMethod" class="sx-hint">
          {{ t`用于选择调用 TavernHelper 的生成方法。generate 使用当前预设，generateRaw 使用自定义 ordered_prompts。` }}
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
=======
  <div class="example-extension-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>{{ t`插件示例` }}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <div class="example-extension_block flex-container">
          <input class="menu_button" type="submit" :value="t`示例按钮`" @click="handle_button_click" />
        </div>

        <div class="example-extension_block flex-container">
          <input v-model="settings.button_selected" type="checkbox" />
          <label for="example_setting">{{ t`示例开关` }}</label>
>>>>>>> 1182e312dc7f161f73325e0744a820ac6d8bc358
        </div>

        <hr class="sysHR" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '@/store/settings';
import { storeToRefs } from 'pinia';
<<<<<<< HEAD
import { connectRelay, disconnectRelay, onRelayStatus, pushRegexesToServer } from '@/SocketIO';
import { installRegexBridge } from '@/RegexBridge';
import { ref, watch } from 'vue';

const { settings } = storeToRefs(useSettingsStore());
const connected = ref(false);

// Tips toggles
const tipEnabled = ref(false);
const tipServer = ref(false);
const tipNS = ref(false);
const tipToken = ref(false);
const tipStream = ref(false);
const tipMethod = ref(false);

function applyConnected(val: boolean) {
  console.info("[Panel.vue/applyConnected] '更新连接状态'", { value: val });
  connected.value = val;
}

onRelayStatus(applyConnected);

async function ensureConnection() {
  console.info("[Panel.vue/ensureConnection] '开始检查并处理连接'", {
    enabled: settings.value.socket_enabled,
    url: settings.value.server_url,
    namespace: settings.value.namespace,
  });
  if (settings.value.socket_enabled) {
    try {
      console.info("[Panel.vue/ensureConnection] '安装正则桥接'");
      await installRegexBridge();
      console.info("[Panel.vue/ensureConnection] '尝试连接中转'", {
        url: settings.value.server_url,
        namespace: settings.value.namespace,
        tokenPresent: !!settings.value.auth_token,
        stream: settings.value.use_stream,
      });
      await connectRelay({
        url: settings.value.server_url,
        namespace: settings.value.namespace,
        token: settings.value.auth_token,
        stream: settings.value.use_stream,
        methodDefault: settings.value.default_method as any,
      });
      console.info("[Panel.vue/ensureConnection] '推送服务器正则规则'");
      await pushRegexesToServer();
      console.info("[Panel.vue/ensureConnection] '连接成功'");
      toastr.success('SocketIO 已连接');
    } catch (e) {
      console.error("[Panel.vue/ensureConnection] '连接失败'", e);
      toastr.error('SocketIO 连接失败，请检查服务器与命名空间');
      applyConnected(false);
    }
  } else {
    console.info("[Panel.vue/ensureConnection] '未启用，执行断开'");
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
    settings.value.use_stream,
    settings.value.default_method,
  ],
  vals => {
    console.info("[Panel.vue/watch] '设置变更触发重联检查'", {
      socket_enabled: settings.value.socket_enabled,
      server_url: settings.value.server_url,
      namespace: settings.value.namespace,
      auth_token_present: !!settings.value.auth_token,
      stream: settings.value.use_stream,
      default_method: settings.value.default_method,
    });
    ensureConnection();
  },
  { immediate: true },
);

function toggleConnection() {
  console.info("[Panel.vue/toggleConnection] '切换连接状态'", { connected: connected.value });
  if (connected.value) {
    disconnectRelay();
    applyConnected(false);
    toastr.info('SocketIO 已断开');
    console.info("[Panel.vue/toggleConnection] '已断开'");
  } else {
    ensureConnection();
  }
}
=======

const { settings } = storeToRefs(useSettingsStore());

const handle_button_click = () => {
  toastr.success('你好呀!');
};
>>>>>>> 1182e312dc7f161f73325e0744a820ac6d8bc358
</script>

<style scoped></style>

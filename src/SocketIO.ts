import { io, Socket } from 'socket.io-client';
import { uuidv4 } from '@sillytavern/scripts/utils';

type ConnectOptions = {
  url: string;
  namespace?: string;
  token?: string;
  stream?: boolean;
};

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatCompletionsCreatePayload = {
  /** 请求方自带的请求 ID（可选）；若未提供将自动生成 */
  id?: string;
  /** 模型名称（可用于透传标识；并不影响 Tavern 的生成逻辑） */
  model?: string;
  /** OpenAI 风格的消息数组（简化映射：仅取最后一条 user 消息作为 user_input） */
  messages?: OpenAIChatMessage[];
  /** 是否流式；若未提供，使用 connectRelay 的默认设置 */
  stream?: boolean;
  /** 指定调用 generate 还是 generateRaw；默认 generate */
  method?: 'generate' | 'generateRaw';
  /** Tavern 专属字段（可选） */
  tavern?: {
    overrides?: any;
    injects?: any[];
    max_chat_history?: 'all' | number;
    custom_api?: any;
    /** 自定义 generation_id；未提供则自动生成 */
    generation_id?: string;
    /** 直接指定 user_input（覆盖 messages 推断） */
    user_input?: string;
    /** generateRaw 专属：自定义提示词顺序 */
    ordered_prompts?: any[];
    /** 便捷开关：等价于 method === 'generateRaw' */
    use_raw?: boolean;
  };
  /** 便捷字段：直接指定 user_input */
  user_input?: string;
};

const reqToGen = new Map<string, string>();
let currentSocket: Socket | null = null;
let currentStreamDefault = true;
let _connected = false;
const statusWatchers: ((s: boolean) => void)[] = [];

function notifyStatus(s: boolean) {
  _connected = s;
  console.info("[SocketIO/notifyStatus] '连接状态更新'", { connected: s });
  for (const fn of statusWatchers) {
    try {
      fn(s);
    } catch (e) {
      console.error("[SocketIO/notifyStatus] '回调执行失败'", e);
    }
  }
}

export function onRelayStatus(cb: (s: boolean) => void) {
  statusWatchers.push(cb);
  console.info("[SocketIO/onRelayStatus] '注册状态监听器'", { watchersCount: statusWatchers.length });
  cb(_connected);
}

export function isConnected() {
  return _connected;
}

export async function connectRelay(opts: ConnectOptions) {
  const ns = (opts.namespace || '').startsWith('/') ? opts.namespace! : `/${opts.namespace || ''}`;
  const url = `${opts.url}${ns}`;
  currentStreamDefault = !!opts.stream;
  console.info("[SocketIO/connectRelay] '准备连接'", { url, namespace: ns, tokenPresent: !!opts.token, streamDefault: currentStreamDefault });
  if (currentSocket) {
    try {
      console.info("[SocketIO/connectRelay] '断开旧连接'");
      currentSocket.disconnect();
    } catch (e) {
      console.error("[SocketIO/connectRelay] '断开旧连接失败'", e);
    }
    currentSocket = null;
  }
  const s = io(url, {
    transports: ['websocket'],
    auth: opts.token ? { token: opts.token } : undefined,
    autoConnect: true,
    reconnection: true,
    reconnectionDelayMax: 10000,
  });
  currentSocket = s;
  console.info("[SocketIO/connectRelay] 'Socket 创建完成，等待连接'");
 
  s.on('connect', () => {
    console.info("[SocketIO/connectRelay] '已连接'");
    notifyStatus(true);
  });
  s.on('disconnect', (reason) => {
    console.warn("[SocketIO/connectRelay] '已断开'", { reason });
    notifyStatus(false);
  });
 
  // OpenAI chat.completions.create 入口
  s.on('openai.chat.completions.create', (payload: ChatCompletionsCreatePayload) => {
    console.info("[SocketIO/connectRelay] '收到创建请求'", payload);
    void handleChatCompletionsCreate(payload);
  });
 
  // 取消/停止指定请求（通过 req_id -> generation_id）
  s.on('openai.abort', (data: { id?: string; req_id?: string }) => {
    console.info("[SocketIO/connectRelay] '收到中止请求'", data);
    const reqId = data?.id || data?.req_id;
    if (!reqId) return;
    const genId = reqToGen.get(reqId);
    const TH: any = (window as any).TavernHelper;
    if (genId && TH?.stopGenerateById) {
      try {
        TH.stopGenerateById(genId);
        console.info("[SocketIO/connectRelay] '已触发停止生成'", { generation_id: genId });
      } catch (e) {
        console.warn("[SocketIO/connectRelay] '停止生成失败'", e);
      }
    }
  });
}

export function disconnectRelay() {
  if (currentSocket) {
    try {
      console.info("[SocketIO/disconnectRelay] '开始断开'");
      currentSocket.disconnect();
    } catch (e) {
      console.error("[SocketIO/disconnectRelay] '断开失败'", e);
    }
  }
  currentSocket = null;
  notifyStatus(false);
}

function lastUserInputFromMessages(messages?: OpenAIChatMessage[]): string {
  if (!messages || messages.length === 0) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return (messages[i] as any).content ?? '';
    }
  }
  return (messages[messages.length - 1] as any)?.content ?? '';
}

function toNonStreamResponse(params: { reqId: string; model?: string; content: string }) {
  const id = `chatcmpl_${params.reqId}`;
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    object: 'chat.completion',
    created: now,
    model: params.model || 'sillytavern',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: params.content },
        finish_reason: 'stop',
      },
    ],
  };
}

function toStreamChunk(params: { reqId: string; delta: string; model?: string; done?: boolean }) {
  const id = `chatcmpl_${params.reqId}`;
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    object: 'chat.completion.chunk',
    created: now,
    model: params.model || 'sillytavern',
    choices: [
      params.done
        ? { index: 0, delta: {}, finish_reason: 'stop' }
        : { index: 0, delta: { content: params.delta }, finish_reason: null },
    ],
  };
}

async function handleChatCompletionsCreate(payload: ChatCompletionsCreatePayload) {
  const socket = currentSocket;
  if (!socket) {
    console.warn("[SocketIO/handleChatCompletionsCreate] '无有效 socket，忽略请求'");
    return;
  }
 
  const reqId = payload.id || uuidv4();
  const genId = payload.tavern?.generation_id || uuidv4();
  reqToGen.set(reqId, genId);
 
  const stream = payload.stream ?? currentStreamDefault ?? true;
 
  const user_input = payload.user_input ?? payload.tavern?.user_input ?? lastUserInputFromMessages(payload.messages);
 
  // 选择使用 generate 还是 generateRaw
  const useRaw =
    payload.tavern?.use_raw === true ||
    payload.method === 'generateRaw' ||
    Array.isArray(payload.tavern?.ordered_prompts);
  const method: 'generate' | 'generateRaw' = useRaw ? 'generateRaw' : 'generate';
 
  // 构建配置
  const config: any = {
    user_input,
    should_stream: stream,
    overrides: payload.tavern?.overrides,
    injects: payload.tavern?.injects,
    max_chat_history: payload.tavern?.max_chat_history,
    custom_api: payload.tavern?.custom_api,
    generation_id: genId,
  };
  if (method === 'generateRaw') {
    config.ordered_prompts = payload.tavern?.ordered_prompts;
  }
 
  const TH: any = (window as any).TavernHelper;
  if (!TH?.[method]) {
    console.error("[SocketIO/handleChatCompletionsCreate] 'TavernHelper 方法不可用'", { method });
    socket.emit('openai.chat.completions.error', {
      id: reqId,
      error: { message: `TavernHelper.${method} 不可用`, type: 'internal_error' },
    });
    return;
  }
 
  console.info("[SocketIO/handleChatCompletionsCreate] '开始生成'", { reqId, genId, stream, method, model: payload.model, user_input_preview: (user_input || '').slice(0, 120) });
 
  // 中转前应用酒馆正则
  const regexProcess = (text: string): string => {
    try {
      const w: any = window as any;
      const fn = w.formatAsTavernRegexedString || w.TavernHelper?.formatAsTavernRegexedString;
      if (typeof fn === 'function') {
        return fn(text, 'ai_output', 'display');
      }
    } catch (e) {
      /* ignore */
    }
    return text;
  };
 
  let full = '';
  const onInc = (incremental: string, id: string) => {
    if (id !== genId) return;
    try {
      full += incremental || '';
      const processed = regexProcess(incremental || '');
      const chunk = toStreamChunk({
        reqId,
        delta: processed,
        model: payload.model,
      });
      socket.emit('openai.chat.completions.chunk', { id: reqId, data: chunk });
      console.debug("[SocketIO/handleChatCompletionsCreate/onInc] '增量片段'", { id, len: (incremental || '').length });
    } catch (e) {
      console.error("[SocketIO/handleChatCompletionsCreate/onInc] '处理增量失败'", e);
    }
  };
  const onFull = (_fullText: string, id: string) => {
    if (id !== genId) return;
    console.info("[SocketIO/handleChatCompletionsCreate/onFull] '收到完整文本'", { id, len: (_fullText || '').length });
    // 可选：也可在此发整段快照
  };
  const onEnd = (text: string, id: string) => {
    if (id !== genId) return;
    try {
      const finalText = text ?? full;
      console.info("[SocketIO/handleChatCompletionsCreate/onEnd] '生成结束'", { id, stream, final_len: (finalText || '').length });
      if (stream) {
        const done = toStreamChunk({
          reqId,
          delta: '',
          model: payload.model,
          done: true,
        });
        socket.emit('openai.chat.completions.chunk', { id: reqId, data: done });
        socket.emit('openai.chat.completions.done', { id: reqId });
      } else {
        const processedFinal = regexProcess(finalText);
        const resp = toNonStreamResponse({
          reqId,
          model: payload.model,
          content: processedFinal,
        });
        socket.emit('openai.chat.completions.result', { id: reqId, data: resp });
      }
    } finally {
      cleanup();
      reqToGen.delete(reqId);
      console.info("[SocketIO/handleChatCompletionsCreate] '清理完成并移除映射'", { reqId });
    }
  };
 
  const pmListener = (ev: MessageEvent) => {
    const data = (ev as any)?.data;
    if (!data || data.source !== 'socketio-extension') return;
    const t = data.type;
    const p = data.payload || {};
    try {
      console.debug("[SocketIO/handleChatCompletionsCreate/pmListener] '收到桥接事件'", { type: t, id: p.id });
      if (t === 'STREAM_TOKEN_RECEIVED_INCREMENTALLY') {
        onInc(p.incremental_text, p.id);
      } else if (t === 'STREAM_TOKEN_RECEIVED_FULLY') {
        onFull(p.full_text, p.id);
      } else if (t === 'GENERATION_ENDED') {
        onEnd(p.text, p.id);
      }
    } catch (e) {
      console.error("[SocketIO/handleChatCompletionsCreate/pmListener] '处理桥接事件失败'", e);
    }
  };
 
  const cleanup = () => {
    try {
      // 清理 iframe 事件监听（如可用）
      eventRemoveListener(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, onInc as any);
      eventRemoveListener(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, onFull as any);
      eventRemoveListener(iframe_events.GENERATION_ENDED, onEnd as any);
    } catch (e) {
      /* ignore */
    } finally {
      try {
        window.removeEventListener('message', pmListener as any);
      } catch (e) {
        /* ignore */
      }
    }
  };
 
  // 注册监听以获取流式 token 与结束事件（优先使用 postMessage 桥）
  try {
    window.addEventListener('message', pmListener as any);
  } catch (e) {
    /* ignore */
  }
  try {
    // 同时尽力注册 iframe 原生事件（当运行于消息 iframe 环境时）
    eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, onInc as any);
    eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, onFull as any);
    eventOn(iframe_events.GENERATION_ENDED, onEnd as any);
  } catch (e) {
    /* ignore */
  }
 
  // 告知请求已受理
  socket.emit('openai.chat.completions.accepted', {
    id: reqId,
    generation_id: genId,
  });
  console.info("[SocketIO/handleChatCompletionsCreate] '已受理请求'", { reqId, generation_id: genId });
 
  try {
    await TH[method](config);
  } catch (e: any) {
    cleanup();
    console.error("[SocketIO/handleChatCompletionsCreate] '生成过程出现错误'", e);
    socket.emit('openai.chat.completions.error', {
      id: reqId,
      error: { message: e?.message || String(e), type: 'generation_error' },
    });
    reqToGen.delete(reqId);
  }
}

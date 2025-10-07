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
  for (const fn of statusWatchers) {
    try {
      fn(s);
    } catch (e) {
      console.error(e);
    }
  }
}

export function onRelayStatus(cb: (s: boolean) => void) {
  statusWatchers.push(cb);
  cb(_connected);
}

export function isConnected() {
  return _connected;
}

export async function connectRelay(opts: ConnectOptions) {
  const ns = (opts.namespace || '').startsWith('/') ? opts.namespace! : `/${opts.namespace || ''}`;
  const url = `${opts.url}${ns}`;
  currentStreamDefault = !!opts.stream;
  if (currentSocket) {
    try {
      currentSocket.disconnect();
    } catch (e) { /* ignore */ }
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

  s.on('connect', () => {
    notifyStatus(true);
  });
  s.on('disconnect', () => {
    notifyStatus(false);
  });

  // OpenAI chat.completions.create 入口
  s.on('openai.chat.completions.create', (payload: ChatCompletionsCreatePayload) => {
    void handleChatCompletionsCreate(payload);
  });

  // 取消/停止指定请求（通过 req_id -> generation_id）
  s.on('openai.abort', (data: { id?: string; req_id?: string }) => {
    const reqId = data?.id || data?.req_id;
    if (!reqId) return;
    const genId = reqToGen.get(reqId);
    const TH: any = (window as any).TavernHelper;
    if (genId && TH?.stopGenerateById) {
      try {
        TH.stopGenerateById(genId);
      } catch (e) {
        console.warn('stopGenerateById failed', e);
      }
    }
  });
}

export function disconnectRelay() {
  if (currentSocket) {
    try {
      currentSocket.disconnect();
    } catch (e) { /* ignore */ }
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
  if (!socket) return;

  const reqId = payload.id || uuidv4();
  const genId = payload.tavern?.generation_id || uuidv4();
  reqToGen.set(reqId, genId);

  const stream = payload.stream ?? currentStreamDefault ?? true;

  const user_input =
    payload.user_input ??
    payload.tavern?.user_input ??
    lastUserInputFromMessages(payload.messages);

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
    socket.emit('openai.chat.completions.error', {
      id: reqId,
      error: { message: `TavernHelper.${method} 不可用`, type: 'internal_error' },
    });
    return;
  }

  // 中转前应用酒馆正则
  const regexProcess = (text: string): string => {
    try {
      const w: any = window as any;
      const fn =
        w.formatAsTavernRegexedString ||
        w.TavernHelper?.formatAsTavernRegexedString;
      if (typeof fn === 'function') {
        return fn(text, 'ai_output', 'display');
      }
    } catch (e) { /* ignore */ }
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
    } catch (e) {
      console.error(e);
    }
  };
  const onFull = (_fullText: string, id: string) => {
    if (id !== genId) return;
    // 可选：也可在此发整段快照
  };
  const onEnd = (text: string, id: string) => {
    if (id !== genId) return;
    try {
      const finalText = text ?? full;
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
    }
  };

  const cleanup = () => {
    try {
      eventRemoveListener(
        iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY,
        onInc as any,
      );
      eventRemoveListener(
        iframe_events.STREAM_TOKEN_RECEIVED_FULLY,
        onFull as any,
      );
      eventRemoveListener(iframe_events.GENERATION_ENDED, onEnd as any);
    } catch (e) { /* ignore */ }
  };

  // 注册监听以获取流式 token 与结束事件
  eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, onInc as any);
  eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, onFull as any);
  eventOn(iframe_events.GENERATION_ENDED, onEnd as any);

  // 告知请求已受理
  socket.emit('openai.chat.completions.accepted', {
    id: reqId,
    generation_id: genId,
  });

  try {
    await TH[method](config);
  } catch (e: any) {
    cleanup();
    socket.emit('openai.chat.completions.error', {
      id: reqId,
      error: { message: e?.message || String(e), type: 'generation_error' },
    });
    reqToGen.delete(reqId);
  }
}

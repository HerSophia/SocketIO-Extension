

import http from 'http';
import { Server as IOServer } from 'socket.io';
import { randomUUID } from 'crypto';
import url from 'url';
import createDebug from 'debug';

let PORT = parseInt(process.env.PORT || '3001', 10);
let NAMESPACE = process.env.NAMESPACE || '/st';
let AUTH_TOKEN = process.env.AUTH_TOKEN || '';
let REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '120000', 10);

// debug namespaces
const DEBUG_NS = 'socketio-relay';
const log = createDebug(`${DEBUG_NS}:server`);
const logHttp = createDebug(`${DEBUG_NS}:http`);
const logIO = createDebug(`${DEBUG_NS}:io`);
const logChat = createDebug(`${DEBUG_NS}:chat`);
const logErr = createDebug(`${DEBUG_NS}:error`);

type AnyObj = any;

function html(str: string) { return str; }

function renderAdminPage() {
  return html(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>SocketIO Relay 管理台</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #0b1020; }
    .card { background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  </style>
</head>
<body class="text-slate-100">
  <div class="max-w-5xl mx-auto p-6 space-y-6">
    <h1 class="text-2xl font-bold">SocketIO Relay 管理台</h1>

    <div class="card p-5 space-y-4">
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="text-sm text-slate-400">监听端口</div>
          <div id="port" class="text-lg font-semibold"></div>
        </div>
        <div>
          <div class="text-sm text-slate-400">当前连接的 Tavern 客户端</div>
          <div id="clients" class="text-lg font-semibold"></div>
        </div>
        <div>
          <div class="text-sm text-slate-400">命名空间</div>
          <div id="ns" class="text-lg font-semibold"></div>
        </div>
      </div>
      <button id="refresh" class="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500">刷新状态</button>
    </div>

    <div class="card p-5 space-y-4">
      <h2 class="text-xl font-semibold">服务器配置</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="space-y-1">
          <span class="text-sm text-slate-300">命名空间（以 / 开头）</span>
          <input id="cfg-namespace" class="w-full px-3 py-2 rounded bg-slate-900/60 border border-white/10" placeholder="/st"/>
        </label>
        <label class="space-y-1">
          <span class="text-sm text-slate-300">鉴权 Token（可选）</span>
          <input id="cfg-auth" type="password" class="w-full px-3 py-2 rounded bg-slate-900/60 border border-white/10" placeholder=""/>
        </label>
        <label class="space-y-1">
          <span class="text-sm text-slate-300">请求超时（毫秒）</span>
          <input id="cfg-timeout" type="number" min="1000" step="1000" class="w-full px-3 py-2 rounded bg-slate-900/60 border border-white/10" placeholder="120000"/>
        </label>
      </div>
      <div class="text-sm text-slate-400">端口需在启动时通过环境变量 PORT 指定，运行中无法修改。</div>
      <div class="flex gap-3">
        <button id="save-config" class="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500">保存配置</button>
        <span id="save-tip" class="text-sm text-slate-400"></span>
      </div>
    </div>

    <div class="card p-5 space-y-4">
      <h2 class="text-xl font-semibold">OpenAI 接口测试</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="space-y-1">
          <span class="text-sm text-slate-300">模型</span>
          <input id="test-model" class="w-full px-3 py-2 rounded bg-slate-900/60 border border-white/10" value="sillytavern"/>
        </label>
        <label class="space-y-1">
          <span class="text-sm text-slate-300">是否流式</span>
          <select id="test-stream" class="w-full px-3 py-2 rounded bg-slate-900/60 border border-white/10">
            <option value="true">true</option>
            <option value="false" selected>false</option>
          </select>
        </label>
      </div>
      <label class="space-y-1 block">
        <span class="text-sm text-slate-300">用户输入（作为最后一条 user 消息）</span>
        <textarea id="test-input" rows="4" class="w-full px-3 py-2 rounded bg-slate-900/60 border border-white/10 mono" placeholder="你好，做一个自我介绍。"></textarea>
      </label>
      <div class="flex gap-3">
        <button id="btn-test" class="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500">发送测试</button>
        <button id="btn-clear" class="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600">清空输出</button>
      </div>
      <pre id="out" class="p-3 bg-black/50 rounded border border-white/10 mono whitespace-pre-wrap"></pre>
    </div>

    <footer class="text-center text-xs text-slate-500 py-6">SocketIO Relay Admin · 尽量在内网环境使用</footer>
  </div>

<script>
  async function fetchStatus() {
    const r = await fetch('/api/status'); const j = await r.json();
    document.getElementById('port').textContent = j.port;
    document.getElementById('clients').textContent = j.clients;
    document.getElementById('ns').textContent = j.namespace;
    document.getElementById('cfg-namespace').value = j.namespace;
    document.getElementById('cfg-timeout').value = j.request_timeout_ms;
    document.getElementById('cfg-auth').value = j.auth_token || '';
  }
  function setTip(msg, ok) {
    const el = document.getElementById('save-tip');
    el.textContent = msg; el.className = ok ? 'text-sm text-emerald-400' : 'text-sm text-rose-400';
  }
  async function saveConfig() {
    const ns = document.getElementById('cfg-namespace').value.trim() || '/';
    const auth = document.getElementById('cfg-auth').value;
    const to = parseInt(document.getElementById('cfg-timeout').value, 10) || 120000;
    const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namespace: ns, auth_token: auth, request_timeout_ms: to }) });
    if (!r.ok) { setTip('保存失败', false); return; }
    await fetchStatus(); setTip('已保存', true);
  }
  async function testOnce() {
    const model = document.getElementById('test-model').value || 'sillytavern';
    const streamStr = document.getElementById('test-stream').value;
    const isStream = streamStr === 'true';
    const input = document.getElementById('test-input').value || '你好';
    const out = document.getElementById('out');
    out.textContent = '';
    const payload = {
      model,
      stream: isStream,
      messages: [{ role: 'user', content: input }]
    };
    if (!isStream) {
      const r = await fetch('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json(); out.textContent = JSON.stringify(j, null, 2);
    } else {
      const r = await fetch('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const reader = r.body.getReader(); const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\\n\\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (!chunk.startsWith('data:')) continue;
          const data = chunk.slice(5).trim();
          if (data === '[DONE]') { out.textContent += '\\n[DONE]'; return; }
          try {
            const j = JSON.parse(data);
            const choice = (j.choices && j.choices[0]) || {};
            const delta = (choice.delta && choice.delta.content) || '';
            out.textContent += delta;
          } catch (e) { /* ignore */ }
        }
      }
    }
  }
  document.getElementById('refresh').addEventListener('click', fetchStatus);
  document.getElementById('save-config').addEventListener('click', saveConfig);
  document.getElementById('btn-test').addEventListener('click', testOnce);
  document.getElementById('btn-clear').addEventListener('click', () => { document.getElementById('out').textContent = ''; });
  fetchStatus();
</script>
</body>
</html>`);
}

const server = http.createServer(async (req, res) => {
  logHttp('req %s %s', req.method, req.url);
  const parsed = url.parse(req.url || '', true);
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  try {
    if (req.method === 'GET' && (parsed.pathname === '/' || parsed.pathname === '/admin')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderAdminPage()); return;
    }
    if (req.method === 'GET' && parsed.pathname === '/api/status') {
      logHttp('status: port=%d ns=%s clients=%d', PORT, NAMESPACE, clients.length);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ port: PORT, namespace: NAMESPACE, clients: clients.length, auth_token: AUTH_TOKEN, request_timeout_ms: REQUEST_TIMEOUT_MS })); return;
    }
    if (req.method === 'POST' && parsed.pathname === '/api/config') {
      const body = await readJson(req);
      const ns0 = (typeof body.namespace === 'string' ? body.namespace : NAMESPACE) || '/';
      const nsNew = ns0.startsWith('/') ? ns0 : ('/' + ns0);
      const tokenNew = typeof body.auth_token === 'string' ? body.auth_token : AUTH_TOKEN;
      const toNew = Number.isFinite(body.request_timeout_ms) ? parseInt(String(body.request_timeout_ms), 10) : REQUEST_TIMEOUT_MS;
      let changedNs = false;
      if (nsNew !== NAMESPACE) { changedNs = true; NAMESPACE = nsNew; rebindNamespace(NAMESPACE); }
      AUTH_TOKEN = tokenNew;
      REQUEST_TIMEOUT_MS = toNew;
      logHttp('config updated: ns=%s changed=%s timeout=%d auth=%s', NAMESPACE, String(changedNs), REQUEST_TIMEOUT_MS, AUTH_TOKEN ? '***' : '(empty)');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, namespace: NAMESPACE, auth_token: AUTH_TOKEN, request_timeout_ms: REQUEST_TIMEOUT_MS, changed_namespace: changedNs })); return;
    }
    if (req.method === 'GET' && parsed.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true })); return;
    }
    if (req.method === 'POST' && (parsed.pathname === '/v1/chat/completions' || parsed.pathname === '/openai/chat/completions')) {
      await handleChatCompletions(req, res); return;
    }
    if (req.method === 'POST' && parsed.pathname === '/v1/openai/abort') { await handleAbort(req, res); return; }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
  } catch (e: any) {
    logErr('unhandled %s %s error: %s', req.method, req.url, e?.message || String(e));
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: e?.message || String(e) } }));
  }
});

const io = new IOServer(server, { cors: { origin: '*'}, transports: ['websocket'] });
let ns = io.of(NAMESPACE);

const clients: AnyObj[] = [];
let rrIndex = 0;

function connectionHandler(socket: AnyObj) {
  const token = (socket.handshake.auth && socket.handshake.auth.token) || '';
  if (AUTH_TOKEN && token !== AUTH_TOKEN) {
    logIO('reject %s: bad token', (socket && socket.id) || 'unknown');
    socket.disconnect(true);
    return;
  }
  clients.push(socket);
  logIO('connected %s, total=%d', (socket && socket.id) || 'unknown', clients.length);
  // 接收来自 Tavern 客户端推送的正则规则
  try {
    socket.on('tavern.regexes.update', (arr: any[]) => {
      try {
        // 仅存储启用的规则，减少处理量
        const list = Array.isArray(arr) ? arr.filter((r: any) => r && r.enabled) : [];
        (socket as any).data = (socket as any).data || {};
        (socket as any).data.regexes = list;
        logIO('regexes updated from %s count=%d', (socket && socket.id) || 'unknown', list.length);
      } catch (e: any) {
        logErr('regexes.update error: %s', e?.message || String(e));
      }
    });
  } catch (e) { /* ignore */ }
  socket.on('disconnect', () => {
    const idx = clients.indexOf(socket);
    if (idx >= 0) clients.splice(idx, 1);
    logIO('disconnected %s, total=%d', (socket && socket.id) || 'unknown', clients.length);
  });
}

ns.on('connection', connectionHandler);

function rebindNamespace(newNsPath: string) {
  try { ns.removeAllListeners('connection'); } catch (e) { /* ignore */ }
  try {
    // Reset client pool
    clients.splice(0, clients.length);
    rrIndex = 0;
  } catch (e) { /* ignore */ }
  ns = io.of(newNsPath);
  ns.on('connection', connectionHandler);
  console.log(`[socketio-relay] namespace switched to ${newNsPath}`);
  logIO('namespace switched to %s', newNsPath);
}

function pickClient(): AnyObj | null {
  if (clients.length === 0) { logErr('pickClient: no clients'); return null; }
  const client = clients[rrIndex % clients.length];
  logIO('pickClient rr=%d size=%d id=%s', rrIndex, clients.length, client && client.id);
  rrIndex = (rrIndex + 1) % (clients.length || 1);
  return client;
}

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = ''; const limit = 2 * 1024 * 1024;
    req.on('data', (chunk) => { data += chunk; if (data.length > limit) { reject(new Error('payload too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function sseStart(res: http.ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}
function sseData(res: http.ServerResponse, obj: any) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}
function sseDone(res: http.ServerResponse) {
  res.write('data: [DONE]\n\n'); res.end();
}

function toOpenAIError(message: string, type = 'server_error') {
  return { error: { message, type } };
}

function mapBodyToTavernPayload(body: any, reqId: string): any {
  const { tavern = {}, id: _ignored, ...rest } = body || {};
  // rest 包含 OpenAI Chat Completions 的所有原始字段（如 temperature、top_p、max_tokens、response_format、seed、stop、n 等）
  const payload: any = {
    id: reqId,
    ...rest,
    tavern,
  };
  return payload;
}

function applyRegexes(text: string, regexes: AnyObj[]): string {
  try {
    if (!Array.isArray(regexes)) return text;
    let out = String(text ?? '');
    for (const r of regexes) {
      try {
        if (!r?.enabled) continue;
        if (!r?.source?.ai_output) continue;
        if (!r?.destination?.display) continue;
        const pat = String(r.find_regex || '');
        const rep = String(r.replace_string ?? '');
        if (!pat) continue;
        const re = new RegExp(pat, 'gms');
        out = out.replace(re, rep);
      } catch (e) { /* ignore one rule */ }
    }
    return out;
  } catch {
    return text;
  }
}
function awaitOnce(socket: AnyObj, event: string, handler: (p: any)=>void) {
  const fn = (p: any) => { try { handler(p); } catch (e) { /* ignore */ } };
  socket.on(event, fn);
  return () => socket.off(event, fn);
}

async function handleChatCompletions(req: http.IncomingMessage, res: http.ServerResponse) {
  const client = pickClient();
  if (!client) { logErr('no tavern client connected'); res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(toOpenAIError('no tavern client connected', 'unavailable'))); return; }
  const body = await readJson(req);
  if (!Array.isArray(body?.messages) || typeof body.model !== 'string' || !body.model) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(toOpenAIError('model (string) and messages (array) are required', 'bad_request')));
    return;
  }
  const reqId = body.id || randomUUID();
  const stream = body.stream === true;
  const msgCount = Array.isArray(body?.messages) ? body.messages.length : 0;
  logChat('create id=%s model=%s stream=%s messages=%d', reqId, body?.model, String(stream), msgCount);
  const payload = mapBodyToTavernPayload(body, reqId);

  const cleanupFns: Array<() => void> = [];
  let finished = false;
  const timeout = setTimeout(() => {
    if (finished) return;
    finished = true;
    cleanupFns.forEach(fn => fn());
    try {
      logErr('timeout id=%s', reqId);
      if (stream) {
        // SSE 超时通过流返回错误并结束
        sseData(res, toOpenAIError('request timeout', 'timeout'));
        sseDone(res);
      } else {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(toOpenAIError('request timeout', 'timeout')));
      }
    } catch (e) { /* ignore */ }
  }, REQUEST_TIMEOUT_MS);

  const cleanupAll = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    cleanupFns.forEach(fn => fn());
  };

  if (stream) {
    sseStart(res);
    let acc = '';
    cleanupFns.push(awaitOnce(client, 'openai.chat.completions.chunk', (p) => {
      if (!p || p.id !== reqId) return;
      try {
        const delta = ((((p || {}).data || {}).choices || [])[0] || {}).delta?.content || '';
        if (typeof delta === 'string' && delta) {
          acc += delta;
        }
      } catch (e) { /* ignore */ }
    }));
    cleanupFns.push(awaitOnce(client, 'openai.chat.completions.done', (p) => {
      if (!p || p.id !== reqId) return;
      try {
        const processed = applyRegexes(acc, ((client as any) && (client as any).data && (client as any).data.regexes) || []);
        const now = Math.floor(Date.now() / 1000);
        const chunk1 = {
          id: `chatcmpl_${reqId}`,
          object: 'chat.completion.chunk',
          created: now,
          model: body?.model || 'sillytavern',
          choices: [{ index: 0, delta: { content: processed }, finish_reason: null }],
        };
        sseData(res, chunk1);
        const chunkDone = {
          id: `chatcmpl_${reqId}`,
          object: 'chat.completion.chunk',
          created: now,
          model: body?.model || 'sillytavern',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        };
        sseData(res, chunkDone);
        sseDone(res);
      } finally { cleanupAll(); }
    }));
    cleanupFns.push(awaitOnce(client, 'openai.chat.completions.error', (p) => {
      if (!p || p.id !== reqId) return;
      try {
        // 流式错误通过 SSE 返回
        logErr('stream error id=%s msg=%s', reqId, (p && p.error && p.error.message) || '');
        sseData(res, toOpenAIError(p?.error?.message || 'generation error', p?.error?.type || 'generation_error'));
        sseDone(res);
      } finally { cleanupAll(); }
    }));
  } else {
    cleanupFns.push(awaitOnce(client, 'openai.chat.completions.result', (p) => {
      if (!p || p.id !== reqId) return;
      try {
        logChat('result id=%s', reqId);
        const data = p.data || {};
        try {
          const msg = ((((data || {}).choices || [])[0] || {}).message) || {};
          if (typeof msg.content === 'string') {
            const list = ((client as any) && (client as any).data && (client as any).data.regexes) || [];
            msg.content = applyRegexes(msg.content, list);
          }
        } catch (e) { /* ignore */ }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } finally { cleanupAll(); }
    }));
    cleanupFns.push(awaitOnce(client, 'openai.chat.completions.error', (p) => {
      if (!p || p.id !== reqId) return;
      try {
        logErr('error id=%s msg=%s', reqId, (p && p.error && p.error.message) || '');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(toOpenAIError(p?.error?.message || 'generation error', p?.error?.type || 'generation_error')));
      } finally { cleanupAll(); }
    }));
  }

  cleanupFns.push(awaitOnce(client, 'openai.chat.completions.accepted', (p) => {
    if (!p || p.id !== reqId) return;
  }));

  client.emit('openai.chat.completions.create', payload);
}

async function handleAbort(req: http.IncomingMessage, res: http.ServerResponse) {
  const client = pickClient();
  if (!client) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(toOpenAIError('no tavern client connected', 'unavailable'))); return; }
  const body = await readJson(req);
  const reqId = body.id || body.req_id;
  if (!reqId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(toOpenAIError('id/req_id is required', 'bad_request'))); return; }
  logChat('abort id=%s', reqId);
  client.emit('openai.abort', { id: reqId, req_id: reqId });
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }));
}

server.listen(PORT, () => {
  console.log(`[socketio-relay] listening on :${PORT}, namespace=${NAMESPACE}, clients=${clients.length}`);
  log('listening on :%d, namespace=%s, clients=%d', PORT, NAMESPACE, clients.length);
});
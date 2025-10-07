/**
 * SocketIO 正则桥 - 在聊天楼层中通过 <socket></socket> 标记加载一个 iframe，
 * 该 iframe 位于楼层消息 iframe 环境中，可以使用 eventOn 等事件 API，
 * 并通过 postMessage 将生成事件转发到父页面（扩展主页面）。
 *
 * 使用方法：
 * - 在任意消息楼层文本中插入 <socket></socket> 即可加载桥接 iframe。
 * - 本扩展会在启用中转时调用 installRegexBridge()，确保正则存在并启用。
 */

export async function installRegexBridge(): Promise<void> {
  try {
    const w: any = window as any;
    const TH = w.TavernHelper;
    if (!TH?.updateTavernRegexesWith || !TH?.getTavernRegexes) {
      // 酒馆助手不可用或接口缺失，直接返回
      return;
    }

    const bridgeName = 'SocketIO-Bridge';
    const findRe = '<socket>([\\s\\S]*?)</socket>'; // 捕获内部内容的非贪婪匹配，便于后续扩展
    const replacement = buildIframeReplacement();

    await TH.updateTavernRegexesWith(async (regexes: any[]) => {
      let existing = Array.isArray(regexes)
        ? regexes.find((r: any) => r?.script_name === bridgeName || r?.find_regex === findRe)
        : undefined;

      if (existing) {
        // 复用并更新现有桥接正则
        existing.enabled = true;
        existing.run_on_edit = false;
        existing.scope = existing.scope || 'global';
        existing.find_regex = findRe;
        existing.replace_string = replacement;
        existing.source = { user_input: false, ai_output: true, slash_command: false, world_info: false };
        existing.destination = { display: true, prompt: false };
        existing.min_depth = 0;
        existing.max_depth = null;
      } else {
        const uuid = w.SillyTavern?.uuidv4?.() || Math.random().toString(36).slice(2);
        regexes.push({
          id: uuid,
          script_name: bridgeName,
          enabled: true,
          run_on_edit: false,
          scope: 'global',
          find_regex: findRe,
          replace_string: replacement,
          source: { user_input: false, ai_output: true, slash_command: false, world_info: false },
          destination: { display: true, prompt: false },
          min_depth: 0,
          max_depth: null,
        });
      }
      return regexes;
    });
  } catch {
    // 静默失败，避免影响 UI
  }
}

/**
 * 生成用于替换的 iframe 标记字符串。
 * 使用 sandbox="allow-scripts allow-same-origin" 的 srcdoc 运行桥接脚本，
 * 在消息 iframe 环境中监听生成相关事件并转发给父窗口。
 */
function buildIframeReplacement(): string {
  // 使用模板字符串避免繁琐转义与拼接错误；保留 $1 以显示/携带占位符内部内容
  const html = `
\`\`\`
<head>
<script src="https://cdn.tailwindcss.com"></script>
<script>(function(){
  try {
    function $(sel, root){ return (root||document).querySelector(sel); }
    function dbg(msg, data){
      try { console.info("[RegexBridge/srcdoc] " + msg, data || {}); } catch (e) {}
    }
    function post(t, p) {
      try {
        var text = '';
        try { text = (p && (p.incremental_text || p.full_text || p.text || '')) || ''; } catch(e){}
        dbg("post -> " + t, { id: p && p.id, len: text.length });
        parent.postMessage({ source: 'socketio-extension', type: t, payload: p }, '*');
      } catch (e) {
        dbg("post failed", e);
      }
    }
    // 基本环境信息
    dbg("init", { ua: navigator.userAgent, ts: Date.now() });
    var scriptEl = document.currentScript;
    dbg("scriptEl", { exists: !!scriptEl });
    // 容器定位策略：优先找最近的 data-socket-content 容器，避免类名前缀导致匹配失败
    var container = null;
    try {
      // 1) 如果脚本紧邻容器，则使用 previousElementSibling
      container = scriptEl && scriptEl.previousElementSibling;
      // 2) 若未命中或缺少标识，则在文档内兜底查找
      if (!container || !container.hasAttribute('data-socket-content')) {
        container = document.querySelector('div[data-socket-content]');
      }
    } catch (e) {}
    dbg("container", { exists: !!container, className: container && container.className, dataContent: container && container.getAttribute('data-socket-content') });
    // 校验：使用属性而不是类名，兼容宿主对类名的前缀化
    if (!container || !container.hasAttribute('data-socket-content')) {
      dbg("container not found or missing data-socket-content", { ok: false });
      post('BRIDGE_ERROR', { message: 'container not found' });
    } else {
      // 如果存在类名前缀，也记录一下以便调试
      try {
        if (!String(container.className).includes('socketio-bridge')) {
          dbg("container class prefixing detected", { className: container.className });
        }
      } catch(e){}
    }
    var fullPre = container ? container.querySelector('pre[data-role="full"]') : null;
    var statusEl = container ? container.querySelector('[data-role="status"]') : null;
    // 缓存增量文本，便于在桥内即时显示
    var incBuf = '';
    function setStatus(text){
      if (statusEl) statusEl.textContent = text;
      dbg("status", { text: text });
    }
    function renderFull(x, id){
      if (!fullPre) {
        dbg("renderFull skipped: fullPre missing", { id: id });
        return;
      }
      setStatus('已接收完整内容');
      fullPre.textContent = (x || '');
      try { fullPre.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      dbg("renderFull done", { id: id, len: (x || '').length });
    }
    function onInc(x, id) {
      dbg("onInc", { id: id, len: (x || '').length });
      try {
        incBuf += x || '';
        if (fullPre) {
          setStatus('接收流式片段中…');
          fullPre.textContent = incBuf;
          try { fullPre.scrollIntoView({ block: 'nearest' }); } catch (e) {}
        }
      } catch (e) {}
      post('STREAM_TOKEN_RECEIVED_INCREMENTALLY', { incremental_text: x || '', id: id });
    }
    function onFull(x, id) {
      dbg("onFull", { id: id, len: (x || '').length });
      incBuf = x || '';
      post('STREAM_TOKEN_RECEIVED_FULLY', { full_text: x || '', id: id });
      renderFull(x, id);
    }
    function onEnd(x, id) {
      dbg("onEnd", { id: id, len: (x || '').length });
      setStatus('生成结束');
      post('GENERATION_ENDED', { text: x || '', id: id });
    }
    // 监听错误以便定位问题
    try {
      window.addEventListener('error', function(ev){
        try {
          dbg("window.error", { message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno });
        } catch(e){}
      });
    } catch(e) {}
    // 环境能力探测
    var envInfo = {};
    try { envInfo.eventOnType = typeof eventOn; } catch(e) { envInfo.eventOnType = 'unavailable'; }
    try { envInfo.iframeEventsKeys = (typeof iframe_events !== 'undefined' && iframe_events) ? Object.keys(iframe_events || {}) : null; } catch(e) { envInfo.iframeEventsKeys = 'unavailable'; }
    dbg("env", envInfo);
    // 注册事件
    if (typeof eventOn === 'function' && typeof iframe_events !== 'undefined') {
      try {
        dbg("registering events", { keys: Object.keys(iframe_events || {}) });
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, onInc);
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, onFull);
        eventOn(iframe_events.GENERATION_ENDED, onEnd);
        setStatus('事件已注册，等待数据…');
        dbg("events registered OK");
      } catch (e) {
        dbg("eventOn register failed", e);
        post('BRIDGE_ERROR', { message: String(e) });
      }
    } else {
      dbg("eventOn unavailable in iframe");
      post('BRIDGE_ERROR', { message: 'eventOn unavailable in iframe' });
    }
    setStatus('桥已就绪');
    post('BRIDGE_READY', { ok: true });
    dbg("bridge ready posted");
  } catch (e) {
    try { console.error("[RegexBridge/srcdoc] top-level error", e); } catch(_){}
  }
})();</script>
</head>
<body>
<div class="socketio-bridge bg-slate-800/80 border border-slate-700 rounded-md shadow p-3 my-2 space-y-2" data-socket-content="$1">
  <div class="text-xs uppercase tracking-wide text-slate-400">SocketIO Bridge</div>
  <div class="text-xs text-slate-400" data-role="status">等待生成完成...</div>
  <pre class="whitespace-pre-wrap text-sm text-slate-100 font-mono bg-slate-900/80 rounded p-2 border border-slate-700" data-role="full"></pre>
</div>
</body>
\`\`\`
`;
  return html;
}

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
<script src="https://cdn.tailwindcss.com"></script>
<div class="socketio-bridge bg-slate-800/80 border border-slate-700 rounded-md shadow p-3 my-2 space-y-2" data-socket-content="$1">
  <div class="text-xs uppercase tracking-wide text-slate-400">SocketIO Bridge</div>
  <div class="text-xs text-slate-400" data-role="status">等待生成完成...</div>
  <pre class="whitespace-pre-wrap text-sm text-slate-100 font-mono bg-slate-900/80 rounded p-2 border border-slate-700" data-role="full"></pre>
</div>
<script>(function(){
  try {
    function $(sel, root){ return (root||document).querySelector(sel); }
    function post(t, p) {
      try {
        parent.postMessage({ source: 'socketio-extension', type: t, payload: p }, '*');
      } catch (e) {}
    }
    var scriptEl = document.currentScript;
    var container = scriptEl && scriptEl.previousElementSibling;
    if (!container || !container.classList.contains('socketio-bridge')) {
      post('BRIDGE_ERROR', { message: 'container not found' });
    }
    var fullPre = container ? container.querySelector('pre[data-role="full"]') : null;
    var statusEl = container ? container.querySelector('[data-role="status"]') : null;
    function setStatus(text){
      if (statusEl) statusEl.textContent = text;
    }
    function renderFull(x, id){
      if (!fullPre) return;
      setStatus('已接收完整内容');
      fullPre.textContent = (x || '');
      try { fullPre.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    }
    function onInc(x, id) { post('STREAM_TOKEN_RECEIVED_INCREMENTALLY', { incremental_text: x || '', id: id }); }
    function onFull(x, id) {
      post('STREAM_TOKEN_RECEIVED_FULLY', { full_text: x || '', id: id });
      renderFull(x, id);
    }
    function onEnd(x, id) { post('GENERATION_ENDED', { text: x || '', id: id }); }
    if (typeof eventOn === 'function' && typeof iframe_events !== 'undefined') {
      try {
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, onInc);
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, onFull);
        eventOn(iframe_events.GENERATION_ENDED, onEnd);
      } catch (e) {
        post('BRIDGE_ERROR', { message: String(e) });
      }
    } else {
      post('BRIDGE_ERROR', { message: 'eventOn unavailable in iframe' });
    }
    post('BRIDGE_READY', { ok: true });
  } catch (e) {}
})();</script>`;
  return html;
}

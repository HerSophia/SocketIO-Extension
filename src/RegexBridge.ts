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
    const findRe = '<socket></socket>'; // 精确匹配占位符
    const replacement = buildIframeReplacement();

    await TH.updateTavernRegexesWith(async (regexes: any[]) => {
      let existing = Array.isArray(regexes)
        ? regexes.find(
            (r: any) =>
              r?.script_name === bridgeName ||
              r?.find_regex === findRe,
          )
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
        const uuid =
          w.SillyTavern?.uuidv4?.() || Math.random().toString(36).slice(2);
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
  const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent;color:#9aa8bd;font:12px/1.4 system-ui,sans-serif;}
#bridge{padding:4px 6px;border:1px solid rgba(110,120,140,.35);border-radius:6px;background:rgba(42,48,60,.22);}
</style></head><body>
<div id="bridge">SocketIO Bridge Active</div>
<script>
(function(){
  function post(type, payload){
    try{ parent.postMessage({ source: 'socketio-extension', type, payload }, '*'); }catch(e){}
  }
  try{
    post('BRIDGE_READY', { ok: true });
    function onInc(incremental_text, id){ post('STREAM_TOKEN_RECEIVED_INCREMENTALLY', { incremental_text: incremental_text || '', id: id }); }
    function onFull(full_text, id){ post('STREAM_TOKEN_RECEIVED_FULLY', { full_text: full_text || '', id: id }); }
    function onEnd(text, id){ post('GENERATION_ENDED', { text: text || '', id: id }); }
    // 在消息 iframe 环境中挂载事件监听
    if (typeof eventOn === 'function' && typeof iframe_events !== 'undefined'){
      try{
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, onInc);
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, onFull);
        eventOn(iframe_events.GENERATION_ENDED, onEnd);
      }catch(e){ post('BRIDGE_ERROR', { message: String(e) }); }
    }else{
      post('BRIDGE_ERROR', { message: 'eventOn unavailable in iframe' });
    }
  }catch(e){ post('BRIDGE_ERROR', { message: String(e) }); }
})();
</script>
</body></html>`;

  // 在 srcdoc 属性中使用引号需要转义
  const iframe =
    '<iframe class="socketio-bridge" title="SocketIO Bridge" ' +
    'sandbox="allow-scripts allow-same-origin" ' +
    'style="display:block;max-width:100%;border:0;margin:4px 0;" ' +
    'srcdoc="' + srcdoc.replace(/"/g, '&quot;') + '"></iframe>';

  return iframe;
}
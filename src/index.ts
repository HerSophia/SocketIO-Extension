import '@/global.css';
import { initPanel } from '@/panel';

function ensureTailwindCdn(): Promise<void> {
  return new Promise(resolve => {
    const w = window as any;

    // 目标配置：使用 tw- 前缀，避免与宿主样式冲突；禁用 preflight；darkMode 采用 class
    const desiredConfig = {
      prefix: 'tw-',
      darkMode: 'class',
      corePlugins: { preflight: false },
    } as const;

    // 若 Tailwind 已存在，则更新配置并尝试刷新
    const applyAndRefresh = () => {
      try {
        w.tailwind = w.tailwind || {};
        w.tailwind.config = Object.assign({}, w.tailwind.config || {}, desiredConfig);
        if (typeof w.tailwind.refresh === 'function') {
          w.tailwind.refresh();
        }
      } catch (e) {
        console.debug('apply tailwind config failed', e);
      }
    };

    if (w.tailwind && w.tailwind?.version) {
      applyAndRefresh();
      return resolve();
    }

    const head = document.head || document.getElementsByTagName('head')[0];

    // 先注入配置，再加载 CDN 脚本，确保前缀与模式生效
    const configScript = document.createElement('script');
    configScript.type = 'text/javascript';
    configScript.text =
      'window.tailwind = window.tailwind || {};' +
      'window.tailwind.config = Object.assign({}, window.tailwind.config || {}, { prefix: "tw-", darkMode: "class", corePlugins: { preflight: false } });';
    head.appendChild(configScript);

    const script = document.createElement('script');
    script.src = 'https://cdn.tailwindcss.com';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve(); // 降级处理：即使加载失败也不阻塞面板初始化
    head.appendChild(script);
  });
}

$(() => {
  ensureTailwindCdn()
    .catch(() => {})
    .finally(() => {
      initPanel();

      // 确保面板挂载后的动态类名被 JIT 编译：延后两帧后刷新
      try {
        const w: any = window as any;
        if (w.tailwind && typeof w.tailwind.refresh === 'function') {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              try {
                w.tailwind.refresh();
              } catch (e) {
                console.debug('tailwind.refresh after mount failed', e);
              }
            }),
          );
        }
      } catch (e) {
        console.debug('schedule tailwind.refresh failed', e);
      }
    });
});

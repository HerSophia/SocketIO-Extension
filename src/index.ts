import '@/global.css';
import { initPanel } from '@/panel';

function ensureTailwindCdn(): Promise<void> {
  return new Promise(resolve => {
    const w = window as any;
    if (w.tailwind && w.tailwind?.version) {
      return resolve();
    }
    const head = document.head || document.getElementsByTagName('head')[0];

    // Configure Tailwind Play CDN with a safe prefix to avoid global conflicts
    const configScript = document.createElement('script');
    configScript.type = 'text/javascript';
    configScript.text =
      'window.tailwind = window.tailwind || {};' +
      'window.tailwind.config = Object.assign({}, window.tailwind.config || {}, { prefix: "tw-", darkMode: "class" });';
    head.appendChild(configScript);

    const script = document.createElement('script');
    script.src = 'https://cdn.tailwindcss.com';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve(); // degrade gracefully; UI will still work with default styles
    head.appendChild(script);
  });
}

$(() => {
  ensureTailwindCdn().catch(() => {}).finally(() => {
    initPanel();
  });
});

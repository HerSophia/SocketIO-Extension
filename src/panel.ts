import Panel from '@/Panel.vue';
import { App } from 'vue';

const app = createApp(Panel);

const pinia = createPinia();
app.use(pinia);

declare module 'vue' {
  interface ComponentCustomProperties {
    t: typeof t;
  }
}
const i18n = {
  install: (app: App) => {
    app.config.globalProperties.t = t;
  },
};
app.use(i18n);

export function initPanel() {
<<<<<<< HEAD
  console.info("[panel.ts/initPanel] '初始化面板挂载点'");
  const $app = $('<div id="tavern_extension_example">').appendTo('#extensions_settings2');
  console.info("[panel.ts/initPanel] '开始挂载'", {
    target: '#extensions_settings2',
    element: '#tavern_extension_example',
  });
  app.mount($app[0]);
  console.info("[panel.ts/initPanel] '挂载完成'");
=======
  const $app = $('<div id="tavern_extension_example">').appendTo('#extensions_settings2');
  app.mount($app[0]);
>>>>>>> e48da6b7bf48992b1630e869e15a5b9c7af14dd4
}

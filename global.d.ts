<<<<<<< HEAD
//// 引入本项目自带的全局声明
/// <reference path="./@types/iframe/event.d.ts" />
/// <reference path="./@types/iframe/exported.tavernhelper.d.ts" />
/// <reference path="./@types/iframe/exported.sillytavern.d.ts" />
/// <reference path="./@types/iframe/exported.mvu.d.ts" />
/// <reference path="./@types/iframe/exported.ejstemplate.d.ts" />
/// <reference path="./@types/iframe/util.d.ts" />
/// <reference path="./@types/iframe/variables.d.ts" />
/// <reference path="./@types/function/index.d.ts" />

export {};

// 全局工具类型（来自 type-fest）
declare global {
  type LiteralUnion<T extends U, U = string> = import('type-fest').LiteralUnion<T, U>;
  type SetRequired<T, K extends keyof T> = import('type-fest').SetRequired<T, K>;
  type PartialDeep<T> = import('type-fest').PartialDeep<T>;
}

// Vue 单文件组件类型
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// SillyTavern 运行时外部模块（类型兜底，供 TS 通过）
declare module '@sillytavern/scripts/utils' {
  export function uuidv4(): string;
}
declare module '@sillytavern/script' {
  export function saveSettingsDebounced(): void;
}
declare module '@sillytavern/scripts/extensions' {
  export const extension_settings: any;
}

// 外部全局（由 vite externals 提供）
=======
>>>>>>> 6d662d8a900facc0f9ced8afc9e9072a4daa2263
declare const hljs: typeof import('highlight.js').default;
declare const Popper: typeof import('@popperjs/core');

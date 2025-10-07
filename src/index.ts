import '@/global.css';
import { initPanel } from '@/panel';

$(() => {
  try {
    initPanel();
  } catch (e) {
    console.debug('init panel failed', e);
  }
});

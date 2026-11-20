import { render } from 'solid-js/web';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

render(() => <App />, document.getElementById('root')!);

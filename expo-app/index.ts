import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './App';

// Global dark theme background reset & PWA initialization for Web / Mobile browsers
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.id = 'iptv-global-reset';
  style.textContent = `
    html, body, #root {
      background-color: #090b10 !important;
      color: #e2e8f0 !important;
      margin: 0 !important;
      padding: 0 !important;
      height: 100% !important;
      width: 100% !important;
      overflow-x: hidden !important;
      -webkit-tap-highlight-color: transparent !important;
    }
    * {
      box-sizing: border-box;
    }
  `;
  document.head.appendChild(style);

  // PWA Manifest & Meta Tags
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = '/manifest.json';
    document.head.appendChild(manifestLink);
  }

  const metaTags: Array<{ name?: string; content: string }> = [
    { name: 'theme-color', content: '#090b10' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    { name: 'apple-mobile-web-app-title', content: 'IPTV Player' }
  ];

  metaTags.forEach(({ name, content }) => {
    if (name && !document.querySelector(`meta[name="${name}"]`)) {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
    }
  });

  // Register Service Worker for PWA
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[PWA] Service Worker registrato con successo (scope: ' + reg.scope + ')');
      }).catch((err) => {
        console.warn('[PWA] Registrazione Service Worker:', err);
      });
    });
  }
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);

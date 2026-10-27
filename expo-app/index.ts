import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './App';

// Global dark theme background reset for Web / Mobile browsers
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
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);

import { Platform } from 'react-native';

class PWAService {
  private deferredPrompt: any = null;
  private isInstalled: boolean = false;
  private listeners: Array<(canInstall: boolean) => void> = [];

  constructor() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (e: any) => {
        e.preventDefault();
        this.deferredPrompt = e;
        this.notifyListeners(true);
      });

      window.addEventListener('appinstalled', () => {
        this.deferredPrompt = null;
        this.isInstalled = true;
        this.notifyListeners(false);
      });

      // Check if already running in standalone mode (installed)
      if (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true
      ) {
        this.isInstalled = true;
      }
    }
  }

  public canInstall(): boolean {
    return !!this.deferredPrompt || this.isIOS();
  }

  public isStandalone(): boolean {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  }

  public isIOS(): boolean {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) && !this.isStandalone();
  }

  public subscribe(listener: (canInstall: boolean) => void): () => void {
    this.listeners.push(listener);
    listener(this.canInstall());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(canInstall: boolean) {
    this.listeners.forEach(l => l(canInstall));
  }

  public async promptInstall(): Promise<'installed' | 'dismissed' | 'ios_guide'> {
    if (this.isIOS()) {
      return 'ios_guide';
    }

    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const choiceResult = await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      this.notifyListeners(false);
      return choiceResult.outcome === 'accepted' ? 'installed' : 'dismissed';
    }

    return 'dismissed';
  }
}

export const PwaInstallService = new PWAService();

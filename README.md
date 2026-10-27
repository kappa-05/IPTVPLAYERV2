# 🎬 IPTV Player V2 - React Native & Expo Edition

Un'applicazione IPTV cross-platform moderna, fluida e ad altissime prestazioni realizzata in **React & React Native (Expo SDK 58)**, supportata da un backend Python leggero con **CORS Proxy**, riscrittura automatica HLS e server demo integrato.

Funziona perfettamente su **Browser Desktop**, **Smartphone / Tablet (iOS & Android via Web ed Expo Go)** e **Smart TV**.

---

## 🚀 Caratteristiche Principali

### 1. 🔑 Doppio Metodo di Accesso
- **Xtream Codes API**: Login con URL server (`player_api.php`), username e password.
- **Link Playlist M3U Diretto**: Incolla qualsiasi URL `.m3u` / `.m3u8` senza credenziali; il parser estrarrà categorie, canali, loghi e stream.
- **Profili Multi-Account**: Salvataggio automatico e persistente in `AsyncStorage` con passaggio istantaneo tra account salvati.
- **Account Demo (1-Click)**: Test immediato con canali live, film VOD e trailer reali senza bisogno di una lista propria.

### 2. 📅 Guida TV (EPG) Completa & In-Player
- **Tab Dedicato "Guida TV"**: Visualizzazione a due colonne con lista canali, ricerca rapida e palinsesto orario della giornata con trame e dettagli.
- **Indicatori In Onda & Avanzamento**: Barra di progresso in tempo reale che mostra la percentuale trascorsa del programma corrente sia nelle card canale che nella Guida TV.
- **Guida TV nel Player**: Pulsante Guida TV integrato nei controlli del player per consultare il palinsesto del canale senza interrompere la visione.
- **Fallback Tematico Dinamico**: Generazione automatica di palinsesti realistici sincronizzati sull'ora corrente per canali privi di feed XMLTV.

### 3. 📺 Canali Live, Film VOD e Serie TV
- **Canali Live**: Card canali con logo, programma in onda e tasto rapido preferiti.
- **Film VOD**: Locandine cinematografiche 2:3 con valutazione e badge contenitore video.
- **Serie TV**: Browser stagioni ed episodi con sinossi della trama e riproduzione diretta.
- **Preferiti**: Spazio dedicato per canali, film e serie contrassegnati dalla stella.

### 4. ⚡ Motore Video Universale & Proxy CORS
- **Web (PC & Mobile)**: Motore doppio `Hls.js` + HTML5 per riproduzione fluida di flussi `.m3u8` anche su browser Windows/Edge/Chrome che non supportano HLS nativamente.
- **Mobile Nativo (Expo Go)**: Riproduzione accelerata via hardware tramite `expo-av`.
- **CORS Proxy Automatico**: Risolve i blocchi cross-origin e la policy "Mixed Content" (HTTPS -> HTTP) su reti remote e dispositivi mobili.

---

## 🛠️ Come Avviare l'Applicazione in Locale

### Metodo 1: Doppio Clic (Windows)
Fai doppio clic sul file `start.bat`. Verrà avviato il server e il browser si aprirà su:
```
http://localhost:8080
```
Da smartphone connesso allo stesso Wi-Fi del PC:
```
http://<IP_LOCALE_PC>:8080
```

### Metodo 2: Sviluppo Mobile con Expo Go (QR Code)
Fai doppio clic su `start-dev.bat`. Verrà avviato il server Expo con tunnel cloud attivo: inquadra il QR Code con l'app **Expo Go** del telefono.

---

## ☁️ Deployment su Render (Cloud)

Il repository include già [`Dockerfile`](./Dockerfile) e [`render.yaml`](./render.yaml) configurati per il deployment istantaneo:
1. Accedi a [dashboard.render.com](https://dashboard.render.com).
2. Seleziona **New +** -> **Web Service** e collega questo repository.
3. Seleziona Runtime **Docker** e piano **Free**.
4. Clicca su **Deploy**: Render compilerà il frontend Expo e avvierà il servizio pubblico HTTPS.

---

## 📁 Struttura del Progetto

```
IPTVPlayerV2/
├── server.py              # Server Python zero-dependency (Static host, CORS proxy, Demo API)
├── Dockerfile             # Multi-stage Docker build per Render
├── render.yaml            # Blueprint Render per deploy a 1 clic
├── start.bat              # Script di avvio per PC e browser locale
├── start-dev.bat          # Script per sviluppo mobile con Expo Go
├── README.md              # Documentazione del progetto
└── expo-app/              # Applicazione React & React Native (Expo SDK 58)
    ├── App.tsx            # Orchestratore principale, navigazione e stato
    ├── index.ts           # Entry point Metro / Expo
    ├── package.json       # Dipendenze React Native, Expo e HLS
    └── src/
        ├── types/         # Definizioni TypeScript (Account, EPG, Stream, Serie)
        ├── theme/         # Palette colori Obsidian & Royal Blue (no stile AI)
        ├── services/      # Client Xtream, M3U Parser, EPG Service, Storage
        └── components/    # Header, EpgGuideView, EpgModal, UniversalVideoPlayer...
```

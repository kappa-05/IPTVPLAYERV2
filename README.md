# 🎬 IPTV Player V2 - Xtream Codes Edition

Un'applicazione web moderna, fluida e ad altissime prestazioni per la fruizione di playlist IPTV tramite API **Xtream Codes**, suddivisa nelle tre macro-categorie: **Canali Live**, **Film VOD** e **Serie TV**.

---

## 🚀 Caratteristiche Principali

### 1. 🔑 Sezione di Login Xtream Codes
- Supporto standard per qualsiasi server IPTV basato su protocollo Xtream Codes (`player_api.php`).
- Campi configurabili: **Server URL / Host**, **Username**, **Password**.
- **Profili Recenti / Multi-Account**: salvataggio automatico delle credenziali in IndexedDB per cambi account immediati senza reinserire i dati.
- **Bypass CORS / Proxy integrato**: risolve automaticamente il blocco imposto dai browser per le chiamate cross-origin verso server IPTV HTTP o senza intestazioni CORS.
- **Account Demo (1-Click)**: possibilità di testare istantaneamente tutte le funzionalità con un mock server Xtream completo di canali, film, serie tv e trailer/stream HLS reali.

### 2. ⚡ Caricamento Playlist Super Ottimizzato
- **Architettura a Due Livelli (Bootstrap Istantaneo)**:
  - All'accesso scarica solo le informazioni utente e le alberature delle categorie in parallelo (<300ms).
  - I flussi vengono caricati **on-demand** per singola categoria (`&category_id=...`), evitando download massivi da decine di megabyte che bloccano il browser.
- **Cache Locale IndexedDB**:
  - Salva categorie e flussi in locale con TTL intelligente.
  - Al riavvio dell'applicazione i contenuti si aprono istantaneamente in meno di 50 millisecondi.
  - Pulsante **🔄 Aggiorna Playlist** per forzare la risincronizzazione con il server quando desiderato.
- **Virtual Grid Rendering a 60 FPS**:
  - Algoritmo di virtualizzazione che mantiene nel DOM esclusivamente le schede visibili nell'area dello schermo.
  - Fluidità costante anche con playlist da oltre 50.000 canali o film.
- **Ricerca Istantanea Real-Time**:
  - Filtraggio reattivo con debounce a 150ms sia sui nomi che sugli ID stream.

### 3. 📺 Visualizzazione Playlist in 3 Categorie
- **Canali Live**:
  - Elenco suddiviso per categorie (Nazionali, Cinema, Sport, Documentari, Bambini, ecc.).
  - Badge LIVE con indicatore a impulsi, ID canale e logo ad alta risoluzione con fallback automatico.
  - Riproduzione istantanea con player HLS integrato.
- **Film VOD**:
  - Locandine verticali (formato cinema 2:3) con badge qualità (4K, MKV, MP4) e punteggio IMDb.
  - Supporto per estensioni container video multiple.
- **Serie TV**:
  - Schede serie con locandina e genere.
  - **Browser Stagioni ed Episodi**: finestra interattiva con trama, cast, selezione stagione per stagione e riproduzione diretta dell'episodio.
- **⭐ Preferiti**:
  - Sistema integrato per salvare con 1 clic i propri canali, film e serie preferiti in uno spazio dedicato.

---

## 🛠️ Come Avviare l'Applicazione

### Metodo 1: Doppio Clic (Windows)
Fai doppio clic sul file `start.bat`. Verrà avviato il server locale e si aprirà automaticamente il browser predefinito su:
```
http://localhost:8080
```

### Metodo 2: Da Terminale (PowerShell / Command Prompt)
```powershell
python server.py
```
Quindi apri nel browser:
```
http://localhost:8080
```

---

## 📁 Struttura del Progetto

```
IPTVPlayerV2/
├── server.py              # Server Python zero-dependency (Static server, CORS proxy, Demo Xtream API)
├── start.bat              # Script di avvio per Windows
├── README.md              # Documentazione
└── public/
    ├── index.html         # Struttura Single-Page Application
    ├── assets/
    │   └── favicon.svg    # Icona vettoriale moderna
    ├── css/
    │   ├── main.css       # Design System, palette colori obsidian & neon, reset, toast
    │   ├── login.css      # Login card in vetro smerigliato e gestione profili
    │   ├── playlist.css   # Layout dashboard, sidebar categorie, toolbar e card
    │   ├── player.css     # Finestra modale player video e navigazione episodi serie
    │   └── animations.css # Effetti shimmer skeleton, fade-in e glow
    └── js/
        ├── app.js         # Orchestratore principale e gestione dello stato
        ├── api.js         # Client API Xtream Codes con supporto Proxy e URL builder
        ├── db.js          # Gestore IndexedDB per caching locale ultra-veloce
        ├── virtualGrid.js # Motore di rendering griglia virtualizzata (100k+ elementi a 60 FPS)
        ├── ui.js          # Fabbrica componenti UI, schede e finestre modali
        └── player.js      # Player video con integrazione Hls.js e fallback nativo
```

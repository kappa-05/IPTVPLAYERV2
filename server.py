#!/usr/bin/env python3
"""
IPTV Player V2 - Local Dev Server & CORS Proxy
Zero-dependency Python server that serves the web application,
proxies Xtream Codes API calls to bypass CORS restrictions,
and provides a built-in Mock Xtream API for instant 1-click testing.
"""

import sys
import os
import json
import ssl
import re
import urllib.request
import urllib.parse
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
import socket
import threading

# Unverified SSL context to prevent certificate validation errors on IPTV servers
SSL_UNVERIFIED_CTX = ssl._create_unverified_context()

# Opener with empty ProxyHandler to explicitly bypass Windows registry / system / env proxies
# preventing HTTP 407 Proxy Authentication Required errors
NO_PROXY_OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    urllib.request.HTTPSHandler(context=SSL_UNVERIFIED_CTX)
)


def rewrite_m3u8(content_text, base_url, proxy_prefix='/api/proxy?url='):
    """
    Rewrites all segment URLs, sub-playlists, and URI attributes in an M3U8 playlist
    so that every subsequent request goes through the local CORS proxy.
    This fixes relative URL resolution and CORS issues with HLS streams.
    """
    lines = content_text.splitlines()
    rewritten = []
    uri_regex = re.compile(r'URI=([\"\'])(.*?)\1')

    for line in lines:
        s = line.strip()
        if not s:
            rewritten.append(line)
            continue

        if s.startswith('#'):
            if 'URI=' in s:
                def repl(m):
                    q, u = m.group(1), m.group(2)
                    if u.startswith('/api/proxy'):
                        return m.group(0)
                    abs_u = urllib.parse.urljoin(base_url, u)
                    return f'URI={q}{proxy_prefix}{urllib.parse.quote(abs_u, safe="")}{q}'
                rewritten.append(uri_regex.sub(repl, s))
            else:
                rewritten.append(line)
        else:
            if s.startswith('/api/proxy'):
                rewritten.append(s)
            else:
                abs_u = urllib.parse.urljoin(base_url, s)
                rewritten.append(f'{proxy_prefix}{urllib.parse.quote(abs_u, safe="")}')

    return '\n'.join(rewritten)


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle each request in a new thread for concurrent HLS fragment loading."""
    daemon_threads = True

PORT = int(os.environ.get('PORT', 8080))
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

# Realistic Mock Xtream Dataset for Instant Demo Mode
DEMO_USER_INFO = {
    "user_info": {
        "username": "vip_user_2026",
        "password": "••••••••",
        "message": "Benvenuto in IPTV Player V2 - Xtream Codes Edition",
        "auth": 1,
        "status": "Active",
        "exp_date": "1800000000",  # Future timestamp
        "is_trial": "0",
        "active_cons": "1",
        "created_at": "1704067200",
        "max_connections": "3",
        "allowed_output_formats": ["m3u8", "ts", "mp4", "mkv"]
    },
    "server_info": {
        "url": "http://demo.iptvplayer.local",
        "port": "8080",
        "https_port": "443",
        "server_protocol": "http",
        "rtmp_port": "8880",
        "timezone": "Europe/Rome",
        "timestamp_now": 1776764100,
        "time_now": "2026-10-21 11:35:00"
    }
}

DEMO_LIVE_CATEGORIES = [
    {"category_id": "1", "category_name": "⭐ Canali Nazionali IT", "parent_id": 0},
    {"category_id": "2", "category_name": "🎬 Cinema HD & 4K", "parent_id": 0},
    {"category_id": "3", "category_name": "⚽ Sport & Calcio Live", "parent_id": 0},
    {"category_id": "4", "category_name": "🌍 Documentari & Natura", "parent_id": 0},
    {"category_id": "5", "category_name": "👶 Bambini & Ragazzi", "parent_id": 0},
    {"category_id": "6", "category_name": "🎵 Musica & Radio TV", "parent_id": 0},
    {"category_id": "7", "category_name": "📰 Notizie 24/7", "parent_id": 0}
]

DEMO_VOD_CATEGORIES = [
    {"category_id": "101", "category_name": "🔥 Novità & Top Cinema 2026", "parent_id": 0},
    {"category_id": "102", "category_name": "💥 Azione & Adrenalina", "parent_id": 0},
    {"category_id": "103", "category_name": "🚀 Fantascienza & Cyberpunk", "parent_id": 0},
    {"category_id": "104", "category_name": "🎭 Commedia & Risate", "parent_id": 0},
    {"category_id": "105", "category_name": "🕵️ Thriller & Mistero", "parent_id": 0},
    {"category_id": "106", "category_name": "🎨 Animazione & Famiglia", "parent_id": 0}
]

DEMO_SERIES_CATEGORIES = [
    {"category_id": "201", "category_name": "🏆 Serie TV Più Votate", "parent_id": 0},
    {"category_id": "202", "category_name": "⚡ Serie Crime & Suspense", "parent_id": 0},
    {"category_id": "203", "category_name": "🌌 Serie Sci-Fi & Fantasy", "parent_id": 0},
    {"category_id": "204", "category_name": "🏛️ Serie Drammatiche & Storiche", "parent_id": 0}
]

DEMO_LIVE_STREAMS = [
    {
        "num": 1,
        "name": "Rai 1 HD",
        "stream_type": "live",
        "stream_id": 1001,
        "stream_icon": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Rai_1_-_Logo_2016.svg/300px-Rai_1_-_Logo_2016.svg.png",
        "epg_channel_id": "rai1.it",
        "category_id": "1",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "custom_sid": "",
        "tv_archive": 1
    },
    {
        "num": 2,
        "name": "Rai 2 HD",
        "stream_type": "live",
        "stream_id": 1002,
        "stream_icon": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Rai_2_-_Logo_2016.svg/300px-Rai_2_-_Logo_2016.svg.png",
        "epg_channel_id": "rai2.it",
        "category_id": "1",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "tv_archive": 1
    },
    {
        "num": 3,
        "name": "Canale 5 HD",
        "stream_type": "live",
        "stream_id": 1003,
        "stream_icon": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Canale_5_logo_2018.svg/300px-Canale_5_logo_2018.svg.png",
        "epg_channel_id": "canale5.it",
        "category_id": "1",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "tv_archive": 1
    },
    {
        "num": 4,
        "name": "Italia 1 HD",
        "stream_type": "live",
        "stream_id": 1004,
        "stream_icon": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Italia_1_logo_2018.svg/300px-Italia_1_logo_2018.svg.png",
        "epg_channel_id": "italia1.it",
        "category_id": "1",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "tv_archive": 1
    },
    {
        "num": 5,
        "name": "Sky Cinema Uno HD 4K",
        "stream_type": "live",
        "stream_id": 1005,
        "stream_icon": "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=300&q=80",
        "epg_channel_id": "skycinema1.it",
        "category_id": "2",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "tv_archive": 1
    },
    {
        "num": 6,
        "name": "Cinema Action HD",
        "stream_type": "live",
        "stream_id": 1006,
        "stream_icon": "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=300&q=80",
        "epg_channel_id": "cinemaaction.it",
        "category_id": "2",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "tv_archive": 1
    },
    {
        "num": 7,
        "name": "Sky Sport Calcio HD 50fps",
        "stream_type": "live",
        "stream_id": 1007,
        "stream_icon": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=300&q=80",
        "epg_channel_id": "skysportcalcio.it",
        "category_id": "3",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "tv_archive": 1
    },
    {
        "num": 8,
        "name": "DAZN Serie A 1 HD",
        "stream_type": "live",
        "stream_id": 1008,
        "stream_icon": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=300&q=80",
        "epg_channel_id": "dazn1.it",
        "category_id": "3",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "tv_archive": 1
    },
    {
        "num": 9,
        "name": "Discovery Science HD",
        "stream_type": "live",
        "stream_id": 1009,
        "stream_icon": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&q=80",
        "epg_channel_id": "discoveryscience.it",
        "category_id": "4",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "tv_archive": 1
    },
    {
        "num": 10,
        "name": "National Geographic Wild HD",
        "stream_type": "live",
        "stream_id": 1010,
        "stream_icon": "https://images.unsplash.com/photo-1534177616072-ef7dc120449d?w=300&q=80",
        "epg_channel_id": "natgeowild.it",
        "category_id": "4",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "tv_archive": 1
    },
    {
        "num": 11,
        "name": "Cartoon Network HD",
        "stream_type": "live",
        "stream_id": 1011,
        "stream_icon": "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&q=80",
        "epg_channel_id": "cartoonnet.it",
        "category_id": "5",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "tv_archive": 1
    },
    {
        "num": 12,
        "name": "Sky TG24 HD",
        "stream_type": "live",
        "stream_id": 1012,
        "stream_icon": "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=300&q=80",
        "epg_channel_id": "skytg24.it",
        "category_id": "7",
        "direct_source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "tv_archive": 1
    }
]

DEMO_VOD_STREAMS = [
    {
        "num": 1,
        "name": "Dune - Parte Due (2024) [4K HDR]",
        "stream_type": "movie",
        "stream_id": 2001,
        "stream_icon": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&q=80",
        "rating": "8.6",
        "rating_5based": 4.3,
        "added": "1710000000",
        "category_id": "101",
        "container_extension": "mp4",
        "custom_sid": "",
        "direct_source": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
    },
    {
        "num": 2,
        "name": "Oppenheimer (2023) [Dolby Vision]",
        "stream_type": "movie",
        "stream_id": 2002,
        "stream_icon": "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=600&q=80",
        "rating": "8.9",
        "rating_5based": 4.5,
        "added": "1705000000",
        "category_id": "101",
        "container_extension": "mp4",
        "direct_source": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
    },
    {
        "num": 3,
        "name": "John Wick 4 (2023) [Action HD]",
        "stream_type": "movie",
        "stream_id": 2003,
        "stream_icon": "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&q=80",
        "rating": "8.2",
        "rating_5based": 4.1,
        "added": "1702000000",
        "category_id": "102",
        "container_extension": "mp4",
        "direct_source": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
    },
    {
        "num": 4,
        "name": "Top Gun: Maverick (2022)",
        "stream_type": "movie",
        "stream_id": 2004,
        "stream_icon": "https://images.unsplash.com/photo-1517976487502-5c8e3100ca2c?w=600&q=80",
        "rating": "8.3",
        "rating_5based": 4.2,
        "added": "1698000000",
        "category_id": "102",
        "container_extension": "mp4",
        "direct_source": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
    },
    {
        "num": 5,
        "name": "Blade Runner 2049 [Cyberpunk Masterpiece]",
        "stream_type": "movie",
        "stream_id": 2005,
        "stream_icon": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&q=80",
        "rating": "8.0",
        "rating_5based": 4.0,
        "added": "1695000000",
        "category_id": "103",
        "container_extension": "mp4",
        "direct_source": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
    },
    {
        "num": 6,
        "name": "Interstellar (2014) [Sci-Fi Legend]",
        "stream_type": "movie",
        "stream_id": 2006,
        "stream_icon": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&q=80",
        "rating": "8.7",
        "rating_5based": 4.4,
        "added": "1690000000",
        "category_id": "103",
        "container_extension": "mp4",
        "direct_source": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
    },
    {
        "num": 7,
        "name": "Spider-Man: Across the Spider-Verse",
        "stream_type": "movie",
        "stream_id": 2007,
        "stream_icon": "https://images.unsplash.com/photo-1635805737707-575885ab0820?w=600&q=80",
        "rating": "8.7",
        "rating_5based": 4.4,
        "added": "1701000000",
        "category_id": "106",
        "container_extension": "mp4",
        "direct_source": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4"
    }
]

DEMO_SERIES_LIST = [
    {
        "num": 1,
        "name": "Stranger Things",
        "series_id": 3001,
        "cover": "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=600&q=80",
        "plot": "Quando un ragazzino svanisce nel nulla, una piccola città svela un mistero che coinvolge esperimenti segreti, terrificanti forze soprannaturali e una strana bambina.",
        "cast": "Millie Bobby Brown, David Harbour, Winona Ryder",
        "director": "The Duffer Brothers",
        "genre": "Sci-Fi, Mistero, Dramma",
        "releaseDate": "2016-07-15",
        "rating": "8.7",
        "rating_5based": 4.4,
        "category_id": "201",
        "seasons_count": 4
    },
    {
        "num": 2,
        "name": "Breaking Bad",
        "series_id": 3002,
        "cover": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&q=80",
        "plot": "Un insegnante di chimica del liceo a cui è stato diagnosticato un cancro ai polmoni inoperabile decide di produrre e vendere metanfetamina per garantire il futuro della sua famiglia.",
        "cast": "Bryan Cranston, Aaron Paul, Anna Gunn",
        "director": "Vince Gilligan",
        "genre": "Crime, Dramma, Thriller",
        "releaseDate": "2008-01-20",
        "rating": "9.5",
        "rating_5based": 4.8,
        "category_id": "202",
        "seasons_count": 5
    },
    {
        "num": 3,
        "name": "The Last of Us",
        "series_id": 3003,
        "cover": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&q=80",
        "plot": "Vent'anni dopo che un'infezione fungina ha decimato il pianeta, Joel deve scortare la giovane Ellie attraverso un'America post-apocalittica desolata e pericolosa.",
        "cast": "Pedro Pascal, Bella Ramsey, Gabriel Luna",
        "director": "Craig Mazin, Neil Druckmann",
        "genre": "Azione, Avventura, Dramma",
        "releaseDate": "2023-01-15",
        "rating": "8.8",
        "rating_5based": 4.4,
        "category_id": "203",
        "seasons_count": 2
    },
    {
        "num": 4,
        "name": "Peaky Blinders",
        "series_id": 3004,
        "cover": "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=600&q=80",
        "plot": "Birmingham, Inghilterra, 1919. Una famigerata gang guidata dall'ambizioso Thomas Shelby cattura l'attenzione dell'ispettore Chester Campbell.",
        "cast": "Cillian Murphy, Paul Anderson, Helen McCrory",
        "director": "Steven Knight",
        "genre": "Crime, Dramma, Storico",
        "releaseDate": "2013-09-12",
        "rating": "8.8",
        "rating_5based": 4.4,
        "category_id": "204",
        "seasons_count": 6
    }
]

def get_demo_series_info(series_id):
    """Returns mock seasons and episodes for a series"""
    series_map = {
        "3001": {
            "seasons": [
                {"air_date": "2016-07-15", "episode_count": 8, "id": 1, "name": "Stagione 1", "overview": "La scomparsa di Will Byers", "season_number": 1},
                {"air_date": "2017-10-27", "episode_count": 9, "id": 2, "name": "Stagione 2", "overview": "Il Mind Flayer attacca Hawkins", "season_number": 2}
            ],
            "info": {
                "name": "Stranger Things",
                "cover": "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=600&q=80",
                "plot": "La scomparsa di un bambino porta alla luce una rete di segreti governativi e minacce dimensionali.",
                "genre": "Sci-Fi, Thriller",
                "rating": "8.7"
            },
            "episodes": {
                "1": [
                    {
                        "id": "e3001_s1_e1",
                        "episode_num": 1,
                        "title": "Capitolo Primo: La scomparsa di Will Byers",
                        "container_extension": "mp4",
                        "info": {"duration": "48m", "plot": "Sulla via di casa dopo una partita di D&D, Will vede qualcosa di spaventoso."},
                        "direct_source": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                    },
                    {
                        "id": "e3001_s1_e2",
                        "episode_num": 2,
                        "title": "Capitolo Secondo: La stramba di Maple Street",
                        "container_extension": "mp4",
                        "info": {"duration": "55m", "plot": "I ragazzi nascondono la ragazza nel seminterrato mentre lo sceriffo Hopper indaga."},
                        "direct_source": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
                    },
                    {
                        "id": "e3001_s1_e3",
                        "episode_num": 3,
                        "title": "Capitolo Terzo: Luci natalizie",
                        "container_extension": "mp4",
                        "info": {"duration": "51m", "plot": "Joyce cerca di comunicare con Will attraverso luci colorate sul muro."},
                        "direct_source": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
                    }
                ],
                "2": [
                    {
                        "id": "e3001_s2_e1",
                        "episode_num": 1,
                        "title": "Capitolo Primo: MADMAX",
                        "container_extension": "mp4",
                        "info": {"duration": "48m", "plot": "Un anno dopo, una nuova ragazza arriva a scuola e Will continua ad avere visioni."},
                        "direct_source": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
                    }
                ]
            }
        }
    }
    return series_map.get(str(series_id), series_map["3001"])


class IPTVRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_cors_headers(self, content_type="application/json"):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type')
        self.send_header('Content-Type', content_type)

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_cors_headers()
        self.end_headers()

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/proxy':
            self.handle_proxy(is_head=True)
            return
        super().do_HEAD()

    def handle_proxy(self, is_head=False):
        # Extract target_url safely from self.path without losing query parameters after '&'
        prefix = '/api/proxy?url='
        if self.path.startswith(prefix):
            target_url = self.path[len(prefix):]
        else:
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            target_url = qs.get('url', [None])[0]

        if not target_url:
            self.send_response(400)
            self.end_cors_headers()
            self.end_headers()
            if not is_head:
                self.wfile.write(b'{"error": "Parametro url mancante"}')
            return

        # Decode if percent-encoded
        if target_url.startswith('http%3A') or target_url.startswith('https%3A') or '%2F' in target_url:
            target_url = urllib.parse.unquote(target_url)

        # Standard IPTV Player User-Agent
        req_headers = {
            'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
            'Accept': '*/*',
            'Connection': 'keep-alive',
        }
        # Forward Range header for partial content (seeking VOD, TS chunks)
        if 'Range' in self.headers:
            req_headers['Range'] = self.headers['Range']

        try:
            req = urllib.request.Request(target_url, headers=req_headers)
            resp = NO_PROXY_OPENER.open(req, timeout=30)
            actual_url = resp.geturl() or target_url

            status_code = resp.status
            content_type = resp.headers.get('Content-Type', 'application/octet-stream')
            content_length = resp.headers.get('Content-Length')
            content_range = resp.headers.get('Content-Range')
            accept_ranges = resp.headers.get('Accept-Ranges', 'bytes')

            is_m3u8 = (
                '.m3u8' in target_url.lower() or
                '.m3u8' in actual_url.lower() or
                'mpegurl' in content_type.lower() or
                'application/x-mpegurl' in content_type.lower() or
                'vnd.apple.mpegurl' in content_type.lower()
            )

            # Check if this is an M3U8 playlist to rewrite
            if is_m3u8 and not is_head:
                raw_data = resp.read()
                # Check if it starts with #EXTM3U or was requested as m3u8
                if raw_data.startswith(b'#EXTM3U') or is_m3u8:
                    try:
                        text = raw_data.decode('utf-8', errors='replace')
                        rewritten_text = rewrite_m3u8(text, actual_url)
                        rewritten_bytes = rewritten_text.encode('utf-8')

                        self.send_response(200)
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
                        self.send_header('Access-Control-Allow-Headers', '*')
                        self.send_header('Access-Control-Expose-Headers', '*')
                        self.send_header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
                        self.send_header('Content-Length', str(len(rewritten_bytes)))
                        self.end_headers()
                        self.wfile.write(rewritten_bytes)
                        return
                    except Exception:
                        pass

                # If not decoded as text or rewriting skipped, send raw_data
                self.send_response(status_code)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
                self.send_header('Access-Control-Allow-Headers', '*')
                self.send_header('Access-Control-Expose-Headers', '*')
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(raw_data)))
                self.end_headers()
                self.wfile.write(raw_data)
                return

            # For regular streams (TS, MP4, MKV, or API JSON)
            self.send_response(status_code)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
            self.send_header('Access-Control-Allow-Headers', '*')
            self.send_header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type')
            self.send_header('Content-Type', content_type)
            if content_length:
                self.send_header('Content-Length', content_length)
            if content_range:
                self.send_header('Content-Range', content_range)
            if accept_ranges:
                self.send_header('Accept-Ranges', accept_ranges)
            self.end_headers()

            if is_head:
                return

            # Stream response body in 64KB chunks
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    break

        except urllib.error.HTTPError as e:
            # Map 407 (Proxy Auth) to 502 Bad Gateway to avoid triggering browser's native proxy dialog
            client_status = 502 if e.code == 407 else e.code
            self.send_response(client_status)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            if not is_head:
                err_body = {
                    "error": f"Errore server IPTV ({e.code}): {e.reason}",
                    "code": e.code,
                    "upstream_reason": str(e.reason)
                }
                self.wfile.write(json.dumps(err_body).encode('utf-8'))
        except urllib.error.URLError as e:
            self.send_response(504)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            if not is_head:
                err_body = {"error": f"Impossibile raggiungere il server IPTV: {str(e.reason)}", "code": 504}
                self.wfile.write(json.dumps(err_body).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            if not is_head:
                err_body = {"error": f"Errore Proxy: {str(e)}", "code": 500}
                self.wfile.write(json.dumps(err_body).encode('utf-8'))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. CORS Proxy Endpoint (for API calls and Streams): /api/proxy?url=<TARGET_URL>
        if path == '/api/proxy':
            self.handle_proxy(is_head=False)
            return

        # 2. Built-in Demo Xtream API: /api/demo/player_api.php
        if path.startswith('/api/demo'):
            action = query.get('action', [None])[0]
            cat_id = query.get('category_id', [None])[0]
            series_id = query.get('series_id', [None])[0]

            self.send_response(200)
            self.end_cors_headers()
            self.end_headers()

            if not action:
                # Root action = Authentication & Server Info
                response_data = DEMO_USER_INFO
            elif action == 'get_live_categories':
                response_data = DEMO_LIVE_CATEGORIES
            elif action == 'get_vod_categories':
                response_data = DEMO_VOD_CATEGORIES
            elif action == 'get_series_categories':
                response_data = DEMO_SERIES_CATEGORIES
            elif action == 'get_live_streams':
                if cat_id:
                    response_data = [s for s in DEMO_LIVE_STREAMS if s.get('category_id') == str(cat_id)]
                else:
                    response_data = DEMO_LIVE_STREAMS
            elif action == 'get_vod_streams':
                if cat_id:
                    response_data = [s for s in DEMO_VOD_STREAMS if s.get('category_id') == str(cat_id)]
                else:
                    response_data = DEMO_VOD_STREAMS
            elif action == 'get_series':
                if cat_id:
                    response_data = [s for s in DEMO_SERIES_LIST if s.get('category_id') == str(cat_id)]
                else:
                    response_data = DEMO_SERIES_LIST
            elif action == 'get_series_info':
                response_data = get_demo_series_info(series_id or "3001")
            else:
                response_data = {"error": f"Action non riconosciuta: {action}"}

            self.wfile.write(json.dumps(response_data, ensure_ascii=False).encode('utf-8'))
            return

        # Default: Serve static files from /public
        super().do_GET()


def run_server():
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    os.makedirs(PUBLIC_DIR, exist_ok=True)
    server_address = ('', PORT)
    try:
        httpd = ThreadingHTTPServer(server_address, IPTVRequestHandler)
        print("=" * 60)
        print(f"[IPTV Player V2] Server Attivo!")
        print(f">> Browser: http://localhost:{PORT}")
        print(f">> Proxy CORS: http://localhost:{PORT}/api/proxy?url=...")
        print(f">> Demo Xtream API: http://localhost:{PORT}/api/demo/player_api.php")
        print("=" * 60)
        httpd.serve_forever()
    except OSError as e:
        if "address already in use" in str(e).lower() or getattr(e, 'errno', None) in (98, 10048):
            alt_port = PORT + 1
            print(f"Porta {PORT} occupata, provo porta {alt_port}...")
            httpd = ThreadingHTTPServer(('', alt_port), IPTVRequestHandler)
            print(f">> Browser: http://localhost:{alt_port}")
            httpd.serve_forever()
        else:
            raise e


if __name__ == '__main__':
    run_server()

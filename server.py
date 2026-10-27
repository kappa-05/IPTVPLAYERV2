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
import subprocess
import shutil
import gzip
import zlib

# Unverified SSL context to prevent certificate validation errors on IPTV servers
SSL_UNVERIFIED_CTX = ssl._create_unverified_context()

# Opener with empty ProxyHandler to explicitly bypass Windows registry / system / env proxies
# preventing HTTP 407 Proxy Authentication Required errors
NO_PROXY_OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    urllib.request.HTTPSHandler(context=SSL_UNVERIFIED_CTX)
)

def find_ffmpeg():
    """Detect FFmpeg executable in PATH or WinGet installation directory."""
    p = shutil.which("ffmpeg")
    if p:
        return p
    winget_dir = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
    if os.path.isdir(winget_dir):
        for root, dirs, files in os.walk(winget_dir):
            if "ffmpeg.exe" in files:
                return os.path.join(root, "ffmpeg.exe")
    for candidate in [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ]:
        if os.path.exists(candidate):
            return candidate
    return None

def find_ffprobe():
    """Detect FFprobe executable in PATH or next to ffmpeg."""
    p = shutil.which("ffprobe")
    if p:
        return p
    ff = find_ffmpeg()
    if ff:
        cand = ff.replace("ffmpeg.exe", "ffprobe.exe").replace("ffmpeg", "ffprobe")
        if os.path.exists(cand):
            return cand
    return None


def find_vlc():
    """Detect VLC Media Player executable."""
    p = shutil.which("vlc")
    if p:
        return p
    for candidate in [
        r"C:\Program Files\VideoLAN\VLC\vlc.exe",
        r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
    ]:
        if os.path.exists(candidate):
            return candidate
    return None


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
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'expo-app', 'dist')
if not os.path.isdir(PUBLIC_DIR):
    fallback_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')
    if os.path.isdir(fallback_dir):
        PUBLIC_DIR = fallback_dir

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
    {"category_id": "1", "category_name": "Canali Nazionali", "parent_id": 0},
    {"category_id": "2", "category_name": "Cinema", "parent_id": 0},
    {"category_id": "3", "category_name": "Sport", "parent_id": 0},
    {"category_id": "4", "category_name": "Documentari", "parent_id": 0},
    {"category_id": "5", "category_name": "Bambini", "parent_id": 0},
    {"category_id": "6", "category_name": "Musica", "parent_id": 0},
    {"category_id": "7", "category_name": "Notizie", "parent_id": 0}
]

DEMO_VOD_CATEGORIES = [
    {"category_id": "101", "category_name": "Novita Cinema", "parent_id": 0},
    {"category_id": "102", "category_name": "Azione", "parent_id": 0},
    {"category_id": "103", "category_name": "Fantascienza", "parent_id": 0},
    {"category_id": "104", "category_name": "Commedia", "parent_id": 0},
    {"category_id": "105", "category_name": "Thriller", "parent_id": 0},
    {"category_id": "106", "category_name": "Animazione", "parent_id": 0}
]

DEMO_SERIES_CATEGORIES = [
    {"category_id": "201", "category_name": "Serie TV Piu Votate", "parent_id": 0},
    {"category_id": "202", "category_name": "Crime", "parent_id": 0},
    {"category_id": "203", "category_name": "Fantascienza", "parent_id": 0},
    {"category_id": "204", "category_name": "Drammatiche e Storiche", "parent_id": 0}
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
    """Returns mock seasons and episodes for a series, with rich multi-season coverage"""
    sample_videos = [
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4"
    ]

    series_map = {
        "3001": {
            "seasons": [
                {"air_date": "2016-07-15", "episode_count": 3, "id": 1, "name": "Stagione 1", "overview": "La scomparsa di Will Byers", "season_number": 1},
                {"air_date": "2017-10-27", "episode_count": 2, "id": 2, "name": "Stagione 2", "overview": "Il Mind Flayer attacca Hawkins", "season_number": 2},
                {"air_date": "2019-07-04", "episode_count": 2, "id": 3, "name": "Stagione 3", "overview": "La battaglia dello Starcourt Mall", "season_number": 3},
                {"air_date": "2022-05-27", "episode_count": 2, "id": 4, "name": "Stagione 4", "overview": "L'incubo di Vecna", "season_number": 4}
            ],
            "info": {
                "name": "Stranger Things",
                "cover": "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=600&q=80",
                "plot": "Quando un ragazzino svanisce nel nulla, una piccola città svela un mistero che coinvolge esperimenti segreti, terrificanti forze soprannaturali e una strana bambina.",
                "genre": "Sci-Fi, Mistero, Dramma",
                "rating": "8.7",
                "cast": "Millie Bobby Brown, David Harbour, Winona Ryder"
            },
            "episodes": {
                "1": [
                    {
                        "id": "e3001_s1_e1",
                        "episode_num": 1,
                        "title": "Capitolo Primo: La scomparsa di Will Byers",
                        "container_extension": "mp4",
                        "info": {"duration": "48m", "plot": "Sulla via di casa dopo una partita di D&D, Will vede qualcosa di spaventoso."},
                        "direct_source": sample_videos[0]
                    },
                    {
                        "id": "e3001_s1_e2",
                        "episode_num": 2,
                        "title": "Capitolo Secondo: La stramba di Maple Street",
                        "container_extension": "mp4",
                        "info": {"duration": "55m", "plot": "I ragazzi nascondono la ragazza nel seminterrato mentre lo sceriffo Hopper indaga."},
                        "direct_source": sample_videos[1]
                    },
                    {
                        "id": "e3001_s1_e3",
                        "episode_num": 3,
                        "title": "Capitolo Terzo: Luci natalizie",
                        "container_extension": "mp4",
                        "info": {"duration": "51m", "plot": "Joyce cerca di comunicare con Will attraverso luci colorate sul muro."},
                        "direct_source": sample_videos[2]
                    }
                ],
                "2": [
                    {
                        "id": "e3001_s2_e1",
                        "episode_num": 1,
                        "title": "Capitolo Primo: MADMAX",
                        "container_extension": "mp4",
                        "info": {"duration": "48m", "plot": "Un anno dopo, una nuova ragazza arriva a scuola e Will continua ad avere visioni."},
                        "direct_source": sample_videos[3]
                    },
                    {
                        "id": "e3001_s2_e2",
                        "episode_num": 2,
                        "title": "Capitolo Secondo: Dolcetto o scherzetto, mattoide",
                        "container_extension": "mp4",
                        "info": {"duration": "56m", "plot": "I ragazzi festeggiano Halloween mentre una presenza oscura cresce sotto la città."},
                        "direct_source": sample_videos[4]
                    }
                ],
                "3": [
                    {
                        "id": "e3001_s3_e1",
                        "episode_num": 1,
                        "title": "Capitolo Primo: Suzy, mi ricevi?",
                        "container_extension": "mp4",
                        "info": {"duration": "50m", "plot": "L'estate del 1985 porta amore, un nuovo centro commerciale e topi molto strani."},
                        "direct_source": sample_videos[5]
                    },
                    {
                        "id": "e3001_s3_e2",
                        "episode_num": 2,
                        "title": "Capitolo Secondo: Incubi da centro commerciale",
                        "container_extension": "mp4",
                        "info": {"duration": "50m", "plot": "Dustin e Steve intercettano una trasmissione radiofonica russa in codice."},
                        "direct_source": sample_videos[6]
                    }
                ],
                "4": [
                    {
                        "id": "e3001_s4_e1",
                        "episode_num": 1,
                        "title": "Capitolo Primo: L'Hellfire Club",
                        "container_extension": "mp4",
                        "info": {"duration": "76m", "plot": "Separati tra Hawkins e la California, i ragazzi affrontano nuove sfide al liceo."},
                        "direct_source": sample_videos[0]
                    },
                    {
                        "id": "e3001_s4_e2",
                        "episode_num": 2,
                        "title": "Capitolo Secondo: La maledizione di Vecna",
                        "container_extension": "mp4",
                        "info": {"duration": "77m", "plot": "Una serie di omicidi inspiegabili sconvolge Hawkins mentre una nuova forza incombe."},
                        "direct_source": sample_videos[1]
                    }
                ]
            }
        },
        "3002": {
            "seasons": [
                {"air_date": "2008-01-20", "episode_count": 3, "id": 1, "name": "Stagione 1", "season_number": 1},
                {"air_date": "2009-03-08", "episode_count": 2, "id": 2, "name": "Stagione 2", "season_number": 2},
                {"air_date": "2010-03-21", "episode_count": 2, "id": 3, "name": "Stagione 3", "season_number": 3},
                {"air_date": "2011-07-17", "episode_count": 2, "id": 4, "name": "Stagione 4", "season_number": 4},
                {"air_date": "2012-07-15", "episode_count": 2, "id": 5, "name": "Stagione 5", "season_number": 5}
            ],
            "info": {
                "name": "Breaking Bad",
                "cover": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&q=80",
                "plot": "Un insegnante di chimica del liceo a cui è stato diagnosticato un cancro ai polmoni inoperabile decide di produrre metanfetamina per il futuro della famiglia.",
                "genre": "Crime, Dramma, Thriller",
                "rating": "9.5",
                "cast": "Bryan Cranston, Aaron Paul, Anna Gunn"
            },
            "episodes": {
                "1": [
                    {
                        "id": "e3002_s1_e1",
                        "episode_num": 1,
                        "title": "Questione di chimica (Pilot)",
                        "container_extension": "mp4",
                        "info": {"duration": "58m", "plot": "Walter White scopre di avere un tumore e si allea con l'ex studente Jesse Pinkman."},
                        "direct_source": sample_videos[2]
                    },
                    {
                        "id": "e3002_s1_e2",
                        "episode_num": 2,
                        "title": "Senza ritorno",
                        "container_extension": "mp4",
                        "info": {"duration": "48m", "plot": "Walt e Jesse devono sbarazzarsi di due spacciatori rimasti coinvolti."},
                        "direct_source": sample_videos[3]
                    },
                    {
                        "id": "e3002_s1_e3",
                        "episode_num": 3,
                        "title": "Conseguenze radicali",
                        "container_extension": "mp4",
                        "info": {"duration": "48m", "plot": "Walt affronta un dilemma morale decisivo sul destino di Krazy-8."},
                        "direct_source": sample_videos[4]
                    }
                ],
                "2": [
                    {
                        "id": "e3002_s2_e1",
                        "episode_num": 1,
                        "title": "Tutto torna",
                        "container_extension": "mp4",
                        "info": {"duration": "47m", "plot": "Walt e Jesse affrontano le minacce dello psicotico Tuco Salamanca."},
                        "direct_source": sample_videos[0]
                    },
                    {
                        "id": "e3002_s2_e2",
                        "episode_num": 2,
                        "title": "Grigliata",
                        "container_extension": "mp4",
                        "info": {"duration": "48m", "plot": "Rapiti da Tuco, Walt e Jesse tentano una fuga disperata nel deserto."},
                        "direct_source": sample_videos[1]
                    }
                ],
                "3": [
                    {
                        "id": "e3002_s3_e1",
                        "episode_num": 1,
                        "title": "Mai più",
                        "container_extension": "mp4",
                        "info": {"duration": "47m", "plot": "Walt cerca di ritirarsi dagli affari mentre Skyler scopre la verità."},
                        "direct_source": sample_videos[5]
                    },
                    {
                        "id": "e3002_s3_e2",
                        "episode_num": 2,
                        "title": "Cavallo senza nome",
                        "container_extension": "mp4",
                        "info": {"duration": "47m", "plot": "Due cugini del cartello messicano oltrepassano il confine in cerca di vendetta."},
                        "direct_source": sample_videos[6]
                    }
                ],
                "4": [
                    {
                        "id": "e3002_s4_e1",
                        "episode_num": 1,
                        "title": "Taglierino",
                        "container_extension": "mp4",
                        "info": {"duration": "47m", "plot": "Walt e Jesse attendono il verdetto di Gus Fring dopo gli eventi del laboratorio."},
                        "direct_source": sample_videos[2]
                    },
                    {
                        "id": "e3002_s4_e2",
                        "episode_num": 2,
                        "title": "Calibro 38",
                        "container_extension": "mp4",
                        "info": {"duration": "47m", "plot": "Sentendosi in trappola, Walt compra una pistola per difendersi da Gus."},
                        "direct_source": sample_videos[3]
                    }
                ],
                "5": [
                    {
                        "id": "e3002_s5_e1",
                        "episode_num": 1,
                        "title": "Vivi libero o muori",
                        "container_extension": "mp4",
                        "info": {"duration": "43m", "plot": "Dopo la caduta di Gus, Walt assume il pieno controllo dell'impero."},
                        "direct_source": sample_videos[4]
                    },
                    {
                        "id": "e3002_s5_e2",
                        "episode_num": 2,
                        "title": "Felina (Finale)",
                        "container_extension": "mp4",
                        "info": {"duration": "55m", "plot": "Walter White torna per chiudere ogni conto rimasto in sospeso."},
                        "direct_source": sample_videos[0]
                    }
                ]
            }
        },
        "3003": {
            "seasons": [
                {"air_date": "2023-01-15", "episode_count": 3, "id": 1, "name": "Stagione 1", "season_number": 1},
                {"air_date": "2025-02-01", "episode_count": 2, "id": 2, "name": "Stagione 2", "season_number": 2}
            ],
            "info": {
                "name": "The Last of Us",
                "cover": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&q=80",
                "plot": "Vent'anni dopo che un'infezione fungina ha decimato il pianeta, Joel deve scortare la giovane Ellie attraverso un'America desolata.",
                "genre": "Azione, Avventura, Dramma",
                "rating": "8.8",
                "cast": "Pedro Pascal, Bella Ramsey, Gabriel Luna"
            },
            "episodes": {
                "1": [
                    {
                        "id": "e3003_s1_e1",
                        "episode_num": 1,
                        "title": "Quando sei perso nell'oscurità",
                        "container_extension": "mp4",
                        "info": {"duration": "81m", "plot": "L'inizio dell'epidemia sconvolge la vita di Joel."},
                        "direct_source": sample_videos[1]
                    },
                    {
                        "id": "e3003_s1_e2",
                        "episode_num": 2,
                        "title": "Gli infetti",
                        "container_extension": "mp4",
                        "info": {"duration": "53m", "plot": "Joel, Tess ed Ellie attraversano una Boston allagata e invasa dai Clicker."},
                        "direct_source": sample_videos[2]
                    },
                    {
                        "id": "e3003_s1_e3",
                        "episode_num": 3,
                        "title": "Molto, molto tempo",
                        "container_extension": "mp4",
                        "info": {"duration": "75m", "plot": "La storia toccante di Bill e Frank in un mondo in rovina."},
                        "direct_source": sample_videos[3]
                    }
                ],
                "2": [
                    {
                        "id": "e3003_s2_e1",
                        "episode_num": 1,
                        "title": "Ritorno a Jackson",
                        "container_extension": "mp4",
                        "info": {"duration": "60m", "plot": "Anni dopo, la quiete di Jackson viene turbata da una nuova minaccia."},
                        "direct_source": sample_videos[4]
                    },
                    {
                        "id": "e3003_s2_e2",
                        "episode_num": 2,
                        "title": "La spirale di Seattle",
                        "container_extension": "mp4",
                        "info": {"duration": "58m", "plot": "Ellie parte per Seattle determinata a compiere la sua vendetta."},
                        "direct_source": sample_videos[5]
                    }
                ]
            }
        },
        "3004": {
            "seasons": [
                {"air_date": "2013-09-12", "episode_count": 3, "id": 1, "name": "Stagione 1", "season_number": 1},
                {"air_date": "2014-10-02", "episode_count": 2, "id": 2, "name": "Stagione 2", "season_number": 2},
                {"air_date": "2016-05-05", "episode_count": 2, "id": 3, "name": "Stagione 3", "season_number": 3}
            ],
            "info": {
                "name": "Peaky Blinders",
                "cover": "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=600&q=80",
                "plot": "Birmingham, Inghilterra, 1919. Una famigerata gang guidata dall'ambizioso Thomas Shelby cattura l'attenzione dell'ispettore Campbell.",
                "genre": "Crime, Dramma, Storico",
                "rating": "8.8",
                "cast": "Cillian Murphy, Paul Anderson, Helen McCrory"
            },
            "episodes": {
                "1": [
                    {
                        "id": "e3004_s1_e1",
                        "episode_num": 1,
                        "title": "Episodio 1",
                        "container_extension": "mp4",
                        "info": {"duration": "57m", "plot": "Thomas Shelby entra in possesso per errore di una cassa di armi militari."},
                        "direct_source": sample_videos[0]
                    },
                    {
                        "id": "e3004_s1_e2",
                        "episode_num": 2,
                        "title": "Episodio 2",
                        "container_extension": "mp4",
                        "info": {"duration": "58m", "plot": "L'ispettore Campbell comincia a stringere il cerchio attorno agli Shelby."},
                        "direct_source": sample_videos[1]
                    },
                    {
                        "id": "e3004_s1_e3",
                        "episode_num": 3,
                        "title": "Episodio 3",
                        "container_extension": "mp4",
                        "info": {"duration": "56m", "plot": "Alle corse di Cheltenham, Tommy affronta il boss Billy Kimber."},
                        "direct_source": sample_videos[2]
                    }
                ],
                "2": [
                    {
                        "id": "e3004_s2_e1",
                        "episode_num": 1,
                        "title": "Episodio 1",
                        "container_extension": "mp4",
                        "info": {"duration": "59m", "plot": "La famiglia Shelby espande il proprio impero criminale verso Londra."},
                        "direct_source": sample_videos[3]
                    },
                    {
                        "id": "e3004_s2_e2",
                        "episode_num": 2,
                        "title": "Episodio 2",
                        "container_extension": "mp4",
                        "info": {"duration": "58m", "plot": "Tommy incontra il leader ebreo Alfie Solomons a Camden Town."},
                        "direct_source": sample_videos[4]
                    }
                ],
                "3": [
                    {
                        "id": "e3004_s3_e1",
                        "episode_num": 1,
                        "title": "Episodio 1",
                        "container_extension": "mp4",
                        "info": {"duration": "55m", "plot": "Il giorno del matrimonio di Tommy coincide con l'arrivo di misteriosi esiliati russi."},
                        "direct_source": sample_videos[5]
                    },
                    {
                        "id": "e3004_s3_e2",
                        "episode_num": 2,
                        "title": "Episodio 2",
                        "container_extension": "mp4",
                        "info": {"duration": "58m", "plot": "Tommy viene coinvolto in una cospirazione internazionale ad alto rischio."},
                        "direct_source": sample_videos[6]
                    }
                ]
            }
        }
    }

    sid = str(series_id)
    if sid in series_map:
        return series_map[sid]

    # Dynamic fallback for any other series ID: find in DEMO_SERIES_LIST or generate 3 seasons
    series_meta = next((s for s in DEMO_SERIES_LIST if str(s.get("series_id")) == sid), None)
    name = series_meta.get("name", "Serie TV") if series_meta else f"Serie {sid}"
    cover = series_meta.get("cover", "") if series_meta else ""
    plot = series_meta.get("plot", "Descrizione serie...") if series_meta else ""
    genre = series_meta.get("genre", "Dramma") if series_meta else ""
    rating = str(series_meta.get("rating", "8.0")) if series_meta else "8.0"
    num_seasons = int(series_meta.get("seasons_count", 3)) if series_meta else 3

    generated_seasons = []
    generated_episodes = {}
    for s_idx in range(1, num_seasons + 1):
        s_str = str(s_idx)
        generated_seasons.append({
            "air_date": f"202{s_idx}-01-01",
            "episode_count": 2,
            "id": s_idx,
            "name": f"Stagione {s_idx}",
            "season_number": s_idx
        })
        generated_episodes[s_str] = [
            {
                "id": f"e{sid}_s{s_idx}_e1",
                "episode_num": 1,
                "title": f"Episodio 1",
                "container_extension": "mp4",
                "info": {"duration": "45m", "plot": f"Primo episodio della Stagione {s_idx}."},
                "direct_source": sample_videos[0]
            },
            {
                "id": f"e{sid}_s{s_idx}_e2",
                "episode_num": 2,
                "title": f"Episodio 2",
                "container_extension": "mp4",
                "info": {"duration": "50m", "plot": f"Secondo episodio della Stagione {s_idx}."},
                "direct_source": sample_videos[1]
            }
        ]

    return {
        "info": {
            "name": name,
            "cover": cover,
            "plot": plot,
            "genre": genre,
            "rating": rating
        },
        "seasons": generated_seasons,
        "episodes": generated_episodes
    }


def get_demo_channel_epg(stream_id):
    import time
    now = int(time.time())
    channel = next((s for s in DEMO_LIVE_STREAMS if str(s.get("stream_id")) == str(stream_id)), None)
    cname = channel.get("name", "Canale TV") if channel else "Canale TV"

    listings = [
        {"title": "Rassegna Stampa & Notizie", "desc": f"Le prime pagine dei quotidiani e le notizie del mattino su {cname}.", "offset": -7200, "dur": 3600},
        {"title": "Mattina Live - Approfondimenti", "desc": "Storie di cronaca, costume e attualità con ospiti in studio.", "offset": -3600, "dur": 3600},
        {"title": f"Edizione Straordinaria Telegiornale", "desc": "Notiziario completo in diretta con i servizi degli inviati.", "offset": 0, "dur": 2700},
        {"title": "Mezzogiorno in Diretta", "desc": "Cucina, consigli per la salute e territorio italiano.", "offset": 2700, "dur": 4500},
        {"title": "TG Pomeriggio & Meteo", "desc": "Aggiornamento meteo e previsioni regionali per le prossime 24 ore.", "offset": 7200, "dur": 1800},
        {"title": "Film del Pomeriggio", "desc": "Grande cinema per tutta la famiglia con audio restaurato.", "offset": 9000, "dur": 6000},
        {"title": "Game Show Serale", "desc": "Quiz a premi e giochi per i concorrenti in studio.", "offset": 15000, "dur": 3600},
        {"title": "Telegiornale Prima Serata", "desc": "Il notiziario principale della giornata con collegamenti dal mondo.", "offset": 18600, "dur": 2400},
        {"title": "Prima Serata Evento", "desc": "Il grande show televisivo con musica, ospiti e intrattenimento.", "offset": 21000, "dur": 7200},
    ]

    epg_list = []
    for idx, item in enumerate(listings):
        start_ts = now + item["offset"]
        stop_ts = start_ts + item["dur"]
        start_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(start_ts))
        stop_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stop_ts))
        epg_list.append({
            "id": str(idx + 1),
            "epg_id": str(stream_id),
            "title": item["title"],
            "lang": "it",
            "start": start_str,
            "end": stop_str,
            "description": item["desc"],
            "start_timestamp": str(start_ts),
            "stop_timestamp": str(stop_ts),
            "now_playing": 1 if (start_ts <= now < stop_ts) else 0
        })

    return {"epg_listings": epg_list}


class IPTVRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        # Prevent browser from caching stale CSS/JS during development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

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
        if parsed.path == '/api/transcode':
            self.handle_transcode(is_head=True)
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

        # Safely unwrap recursive/nested proxy URLs
        for _ in range(5):
            m = re.match(r'^(?:https?://[^/]+)?/api/proxy\?url=(.+)$', target_url)
            if m:
                target_url = urllib.parse.unquote(m.group(1))
            else:
                break

        # Detect whether this is an API call or a media stream
        lower_url = target_url.lower()
        is_media_stream = any(lower_url.endswith(ext) or (ext + '?') in lower_url for ext in ('.ts', '.m3u8', '.mp4', '.mkv', '.avi'))
        is_api_request = (
            'player_api.php' in lower_url or
            'get.php' in lower_url or
            'xmltv' in lower_url or
            '/api/' in lower_url or
            ('action=' in lower_url and not is_media_stream)
        )

        req_headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                if is_api_request
                else 'VLC/3.0.20 LibVLC/3.0.20'
            ),
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
        }
        # Forward Range header for partial content (seeking VOD, TS chunks)
        if 'Range' in self.headers:
            req_headers['Range'] = self.headers['Range']

        # 1. Primary engine: requests (supports automatic gzip decompression, SSL bypass, redirects)
        try:
            import requests
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

            resp = requests.get(
                target_url,
                headers=req_headers,
                stream=True,
                timeout=25,
                verify=False,
                allow_redirects=True
            )
            actual_url = resp.url or target_url
            status_code = resp.status_code
            content_type = resp.headers.get('Content-Type', 'application/octet-stream')

            is_m3u8 = (
                '.m3u8' in target_url.lower() or
                '.m3u8' in actual_url.lower() or
                'mpegurl' in content_type.lower() or
                'application/x-mpegurl' in content_type.lower() or
                'vnd.apple.mpegurl' in content_type.lower()
            )

            # Check if this is an M3U8 playlist to rewrite
            if is_m3u8 and not is_head:
                raw_text = resp.text
                if raw_text.startswith('#EXTM3U') or is_m3u8:
                    try:
                        rewritten_text = rewrite_m3u8(raw_text, actual_url)
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

            # For JSON API requests, deliver decompressed content cleanly
            if is_api_request or 'application/json' in content_type.lower():
                body_bytes = resp.content  # requests handles gzip/deflate automatically
                self.send_response(status_code)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
                self.send_header('Access-Control-Allow-Headers', '*')
                self.send_header('Access-Control-Expose-Headers', '*')
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(body_bytes)))
                self.end_headers()
                if not is_head:
                    self.wfile.write(body_bytes)
                return

            # For regular streams (TS, MP4, MKV)
            self.send_response(status_code)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
            self.send_header('Access-Control-Allow-Headers', '*')
            self.send_header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type')
            self.send_header('Content-Type', content_type)
            if 'Content-Length' in resp.headers:
                self.send_header('Content-Length', resp.headers['Content-Length'])
            if 'Content-Range' in resp.headers:
                self.send_header('Content-Range', resp.headers['Content-Range'])
            if 'Accept-Ranges' in resp.headers:
                self.send_header('Accept-Ranges', resp.headers['Accept-Ranges'])
            self.end_headers()

            if is_head:
                return

            for chunk in resp.iter_content(chunk_size=65536):
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    break
            return

        except Exception as req_err:
            # Fallback to urllib if requests fails
            try:
                req = urllib.request.Request(target_url, headers=req_headers)
                resp = NO_PROXY_OPENER.open(req, timeout=30)
                actual_url = resp.geturl() or target_url

                status_code = resp.status
                content_type = resp.headers.get('Content-Type', 'application/octet-stream')
                content_length = resp.headers.get('Content-Length')
                content_range = resp.headers.get('Content-Range')
                accept_ranges = resp.headers.get('Accept-Ranges', 'bytes')
                content_encoding = resp.headers.get('Content-Encoding', '').lower()

                raw_data = resp.read()

                # Decompress if gzipped
                if content_encoding == 'gzip' or raw_data.startswith(b'\x1f\x8b'):
                    try:
                        raw_data = gzip.decompress(raw_data)
                    except Exception:
                        pass
                elif content_encoding == 'deflate':
                    try:
                        raw_data = zlib.decompress(raw_data)
                    except Exception:
                        pass

                is_m3u8 = (
                    '.m3u8' in target_url.lower() or
                    '.m3u8' in actual_url.lower() or
                    'mpegurl' in content_type.lower()
                )

                if is_m3u8 and not is_head:
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

                self.send_response(status_code)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
                self.send_header('Access-Control-Allow-Headers', '*')
                self.send_header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type')
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(raw_data)))
                if content_range:
                    self.send_header('Content-Range', content_range)
                if accept_ranges:
                    self.send_header('Accept-Ranges', accept_ranges)
                self.end_headers()

                if not is_head:
                    self.wfile.write(raw_data)
                return

            except urllib.error.HTTPError as e:
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

    def handle_tools(self):
        vlc = find_vlc()
        ffmpeg = find_ffmpeg()
        self.send_response(200)
        self.end_cors_headers()
        self.end_headers()
        res = {
            "vlc_available": bool(vlc),
            "vlc_path": vlc,
            "ffmpeg_available": bool(ffmpeg),
            "ffmpeg_path": ffmpeg
        }
        self.wfile.write(json.dumps(res).encode('utf-8'))

    def handle_open_vlc(self):
        prefix = '/api/open_vlc?url='
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
            self.wfile.write(b'{"success": false, "error": "Parametro url mancante"}')
            return

        if target_url.startswith('http%3A') or target_url.startswith('https%3A') or '%2F' in target_url:
            target_url = urllib.parse.unquote(target_url)

        vlc_path = find_vlc()
        if not vlc_path:
            self.send_response(404)
            self.end_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": "VLC Media Player non trovato sul sistema."}).encode('utf-8'))
            return

        try:
            subprocess.Popen([vlc_path, target_url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.send_response(200)
            self.end_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "message": "VLC avviato con successo!", "path": vlc_path}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.end_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))

    def handle_transcode(self, is_head=False):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        target_url = qs.get('url', [None])[0]
        ss_val = qs.get('ss', [None])[0] or qs.get('start', [None])[0]

        # Fallback for unescaped url parameter
        if not target_url:
            prefix = '/api/transcode?url='
            if self.path.startswith(prefix):
                remainder = self.path[len(prefix):]
                if '&ss=' in remainder:
                    parts = remainder.split('&ss=', 1)
                    target_url = parts[0]
                    ss_val = parts[1]
                else:
                    target_url = remainder

        if not target_url:
            self.send_response(400)
            self.end_cors_headers()
            self.end_headers()
            if not is_head:
                self.wfile.write(b'{"error": "Parametro url mancante"}')
            return

        if target_url.startswith('http%3A') or target_url.startswith('https%3A') or '%2F' in target_url:
            target_url = urllib.parse.unquote(target_url)

        start_seconds = 0.0
        if ss_val:
            try:
                start_seconds = max(0.0, float(ss_val))
            except (ValueError, TypeError):
                start_seconds = 0.0

        ffmpeg_path = find_ffmpeg()
        if not ffmpeg_path:
            # Fallback to standard proxy if ffmpeg is missing
            self.handle_proxy(is_head=is_head)
            return

        clean_env = os.environ.copy()
        clean_env.pop('http_proxy', None)
        clean_env.pop('https_proxy', None)

        cmd = [
            ffmpeg_path,
            "-hide_banner",
            "-loglevel", "error",
            "-reconnect", "1",
            "-reconnect_streamed", "1",
            "-reconnect_delay_max", "5",
            "-user_agent", "VLC/3.0.20 LibVLC/3.0.20",
        ]

        if start_seconds > 0:
            cmd.extend(["-ss", str(start_seconds)])

        cmd.extend([
            "-i", target_url,
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-ac", "2",
            "-avoid_negative_ts", "make_zero",
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "pipe:1"
        ])

        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Content-Type', 'video/mp4')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()

        if is_head:
            return

        proc = None
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=clean_env)
            while True:
                chunk = proc.stdout.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception as e:
            print(f"[Transcode] Streaming error: {e}")
        finally:
            if proc:
                try:
                    proc.terminate()
                    proc.wait(timeout=1)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass

    def handle_media_info(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        target_url = qs.get('url', [None])[0]
        if not target_url:
            self.send_response(400)
            self.end_cors_headers()
            self.end_headers()
            self.wfile.write(b'{"error": "Parametro url mancante"}')
            return

        if target_url.startswith('http%3A') or target_url.startswith('https%3A') or '%2F' in target_url:
            target_url = urllib.parse.unquote(target_url)

        ffprobe_path = find_ffprobe()
        if not ffprobe_path:
            self.send_response(200)
            self.end_cors_headers()
            self.end_headers()
            self.wfile.write(b'{"duration": 0}')
            return

        try:
            cmd = [
                ffprobe_path,
                "-v", "error",
                "-user_agent", "VLC/3.0.20 LibVLC/3.0.20",
                "-show_entries", "format=duration",
                "-of", "json",
                target_url
            ]
            clean_env = os.environ.copy()
            clean_env.pop('http_proxy', None)
            clean_env.pop('https_proxy', None)
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=8, env=clean_env)
            info = json.loads(res.stdout) if res.stdout else {}
            dur_str = info.get('format', {}).get('duration')
            dur = float(dur_str) if dur_str else 0
            self.send_response(200)
            self.end_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"duration": dur}).encode('utf-8'))
        except Exception as e:
            self.send_response(200)
            self.end_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"duration": 0, "error": str(e)}).encode('utf-8'))

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == '/api/proxy':
            self.handle_proxy(is_head=True)
            return
        if path == '/api/transcode':
            self.handle_transcode(is_head=True)
            return
        super().do_HEAD()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. CORS Proxy Endpoint (for API calls and Streams): /api/proxy?url=<TARGET_URL>
        if path == '/api/proxy':
            self.handle_proxy(is_head=False)
            return

        # 2. On-The-Fly Audio Transcoding (AC3/DTS -> AAC for browser playback): /api/transcode?url=<TARGET_URL>&ss=<SEEK_SECONDS>
        if path == '/api/transcode':
            self.handle_transcode(is_head=False)
            return

        # 3. Media Metadata Probe: /api/media_info?url=<TARGET_URL>
        if path == '/api/media_info':
            self.handle_media_info()
            return

        # 4. Direct Launch in VLC Media Player: /api/open_vlc?url=<TARGET_URL>
        if path == '/api/open_vlc':
            self.handle_open_vlc()
            return

        # 5. Diagnostic System Tools Status: /api/tools
        if path == '/api/tools':
            self.handle_tools()
            return

        # 5c. Live Version & Commit Status: /api/version or /version
        if path in ('/api/version', '/version'):
            self.send_response(200)
            self.end_cors_headers(content_type="application/json; charset=utf-8")
            self.end_headers()
            version_info = {
                "app": "IPTV Player V2",
                "version": "2.3.0",
                "branch": "main",
                "latest_update": "mobile bottom nav reorder (Live, Film/VOD, Serie TV, Preferiti, Guida TV) + device native video player (Apple AVPlayer on iOS)",
                "features": ["mobile_ui", "desktop_ui", "device_native_player", "apple_avplayer_ios", "epg_guide", "m3u_support", "xtream_support"]
            }
            self.wfile.write(json.dumps(version_info, ensure_ascii=False, indent=2).encode('utf-8'))
            return

        # 5b. Demo M3U Playlist: /demo.m3u or /playlist.m3u
        if path in ('/demo.m3u', '/playlist.m3u', '/api/demo/playlist.m3u'):
            self.send_response(200)
            self.end_cors_headers(content_type="audio/x-mpegurl; charset=utf-8")
            self.end_headers()
            cat_map = {c['category_id']: c['category_name'] for c in DEMO_LIVE_CATEGORIES + DEMO_VOD_CATEGORIES}
            m3u_lines = ["#EXTM3U"]
            for s in DEMO_LIVE_STREAMS:
                cat_name = cat_map.get(str(s.get('category_id')), 'Canali Nazionali')
                logo = s.get('stream_icon', '')
                tvg_id = s.get('epg_channel_id', '')
                name = s.get('name', 'Canale Live')
                url = s.get('direct_source', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8')
                m3u_lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{name}" tvg-logo="{logo}" group-title="{cat_name}",{name}')
                m3u_lines.append(url)
            for v in DEMO_VOD_STREAMS:
                cat_name = cat_map.get(str(v.get('category_id')), 'Cinema')
                logo = v.get('stream_icon', '')
                name = v.get('name', 'Film VOD')
                url = v.get('direct_source', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4')
                m3u_lines.append(f'#EXTINF:-1 tvg-name="{name}" tvg-logo="{logo}" group-title="{cat_name}",{name}')
                m3u_lines.append(url)
            self.wfile.write("\n".join(m3u_lines).encode('utf-8'))
            return

        # 6. Built-in Demo Xtream API: /api/demo/player_api.php or /player_api.php
        if path.startswith('/api/demo') or path == '/player_api.php' or path.startswith('/player_api.php'):
            action = query.get('action', [None])[0]
            cat_id = query.get('category_id', [None])[0]
            series_id = query.get('series_id', [None])[0]
            stream_id = query.get('stream_id', [None])[0]

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
            elif action in ('get_short_epg', 'get_simple_data_table'):
                response_data = get_demo_channel_epg(stream_id or "1001")
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
        mode_str = "React Native (Expo Web)" if "expo-app" in PUBLIC_DIR else "Vanilla JS (Classico)"
        httpd = ThreadingHTTPServer(server_address, IPTVRequestHandler)
        print("=" * 60)
        print(f"[IPTV Player V2] Server Attivo! Modo: {mode_str}")
        print(f">> Directory servita: {PUBLIC_DIR}")
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

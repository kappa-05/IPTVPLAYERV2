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
import time
import math
import tempfile
import atexit
import hashlib

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


class HLSStreamManager:
    """
    On-the-fly HLS VOD Engine for Movies and Series.
    Generates a full VOD HLS Playlist (#EXT-X-PLAYLIST-TYPE:VOD + #EXT-X-ENDLIST)
    and serves MPEG-TS video segments.
    - Guaranteed Apple AVPlayer native fullscreen on iPhone/iPad with full duration,
      draggable timeline scrubber, and 15s forward/rewind buttons (NO 'LIVE' badge!).
    - Guaranteed universal playback via hls.js on Chrome/Firefox/Android/Desktop.
    - On-demand instant seeking (<150ms) using FFmpeg input-seeking (-ss before -i).
    - Sequential background prefetching for zero-latency consecutive segment delivery.
    """
    def __init__(self):
        self.temp_root = os.path.join(tempfile.gettempdir(), 'iptv_hls_cache')
        os.makedirs(self.temp_root, exist_ok=True)
        self.sessions = {}
        self.duration_cache = {}
        self.seg_locks = {}
        self.lock = threading.Lock()
        self._cleaner = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleaner.start()
        atexit.register(self.shutdown_all)

    def _cleanup_loop(self):
        while True:
            time.sleep(30)
            now = time.time()
            with self.lock:
                to_delete = []
                for sid, data in self.sessions.items():
                    if now - data.get('last_seen', now) > 600:
                        to_delete.append(sid)
                for sid in to_delete:
                    self._kill_session(sid)

    def _kill_session(self, sid):
        data = self.sessions.pop(sid, None)
        if data:
            proc = data.get('proc')
            if proc:
                try:
                    proc.terminate()
                    proc.wait(timeout=1)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
            sdir = data.get('dir')
            if sdir and os.path.isdir(sdir):
                shutil.rmtree(sdir, ignore_errors=True)

    def shutdown_all(self):
        with self.lock:
            for sid in list(self.sessions.keys()):
                self._kill_session(sid)

    def get_duration(self, target_url, hint_duration=0):
        if hint_duration and hint_duration > 0:
            self.duration_cache[target_url] = float(hint_duration)
            return float(hint_duration)

        if target_url in self.duration_cache:
            return self.duration_cache[target_url]

        ffprobe_path = find_ffprobe()
        if ffprobe_path:
            for ua in ["IPTVSmartersPlayer", "VLC/3.0.20 LibVLC/3.0.20", "Mozilla/5.0"]:
                try:
                    cmd = [
                        ffprobe_path,
                        "-v", "error",
                        "-user_agent", ua,
                        "-headers", "Accept: */*\r\n",
                        "-probesize", "2097152",
                        "-analyzeduration", "3000000",
                        "-show_entries", "format=duration",
                        "-of", "json",
                        target_url
                    ]
                    clean_env = os.environ.copy()
                    clean_env.pop('http_proxy', None)
                    clean_env.pop('https_proxy', None)
                    res = subprocess.run(cmd, capture_output=True, text=True, timeout=5.0, env=clean_env)
                    if res.stdout:
                        info = json.loads(res.stdout)
                        dur_str = info.get('format', {}).get('duration')
                        if dur_str:
                            dur = float(dur_str)
                            if dur > 0:
                                self.duration_cache[target_url] = dur
                                return dur
                except Exception:
                    pass

        # Fallback default: 7200 seconds (2 hours)
        default_dur = 7200.0
        self.duration_cache[target_url] = default_dur
        return default_dur

    def get_vod_master_m3u8(self, target_url, duration, seg_duration=5.0):
        sid = hashlib.md5(target_url.encode('utf-8')).hexdigest()[:12]
        sdir = os.path.join(self.temp_root, sid)
        os.makedirs(sdir, exist_ok=True)

        num_segments = max(1, int(math.ceil(duration / seg_duration)))

        lines = [
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            f"#EXT-X-TARGETDURATION:{int(seg_duration) + 1}",
            "#EXT-X-MEDIA-SEQUENCE:0",
            "#EXT-X-PLAYLIST-TYPE:VOD"
        ]

        for i in range(num_segments):
            if i == num_segments - 1:
                last_dur = duration - (i * seg_duration)
                if last_dur <= 0:
                    last_dur = seg_duration
                lines.append(f"#EXTINF:{last_dur:.6f},")
            else:
                lines.append(f"#EXTINF:{seg_duration:.6f},")
            lines.append(f"/api/hls/{sid}/seg_{i:04d}.ts")

        lines.append("#EXT-X-ENDLIST")
        m3u8_bytes = ("\n".join(lines) + "\n").encode('utf-8')

        with self.lock:
            if sid not in self.sessions:
                self.sessions[sid] = {
                    'target_url': target_url,
                    'duration': duration,
                    'seg_duration': seg_duration,
                    'num_segments': num_segments,
                    'dir': sdir,
                    'last_seen': time.time(),
                    'proc': None
                }
            else:
                self.sessions[sid]['last_seen'] = time.time()
                self.sessions[sid]['duration'] = duration

        # Start continuous sequential background worker from segment 0
        self._ensure_background_worker(sid, target_url, sdir, start_seg=0)

        return sid, m3u8_bytes

    def _ensure_background_worker(self, sid, target_url, sdir, start_seg=0):
        with self.lock:
            sess = self.sessions.get(sid)
            if not sess:
                return
            proc = sess.get('proc')
            cur_start = sess.get('current_start_seg', 0)
            # If a worker is already running from or near this position, let it continue
            if proc and proc.poll() is None:
                if 0 <= (start_seg - cur_start) <= 5:
                    return
                # Otherwise terminate old worker before seeking to new position to avoid duplicate connections!
                try:
                    proc.terminate()
                    proc.wait(timeout=1)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                sess['proc'] = None

            ffmpeg_path = find_ffmpeg()
            if not ffmpeg_path:
                return

            clean_env = os.environ.copy()
            clean_env.pop('http_proxy', None)
            clean_env.pop('https_proxy', None)

            seg_duration = sess.get('seg_duration', 5.0)
            cmd = [
                ffmpeg_path,
                "-y",
                "-hide_banner",
                "-loglevel", "warning",
            ]
            if target_url.startswith(('http://', 'https://')):
                cmd.extend([
                    "-reconnect", "1",
                    "-reconnect_at_eof", "1",
                    "-reconnect_streamed", "1",
                    "-reconnect_delay_max", "5",
                    "-probesize", "2097152",
                    "-analyzeduration", "3000000",
                    "-fflags", "+nobuffer+fastseek+discardcorrupt",
                    "-user_agent", "IPTVSmartersPlayer",
                    "-headers", "Accept: */*\r\n",
                ])

            if start_seg > 0:
                seek_secs = start_seg * seg_duration
                cmd.extend(["-ss", f"{seek_secs:.2f}"])

            cmd.extend([
                "-i", target_url,
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "192k",
                "-ac", "2",
                "-avoid_negative_ts", "make_zero",
                "-f", "hls",
                "-hls_time", str(int(seg_duration)),
                "-hls_list_size", "0",
                "-hls_flags", "independent_segments",
                "-start_number", str(start_seg),
                "-hls_segment_filename", os.path.join(sdir, "seg_%04d.ts"),
                os.path.join(sdir, f"internal_{start_seg}.m3u8")
            ])
            try:
                sess['proc'] = subprocess.Popen(cmd, env=clean_env)
                sess['current_start_seg'] = start_seg
            except Exception as e:
                print(f"[Worker Error] {e}")

    def get_or_create_segment(self, sid, seg_name):
        with self.lock:
            sess = self.sessions.get(sid)
            if not sess:
                sdir = os.path.join(self.temp_root, sid)
                if not os.path.isdir(sdir):
                    return None
                sess = {
                    'dir': sdir,
                    'last_seen': time.time(),
                    'target_url': None,
                    'duration': 7200.0,
                    'seg_duration': 5.0,
                    'proc': None,
                    'current_start_seg': 0
                }
                self.sessions[sid] = sess
            sess['last_seen'] = time.time()
            sdir = sess['dir']
            target_url = sess.get('target_url')
            seg_duration = sess.get('seg_duration', 5.0)

        seg_path = os.path.join(sdir, seg_name)

        # 1. Fast path: Segment already generated on disk
        if os.path.exists(seg_path) and os.path.getsize(seg_path) > 0:
            return seg_path

        if not target_url:
            return None

        m = re.match(r'seg_(\d+)\.ts', seg_name)
        if not m:
            return None
        seg_idx = int(m.group(1))

        # Check worker status
        proc = sess.get('proc')
        worker_alive = proc is not None and proc.poll() is None
        cur_start = sess.get('current_start_seg', 0)

        # If worker is not running, or if requested segment is far away from worker position (seek ahead > 8 segments), restart worker!
        if not worker_alive or (seg_idx < cur_start) or (seg_idx > cur_start + 12):
            self._ensure_background_worker(sid, target_url, sdir, start_seg=seg_idx)

        # 2. Smart Wait: wait up to 35 seconds for the single background worker to produce this segment!
        # This completely avoids running multiple simultaneous FFmpeg instances that choke the IPTV server and trigger stream timeouts!
        start_wait = time.time()
        while time.time() - start_wait < 35.0:
            if os.path.exists(seg_path) and os.path.getsize(seg_path) > 0:
                return seg_path
            time.sleep(0.2)
            # If worker terminated unexpectedly, try to restart it once
            proc = sess.get('proc')
            if proc and proc.poll() is not None:
                if not os.path.exists(seg_path) or os.path.getsize(seg_path) == 0:
                    self._ensure_background_worker(sid, target_url, sdir, start_seg=seg_idx)

        if os.path.exists(seg_path) and os.path.getsize(seg_path) > 0:
            return seg_path

        return None

HLS_STREAM_MGR = HLSStreamManager()


class IPTVRequestHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        # Do NOT send no-store on media streams or proxy/transcode/hls responses (breaks iOS AVPlayer playback)
        path_lower = getattr(self, 'path', '').lower()
        is_media = any(ext in path_lower for ext in ('/api/proxy', '/api/transcode', '/api/hls', '.ts', '.m3u8', '.mp4', '.mkv', '.avi', '.mov', '.mp3'))
        if not is_media:
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
        is_mkv = lower_url.endswith('.mkv') or ('.mkv?' in lower_url) or lower_url.endswith('.avi') or ('.avi?' in lower_url) or lower_url.endswith('.flv') or ('.flv?' in lower_url)
        is_media_stream = any(lower_url.endswith(ext) or (ext + '?') in lower_url for ext in ('.ts', '.m3u8', '.mp4', '.mkv', '.avi', '.mov', '.flv'))
        is_api_request = (
            'player_api.php' in lower_url or
            'get.php' in lower_url or
            'xmltv' in lower_url or
            '/api/' in lower_url or
            ('action=' in lower_url and not is_media_stream)
        )

        # HTML5 browsers (especially Safari on iOS) cannot demux or play MKV/AVI containers natively.
        # If ffmpeg is available, transparently delegate to ffmpeg real-time remuxer to output progressive MP4!
        if is_mkv and find_ffmpeg():
            return self.handle_transcode(is_head=is_head, override_url=target_url)

        req_headers = {
            'User-Agent': 'IPTVSmartersPlayer' if not is_api_request else 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive',
        }
        if is_api_request:
            req_headers['Accept-Encoding'] = 'gzip, deflate'
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
            # If IPTV server blocks the initial User-Agent with 403, retry with VLC User-Agent
            if resp.status_code == 403:
                req_headers['User-Agent'] = 'VLC/3.0.20 LibVLC/3.0.20'
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
            # Ensure correct MIME type for video media streams so Safari & mobile browsers won't reject with MediaError Code 4
            if is_media_stream or '/movie/' in lower_url or '/series/' in lower_url:
                if is_m3u8:
                    content_type = 'application/vnd.apple.mpegurl'
                elif not is_api_request:
                    content_type = 'video/mp4'

            # If the upstream returned 200 OK despite client requesting Range (some IPTV CDNs ignore Range headers),
            # synthesize a 206 Partial Content response for Safari/AVPlayer so it does not fail with Code 4!
            client_range = self.headers.get('Range')
            total_content_len = int(resp.headers.get('Content-Length', 0))
            is_synthesized_range = False
            r_start, r_end, bytes_to_send = 0, 0, None

            if status_code == 200 and client_range and client_range.startswith('bytes=') and not is_m3u8:
                try:
                    rng_val = client_range[6:].split('-')
                    r_start = int(rng_val[0]) if rng_val[0] else 0
                    if len(rng_val) > 1 and rng_val[1]:
                        r_end = int(rng_val[1])
                    else:
                        r_end = (total_content_len - 1) if total_content_len > 0 else (r_start + 1048575)
                    if total_content_len > 0:
                        r_end = min(r_end, total_content_len - 1)

                    status_code = 206
                    is_synthesized_range = True
                    bytes_to_send = max(0, r_end - r_start + 1)
                except Exception:
                    is_synthesized_range = False

            self.send_response(status_code)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
            self.send_header('Access-Control-Allow-Headers', '*')
            self.send_header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type')
            self.send_header('Content-Type', content_type)

            if is_synthesized_range:
                self.send_header('Content-Range', f"bytes {r_start}-{r_end}/{total_content_len if total_content_len > 0 else '*'}")
                self.send_header('Content-Length', str(bytes_to_send))
            else:
                if 'Content-Length' in resp.headers:
                    self.send_header('Content-Length', resp.headers['Content-Length'])
                if 'Content-Range' in resp.headers:
                    self.send_header('Content-Range', resp.headers['Content-Range'])

            if 'Accept-Ranges' in resp.headers:
                self.send_header('Accept-Ranges', resp.headers['Accept-Ranges'])
            else:
                self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Cache-Control', 'public, max-age=3600')
            self.end_headers()

            if is_head:
                return

            if is_synthesized_range and bytes_to_send is not None:
                bytes_left = bytes_to_send
                current_offset = 0
                for chunk in resp.iter_content(chunk_size=65536):
                    if not chunk or bytes_left <= 0:
                        break
                    chunk_len = len(chunk)
                    if current_offset + chunk_len <= r_start:
                        current_offset += chunk_len
                        continue
                    start_in_chunk = max(0, r_start - current_offset)
                    slice_len = min(chunk_len - start_in_chunk, bytes_left)
                    try:
                        self.wfile.write(chunk[start_in_chunk:start_in_chunk + slice_len])
                        bytes_left -= slice_len
                        current_offset += chunk_len
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        break
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
                else:
                    self.send_header('Accept-Ranges', 'bytes')
                self.send_header('Cache-Control', 'public, max-age=3600')
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

    def handle_transcode(self, is_head=False, override_url=None):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        target_url = override_url or qs.get('url', [None])[0]
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
        ]
        if target_url.startswith(('http://', 'https://')):
            cmd.extend([
                "-reconnect", "1",
                "-reconnect_at_eof", "1",
                "-reconnect_streamed", "1",
                "-reconnect_delay_max", "5",
                "-probesize", "2097152",
                "-analyzeduration", "3000000",
                "-fflags", "+nobuffer+fastseek+discardcorrupt",
                "-user_agent", "IPTVSmartersPlayer",
                "-headers", "Accept: */*\r\n",
            ])

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
        self.send_header('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Accept-Ranges')
        self.send_header('Content-Type', 'video/mp4')
        self.send_header('Cache-Control', 'public, max-age=3600')
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

        if target_url.startswith(('http%3A', 'https%3A')) or '%2F' in target_url:
            target_url = urllib.parse.unquote(target_url)

        dur = HLS_STREAM_MGR.get_duration(target_url)
        self.send_response(200)
        self.end_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps({"duration": dur}).encode('utf-8'))

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == '/api/hls/master.m3u8' or path.startswith('/api/hls/'):
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
            self.send_header('Content-Type', 'application/vnd.apple.mpegurl' if path.endswith('.m3u8') else 'video/mp2t')
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()
            return
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

        # 0. Real-time HLS Remuxer for VOD & Series: /api/hls/master.m3u8?url=<TARGET_URL>&duration=<SECS>
        if path == '/api/hls/master.m3u8':
            target_url = query.get('url', [None])[0]
            duration_val = query.get('duration', [None])[0]
            if not target_url:
                prefix = '/api/hls/master.m3u8?url='
                if self.path.startswith(prefix):
                    remainder = self.path[len(prefix):]
                    if '&duration=' in remainder:
                        parts = remainder.split('&duration=', 1)
                        target_url = parts[0]
                        duration_val = parts[1]
                    else:
                        target_url = remainder
            if target_url:
                if target_url.startswith(('http%3A', 'https%3A')) or '%2F' in target_url:
                    target_url = urllib.parse.unquote(target_url)

                # If target is already an HLS m3u8 playlist, redirect to proxy
                if '.m3u8' in target_url.lower():
                    self.send_response(302)
                    self.send_header('Location', f'/api/proxy?url={urllib.parse.quote(target_url, safe="")}')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    return

                hint_dur = 0.0
                if duration_val:
                    try:
                        hint_dur = float(duration_val)
                    except Exception:
                        hint_dur = 0.0

                duration = HLS_STREAM_MGR.get_duration(target_url, hint_dur)
                sid, m3u8_bytes = HLS_STREAM_MGR.get_vod_master_m3u8(target_url, duration, seg_duration=6.0)

                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
                self.send_header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
                self.send_header('Content-Length', str(len(m3u8_bytes)))
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                self.end_headers()
                self.wfile.write(m3u8_bytes)
                return

        # Serve HLS Segment chunks: /api/hls/{sid}/{segment.ts}
        if path.startswith('/api/hls/'):
            parts = [p for p in path.split('/') if p]
            if len(parts) >= 4:
                sid = parts[2]
                seg_name = parts[3]
                seg_path = HLS_STREAM_MGR.get_or_create_segment(sid, seg_name)
                if seg_path and os.path.exists(seg_path):
                    try:
                        file_size = os.path.getsize(seg_path)
                        self.send_response(200)
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
                        self.send_header('Content-Type', 'video/mp2t')
                        self.send_header('Content-Length', str(file_size))
                        self.send_header('Accept-Ranges', 'bytes')
                        self.send_header('Cache-Control', 'public, max-age=3600')
                        self.end_headers()
                        with open(seg_path, 'rb') as sf:
                            while True:
                                chunk = sf.read(65536)
                                if not chunk:
                                    break
                                self.wfile.write(chunk)
                        return
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        return
                    except Exception as e:
                        print(f"[HLS Segment Error]: {e}")
                        return

            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            return

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
                "version": "2.6.1",
                "branch": "main",
                "latest_update": "Definitive VOD fix: on-the-fly HLS remuxing pipeline for movies/series, IPTVSmarters/VLC anti-403 User-Agent, zero demo sections, removed VLC button",
                "features": ["mobile_ui", "desktop_ui", "device_native_player", "vod_hls_pipeline", "first_category_default", "apple_avplayer_ios", "epg_guide", "m3u_support", "xtream_support"]
            }
            self.wfile.write(json.dumps(version_info, ensure_ascii=False, indent=2).encode('utf-8'))
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

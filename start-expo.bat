@echo off
title IPTV Player V2 - React Native / Expo Web
echo =======================================================
echo   IPTV Player V2 - Edizione React Native / Expo
echo =======================================================
echo.
echo Avvio server locale su http://localhost:8080 ...
echo.
start "" http://localhost:8080
python server.py --expo
pause

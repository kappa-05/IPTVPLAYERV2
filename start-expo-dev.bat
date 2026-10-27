@echo off
title IPTV Player V2 - Expo Dev Server (Mobile + Web)
echo =======================================================
echo   IPTV Player V2 - Expo Dev Server (Mobile + Web)
echo =======================================================
echo.
echo Avvio del backend CORS proxy e mock server...
start /b python server.py
echo.
echo Avvio Expo per Web e Smartphone (inquadra il QR code con Expo Go)...
echo.
cd expo-app
npx expo start --web
pause

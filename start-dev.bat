@echo off
title IPTV Player V2 - Dev Server (Expo Go & Metro)
echo =======================================================
echo   IPTV Player V2 - Dev Server (Expo Go & Metro)
echo =======================================================
echo.
echo Avvio backend proxy CORS e mock server...
start /b python server.py
echo.
echo Avvio Expo Dev Server con Tunnel attivo per smartphone...
echo Inquadra il QR Code con l'app Expo Go da qualsiasi connessione.
echo.
cd expo-app
npx expo start --tunnel
pause

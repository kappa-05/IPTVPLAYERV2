@echo off
title IPTV Player V2
echo =======================================================
echo   IPTV Player V2 (React Native / Web)
echo =======================================================
echo.
echo  Accesso da questo PC:
echo    http://localhost:8080
echo.
echo  Accesso da Smartphone / Tablet (stesso Wi-Fi):
echo    http://160.97.168.195:8080
echo.
echo =======================================================
echo.
start "" http://localhost:8080
python server.py
pause

@echo off
set PATH=C:\Program Files\nodejs;%PATH%
title IPTV Player V2
echo =======================================================
echo   IPTV Player V2 (React Native / Web)
echo =======================================================
echo.
echo  Accesso da questo PC:
echo    http://localhost:8080
echo.
echo  Accesso da Smartphone / Tablet (stesso Wi-Fi):
echo    http://192.168.1.166:8080
echo.
echo =======================================================
echo.
start "" http://localhost:8080
python server.py
pause

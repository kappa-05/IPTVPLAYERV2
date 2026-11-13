@echo off
setlocal
cd /d "%~dp0"
set PATH=C:\Program Files\nodejs;%PATH%
title IPTV Player V2 - Cinematic

echo =======================================================
echo   IPTV PLAYER V2 - CINEMATIC
echo =======================================================
echo.

cd /d "%~dp0expo-app"
if not exist "node_modules\expo" (
    echo [1/4] Installazione dipendenze frontend...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERRORE: npm install non riuscito. Controlla la connessione Internet.
        pause
        exit /b 1
    )
) else (
    echo [1/4] Dipendenze frontend gia' presenti.
)

echo.
echo [2/4] Compilazione frontend Expo per il web...
call npx expo export --platform web
if errorlevel 1 (
    echo.
    echo ERRORE: compilazione frontend non riuscita.
    pause
    exit /b 1
)

echo.
echo [3/4] Avvio backend su porta 8080...
cd /d "%~dp0"
start "IPTV Player V2 - Backend 8080" cmd /k "cd /d ""%~dp0"" && python server.py"

echo.
echo [4/4] Apertura browser su http://localhost:8080
timeout /t 3 /nobreak >nul
start "" "http://localhost:8080"

echo.
echo Frontend: http://localhost:8080
echo Riesegui start.bat dopo ogni modifica al frontend.
echo.
pause

@echo off
title Multi-AI Autonomous Development Orchestrator
echo ======================================================================
echo    Starting Multi-AI Autonomous Development Orchestrator
echo ======================================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking dependencies...
if not exist node_modules (
    echo Installing node dependencies...
    call npm install
)

echo [2/3] Checking Chrome with Remote Debugging (port 9222)...
netstat -ano | findstr ":9222 " | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Chrome debugging port 9222 is not active.
    echo Launching AI Dedicated Chrome with persistent session profile...
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\.chrome-ai-session" --no-first-run --no-default-browser-check "https://chatgpt.com" "https://gemini.google.com/app" "https://chat.deepseek.com" "https://claude.ai"
    timeout /t 3 /nobreak >nul
) else (
    echo Chrome CDP port 9222 is active!
)

echo [3/3] Checking Port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Freeing port 3000 (Process %%a)...
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo Starting Orchestrator Server on http://localhost:3000...
start "" "http://localhost:3000"
node server.js

pause

@echo off
chcp 65001 >nul
title Multi-AI Orchestrator -- SQAT Summit 2026 Champion Launcher
cd /d "%~dp0"

:menu
cls
echo ======================================================================
echo    Multi-AI Autonomous Development Orchestrator -- SQAT Summit 2026
echo    Theme: Quality, Security ^& AI: Shaping the Future of SWE
echo ======================================================================
echo.
echo  [1] Run 90 Automated Tests + Live Coverage Audit (Terminal Demo)
echo  [2] Launch SQAT Live Showcase Demo Mode (Zero-Lag 2.5-Min Stage Demo)
echo  [3] Launch Production Electron Desktop App (Live Web Sessions)
echo  [4] Open Interactive Presentation Slide Deck (PITCH_DECK.html)
echo  [5] Open Printable 2-Page Jury Technical Dossier (JURY_TECHNICAL_DOSSIER.html)
echo  [6] Open 5-Minute Pitch Script ^& Q^&A Defense Guide (Markdown)
echo  [7] Rebuild Project Bundles (npm run build)
echo  [8] Exit
echo.
echo ======================================================================
set /p choice="Select an option (1-8): "

if "%choice%"=="1" (
    cls
    node scripts\verify-quality.mjs
    echo.
    pause
    goto menu
)

if "%choice%"=="2" (
    cls
    echo ==================================================================
    echo Starting SQAT Summit High-Speed Live Showcase Mode...
    echo (Pre-warmed multi-model consensus, Zero-latency offline safe)
    echo ==================================================================
    npm run start:showcase
    goto menu
)

if "%choice%"=="3" (
    cls
    echo Starting Production Electron Desktop App...
    npm start
    goto menu
)

if "%choice%"=="4" (
    start "" "PITCH_DECK.html"
    goto menu
)

if "%choice%"=="5" (
    start "" "JURY_TECHNICAL_DOSSIER.html"
    goto menu
)

if "%choice%"=="6" (
    start "" notepad.exe "SHOWCASE_5_MINUTE_PITCH_SCRIPT.md"
    goto menu
)

if "%choice%"=="7" (
    cls
    echo Rebuilding project...
    call npm run build
    echo Build complete.
    pause
    goto menu
)

if "%choice%"=="8" (
    exit
)

goto menu

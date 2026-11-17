@echo off
setlocal
cd /d "%~dp0"
echo ======================================================================
echo    SQAT Summit 2026 -- Desktop Shortcut Generator
echo ======================================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "TARGET_FILE=%SCRIPT_DIR%SHOWCASE_LAUNCHER.bat"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$shortcutPath = Join-Path $desktop 'SQAT Summit - Multi-AI Showcase.lnk'; " ^
  "$s = $ws.CreateShortcut($shortcutPath); " ^
  "$s.TargetPath = '%TARGET_FILE%'; " ^
  "$s.WorkingDirectory = '%SCRIPT_DIR%'; " ^
  "$s.WindowStyle = 1; " ^
  "$s.Description = 'Multi-AI Autonomous Development Orchestrator - SQAT Summit 2026'; " ^
  "$s.Save(); " ^
  "Write-Host '[SUCCESS] Shortcut created on Desktop: SQAT Summit - Multi-AI Showcase.lnk' -ForegroundColor Green"

echo.
pause

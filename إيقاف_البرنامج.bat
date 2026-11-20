@echo off
chcp 65001 > nul
title إيقاف تشغيل برنامج نديم للحسابات
cd /d "%~dp0"

echo ==========================================================
echo    إيقاف تشغيل برنامج نديم للحسابات والنفق السحابي
echo ==========================================================
echo.

powershell -ExecutionPolicy Bypass -Command "Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"

powershell -ExecutionPolicy Bypass -Command "$conns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue; if ($conns) { foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } }"

echo [✓] تم إيقاف الخادم ونفق الإنترنت بالكامل.
echo.
timeout /t 3 > nul

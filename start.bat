@echo off
chcp 65001 > nul
title سيرفر نديم للحسابات
cd /d "%~dp0"

echo ==========================================================
echo    تشغيل برنامج نديم للحسابات (محلياً)
echo ==========================================================
echo.

set ELECTRON_RUN_AS_NODE=1
set "NODE_EXE=C:\Users\NADEEM\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe"

netstat -ano | findstr ":3000" | findstr "LISTENING" > nul
if errorlevel 1 (
    echo [+] جاري تشغيل السيرفر...
    start "NadeemServer" /min cmd /c "set ELECTRON_RUN_AS_NODE=1 && ""%NODE_EXE%"" server.js"
    timeout /t 3 /nobreak > nul
) else (
    echo [i] السيرفر يعمل مسبقاً على المنفذ 3000.
)

start http://localhost:3000
exit

@echo off
chcp 65001 > nul
title برنامج نديم للحسابات
cd /d "%~dp0"

echo ==========================================================
echo    تشغيل برنامج نديم للحسابات
echo ==========================================================
echo.

set ELECTRON_RUN_AS_NODE=1
set "NODE_EXE=C:\Users\NADEEM\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe"

netstat -ano | findstr ":3000" > nul
if errorlevel 1 (
    echo [+] جاري تشغيل السيرفر...
    if exist "%NODE_EXE%" (
        start "" /b cmd /c "set ELECTRON_RUN_AS_NODE=1 && ""%NODE_EXE%"" server.js"
    ) else (
        start "" /b node server.js
    )
    timeout /t 2 /nobreak > nul
) else (
    echo [i] السيرفر يعمل مسبقاً.
)

start http://localhost:3000
exit

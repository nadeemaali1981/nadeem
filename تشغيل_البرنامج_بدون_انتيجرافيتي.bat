@echo off
chcp 65001 > nul
title تشغيل برنامج نديم للحسابات في الخلفية
cd /d "%~dp0"

echo ==========================================================
echo    تشغيل برنامج نديم للحسابات (مستقل عن انتيجرافيتي)
echo ==========================================================
echo.

set ELECTRON_RUN_AS_NODE=1
set "NODE_EXE=C:\Users\NADEEM\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe"

:: 1. التحقق من تشغيل الخادم
netstat -ano | findstr ":3000" > nul
if errorlevel 1 (
    echo [+] جاري تشغيل خادم المحاسبة في الخلفية...
    start "" /b cmd /c "set ELECTRON_RUN_AS_NODE=1 && ""%NODE_EXE%"" server.js"
    timeout /t 3 /nobreak > nul
) else (
    echo [✓] الخادم المحلي يعمل بالفعل.
)

:: 2. تشغيل نفق Cloudflare للإنترنت
echo [+] جاري تشغيل البث السحابي المباشر عبر Cloudflare...
start "" /b powershell -ExecutionPolicy Bypass -File "%~dp0start_tunnel.ps1"

timeout /t 5 /nobreak > nul

if exist "%~dp0tunnel_url.txt" (
    set /p TUNNEL_URL=<"%~dp0tunnel_url.txt"
    echo.
    echo ==========================================================
    echo   [✓] البرنامج قيد التشغيل في الخلفية بنجاح!
    echo   [✓] سيبقى الرابط شغالاً حتى لو أغلقت انتيجرافيتي تماماً
    echo   ----------------------------------------------------------
    echo   رابط الإنترنت المباشر:
    echo   %TUNNEL_URL%
    echo.
    echo   الرابط المحلي:
    echo   http://localhost:3000
    echo ==========================================================
    start "" "%TUNNEL_URL%"
) else (
    echo [✓] تم بدء التشغيل، جاري فتح الرابط المحلي...
    start "" "http://localhost:3000"
)

echo.
echo يمكنك إغلاق هذه الشاشة الآن، البرنامج يعمل في الخلفية بشكل مستقل.
pause

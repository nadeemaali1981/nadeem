@echo off
chcp 65001 > nul
title برنامج نديم للحسابات - البث المباشر على الإنترنت (Cloudflare Tunnel)
cd /d "%~dp0"

echo ====================================================
echo   برنامج نديم للحسابات - تشغيل الرابط العام للإنترنت
echo ====================================================
echo.

set ELECTRON_RUN_AS_NODE=1
set "NODE_EXE=C:\Users\NADEEM\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe"

:: 1. تشغيل الخادم المحلي إن لم يكن قيد التشغيل
netstat -ano | findstr ":3000" > nul
if errorlevel 1 (
    echo [+] جاري تشغيل الخادم المحلي...
    start "" /min cmd /c "set ELECTRON_RUN_AS_NODE=1 && ""%NODE_EXE%"" server.js"
    timeout /t 3 /nobreak > nul
) else (
    echo [+] الخادم المحلي يعمل بالفعل على المنفذ 3000.
)

:: 2. تشغيل نفق Cloudflare المباشر
echo [+] جاري إنشاء رابط إنترنت عام آمن عبر Cloudflare...
echo.

powershell -ExecutionPolicy Bypass -Command "$bin = '.\bin\cloudflared.exe'; $log = '.\tunnel_err.log'; if (Test-Path $log) { Remove-Item $log -Force }; $proc = Start-Process -FilePath $bin -ArgumentList 'tunnel --url http://127.0.0.1:3000' -PassThru -NoNewWindow -RedirectStandardError $log; for ($i=0; $i -lt 25; $i++) { Start-Sleep 1; if (Test-Path $log) { $txt = Get-Content $log -Raw; if ($txt -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') { $u = $matches[1]; Write-Host ''; Write-Host '====================================================' -ForegroundColor Green; Write-Host '  رابط الإنترنت العام الخاص بك جاهز الآن:' -ForegroundColor Yellow; Write-Host ('  ' + $u) -ForegroundColor Cyan; Write-Host '====================================================' -ForegroundColor Green; Write-Host ''; Start-Process $u; break; } } }; $proc.WaitForExit()"

echo.
echo تم إغلاق النفق.
pause

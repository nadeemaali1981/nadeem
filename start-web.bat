

@echo off
chcp 65001 > nul
title برنامج نديم للحسابات - خادم الويب
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=1
set "NODE_EXE=C:\Users\NADEEM\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe"

echo ====================================================
echo  جاري تشغيل برنامج نديم للحسابات...
echo ====================================================

start "" /min cmd /c "set ELECTRON_RUN_AS_NODE=1 && ""%NODE_EXE%"" server.js"
timeout /t 2 /nobreak > nul

start http://localhost:3000

echo.
echo تم تشغيل البرنامج بنجاح!
echo الرابط المحلي: http://localhost:3000
echo رابط الأجهزة الأخرى على الشبكة (الجوال): http://192.168.1.229:3000
echo.
echo يرجى عدم إغلاق هذه النافذة أثناء استخدام البرنامج.
pause

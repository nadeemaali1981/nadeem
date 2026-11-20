@echo off
chcp 65001 > nul
title تثبيت التشغيل التلقائي مع إقلاع الويندوز
cd /d "%~dp0"

echo ==========================================================
echo    تثبيت تشغيل برنامج نديم للحسابات تلقائياً مع الويندوز
echo ==========================================================
echo.

powershell -ExecutionPolicy Bypass -Command "$wsh = New-Object -ComObject WScript.Shell; $startup = [System.Environment]::GetFolderPath('Startup'); $sc = $wsh.CreateShortcut(\"$startup\NadeemAccounting.lnk\"); $sc.TargetPath = \"$PSScriptRoot\تشغيل_البرنامج_بدون_انتيجرافيتي.bat\"; $sc.WorkingDirectory = \"$PSScriptRoot\"; $sc.WindowStyle = 7; $sc.Save(); Write-Host '[✓] تم إنشاء اختصار التشغيل التلقائي في مجلد بدء التشغيل (Startup) بنجاح!' -ForegroundColor Green"

echo.
echo سيعمل البرنامج تلقائياً في الخلفية في كل مرة تفتح فيها جهاز الكمبيوتر.
echo دون الحاجة لفتح انتيجرافيتي أو أي برنامج آخر!
echo.
pause

@echo off
title Nadeem Clothes Store ERP (Next.js + Supabase)
cd /d "%~dp0"

echo ==================================================
echo   Starting Nadeem Clothes Store ERP (Next.js)
echo   Local URL: http://localhost:3000
echo ==================================================
echo.

start "" "http://localhost:3000"
call npm run dev
pause

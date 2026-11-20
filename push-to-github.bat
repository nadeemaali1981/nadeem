@echo off
title Push updates to GitHub and Render
cd /d "%~dp0"

echo ==========================================================
echo    Pushing updates to GitHub (Render will auto-deploy)
echo ==========================================================
echo.

git add -A
git commit -m "Update from local" 2>nul
git push origin main

echo.
echo ==========================================================
if %ERRORLEVEL% equ 0 (
    echo [OK] Pushed to GitHub successfully.
    echo [OK] Render is now deploying automatically.
    echo Site: https://nadeem-h8rz.onrender.com
) else (
    echo [X] Push failed. If a GitHub sign-in window appears, please approve it.
)
echo ==========================================================
echo.
pause

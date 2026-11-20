@echo off
title Auto-push to GitHub
cd /d "%~dp0"
echo Auto-push is running. Keep this window open (minimize it).
node auto-push.js
pause

@echo off
chcp 65001 > nul
cd /d "C:\Users\NADEEM\Desktop\نديم للحسابات"
set ELECTRON_RUN_AS_NODE=1
"C:\Users\NADEEM\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" server.js >> debug_server.log 2>&1

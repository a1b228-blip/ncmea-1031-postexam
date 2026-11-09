@echo off
rem 1031 post-exam 3D deck: double-click to start (Windows). Keep the black window open while presenting.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"

@echo off
rem Starts the HonestPlates food-model server for the iOS app (port 8787).
rem Extra arguments are passed through, e.g.:  start_server.bat --token mysecret
cd /d "%~dp0"
".venv\Scripts\python.exe" serve.py %*
pause

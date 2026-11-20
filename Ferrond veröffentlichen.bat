@echo off
rem Testet das Modul, baut die Kompendien, zeigt was sich geaendert hat, fragt nach und laedt dann eine neue Version auf GitHub hoch.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || set "PATH=E:\Apps\nodejs;%PATH%"
where git >nul 2>nul || set "PATH=E:\Apps\Git\cmd;%PATH%"
where gh >nul 2>nul || set "PATH=C:\Program Files\GitHub CLI;%PATH%"
if not exist node_modules (
  echo Erster Start: lade die Werkzeuge ...
  call npm install --no-fund --no-audit
)
node tools\publish.mjs
echo.
pause

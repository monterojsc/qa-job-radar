@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  start "QA Job Radar Server" cmd /k py -m http.server 8080
  timeout /t 2 /nobreak >nul
  start "" http://localhost:8080
  exit /b 0
)
where python >nul 2>&1
if %errorlevel%==0 (
  start "QA Job Radar Server" cmd /k python -m http.server 8080
  timeout /t 2 /nobreak >nul
  start "" http://localhost:8080
  exit /b 0
)
echo.
echo No se ha encontrado Python en el equipo.
echo Instala Python o publica la app en GitHub Pages siguiendo README.md.
echo.
pause

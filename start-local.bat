@echo off
cd /d "%~dp0web"
if not exist node_modules (
  echo Installing dependencies with Bun...
  call bun install
)
if not exist .env.local (
  if exist ..\.env (
    echo Creating .env.local from parent .env + .cohesivity...
    for /f "usebackq tokens=1,* delims==" %%a in ("..\.env") do set %%a=%%b
    for /f "usebackq tokens=1,* delims==" %%a in ("..\.cohesivity") do if "%%a"=="coh_application_key" set COH_APPLICATION_KEY=%%b
    echo GEMINI_API_KEY=%GEMINI_API_KEY%> .env.local
    echo COH_APPLICATION_KEY=%COH_APPLICATION_KEY%>> .env.local
  ) else (
    echo Copy web\.env.example to web\.env.local and add your API keys.
    copy .env.example .env.local
    notepad .env.local
    pause
    exit /b 1
  )
)
echo.
echo Thumbnail Generator running at http://localhost:1382
echo Other devices on your network: http://YOUR-IP:1382
echo.
call bun run dev

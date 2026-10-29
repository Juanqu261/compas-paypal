@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title COMPAS — starting demo
echo.
echo  COMPAS local demo
echo  ------------------
echo  Backend  : http://localhost:4000   (Node ^>= 22.9)
echo  Frontend : http://localhost:3000   (Next.js)
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not on PATH. Install Node 22.9+ and try again.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do echo  Node %%v

if not exist "backend\node_modules\" (
  echo.
  echo  Installing backend dependencies...
  pushd backend
  call npm install
  if errorlevel 1 (
    echo ERROR: backend npm install failed.
    popd
    pause
    exit /b 1
  )
  popd
)

if not exist "frontend\node_modules\" (
  echo.
  echo  Installing frontend dependencies...
  pushd frontend
  call npm install
  if errorlevel 1 (
    echo ERROR: frontend npm install failed.
    popd
    pause
    exit /b 1
  )
  popd
)

if not exist "backend\.env" (
  echo.
  echo  NOTE: backend\.env is missing. Copy backend\.env.example to backend\.env
  echo        and fill PayPal sandbox values when you need real orders.
  echo        The API still starts; unconfigured PayPal calls throw instead of faking.
  echo.
)

echo.
echo  Opening Backend and Frontend in separate windows...
echo  Close those windows to stop each server.
echo.

start "COMPAS Backend :4000" /D "%~dp0backend" cmd /k "npm run dev"
start "COMPAS Frontend :3000" /D "%~dp0frontend" cmd /k "npm run dev"

echo  Done. When both windows say they are ready:
echo    open  http://localhost:3000
echo    demo  http://localhost:3000/demo
echo.
timeout /t 4 >nul
endlocal

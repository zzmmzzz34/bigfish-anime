@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 大肥鱼番剧

if exist "config.env" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /v /b "#" "config.env"`) do set "%%A=%%B"
)

set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"

if not defined NODE_EXE (
  set "BUNDLED_NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
  if exist "%BUNDLED_NODE%" (
    set "NODE_EXE=%BUNDLED_NODE%"
    set "PATH=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;%PATH%"
  )
)

if not defined NODE_EXE (
  echo.
  echo   [x] 没有找到 Node.js
  echo       请先安装 Node.js LTS: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\tsx" (
  echo.
  echo   [x] 依赖还没安装，请先运行:
  echo       npm install
  echo.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo   正在构建前端...
  call npm run build
)

echo.
echo   大肥鱼番剧启动中...  http://127.0.0.1:8787
echo   关闭这个窗口即可停止服务
echo.

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8787'"
"%NODE_EXE%" "node_modules\tsx\dist\cli.mjs" server\index.ts

pause

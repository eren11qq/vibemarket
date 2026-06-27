@echo off
title Vibe Market 独立服务器
cd /d "%~dp0"

echo ============================================
echo       Vibe Market 启动中...
echo ============================================
echo.

REM 检查 node_modules
if not exist "node_modules\" (
    echo [错误] 请先运行 npm install 安装依赖
    pause
    exit /b 1
)

REM 检查 .env 文件
if not exist ".env" (
    echo [警告] 未找到 .env 文件，将使用默认配置
    echo [提示] 生产环境请根据 .env.example 创建 .env 文件
)

echo [信息] 启动服务器...
echo [信息] 打开浏览器访问 http://localhost:3456
echo.

node server.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 启动失败，请检查上方错误信息
    pause
)
pause

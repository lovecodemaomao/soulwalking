@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

py -3.12 --version >nul 2>&1
if errorlevel 1 goto :python_missing

if not exist ".venv\Scripts\python.exe" (
    echo [1/3] 正在创建 Python 3.12 虚拟环境…
    py -3.12 -m venv .venv
    if errorlevel 1 goto :failed
)

echo [2/3] 正在检查并安装运行依赖；首次启动需要联网，可能需数分钟…
.venv\Scripts\python.exe -m pip install -e .
if errorlevel 1 goto :failed

echo [3/3] 正在启动 SoulWalking…
.venv\Scripts\python.exe desktop_launcher.py
exit /b 0

:python_missing
echo 未检测到 Python 3.12。
echo 请安装 Python 3.12 x64，并在安装时勾选 “Add Python to PATH”，然后重新双击本文件。
pause
exit /b 1

:failed
echo 启动失败。请确认网络可用，并重新运行本文件。
pause
exit /b 1

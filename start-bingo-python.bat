@echo off
setlocal
cd /d "%~dp0bridge\python"

echo ==========================================
echo        BINGO DEEPSEEK BUILD
 echo        PYTHON LOCAL BRIDGE
 echo ==========================================
echo.

where py >nul 2>nul
if %errorlevel%==0 goto run_py

where python >nul 2>nul
if %errorlevel%==0 goto run_python

echo [ERRO] Python nao foi encontrado no PATH.
echo Instale Python 3.x e marque "Add Python to PATH".
pause
exit /b 1

:run_py
echo [OK] Iniciando Python Bridge...
py bingo_bridge.py
goto end

:run_python
echo [OK] Iniciando Python Bridge...
python bingo_bridge.py

goto end

:end
endlocal

@echo off
setlocal
cd /d "%~dp0python"
where py >nul 2>nul
if %errorlevel%==0 (
  py bingo_bridge_v11.py
  goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
  python bingo_bridge_v11.py
  goto :end
)
echo [BINGO] Python nao encontrado no PATH.
echo Instale Python 3.x e marque "Add Python to PATH".
pause
:end
endlocal

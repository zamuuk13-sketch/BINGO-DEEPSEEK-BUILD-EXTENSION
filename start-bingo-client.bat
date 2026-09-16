@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo       BINGO CLIENT - STAGE 10
 echo ==========================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 -m bingo_client.main_v10
    goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
    python -m bingo_client.main_v10
    goto :end
)

echo [ERRO] Python 3 nao foi encontrado no PATH.
echo Instale Python 3 e tente novamente.
pause

:end
endlocal

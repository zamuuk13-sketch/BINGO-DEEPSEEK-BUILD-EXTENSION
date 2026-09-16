@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo       BINGO CLIENT - PRODUCTION BUILD
echo ==========================================
echo.

where py >nul 2>nul
if %errorlevel%==0 goto build
where python >nul 2>nul
if %errorlevel%==0 goto build

echo [ERRO] Python 3 nao foi encontrado no PATH.
pause
goto :end

:build
set PYTHON=py -3
%PYTHON% -m pip install --disable-pip-version-check pyinstaller
if errorlevel 1 goto fail
%PYTHON% -m PyInstaller --noconfirm --clean --windowed --name BINGO-Client --paths . -m bingo_client.main_v10
if errorlevel 1 goto fail

echo.
echo [OK] Build criado em dist\BINGO-Client\
echo.
goto :end

:fail
echo [ERRO] Falha durante o build.
pause

:end
endlocal

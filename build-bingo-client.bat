@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo       BINGO CLIENT - PRODUCTION BUILD
echo ==========================================
echo.

where py >nul 2>nul
if %errorlevel%==0 goto build_py
where python >nul 2>nul
if %errorlevel%==0 goto build_python

echo [ERRO] Python 3 nao foi encontrado no PATH.
pause
goto :end

:build_py
py -3 -m pip install --disable-pip-version-check pyinstaller
if errorlevel 1 goto fail
py -3 -m PyInstaller --noconfirm --clean --windowed --name BINGO-Client --paths . bingo_client/__main__.py
if errorlevel 1 goto fail
goto success

:build_python
python -m pip install --disable-pip-version-check pyinstaller
if errorlevel 1 goto fail
python -m PyInstaller --noconfirm --clean --windowed --name BINGO-Client --paths . bingo_client/__main__.py
if errorlevel 1 goto fail
goto success

:success
echo.
echo [OK] Build criado em dist\BINGO-Client\
echo [OK] O executavel esta dentro da pasta de distribuicao.
echo.
goto :end

:fail
echo [ERRO] Falha durante o build.
pause

:end
endlocal

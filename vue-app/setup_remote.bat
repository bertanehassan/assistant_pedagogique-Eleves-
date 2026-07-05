@echo off
SET GIT="C:\Program Files\Git\bin\git.exe"
SET REPO_URL=%1

if "%REPO_URL%"=="" (
  echo Usage: setup_remote.bat https://github.com/VOTRE-USERNAME/mon-assistant-ia.git
  pause
  exit /b 1
)

%GIT% branch -M main
%GIT% remote add origin %REPO_URL%
%GIT% push -u origin main
echo.
echo === PUSH REUSSI ! ===
echo Votre code est maintenant sur GitHub.
echo Allez sur vercel.com pour connecter le depot.
pause

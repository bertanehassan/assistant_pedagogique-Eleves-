@echo off
SET GIT="C:\Program Files\Git\bin\git.exe"

%GIT% config user.name "Hassan Bertane"
%GIT% config user.email "user@example.com"
%GIT% add .
%GIT% commit -m "Initial commit - Mon Assistant IA 2026"
echo.
echo === REPO INITIALISE ===
echo Maintenant allez sur https://github.com/new et creez un depot nomme "mon-assistant-ia"
echo Puis revenez et lancez setup_remote.bat
pause

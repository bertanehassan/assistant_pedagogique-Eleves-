@echo off
echo =======================================================
echo Lancement du serveur HASSAN_BERTANE AI (Vue.js / Vite)
echo =======================================================
echo.
echo Ouverture de http://localhost:5173 dans votre navigateur par defaut...
start http://localhost:5173

cd vue-app
npm run dev
pause

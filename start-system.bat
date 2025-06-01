@echo off
echo 🌐 Starting Distributed Search System with FlexSearch
echo.

cd /d "%~dp0\backend"

echo 📦 Installing dependencies...
call npm install

echo.
echo 🚀 Starting System Components...
echo.

echo 🎯 Starting Coordinator (Port 3000)...
start "Coordinator" cmd /k "npm run coordinator"

timeout /t 3 /nobreak > nul

echo 🔍 Starting Search Node 1 (Port 3001 - Data: 0-6692)...
start "Node-1" cmd /k "npm run node1"

timeout /t 2 /nobreak > nul

echo 🔍 Starting Search Node 2 (Port 3002 - Data: 6692-13385)...
start "Node-2" cmd /k "npm run node2"

timeout /t 2 /nobreak > nul

echo 🔍 Starting Search Node 3 (Port 3003 - Data: 13385-20077)...
start "Node-3" cmd /k "npm run node3"

timeout /t 2 /nobreak > nul

echo 🔍 Starting Search Node 4 (Port 3004 - Data: 20077-26770)...
start "Node-4" cmd /k "npm run node4"

echo.
echo ✅ All components started!
echo.
echo 🌐 Dashboard: http://localhost:3000
echo 📊 Coordinator API: http://localhost:3000/api/status
echo 🔧 Nodes Info:
echo    - Node 1: http://localhost:3001/info
echo    - Node 2: http://localhost:3002/info  
echo    - Node 3: http://localhost:3003/info
echo    - Node 4: http://localhost:3004/info
echo.

timeout /t 5 /nobreak > nul

echo 🚀 Opening dashboard...
start http://localhost:3000

echo.
echo 🎉 Distributed Search System is running!
echo 💡 Close this window safely - all services run in separate windows
echo.
pause 
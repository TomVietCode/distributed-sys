@echo off
echo ========================================
echo   FlexSearch Distributed System
echo   with MySQL Database Integration
echo ========================================
echo.

echo Installing dependencies...
cd backend
call npm install
echo.

echo Starting Distributed Search System...
echo.

echo Starting Coordinator (Port 3000)...
start "Coordinator" cmd /k "npm run coordinator"

timeout /t 3 /nobreak > nul

echo Starting Search Node 1 (Port 3001)...
start "Search Node 1" cmd /k "set PORT=3001&& set NODE_ID=search-node-1&& npm run node"

timeout /t 2 /nobreak > nul

echo Starting Search Node 2 (Port 3002)...
start "Search Node 2" cmd /k "set PORT=3002&& set NODE_ID=search-node-2&& npm run node"

timeout /t 2 /nobreak > nul

echo Starting Search Node 3 (Port 3003)...
start "Search Node 3" cmd /k "set PORT=3003&& set NODE_ID=search-node-3&& npm run node"

echo.
echo ========================================
echo   System Starting...
echo ========================================
echo.
echo Coordinator:     http://localhost:3000
echo Dashboard:       http://localhost:3000
echo API Status:      http://localhost:3000/api/status
echo Database Health: http://localhost:3000/api/database/health
echo.
echo Search Node 1:   http://localhost:3001/info
echo Search Node 2:   http://localhost:3002/info  
echo Search Node 3:   http://localhost:3003/info
echo.
echo Database Config:
echo Host: 127.0.0.1:3309
echo Database: Local MYSQL
echo Table: untitled_table_1
echo.
echo ========================================
echo Wait 10 seconds for services to start,
echo then open: http://localhost:3000
echo ========================================

timeout /t 10 /nobreak > nul
start http://localhost:3000

pause 
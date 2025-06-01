// coordinator.js - Distributed Search Coordinator với MySQL, Node Management và Redis Cache
require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const { spawn } = require('child_process');
const { databaseManager } = require('./database');
const { cacheManager } = require('./cache-manager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../')));

class DistributedSearchCoordinator {
    constructor() {
        this.nodes = new Map();
        this.totalDataSize = 0; // Sẽ được lấy từ database
        this.stats = {
            totalRequests: 0,
            averageResponseTime: 0,
            requestHistory: []
        };
        
        // Node management
        this.managedNodes = new Map(); // Map of spawned node processes
        this.targetNodeCount = 0; // Desired number of nodes
        this.basePort = 3001; // Starting port for spawned nodes
        
        console.log('🌐 Distributed Search Coordinator starting...');
    }
    
    // Khởi tạo coordinator với database
    async initialize() {
        try {
            console.log('🔄 Initializing coordinator with MySQL database and Redis cache...');
            
            // Khởi tạo database connection
            await databaseManager.initialize();
            
            // Khởi tạo Redis cache 
            try {
                await cacheManager.initialize();
            } catch (cacheError) {
                console.log('⚠️ Cache initialization failed, continuing without cache');
            }
            
            // Lấy tổng số bài hát từ database
            this.totalDataSize = await databaseManager.getTotalCount();
            console.log(`📊 Total songs in database: ${this.totalDataSize.toLocaleString()}`);
            
            return true;
        } catch (error) {
            console.error('❌ Coordinator initialization failed:', error.message);
            
            // Set default values on error
            this.totalDataSize = 0;
            throw error;
        }
    }
    
    // Spawn một search node mới
    async spawnSearchNode(nodeId, port) {
        try {
            console.log(`🚀 Spawning search node: ${nodeId} on port ${port}`);
            
            const nodeProcess = spawn('node', ['node.js', nodeId, port.toString()], {
                cwd: __dirname,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    PORT: port.toString(),
                    NODE_ID: nodeId
                }
            });
            
            // Log node output
            nodeProcess.stdout.on('data', (data) => {
                console.log(`[${nodeId}] ${data.toString().trim()}`);
            });
            
            nodeProcess.stderr.on('data', (data) => {
                console.error(`[${nodeId}] ERROR: ${data.toString().trim()}`);
            });
            
            nodeProcess.on('close', (code) => {
                console.log(`📴 Node ${nodeId} exited with code ${code}`);
                this.managedNodes.delete(nodeId);
                
                // Remove from active nodes if it was registered
                if (this.nodes.has(nodeId)) {
                    this.nodes.delete(nodeId);
                    this.redistributeData();
                }
            });
            
            nodeProcess.on('error', (error) => {
                console.error(`❌ Failed to spawn node ${nodeId}:`, error.message);
                this.managedNodes.delete(nodeId);
            });
            
            // Store process reference
            this.managedNodes.set(nodeId, {
                process: nodeProcess,
                port: port,
                startTime: Date.now(),
                status: 'starting'
            });
            
            return true;
        } catch (error) {
            console.error(`❌ Error spawning node ${nodeId}:`, error.message);
            return false;
        }
    }
    
    // Kill một search node
    async killSearchNode(nodeId) {
        try {
            const nodeInfo = this.managedNodes.get(nodeId);
            if (!nodeInfo) {
                console.log(`⚠️ Node ${nodeId} not found in managed nodes`);
                return false;
            }
            
            console.log(`🛑 Killing search node: ${nodeId}`);
            
            // Kill the process
            nodeInfo.process.kill('SIGTERM');
            
            // Wait a bit then force kill if still alive
            setTimeout(() => {
                if (!nodeInfo.process.killed) {
                    console.log(`🔪 Force killing node ${nodeId}`);
                    nodeInfo.process.kill('SIGKILL');
                }
            }, 5000);
            
            return true;
        } catch (error) {
            console.error(`❌ Error killing node ${nodeId}:`, error.message);
            return false;
        }
    }
    
    // Cập nhật số lượng nodes mong muốn
    async updateNodeCount(targetCount) {
        try {
            const currentCount = this.managedNodes.size;
            console.log(`🔄 Updating node count: ${currentCount} → ${targetCount}`);
            
            this.targetNodeCount = targetCount;
            
            if (targetCount > currentCount) {
                // Spawn thêm nodes
                const nodesToSpawn = targetCount - currentCount;
                console.log(`➕ Spawning ${nodesToSpawn} new nodes...`);
                
                for (let i = 0; i < nodesToSpawn; i++) {
                    const nodeIndex = currentCount + i + 1;
                    const nodeId = `search-node-${nodeIndex}`;
                    const port = this.basePort + currentCount + i;
                    
                    await this.spawnSearchNode(nodeId, port);
                    
                    // Small delay between spawns
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } else if (targetCount < currentCount) {
                // Kill excess nodes
                const nodesToKill = currentCount - targetCount;
                console.log(`➖ Killing ${nodesToKill} excess nodes...`);
                
                const nodeIds = Array.from(this.managedNodes.keys());
                const nodesKeep = nodeIds.slice(0, targetCount);
                const nodesKill = nodeIds.slice(targetCount);
                
                for (const nodeId of nodesKill) {
                    await this.killSearchNode(nodeId);
                }
            }
            
            return {
                success: true,
                message: `Node count updated to ${targetCount}`,
                currentCount: this.managedNodes.size,
                targetCount: targetCount
            };
        } catch (error) {
            console.error('❌ Error updating node count:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Lấy trạng thái của managed nodes
    getManagedNodesStatus() {
        const managedStatus = {};
        this.managedNodes.forEach((nodeInfo, nodeId) => {
            managedStatus[nodeId] = {
                port: nodeInfo.port,
                startTime: nodeInfo.startTime,
                uptime: Date.now() - nodeInfo.startTime,
                status: nodeInfo.status,
                pid: nodeInfo.process.pid,
                isRegistered: this.nodes.has(nodeId)
            };
        });
        return managedStatus;
    }
    
    // Tự động phân chia data cho nodes dựa trên database size
    redistributeData() {
        const nodeCount = this.nodes.size;
        if (nodeCount === 0) return;
        
        const chunkSize = Math.ceil(this.totalDataSize / nodeCount);
        const nodeArray = Array.from(this.nodes.values());
        
        console.log(`🔄 Redistributing ${this.totalDataSize} songs for ${nodeCount} nodes (chunk size: ~${chunkSize})`);
        
        nodeArray.forEach((node, index) => {
            const start = index * chunkSize;
            const end = Math.min(start + chunkSize, this.totalDataSize);
            
            node.dataRange = { start, end };
            console.log(`📊 ${node.id}: assigned data range ${start}-${end} (${end - start} songs)`);
        });
    }
    
    // Đăng ký search node
    registerNode(nodeInfo) {
        const { nodeId, port } = nodeInfo;
        const nodeUrl = `http://localhost:${port}`;
        
        this.nodes.set(nodeId, {
            id: nodeId,
            url: nodeUrl,
            port: port,
            dataRange: { start: 0, end: 0 }, // Sẽ được cập nhật
            status: 'active',
            totalRequests: 0,
            averageResponseTime: 0,
            lastSeen: Date.now()
        });
        
        // Update managed node status if it exists
        if (this.managedNodes.has(nodeId)) {
            this.managedNodes.get(nodeId).status = 'registered';
        }
        
        // Tự động phân chia lại data cho tất cả nodes
        this.redistributeData();
        
        // Thông báo cho tất cả nodes về data range mới
        this.notifyNodesDataRange();
        
        console.log(`📍 Node registered: ${nodeId} at ${nodeUrl}`);
        return { 
            success: true, 
            message: `Node ${nodeId} registered successfully`,
            dataRange: this.nodes.get(nodeId).dataRange,
            totalDataSize: this.totalDataSize
        };
    }
    
    // Thông báo data range mới cho tất cả nodes
    async notifyNodesDataRange() {
        const notifications = Array.from(this.nodes.values()).map(async (node) => {
            try {
                await axios.post(`${node.url}/update-data-range`, {
                    dataRange: node.dataRange,
                    totalDataSize: this.totalDataSize
                }, { timeout: 50000 });
                
                console.log(`✅ Updated data range for ${node.id}: ${node.dataRange.start}-${node.dataRange.end}`);
            } catch (error) {
                console.error(`❌ Failed to update data range for ${node.id}:`, error.message);
                node.status = 'error';
            }
        });
        
        await Promise.allSettled(notifications);
    }
    
    // Lấy danh sách nodes khỏe mạnh
    getHealthyNodes() {
        return Array.from(this.nodes.values()).filter(node => node.status === 'active');
    }
    
    // Tìm kiếm phân tán với Redis Cache
    async distributedSearch(query, options = {}) {
        const startTime = performance.now();
        const searchId = `search-${Date.now()}`;
        
        console.log(`🔍 Distributed search: "${query}" (ID: ${searchId})`);
        
        // Check cache first
        try {
            const cachedResult = await cacheManager.getCachedDistributedResults(query, options);
            if (cachedResult) {
                const totalTime = performance.now() - startTime;
                console.log(`💰 Cache HIT: "${query}" in ${totalTime.toFixed(2)}ms`);
                
                return {
                    ...cachedResult,
                    totalTime: totalTime,
                    fromCache: true
                };
            }
        } catch (cacheError) {
            console.log('⚠️ Cache check failed, proceeding with search:', cacheError.message);
        }

        // === DEMO: Artificial delay for first-time searches ===
        console.log(`🐌 Cache MISS: Simulating heavy database processing...`);
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000)); // 1-2 second delay
        
        const healthyNodes = this.getHealthyNodes();
        if (healthyNodes.length === 0) {
            throw new Error('No healthy search nodes available');
        }
        
        // Gửi search request đến tất cả nodes song song
        const searchPromises = healthyNodes.map(async (node) => {
            const nodeStartTime = performance.now();
            try {
                const response = await axios.post(`${node.url}/search`, {
                    query: query,
                    options: options,
                    searchId: searchId
                }, { timeout: 8000 });
                
                const nodeResponseTime = performance.now() - nodeStartTime;
                
                // Cập nhật node stats
                node.totalRequests++;
                node.averageResponseTime = ((node.averageResponseTime * (node.totalRequests - 1)) + nodeResponseTime) / node.totalRequests;
                node.lastSeen = Date.now();
                
                console.log(`✅ ${node.id}: ${response.data.results.length} results in ${nodeResponseTime.toFixed(2)}ms`);
                
                return {
                    nodeId: node.id,
                    results: response.data.results,
                    responseTime: nodeResponseTime,
                    dataRange: node.dataRange,
                    success: true
                };
            } catch (error) {
                console.error(`❌ ${node.id} failed:`, error.message);
                node.status = 'error';
                return {
                    nodeId: node.id,
                    results: [],
                    responseTime: performance.now() - nodeStartTime,
                    success: false,
                    error: error.message
                };
            }
        });
        
        // Chờ tất cả responses
        const nodeResults = await Promise.allSettled(searchPromises);
        const endTime = performance.now();
        const totalTime = endTime - startTime;
        
        // Xử lý và merge results
        const allResults = [];
        const successfulNodes = [];
        const failedNodes = [];
        
        nodeResults.forEach((result) => {
            if (result.status === 'fulfilled' && result.value.success) {
                const nodeResult = result.value;
                successfulNodes.push(nodeResult);
                
                nodeResult.results.forEach(song => {
                    allResults.push({
                        ...song,
                        sourceNode: nodeResult.nodeId,
                        nodeDataRange: nodeResult.dataRange
                    });
                });
            } else {
                failedNodes.push(result.value || { nodeId: 'unknown', error: 'Promise rejected' });
            }
        });
        
        // Sắp xếp results theo relevance (song name)
        allResults.sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            const queryLower = query.toLowerCase();
            
            // Ưu tiên exact match
            if (nameA.includes(queryLower) && !nameB.includes(queryLower)) return -1;
            if (!nameA.includes(queryLower) && nameB.includes(queryLower)) return 1;
            
            // Ưu tiên starts with
            if (nameA.startsWith(queryLower) && !nameB.startsWith(queryLower)) return -1;
            if (!nameA.startsWith(queryLower) && nameB.startsWith(queryLower)) return 1;
            
            return nameA.localeCompare(nameB);
        });
        
        // Apply limit
        const limit = options.limit || 25;
        const finalResults = allResults.slice(0, limit);
        
        // Cập nhật coordinator stats
        this.stats.totalRequests++;
        this.stats.averageResponseTime = ((this.stats.averageResponseTime * (this.stats.totalRequests - 1)) + totalTime) / this.stats.totalRequests;
        this.stats.requestHistory.push({
            searchId: searchId,
            query: query,
            totalTime: totalTime,
            nodesUsed: successfulNodes.length,
            resultsCount: finalResults.length,
            timestamp: Date.now()
        });
        
        // Giữ chỉ 50 requests gần nhất
        if (this.stats.requestHistory.length > 50) {
            this.stats.requestHistory = this.stats.requestHistory.slice(-50);
        }
        
        const searchResult = {
            results: finalResults,
            totalTime: totalTime,
            searchId: searchId,
            distributedStats: {
                nodesQueried: healthyNodes.length,
                nodesSuccessful: successfulNodes.length,
                nodesFailed: failedNodes.length,
                nodeDetails: successfulNodes
            },
            fromCache: false
        };
        
        // Cache the results (async, don't wait)
        if (finalResults.length > 0) {
            cacheManager.cacheDistributedResults(query, searchResult, options)
                .catch(error => console.log('⚠️ Failed to cache results:', error.message));
        }
        
        console.log(`🏁 Search completed: ${finalResults.length} results in ${totalTime.toFixed(2)}ms from ${successfulNodes.length}/${healthyNodes.length} nodes`);
        
        return searchResult;
    }
    
    // Lấy trạng thái hệ thống
    getSystemStatus() {
        const nodeStats = {};
        this.nodes.forEach((node, nodeId) => {
            nodeStats[nodeId] = {
                ...node,
                isHealthy: node.status === 'active'
            };
        });
        
        return {
            ...this.stats,
            nodes: nodeStats,
            healthyNodes: this.getHealthyNodes().length,
            totalNodes: this.nodes.size,
            totalDataSize: this.totalDataSize,
            databaseStatus: databaseManager.isReady() ? 'connected' : 'disconnected',
            managedNodes: this.getManagedNodesStatus(),
            targetNodeCount: this.targetNodeCount
        };
    }
    
    // Làm mới thống kê database (gọi định kỳ)
    async refreshDatabaseStats() {
        try {
            if (databaseManager.isReady()) {
                const newTotalSize = await databaseManager.getTotalCount();
                if (newTotalSize !== this.totalDataSize) {
                    console.log(`📊 Database size changed: ${this.totalDataSize} → ${newTotalSize}`);
                    this.totalDataSize = newTotalSize;
                    this.redistributeData();
                    this.notifyNodesDataRange();
                }
            }
        } catch (error) {
            console.error('❌ Error refreshing database stats:', error.message);
        }
    }
}

// Khởi tạo coordinator
const coordinator = new DistributedSearchCoordinator();

// API Routes
app.get('/api/status', async (req, res) => {
    try {
        const dbHealth = await databaseManager.healthCheck();
        res.json({
            status: 'coordinator-ready',
            type: 'distributed-coordinator',
            database: dbHealth,
            stats: coordinator.getSystemStatus()
        });
    } catch (error) {
        res.status(500).json({
            status: 'coordinator-error',
            error: error.message
        });
    }
});

app.post('/api/search', async (req, res) => {
    try {
        const { query, options = {} } = req.body;
        
        if (!query || query.trim().length === 0) {
            return res.json({ results: [], totalTime: 0, message: 'Empty query' });
        }
        
        if (!databaseManager.isReady()) {
            return res.status(503).json({ 
                error: 'Database not ready',
                message: 'Database connection not established'
            });
        }
        
        const searchResult = await coordinator.distributedSearch(query, options);
        res.json(searchResult);
        
    } catch (error) {
        console.error('Distributed search error:', error);
        res.status(500).json({ 
            error: 'Distributed search failed',
            message: error.message
        });
    }
});

app.post('/api/register-node', (req, res) => {
    try {
        const result = coordinator.registerNode(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/nodes', (req, res) => {
    const stats = coordinator.getSystemStatus();
    res.json({
        nodes: stats.nodes,
        healthyNodes: stats.healthyNodes,
        totalNodes: stats.totalNodes,
        managedNodes: stats.managedNodes,
        targetNodeCount: stats.targetNodeCount
    });
});

// Node management APIs
app.post('/api/nodes/update-count', async (req, res) => {
    try {
        const { nodeCount } = req.body;
        
        if (!nodeCount || nodeCount < 0 || nodeCount > 10) {
            return res.status(400).json({ 
                error: 'Invalid node count',
                message: 'Node count must be between 0 and 10'
            });
        }
        
        const result = await coordinator.updateNodeCount(parseInt(nodeCount));
        res.json(result);
        
    } catch (error) {
        console.error('Update node count error:', error);
        res.status(500).json({ 
            error: 'Failed to update node count',
            message: error.message
        });
    }
});

app.get('/api/database/health', async (req, res) => {
    try {
        const health = await databaseManager.healthCheck();
        res.json(health);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cache management APIs
app.get('/api/cache/health', async (req, res) => {
    try {
        const health = await cacheManager.healthCheck();
        res.json(health);
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            status: 'error',
            connected: false
        });
    }
});

app.get('/api/cache/stats', async (req, res) => {
    try {
        const stats = await cacheManager.getCacheStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            connected: false 
        });
    }
});

app.get('/api/cache/hot-queries', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const hotQueries = await cacheManager.getHotQueries(limit);
        res.json({
            hotQueries: hotQueries,
            limit: limit,
            timestamp: Date.now()
        });
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            hotQueries: []
        });
    }
});

app.delete('/api/cache/invalidate', async (req, res) => {
    try {
        const { pattern } = req.query;
        
        if (!pattern) {
            // Invalidate all search cache
            const success = await cacheManager.invalidateSearchCache();
            return res.json({
                success: success,
                message: 'Search cache invalidated',
                pattern: 'search:*'
            });
        }
        
        const success = await cacheManager.invalidatePattern(pattern);
        res.json({
            success: success,
            message: `Cache invalidated for pattern: ${pattern}`,
            pattern: pattern
        });
        
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            success: false
        });
    }
});

// Thêm API endpoint mới
app.delete('/api/demo/clear-cache', async (req, res) => {
    try {
        const success = await cacheManager.invalidateSearchCache();
        console.log('🧹 Demo: Search cache cleared for demonstration');
        res.json({
            success: success,
            message: 'Cache cleared - next searches will be slow again',
            timestamp: Date.now()
        });
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            success: false
        });
    }
});

app.get('/api/demo/cache-status/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const cachedResult = await cacheManager.getCachedDistributedResults(query, {});
        
        res.json({
            query: query,
            cached: !!cachedResult,
            cacheAge: cachedResult ? Date.now() - (cachedResult.timestamp || 0) : 0,
            message: cachedResult ? 'This query is cached - will be fast' : 'This query is not cached - will be slow first time'
        });
    } catch (error) {
        res.json({
            query: query,
            cached: false,
            error: error.message
        });
    }
});

// Serve dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../distributed-search.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        type: 'coordinator',
        uptime: process.uptime(),
        database: databaseManager.isReady() ? 'connected' : 'disconnected',
        managedNodes: coordinator.managedNodes.size,
        registeredNodes: coordinator.nodes.size
    });
});

// Khởi tạo và start server
async function startCoordinator() {
    try {
        // Khởi tạo coordinator với database
        await coordinator.initialize();
        
        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 Distributed Search Coordinator running on http://localhost:${PORT}`);
        });
        
        // Làm mới database stats mỗi 5 phút
        setInterval(() => {
            coordinator.refreshDatabaseStats();
        }, 5 * 60 * 1000);
        
    } catch (error) {
        console.error('❌ Failed to start coordinator:', error.message);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down coordinator...');
    try {
        // Kill all managed nodes
        console.log('🛑 Killing all managed nodes...');
        for (const [nodeId, nodeInfo] of coordinator.managedNodes) {
            await coordinator.killSearchNode(nodeId);
        }
        
        // Close connections
        await Promise.all([
            databaseManager.close(),
            cacheManager.close()
        ]);
        
    } catch (error) {
        console.error('Error during shutdown:', error.message);
    }
    process.exit(0);
});

// Start coordinator
startCoordinator(); 
// coordinator.js - Distributed Search Coordinator
const express = require('express');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

class DistributedSearchCoordinator {
    constructor() {
        this.nodes = new Map();
        this.totalDataSize = 26770; // Total movies count
        this.stats = {
            totalRequests: 0,
            averageResponseTime: 0,
            requestHistory: []
        };
        
        console.log('🌐 Distributed Search Coordinator starting...');
        console.log(`📊 Total data size: ${this.totalDataSize} movies`);
    }
    
    // Tự động phân chia data cho nodes
    redistributeData() {
        const nodeCount = this.nodes.size;
        if (nodeCount === 0) return;
        
        const chunkSize = Math.ceil(this.totalDataSize / nodeCount);
        const nodeArray = Array.from(this.nodes.values());
        
        console.log(`🔄 Redistributing data for ${nodeCount} nodes (chunk size: ~${chunkSize})`);
        
        nodeArray.forEach((node, index) => {
            const start = index * chunkSize;
            const end = Math.min(start + chunkSize, this.totalDataSize);
            
            node.dataRange = { start, end };
            console.log(`📊 ${node.id}: assigned data range ${start}-${end} (${end - start} movies)`);
        });
    }
    
    // Đăng ký search node (không cần dataRange từ client)
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
        
        // Tự động phân chia lại data cho tất cả nodes
        this.redistributeData();
        
        // Thông báo cho tất cả nodes về data range mới
        this.notifyNodesDataRange();
        
        console.log(`📍 Node registered: ${nodeId} at ${nodeUrl}`);
        return { 
            success: true, 
            message: `Node ${nodeId} registered successfully`,
            dataRange: this.nodes.get(nodeId).dataRange
        };
    }
    
    // Thông báo data range mới cho tất cả nodes
    async notifyNodesDataRange() {
        const notifications = Array.from(this.nodes.values()).map(async (node) => {
            try {
                await axios.post(`${node.url}/update-data-range`, {
                    dataRange: node.dataRange
                }, { timeout: 5000 });
                
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
    
    // Tìm kiếm phân tán
    async distributedSearch(query, options = {}) {
        const startTime = performance.now();
        const searchId = `search-${Date.now()}`;
        
        console.log(`🔍 Distributed search: "${query}" (ID: ${searchId})`);
        
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
                
                nodeResult.results.forEach(movie => {
                    allResults.push({
                        ...movie,
                        sourceNode: nodeResult.nodeId,
                        nodeDataRange: nodeResult.dataRange
                    });
                });
            } else {
                failedNodes.push(result.value || { nodeId: 'unknown', error: 'Promise rejected' });
            }
        });
        
        // Sắp xếp results theo relevance
        allResults.sort((a, b) => {
            const titleA = (a.title || '').toLowerCase();
            const titleB = (b.title || '').toLowerCase();
            const queryLower = query.toLowerCase();
            
            // Ưu tiên exact match
            if (titleA.includes(queryLower) && !titleB.includes(queryLower)) return -1;
            if (!titleA.includes(queryLower) && titleB.includes(queryLower)) return 1;
            
            // Ưu tiên starts with
            if (titleA.startsWith(queryLower) && !titleB.startsWith(queryLower)) return -1;
            if (!titleA.startsWith(queryLower) && titleB.startsWith(queryLower)) return 1;
            
            return titleA.localeCompare(titleB);
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
        
        console.log(`🏁 Search completed: ${finalResults.length} results in ${totalTime.toFixed(2)}ms from ${successfulNodes.length}/${healthyNodes.length} nodes`);
        
        return {
            results: finalResults,
            totalTime: totalTime,
            searchId: searchId,
            distributedStats: {
                nodesQueried: healthyNodes.length,
                nodesSuccessful: successfulNodes.length,
                nodesFailed: failedNodes.length,
                nodeDetails: successfulNodes
            }
        };
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
            totalDataSize: this.totalDataSize
        };
    }
}

// Khởi tạo coordinator
const coordinator = new DistributedSearchCoordinator();

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        status: 'coordinator-ready',
        type: 'distributed-coordinator',
        stats: coordinator.getSystemStatus()
    });
});

app.post('/api/search', async (req, res) => {
    try {
        const { query, options = {} } = req.body;
        
        if (!query || query.trim().length === 0) {
            return res.json({ results: [], totalTime: 0, message: 'Empty query' });
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
        totalNodes: stats.totalNodes
    });
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
        uptime: process.uptime()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Distributed Search Coordinator running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔧 API Status: http://localhost:${PORT}/api/status`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Shutting down coordinator...');
    process.exit(0);
}); 
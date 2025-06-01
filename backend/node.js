// node.js - Distributed Search Node với FlexSearch
const express = require('express');
const FlexSearch = require('flexsearch');
const axios = require('axios');

class DistributedSearchNode {
    constructor(nodeId, port) {
        this.nodeId = nodeId;
        this.port = port;
        this.dataRange = { start: 0, end: 0 }; // Sẽ được cập nhật từ coordinator
        this.index = null;
        this.movies = [];
        this.allMovies = []; // Store all movies data
        this.stats = {
            totalSearches: 0,
            averageResponseTime: 0,
            startTime: Date.now()
        };
        
        console.log(`🎬 Search Node ${nodeId} initializing on port ${port}`);
        console.log(`⏳ Waiting for data range assignment from coordinator...`);
    }
    
    // Load tất cả movie data
    async loadAllMovies() {
        try {
            console.log(`📚 Loading all movie data for Node ${this.nodeId}...`);
            
            // Load movies từ file
            this.allMovies = require('../data/movies.js');
            console.log(`📊 Node ${this.nodeId} loaded ${this.allMovies.length} total movies`);
            
        } catch (error) {
            console.error(`❌ Node ${this.nodeId} failed to load movie data:`, error);
            throw error;
        }
    }
    
    // Cập nhật data range và re-index
    async updateDataRange(newDataRange) {
        try {
            console.log(`🔄 Node ${this.nodeId}: Updating data range ${newDataRange.start}-${newDataRange.end}`);
            
            this.dataRange = newDataRange;
            
            // Extract data slice cho range mới
            this.movies = this.allMovies.slice(this.dataRange.start, this.dataRange.end);
            console.log(`🎯 Node ${this.nodeId} now handling ${this.movies.length} movies`);
            
            // Re-create index với data mới
            await this.createIndex();
            
            return true;
        } catch (error) {
            console.error(`❌ Node ${this.nodeId} failed to update data range:`, error);
            return false;
        }
    }
    
    // Tạo FlexSearch index
    async createIndex() {
        console.log(`🔍 Creating FlexSearch index for Node ${this.nodeId}...`);
        
        this.index = new FlexSearch.Document({
            id: 'id',
            index: [{
                field: 'title',
                tokenize: 'forward',
                optimize: true,
                resolution: 9
            }]
        });
        
        // Index movies trong range hiện tại
        for (let i = 0; i < this.movies.length; i++) {
            const title = this.movies[i];
            await this.index.add({
                id: i,
                title: title
            });
        }
        
        console.log(`✅ Node ${this.nodeId}: FlexSearch index created with ${this.movies.length} movies (range: ${this.dataRange.start}-${this.dataRange.end})`);
    }
    
    // Tìm kiếm
    async search(query, options = {}) {
        const startTime = performance.now();
        
        try {
            if (!this.index) {
                throw new Error('Search index not initialized');
            }
            
            if (this.movies.length === 0) {
                console.log(`⚠️ Node ${this.nodeId}: No data assigned yet`);
                return {
                    results: [],
                    responseTime: 0,
                    nodeId: this.nodeId,
                    dataRange: this.dataRange,
                    totalIndexed: 0
                };
            }
            
            console.log(`🔎 Node ${this.nodeId}: Searching for "${query}" in range ${this.dataRange.start}-${this.dataRange.end}`);
            
            const limit = options.limit || 25;
            
            // Thực hiện search với FlexSearch
            const searchResults = await this.index.search(query, {
                limit: limit * 2, // Lấy nhiều hơn để có thể filter
                suggest: true
            });
            
            const results = [];
            
            // Xử lý results
            if (searchResults && searchResults.length > 0) {
                for (const fieldResult of searchResults) {
                    if (fieldResult.result) {
                        for (const id of fieldResult.result) {
                            if (results.length >= limit) break;
                            
                            const title = this.movies[id];
                            if (title) {
                                results.push({
                                    id: this.dataRange.start + id, // Global ID
                                    title: title,
                                    nodeId: this.nodeId,
                                    dataRange: this.dataRange
                                });
                            }
                        }
                    }
                }
            }
            
            // Sắp xếp theo relevance
            results.sort((a, b) => {
                const titleA = a.title.toLowerCase();
                const titleB = b.title.toLowerCase();
                const queryLower = query.toLowerCase();
                
                // Exact match first
                if (titleA.includes(queryLower) && !titleB.includes(queryLower)) return -1;
                if (!titleA.includes(queryLower) && titleB.includes(queryLower)) return 1;
                
                // Starts with second
                if (titleA.startsWith(queryLower) && !titleB.startsWith(queryLower)) return -1;
                if (!titleA.startsWith(queryLower) && titleB.startsWith(queryLower)) return 1;
                
                return titleA.localeCompare(titleB);
            });
            
            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            // Cập nhật stats
            this.stats.totalSearches++;
            this.stats.averageResponseTime = ((this.stats.averageResponseTime * (this.stats.totalSearches - 1)) + responseTime) / this.stats.totalSearches;
            
            console.log(`✨ Node ${this.nodeId}: Found ${results.length} results in ${responseTime.toFixed(2)}ms`);
            
            return {
                results: results.slice(0, limit),
                responseTime: responseTime,
                nodeId: this.nodeId,
                dataRange: this.dataRange,
                totalIndexed: this.movies.length
            };
            
        } catch (error) {
            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            console.error(`❌ Node ${this.nodeId} search error:`, error);
            
            return {
                results: [],
                responseTime: responseTime,
                nodeId: this.nodeId,
                error: error.message
            };
        }
    }
    
    // Đăng ký với coordinator (không gửi dataRange)
    async registerWithCoordinator() {
        try {
            const coordinatorUrl = 'http://localhost:3000';
            
            const nodeInfo = {
                nodeId: this.nodeId,
                port: this.port
                // Không gửi dataRange - coordinator sẽ tự phân chia
            };
            
            const response = await axios.post(`${coordinatorUrl}/api/register-node`, nodeInfo, {
                timeout: 5000
            });
            
            if (response.data.success) {
                console.log(`✅ Node ${this.nodeId} registered with coordinator successfully`);
                
                // Nhận data range từ coordinator
                if (response.data.dataRange) {
                    await this.updateDataRange(response.data.dataRange);
                }
            } else {
                console.log(`⚠️ Node ${this.nodeId} registration response:`, response.data);
            }
            
        } catch (error) {
            console.error(`❌ Node ${this.nodeId} failed to register with coordinator:`, error.message);
            // Không throw error vì node vẫn có thể hoạt động độc lập
        }
    }
    
    // Lấy node stats
    getStats() {
        return {
            nodeId: this.nodeId,
            port: this.port,
            dataRange: this.dataRange,
            ...this.stats,
            uptime: Date.now() - this.stats.startTime,
            status: 'active',
            moviesCount: this.movies.length
        };
    }
}

// Khởi tạo và start node
async function startSearchNode() {
    // Lấy config từ environment variables hoặc args
    const nodeId = process.env.NODE_ID || process.argv[2] || `node-${process.env.PORT || '3001'}`;
    const port = parseInt(process.env.PORT) || parseInt(process.argv[3]) || 3001;
    
    const searchNode = new DistributedSearchNode(nodeId, port);
    
    // Tạo Express app
    const app = express();
    app.use(express.json());
    
    // API endpoints
    app.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            nodeId: searchNode.nodeId,
            uptime: Date.now() - searchNode.stats.startTime
        });
    });
    
    app.get('/info', (req, res) => {
        res.json({
            nodeType: 'search-node',
            ...searchNode.getStats()
        });
    });
    
    app.post('/search', async (req, res) => {
        try {
            const { query, options = {}, searchId } = req.body;
            
            if (searchId) {
                console.log(`🆔 Search ID: ${searchId}`);
            }
            
            const result = await searchNode.search(query, options);
            res.json(result);
            
        } catch (error) {
            console.error(`❌ Node ${searchNode.nodeId} search error:`, error);
            res.status(500).json({
                error: 'Search failed',
                message: error.message,
                nodeId: searchNode.nodeId
            });
        }
    });
    
    // Endpoint để nhận data range update từ coordinator
    app.post('/update-data-range', async (req, res) => {
        try {
            const { dataRange } = req.body;
            
            const success = await searchNode.updateDataRange(dataRange);
            
            if (success) {
                res.json({ 
                    success: true, 
                    message: `Data range updated to ${dataRange.start}-${dataRange.end}`,
                    nodeId: searchNode.nodeId,
                    moviesCount: searchNode.movies.length
                });
            } else {
                res.status(500).json({ 
                    success: false, 
                    message: 'Failed to update data range',
                    nodeId: searchNode.nodeId
                });
            }
            
        } catch (error) {
            console.error(`❌ Node ${searchNode.nodeId} update data range error:`, error);
            res.status(500).json({
                success: false,
                error: 'Update data range failed',
                message: error.message,
                nodeId: searchNode.nodeId
            });
        }
    });
    
    app.get('/stats', (req, res) => {
        res.json(searchNode.getStats());
    });
    
    // Start server
    app.listen(port, async () => {
        console.log(`🚀 Search Node ${nodeId} running on http://localhost:${port}`);
        
        try {
            // Load tất cả movie data
            await searchNode.loadAllMovies();
            
            // Đăng ký với coordinator (sau delay nhỏ)
            setTimeout(() => {
                searchNode.registerWithCoordinator();
            }, 2000);
            
            console.log(`✅ Search Node ${nodeId} ready for distributed searches!`);
            
        } catch (error) {
            console.error(`❌ Search Node ${nodeId} failed to initialize:`, error);
            process.exit(1);
        }
    });
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log(`🛑 Shutting down Search Node ${nodeId}...`);
        process.exit(0);
    });
}

// Start the node
startSearchNode(); 
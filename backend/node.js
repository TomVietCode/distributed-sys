// node.js - Distributed Search Node với FlexSearch và MySQL
require('dotenv').config();
const express = require('express');
const FlexSearch = require('flexsearch');
const axios = require('axios');
const { databaseManager } = require('./database');

class DistributedSearchNode {
    constructor(nodeId, port) {
        this.nodeId = nodeId;
        this.port = port;
        this.dataRange = { start: 0, end: 0 }; // Sẽ được cập nhật từ coordinator
        this.index = null;
        this.songs = [];
        this.totalDataSize = 0; // Total size từ database
        this.stats = {
            totalSearches: 0,
            averageResponseTime: 0,
            startTime: Date.now()
        };
        
        console.log(`🎬 Search Node ${nodeId} initializing on port ${port}`);
        console.log(`⏳ Waiting for database connection and data range assignment...`);
    }
    
    // Khởi tạo database connection
    async initializeDatabase() {
        try {
            console.log(`🔌 Node ${this.nodeId}: Connecting to MySQL database...`);
            
            if (!databaseManager.isReady()) {
                await databaseManager.initialize();
            }
            
            // Test database query
            await databaseManager.testQuery();
            
            console.log(`✅ Node ${this.nodeId}: Database connection established`);
            return true;
        } catch (error) {
            console.error(`❌ Node ${this.nodeId} failed to connect to database:`, error);
            throw error;
        }
    }
    
    // Cập nhật data range và load data từ database
    async updateDataRange(newDataRange, totalDataSize) {
        try {
            console.log(`🔄 Node ${this.nodeId}: Updating data range ${newDataRange.start}-${newDataRange.end}`);
            
            this.dataRange = newDataRange;
            this.totalDataSize = totalDataSize || 0;
            
            // Load songs từ database theo range
            if (newDataRange.start < newDataRange.end) {
                await this.loadSongsFromDatabase();
                
                // Re-create index với data mới
                await this.createIndex();
            } else {
                console.log(`⚠️ Node ${this.nodeId}: Empty data range assigned`);
                this.songs = [];
                this.index = null;
            }
            
            return true;
        } catch (error) {
            console.error(`❌ Node ${this.nodeId} failed to update data range:`, error);
            return false;
        }
    }
    
    // Load songs từ database theo range
    async loadSongsFromDatabase() {
        try {
            console.log(`📚 Node ${this.nodeId}: Loading songs from database range ${this.dataRange.start}-${this.dataRange.end}...`);
            
            if (!databaseManager.isReady()) {
                throw new Error('Database not ready');
            }
            
            // Lấy songs theo range
            const dbSongs = await databaseManager.getSongsByRange(
                this.dataRange.start, 
                this.dataRange.end
            );
            
            // Chuyển đổi format cho FlexSearch
            this.songs = dbSongs.map((song, index) => ({
                id: song.id,  // Database ID (có thể là TEXT)
                localId: index,  // Local index ID (INT)
                name: song.name || ''  // Ensure name is string
            }));
            
            console.log(`✅ Node ${this.nodeId}: Loaded ${this.songs.length} songs from database`);
            
            // Log sample data for debugging
            if (this.songs.length > 0) {
                console.log(`📄 Sample songs:`, this.songs.slice(0, 2).map(s => ({ id: s.id, name: s.name?.substring(0, 50) + '...' })));
            }
            
        } catch (error) {
            console.error(`❌ Node ${this.nodeId} failed to load songs:`, error);
            
            // Set empty songs array on error
            this.songs = [];
            throw error;
        }
    }
    
    // Tạo FlexSearch index
    async createIndex() {
        console.log(`🔍 Creating FlexSearch index for Node ${this.nodeId}...`);
        
        this.index = new FlexSearch.Document({
            id: 'localId',
            index: [{
                field: 'name',
                tokenize: 'forward',
                optimize: true,
                resolution: 9
            }]
        });
        
        // Index songs
        for (let i = 0; i < this.songs.length; i++) {
            const song = this.songs[i];
            await this.index.add({
                localId: song.localId,
                name: song.name
            });
        }
        
        console.log(`✅ Node ${this.nodeId}: FlexSearch index created with ${this.songs.length} songs (range: ${this.dataRange.start}-${this.dataRange.end})`);
    }
    
    // Tìm kiếm
    async search(query, options = {}) {
        const startTime = performance.now();
        
        try {
            if (!this.index) {
                console.log(`⚠️ Node ${this.nodeId}: Index not ready yet`);
                return {
                    results: [],
                    responseTime: 0,
                    nodeId: this.nodeId,
                    dataRange: this.dataRange,
                    totalIndexed: 0
                };
            }
            
            if (this.songs.length === 0) {
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
                        for (const localId of fieldResult.result) {
                            if (results.length >= limit) break;
                            
                            const song = this.songs[localId];
                            if (song) {
                                results.push({
                                    id: song.id, // Database ID
                                    name: song.name,
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
                const nameA = a.name.toLowerCase();
                const nameB = b.name.toLowerCase();
                const queryLower = query.toLowerCase();
                
                // Exact match first
                if (nameA.includes(queryLower) && !nameB.includes(queryLower)) return -1;
                if (!nameA.includes(queryLower) && nameB.includes(queryLower)) return 1;
                
                // Starts with second
                if (nameA.startsWith(queryLower) && !nameB.startsWith(queryLower)) return -1;
                if (!nameA.startsWith(queryLower) && nameB.startsWith(queryLower)) return 1;
                
                return nameA.localeCompare(nameB);
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
                totalIndexed: this.songs.length
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
    
    // Đăng ký với coordinator
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
                    await this.updateDataRange(
                        response.data.dataRange, 
                        response.data.totalDataSize
                    );
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
            songsCount: this.songs.length,
            databaseConnected: databaseManager.isReady(),
            totalDataSize: this.totalDataSize
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
    app.get('/health', async (req, res) => {
        const dbHealth = await databaseManager.healthCheck();
        res.json({
            status: 'healthy',
            nodeId: searchNode.nodeId,
            uptime: Date.now() - searchNode.stats.startTime,
            database: dbHealth
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
            const { dataRange, totalDataSize } = req.body;
            
            const success = await searchNode.updateDataRange(dataRange, totalDataSize);
            
            if (success) {
                res.json({ 
                    success: true, 
                    message: `Data range updated to ${dataRange.start}-${dataRange.end}`,
                    nodeId: searchNode.nodeId,
                    songsCount: searchNode.songs.length
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
            // Khởi tạo database connection
            await searchNode.initializeDatabase();
            
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
    process.on('SIGINT', async () => {
        console.log(`🛑 Shutting down Search Node ${nodeId}...`);
        try {
            await databaseManager.close();
        } catch (error) {
            console.error('Error closing database:', error.message);
        }
        process.exit(0);
    });
}

// Start the node
startSearchNode(); 
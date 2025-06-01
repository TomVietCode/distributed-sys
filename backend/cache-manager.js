// cache-manager.js - Redis Distributed Cache Manager
const redis = require('redis');

class DistributedCacheManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.config = {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            db: process.env.REDIS_DB || 0,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3
        };
        
        // Cache TTL settings
        this.TTL = {
            SEARCH_RESULTS: parseInt(process.env.CACHE_TTL_SEARCH) || 300,      // 5 minutes
            NODE_STATUS: parseInt(process.env.CACHE_TTL_STATUS) || 30,          // 30 seconds  
            SYSTEM_STATS: parseInt(process.env.CACHE_TTL_STATS) || 60,          // 1 minute
            HOT_QUERIES: parseInt(process.env.CACHE_TTL_HOT) || 1800            // 30 minutes
        };
        
        console.log('🔧 Distributed Cache Manager initializing...');
    }
    
    // Khởi tạo Redis connection
    async initialize() {
        try {
            console.log('🔌 Connecting to Redis cache server...');
            
            this.client = redis.createClient(this.config);
            
            // Event handlers
            this.client.on('connect', () => {
                console.log('✅ Redis connected successfully');
                this.isConnected = true;
            });
            
            this.client.on('error', (error) => {
                console.error('❌ Redis connection error:', error.message);
                this.isConnected = false;
            });
            
            this.client.on('end', () => {
                console.log('🔌 Redis connection closed');
                this.isConnected = false;
            });
            
            this.client.on('reconnecting', () => {
                console.log('🔄 Redis reconnecting...');
            });
            
            // Connect to Redis
            await this.client.connect();
            
            // Test connection
            await this.client.ping();
            console.log('✅ Redis cache ready for distributed operations');
            
            return true;
        } catch (error) {
            console.error('❌ Redis initialization failed:', error.message);
            console.log('⚠️ Continuing without cache (fallback mode)');
            this.isConnected = false;
            return false;
        }
    }
    
    // Generate cache keys
    generateSearchKey(query, nodeId = 'global', options = {}) {
        const optionsHash = JSON.stringify(options);
        const key = `search:${nodeId}:${Buffer.from(query + optionsHash).toString('base64')}`;
        return key.substring(0, 200); // Limit key length
    }
    
    generateSystemStatsKey() {
        return 'system:stats';
    }
    
    generateNodeStatusKey(nodeId) {
        return `node:status:${nodeId}`;
    }
    
    generateHotQueriesKey() {
        return 'analytics:hot_queries';
    }
    
    // Cache search results
    async cacheSearchResults(query, nodeId, results, options = {}) {
        if (!this.isReady()) return false;
        
        try {
            const key = this.generateSearchKey(query, nodeId, options);
            const cacheData = {
                results: results.results,
                responseTime: results.responseTime,
                nodeId: results.nodeId,
                dataRange: results.dataRange,
                totalIndexed: results.totalIndexed,
                cached: true,
                cachedAt: Date.now()
            };
            
            await this.client.setEx(key, this.TTL.SEARCH_RESULTS, JSON.stringify(cacheData));
            
            // Track hot queries
            await this.trackHotQuery(query);
            
            console.log(`💾 Cached search results: ${key} (TTL: ${this.TTL.SEARCH_RESULTS}s)`);
            return true;
        } catch (error) {
            console.error('❌ Failed to cache search results:', error.message);
            return false;
        }
    }
    
    // Get cached search results
    async getCachedSearchResults(query, nodeId, options = {}) {
        if (!this.isReady()) return null;
        
        try {
            const key = this.generateSearchKey(query, nodeId, options);
            const cached = await this.client.get(key);
            
            if (cached) {
                const data = JSON.parse(cached);
                console.log(`💰 Cache HIT: ${key}`);
                return data;
            }
            
            console.log(`💸 Cache MISS: ${key}`);
            return null;
        } catch (error) {
            console.error('❌ Failed to get cached results:', error.message);
            return null;
        }
    }
    
    // Cache distributed search results (from multiple nodes)
    async cacheDistributedResults(query, searchResult, options = {}) {
        if (!this.isReady()) return false;
        
        try {
            const key = this.generateSearchKey(query, 'distributed', options);
            const cacheData = {
                ...searchResult,
                cached: true,
                cachedAt: Date.now()
            };
            
            await this.client.setEx(key, this.TTL.SEARCH_RESULTS, JSON.stringify(cacheData));
            
            // Track hot queries
            await this.trackHotQuery(query);
            
            console.log(`💾 Cached distributed results: ${key}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to cache distributed results:', error.message);
            return false;
        }
    }
    
    // Get cached distributed results
    async getCachedDistributedResults(query, options = {}) {
        if (!this.isReady()) return null;
        
        try {
            const key = this.generateSearchKey(query, 'distributed', options);
            const cached = await this.client.get(key);
            
            if (cached) {
                const data = JSON.parse(cached);
                console.log(`🎯 Distributed cache HIT: ${key}`);
                return data;
            }
            
            return null;
        } catch (error) {
            console.error('❌ Failed to get cached distributed results:', error.message);
            return null;
        }
    }
    
    // Track hot queries for analytics
    async trackHotQuery(query) {
        if (!this.isReady()) return false;
        
        try {
            const key = this.generateHotQueriesKey();
            await this.client.zIncrBy(key, 1, query.toLowerCase());
            await this.client.expire(key, this.TTL.HOT_QUERIES);
            return true;
        } catch (error) {
            console.error('❌ Failed to track hot query:', error.message);
            return false;
        }
    }
    
    // Get hot queries analytics
    async getHotQueries(limit = 10) {
        if (!this.isReady()) return [];
        
        try {
            const key = this.generateHotQueriesKey();
            const hotQueries = await this.client.zRevRange(key, 0, limit - 1, {
                BY: 'SCORE',
                REV: true
            });
            
            return hotQueries;
        } catch (error) {
            console.error('❌ Failed to get hot queries:', error.message);
            return [];
        }
    }
    
    // Cache system stats
    async cacheSystemStats(stats) {
        if (!this.isReady()) return false;
        
        try {
            const key = this.generateSystemStatsKey();
            const cacheData = {
                ...stats,
                cached: true,
                cachedAt: Date.now()
            };
            
            await this.client.setEx(key, this.TTL.SYSTEM_STATS, JSON.stringify(cacheData));
            return true;
        } catch (error) {
            console.error('❌ Failed to cache system stats:', error.message);
            return false;
        }
    }
    
    // Get cached system stats
    async getCachedSystemStats() {
        if (!this.isReady()) return null;
        
        try {
            const key = this.generateSystemStatsKey();
            const cached = await this.client.get(key);
            
            if (cached) {
                return JSON.parse(cached);
            }
            
            return null;
        } catch (error) {
            console.error('❌ Failed to get cached system stats:', error.message);
            return null;
        }
    }
    
    // Invalidate cache by pattern
    async invalidatePattern(pattern) {
        if (!this.isReady()) return false;
        
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(keys);
                console.log(`🗑️ Invalidated ${keys.length} cache entries: ${pattern}`);
            }
            return true;
        } catch (error) {
            console.error('❌ Failed to invalidate cache pattern:', error.message);
            return false;
        }
    }
    
    // Invalidate all search caches
    async invalidateSearchCache() {
        return await this.invalidatePattern('search:*');
    }
    
    // Get cache statistics
    async getCacheStats() {
        if (!this.isReady()) {
            return {
                connected: false,
                status: 'disconnected'
            };
        }
        
        try {
            const info = await this.client.info('memory');
            const dbSize = await this.client.dbSize();
            
            return {
                connected: true,
                status: 'connected',
                memoryUsage: this.parseRedisInfo(info, 'used_memory_human'),
                totalKeys: dbSize,
                config: this.config,
                ttl: this.TTL
            };
        } catch (error) {
            console.error('❌ Failed to get cache stats:', error.message);
            return {
                connected: false,
                status: 'error',
                error: error.message
            };
        }
    }
    
    // Health check
    async healthCheck() {
        try {
            if (!this.isReady()) {
                return {
                    status: 'disconnected',
                    connected: false,
                    error: 'Redis not connected'
                };
            }
            
            const start = Date.now();
            await this.client.ping();
            const responseTime = Date.now() - start;
            
            return {
                status: 'healthy',
                connected: true,
                responseTime: responseTime,
                host: this.config.host,
                port: this.config.port
            };
        } catch (error) {
            return {
                status: 'error',
                connected: false,
                error: error.message
            };
        }
    }
    
    // Helper methods
    isReady() {
        return this.isConnected && this.client;
    }
    
    parseRedisInfo(info, key) {
        const lines = info.split('\r\n');
        for (const line of lines) {
            if (line.startsWith(key + ':')) {
                return line.split(':')[1];
            }
        }
        return 'unknown';
    }
    
    // Close connection
    async close() {
        if (this.client) {
            console.log('🔌 Closing Redis connection...');
            await this.client.quit();
            this.client = null;
            this.isConnected = false;
            console.log('✅ Redis connection closed');
        }
    }
}

// Export singleton instance
const cacheManager = new DistributedCacheManager();

module.exports = {
    DistributedCacheManager,
    cacheManager
}; 
// distributed-search-manager.js - Quản lý hệ thống tìm kiếm phân tán
export class DistributedSearchManager {
    constructor(options = {}) {
        this.workers = [];
        this.workerCount = options.workerCount || 4;
        this.data = [];
        this.isInitialized = false;
        this.searchTimeout = options.searchTimeout || 5000;
        this.retryAttempts = options.retryAttempts || 2;
        this.useFallback = options.useFallback !== false; // Default true
        
        // Performance tracking
        this.stats = {
            totalSearches: 0,
            averageSearchTime: 0,
            workerStats: {},
            errors: []
        };
        
        console.log(`DistributedSearchManager initializing with ${this.workerCount} workers`);
    }
    
    // Tạo worker với fallback support
    createWorker(workerId, useFallback = false) {
        try {
            const workerFile = useFallback ? './search-worker-fallback.js' : './search-worker.js';
            const worker = new Worker(workerFile, { type: 'module' });
            
            console.log(`Creating ${useFallback ? 'fallback' : 'FlexSearch'} worker: ${workerId}`);
            return worker;
            
        } catch (error) {
            console.error(`Failed to create worker ${workerId}:`, error);
            
            // Try fallback if not already using it
            if (!useFallback && this.useFallback) {
                console.log(`Trying fallback worker for ${workerId}`);
                return this.createWorker(workerId, true);
            }
            
            throw error;
        }
    }
    
    // Khởi tạo workers với dữ liệu phân tán
    async initialize(movieData) {
        this.data = movieData;
        const chunkSize = Math.ceil(movieData.length / this.workerCount);
        
        console.log(`Splitting ${movieData.length} movies into ${this.workerCount} chunks of ~${chunkSize} items each`);
        
        // Tạo và khởi tạo workers
        const initPromises = [];
        
        for (let i = 0; i < this.workerCount; i++) {
            const startIndex = i * chunkSize;
            const endIndex = Math.min(startIndex + chunkSize, movieData.length);
            const chunk = movieData.slice(startIndex, endIndex);
            
            // Chuẩn bị chunk data - đảm bảo format đúng
            const enrichedChunk = chunk.map((movie, idx) => {
                if (typeof movie === 'string') {
                    return {
                        title: movie,
                        originalIndex: startIndex + idx
                    };
                } else {
                    return {
                        title: movie.title || movie,
                        originalIndex: movie.originalIndex || startIndex + idx
                    };
                }
            });
            
            try {
                const workerId = `worker-${i}`;
                let worker = null;
                let isUsingFallback = false;
                
                // Try FlexSearch worker first
                try {
                    worker = this.createWorker(workerId, false);
                } catch (flexError) {
                    console.warn(`FlexSearch worker failed for ${workerId}, trying fallback:`, flexError);
                    if (this.useFallback) {
                        worker = this.createWorker(workerId, true);
                        isUsingFallback = true;
                    } else {
                        throw flexError;
                    }
                }
                
                // Setup error handling for worker
                worker.addEventListener('error', (error) => {
                    console.error(`Worker ${workerId} error:`, error);
                    this.stats.errors.push({
                        type: 'WORKER_ERROR',
                        workerId: workerId,
                        error: error.message || 'Worker error',
                        timestamp: Date.now()
                    });
                });
                
                // Setup message error handling
                worker.addEventListener('messageerror', (error) => {
                    console.error(`Worker ${workerId} message error:`, error);
                    this.stats.errors.push({
                        type: 'WORKER_MESSAGE_ERROR',
                        workerId: workerId,
                        error: 'Message communication error',
                        timestamp: Date.now()
                    });
                });
                
                this.workers.push({
                    worker: worker,
                    id: workerId,
                    dataSize: enrichedChunk.length,
                    status: 'initializing',
                    startIndex: startIndex,
                    endIndex: endIndex,
                    usingFallback: isUsingFallback
                });
                
                // Promise để wait cho worker init
                initPromises.push(this.waitForWorkerInit(worker, workerId, enrichedChunk));
                
                console.log(`Worker ${workerId} created with ${enrichedChunk.length} movies (${startIndex}-${endIndex-1}) [${isUsingFallback ? 'fallback' : 'FlexSearch'}]`);
                
            } catch (error) {
                console.error(`Failed to create worker ${i}:`, error);
                this.stats.errors.push({
                    type: 'WORKER_CREATION_ERROR',
                    workerId: `worker-${i}`,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
        
        // Đợi tất cả workers khởi tạo xong
        try {
            await Promise.all(initPromises);
            this.isInitialized = true;
            
            // Log worker types
            const flexWorkers = this.workers.filter(w => !w.usingFallback).length;
            const fallbackWorkers = this.workers.filter(w => w.usingFallback).length;
            console.log(`All workers initialized successfully: ${flexWorkers} FlexSearch + ${fallbackWorkers} fallback workers`);
            
            // Setup health monitoring
            this.startHealthMonitoring();
            
        } catch (error) {
            console.error('Failed to initialize some workers:', error);
            // Log chi tiết lỗi của từng worker
            this.logWorkerErrors();
            throw new Error(`Distributed search initialization failed: ${error.message}`);
        }
    }
    
    // Đợi worker khởi tạo xong với retry logic
    waitForWorkerInit(worker, workerId, chunkData, retryCount = 0) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (retryCount < this.retryAttempts && this.useFallback) {
                    console.log(`Worker ${workerId} timeout, retrying with fallback...`);
                    // Try fallback worker
                    worker.terminate();
                    try {
                        const fallbackWorker = this.createWorker(workerId, true);
                        // Update worker in the array
                        const workerInfo = this.workers.find(w => w.id === workerId);
                        if (workerInfo) {
                            workerInfo.worker = fallbackWorker;
                            workerInfo.usingFallback = true;
                        }
                        resolve(this.waitForWorkerInit(fallbackWorker, workerId, chunkData, retryCount + 1));
                    } catch (fallbackError) {
                        reject(new Error(`Worker ${workerId} initialization failed after fallback attempt: ${fallbackError.message}`));
                    }
                } else {
                    reject(new Error(`Worker ${workerId} initialization timeout`));
                }
            }, 15000); // 15s timeout
            
            const messageHandler = (e) => {
                if (e.data.type === 'INIT_COMPLETE' && e.data.workerId === workerId) {
                    clearTimeout(timeout);
                    worker.removeEventListener('message', messageHandler);
                    resolve();
                } else if (e.data.type === 'ERROR' && e.data.workerId === workerId) {
                    clearTimeout(timeout);
                    worker.removeEventListener('message', messageHandler);
                    reject(new Error(`Worker ${workerId} initialization error: ${e.data.error}`));
                }
            };
            
            worker.addEventListener('message', messageHandler);
            
            // Gửi data để khởi tạo worker
            worker.postMessage({
                type: 'INIT',
                data: chunkData,
                id: workerId
            });
        });
    }
    
    // Log chi tiết lỗi workers
    logWorkerErrors() {
        if (this.stats.errors.length > 0) {
            console.log('Worker initialization errors:');
            this.stats.errors.forEach(error => {
                console.error(`- ${error.workerId}: ${error.error} (${error.type})`);
            });
        }
    }
    
    // Tìm kiếm phân tán
    async search(query, options = {}) {
        if (!this.isInitialized) {
            throw new Error('DistributedSearchManager not initialized');
        }
        
        if (!query || query.trim().length === 0) {
            return { results: [], totalTime: 0, workerResults: [] };
        }
        
        const startTime = performance.now();
        const searchId = `search-${Date.now()}-${Math.random()}`;
        
        console.log(`Starting distributed search for: "${query}" (ID: ${searchId})`);
        
        // Gửi search request đến tất cả workers
        const searchPromises = this.workers.map(workerInfo => 
            this.searchInWorker(workerInfo, query, options, searchId)
        );
        
        try {
            // Đợi tất cả workers trả kết quả hoặc timeout
            const workerResults = await Promise.allSettled(searchPromises);
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            
            // Xử lý kết quả từ các workers
            const validResults = [];
            const errors = [];
            
            workerResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    validResults.push(result.value);
                    this.updateWorkerStats(this.workers[index].id, result.value.searchTime, true);
                } else {
                    errors.push({
                        workerId: this.workers[index].id,
                        error: result.reason.message || 'Unknown error'
                    });
                    this.updateWorkerStats(this.workers[index].id, 0, false);
                }
            });
            
            // Merge và sort kết quả từ tất cả workers
            const mergedResults = this.mergeResults(validResults, options);
            
            // Update stats
            this.stats.totalSearches++;
            this.stats.averageSearchTime = (this.stats.averageSearchTime * (this.stats.totalSearches - 1) + totalTime) / this.stats.totalSearches;
            
            console.log(`Search "${query}" completed in ${totalTime.toFixed(2)}ms with ${mergedResults.length} results from ${validResults.length}/${this.workers.length} workers`);
            
            return {
                results: mergedResults,
                totalTime: totalTime,
                workerResults: validResults,
                errors: errors,
                searchId: searchId,
                stats: {
                    workersUsed: validResults.length,
                    totalWorkers: this.workers.length,
                    averageWorkerTime: validResults.length > 0 ? 
                        validResults.reduce((sum, r) => sum + r.searchTime, 0) / validResults.length : 0
                }
            };
            
        } catch (error) {
            console.error('Distributed search failed:', error);
            this.stats.errors.push({
                type: 'SEARCH_ERROR',
                query: query,
                error: error.message,
                timestamp: Date.now()
            });
            
            throw error;
        }
    }
    
    // Tìm kiếm trong một worker cụ thể
    searchInWorker(workerInfo, query, options, searchId) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Search timeout in ${workerInfo.id}`));
            }, this.searchTimeout);
            
            const messageHandler = (e) => {
                if (e.data.type === 'SEARCH_RESULT') {
                    clearTimeout(timeout);
                    workerInfo.worker.removeEventListener('message', messageHandler);
                    resolve(e.data);
                } else if (e.data.type === 'ERROR') {
                    clearTimeout(timeout);
                    workerInfo.worker.removeEventListener('message', messageHandler);
                    reject(new Error(`Worker ${workerInfo.id} search error: ${e.data.error}`));
                }
            };
            
            workerInfo.worker.addEventListener('message', messageHandler);
            workerInfo.worker.postMessage({
                type: 'SEARCH',
                query: query,
                options: options,
                searchId: searchId
            });
        });
    }
    
    // Merge kết quả từ các workers
    mergeResults(workerResults, options = {}) {
        const allResults = [];
        
        // Collect tất cả results từ workers
        workerResults.forEach(workerResult => {
            if (workerResult.results && Array.isArray(workerResult.results)) {
                workerResult.results.forEach(result => {
                    allResults.push({
                        ...result,
                        fromWorker: workerResult.workerId
                    });
                });
            }
        });
        
        // Sort theo score (nếu có) hoặc relevance
        allResults.sort((a, b) => {
            // Sort by score first (if available)
            if (a.score !== undefined && b.score !== undefined) {
                if (b.score !== a.score) return b.score - a.score;
            }
            
            // Ưu tiên exact matches
            const aExact = a.highlight && a.highlight.toLowerCase().includes(options.query?.toLowerCase() || '');
            const bExact = b.highlight && b.highlight.toLowerCase().includes(options.query?.toLowerCase() || '');
            
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            // Sau đó sort theo độ dài (shorter = better)
            return (a.originalTitle || a.title || '').length - (b.originalTitle || b.title || '').length;
        });
        
        // Limit results
        const limit = options.limit || 25;
        return allResults.slice(0, limit);
    }
    
    // Update worker statistics
    updateWorkerStats(workerId, searchTime, success) {
        if (!this.stats.workerStats[workerId]) {
            this.stats.workerStats[workerId] = {
                searches: 0,
                totalTime: 0,
                averageTime: 0,
                successCount: 0,
                errorCount: 0
            };
        }
        
        const workerStat = this.stats.workerStats[workerId];
        workerStat.searches++;
        workerStat.totalTime += searchTime;
        workerStat.averageTime = workerStat.totalTime / workerStat.searches;
        
        if (success) {
            workerStat.successCount++;
        } else {
            workerStat.errorCount++;
        }
    }
    
    // Health monitoring
    startHealthMonitoring() {
        setInterval(() => {
            this.workers.forEach(workerInfo => {
                try {
                    workerInfo.worker.postMessage({ type: 'HEALTH_CHECK' });
                } catch (error) {
                    console.error(`Health check failed for ${workerInfo.id}:`, error);
                }
            });
        }, 30000); // Check mỗi 30 giây
    }
    
    // Get performance statistics
    getStats() {
        return {
            ...this.stats,
            isInitialized: this.isInitialized,
            workerCount: this.workers.length,
            dataSize: this.data.length,
            workerTypes: {
                flexSearch: this.workers.filter(w => !w.usingFallback).length,
                fallback: this.workers.filter(w => w.usingFallback).length
            }
        };
    }
    
    // Cleanup workers
    destroy() {
        this.workers.forEach(workerInfo => {
            try {
                workerInfo.worker.terminate();
            } catch (error) {
                console.error(`Error terminating worker ${workerInfo.id}:`, error);
            }
        });
        this.workers = [];
        this.isInitialized = false;
        console.log('DistributedSearchManager destroyed');
    }
} 
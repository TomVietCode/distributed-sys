// search-worker-fallback.js - Fallback worker sử dụng simple string matching

// Simple search implementation without FlexSearch
let workerData = [];
let workerId = null;

// Normalize string for better matching
function normalizeString(str) {
    return str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^\w\s]/g, ' ') // Replace special chars with space
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
}

// Simple fuzzy search implementation
function simpleSearch(query, data, options = {}) {
    const normalizedQuery = normalizeString(query);
    const queryWords = normalizedQuery.split(' ').filter(word => word.length > 0);
    
    if (queryWords.length === 0) return [];
    
    const results = [];
    
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const title = typeof item === 'string' ? item : item.title;
        const normalizedTitle = normalizeString(title);
        
        let score = 0;
        let highlightedTitle = title;
        
        // Check for exact phrase match
        if (normalizedTitle.includes(normalizedQuery)) {
            score += 100;
        }
        
        // Check for word matches
        queryWords.forEach(word => {
            if (normalizedTitle.includes(word)) {
                score += 10;
                // Simple highlighting
                const regex = new RegExp(`(${word})`, 'gi');
                highlightedTitle = highlightedTitle.replace(regex, '<b>$1</b>');
            }
        });
        
        // Boost score for matches at the beginning
        if (normalizedTitle.startsWith(normalizedQuery)) {
            score += 50;
        }
        
        if (score > 0) {
            results.push({
                id: i,
                title: title,
                highlight: highlightedTitle,
                score: score,
                originalTitle: title
            });
        }
    }
    
    // Sort by score (descending) then by length (ascending)
    results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.title.length - b.title.length;
    });
    
    // Apply limit
    const limit = options.limit || 25;
    return results.slice(0, limit);
}

// Khởi tạo worker với dữ liệu được phân chia
function initializeWorker(data, id) {
    workerId = id;
    workerData = data;
    console.log(`Fallback Worker ${workerId} initialized with ${data.length} movies`);
}

// Xử lý tìm kiếm trong worker
function searchInWorker(query, options = {}) {
    if (!workerData || workerData.length === 0) {
        return { results: [], workerId, error: "Worker not initialized" };
    }
    
    const startTime = performance.now();
    
    try {
        const results = simpleSearch(query, workerData, options);
        const endTime = performance.now();
        
        // Thêm thông tin worker vào kết quả
        const enrichedResults = results.map(result => ({
            ...result,
            workerId: workerId
        }));
        
        return {
            results: enrichedResults,
            workerId: workerId,
            searchTime: endTime - startTime,
            dataSize: workerData.length
        };
        
    } catch (error) {
        console.error(`Fallback Worker ${workerId} search error:`, error);
        return { 
            results: [], 
            workerId, 
            error: error.message,
            searchTime: 0,
            dataSize: workerData.length
        };
    }
}

// Lắng nghe messages từ main thread
self.addEventListener('message', function(e) {
    const { type, data, query, options, id } = e.data;
    
    try {
        switch(type) {
            case 'INIT':
                initializeWorker(data, id);
                self.postMessage({
                    type: 'INIT_COMPLETE',
                    workerId: id,
                    status: 'ready'
                });
                break;
                
            case 'SEARCH':
                const searchResult = searchInWorker(query, options);
                self.postMessage({
                    type: 'SEARCH_RESULT',
                    ...searchResult
                });
                break;
                
            case 'HEALTH_CHECK':
                self.postMessage({
                    type: 'HEALTH_RESPONSE',
                    workerId: workerId,
                    status: 'healthy',
                    dataSize: workerData.length,
                    isReady: !!workerData.length
                });
                break;
                
            default:
                self.postMessage({
                    type: 'ERROR',
                    workerId: workerId,
                    error: `Unknown message type: ${type}`
                });
        }
    } catch (error) {
        console.error(`Fallback Worker ${workerId} message handling error:`, error);
        self.postMessage({
            type: 'ERROR',
            workerId: workerId,
            error: error.message
        });
    }
});

// Báo hiệu worker đã sẵn sàng
self.postMessage({
    type: 'WORKER_READY',
    message: 'Fallback search worker loaded and ready for initialization'
}); 
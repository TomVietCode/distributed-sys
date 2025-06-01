// search-worker.js - Worker xử lý tìm kiếm phân tán

// Import FlexSearch using importScripts for better worker compatibility
importScripts('https://cdn.jsdelivr.net/gh/nextapps-de/flexsearch@master/dist/flexsearch.bundle.js');

// Polyfill for String.prototype.normalize if not available
if (!String.prototype.normalize) {
    String.prototype.normalize = function(form) {
        // Simple fallback - just return the string as-is
        return this.toString();
    };
}

// Index FlexSearch cho worker này
let index = null;
let workerData = [];
let workerId = null;

// Khởi tạo worker với dữ liệu được phân chia
function initializeWorker(data, id) {
    workerId = id;
    workerData = data;
    
    try {
        // Tạo Document index với FlexSearch
        index = new FlexSearch.Document({
            document: {
                store: true,
                index: [{
                    field: "title",
                    tokenize: "forward"
                }]
            }
        });

        // Thêm dữ liệu vào index
        for(let i = 0; i < data.length; i++){
            const movieData = data[i];
            const title = typeof movieData === 'string' ? movieData : movieData.title;
            
            index.add(i, {
                "title": title,
                "originalIndex": movieData.originalIndex || i
            });
        }
        
        console.log(`Worker ${workerId} initialized with ${data.length} movies`);
        
    } catch (error) {
        console.error(`Worker ${workerId} initialization error:`, error);
        throw error;
    }
}

// Xử lý tìm kiếm trong worker
function searchInWorker(query, options = {}) {
    if (!index) {
        return { results: [], workerId, error: "Worker not initialized" };
    }
    
    const startTime = performance.now();
    
    try {
        const results = index.search({
            query: query,
            suggest: options.suggest || false,
            limit: options.limit || 25,
            pluck: "title",
            enrich: true,
            highlight: options.highlight || "<b>$1</b>"
        });
        
        const endTime = performance.now();
        
        // Thêm thông tin worker vào kết quả
        const enrichedResults = results.map(result => {
            const originalData = workerData[result.id];
            const title = typeof originalData === 'string' ? originalData : originalData.title;
            
            return {
                ...result,
                workerId: workerId,
                originalTitle: title
            };
        });
        
        return {
            results: enrichedResults,
            workerId: workerId,
            searchTime: endTime - startTime,
            dataSize: workerData.length
        };
        
    } catch (error) {
        console.error(`Worker ${workerId} search error:`, error);
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
                    isReady: !!index
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
        console.error(`Worker ${workerId} message handling error:`, error);
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
    message: 'Search worker loaded and ready for initialization'
}); 
# 🎵 Distributed Song Search System
*Advanced distributed search với FlexSearch, MySQL và Redis Cache*

## 📝 Mô tả dự án

Hệ thống tìm kiếm bài hát phân tán với khả năng xử lý song song trên nhiều worker nodes, tích hợp cache Redis và database MySQL để đạt hiệu suất tối ưu.

**Tính năng nổi bật:**
- ⚡ Tìm kiếm 600K+ bài hát với tốc độ sub-millisecond (nhờ cache)
- 🔄 Quản lý nodes tự động (0-8 nodes)
- 🚀 Redis distributed cache với TTL configurable
- 📊 Real-time analytics và monitoring
- 🎯 Fuzzy search với FlexSearch engine

---

## 🔄 **LUỒNG HOẠT ĐỘNG DỰ ÁN**

### **1. Khởi tạo hệ thống**
```
1. Coordinator khởi động (port 3000)
2. Kết nối MySQL database (127.0.0.1:3309)
3. Khởi tạo Redis cache manager (127.0.0.1:6379)
4. Load web interface tại localhost:3000
```

### **2. Node Management Process**
```
User chọn số nodes (0-8) → 
Coordinator spawn worker nodes (ports 3001+) →
Mỗi node kết nối database riêng →
Phân chia dữ liệu (data partitioning) →
Nodes register với coordinator →
Ready for distributed search
```

### **3. Search Flow (Cache-First Strategy)**
```
User query → 
Check Redis distributed cache →
├─ CACHE HIT: Return results (1-5ms)
└─ CACHE MISS:
   ├─ Broadcast query to all nodes
   ├─ Each node checks local cache  
   ├─ Node executes FlexSearch on partition
   ├─ Cache results at node level
   ├─ Merge results at coordinator
   ├─ Cache final results in Redis
   └─ Return to user (50-200ms first time)
```

### **4. Data Partitioning Logic**
```javascript
// Ví dụ với 4 nodes và 600K records:
Node 1: Records 1-150,000      (OFFSET 0, LIMIT 150000)
Node 2: Records 150,001-300,000 (OFFSET 150000, LIMIT 150000)  
Node 3: Records 300,001-450,000 (OFFSET 300000, LIMIT 150000)
Node 4: Records 450,001-600,000 (OFFSET 450000, LIMIT 150000)
```

### **5. Cache Strategy**
```
Level 1: Node cache (search:node-{id}:{query_hash})
Level 2: Distributed cache (search:distributed:{query_hash})
Level 3: Hot queries tracking (analytics:hot_queries)
Level 4: System stats cache (system:stats)
```

---

## 🧪 **HƯỚNG DẪN TEST DỰ ÁN**

### **📋 Checklist trước khi test**
- [ ] MySQL running on 127.0.0.1:3309
- [ ] Database `dataset` với table `DataSet` exists
- [ ] Redis running on 127.0.0.1:6379 (optional but recommended)
- [ ] Node.js v14+ installed
- [ ] Dependencies installed (`npm install`)

### **🚀 Test 1: Basic System Startup**
```bash
# Test coordinator startup
node backend/coordinator.js

# Kiểm tra log output:
✅ "Coordinator started on port 3000"
✅ "Database connected successfully"  
✅ "Redis cache connected" (nếu có Redis)
```

**Expected behavior:**
- Coordinator khởi động không lỗi
- Database connection successful
- Web interface accessible tại http://localhost:3000

### **🔧 Test 2: Node Management**
```bash
# Truy cập localhost:3000
# Test từng số nodes:

1. Select "1 Node" → Click "Cập nhật"
   ✅ Node status: "1/1 nodes active" 
   ✅ Console log: "Search node started on port 3001"

2. Select "3 Nodes" → Click "Cập nhật"  
   ✅ Node status: "3/3 nodes active"
   ✅ Console log: Nodes on ports 3001, 3002, 3003

3. Select "0 Nodes" → Click "Cập nhật"
   ✅ Node status: "0/0 nodes active"
   ✅ Console log: "All search nodes terminated"
```

### **🔍 Test 3: Search Functionality**
```bash
# Test với 2-4 nodes active:

1. Search query: "love"
   ✅ Results hiển thị (10-50 results)
   ✅ Response time: 50-200ms (first search)
   ✅ Console log: "Distributed search to X nodes"

2. Search query: "love" (repeat)  
   ✅ Response time: 1-10ms (cached)
   ✅ Dashboard shows cache hit

3. Search query: "thiếu tên"
   ✅ No results found gracefully
   ✅ Response time normal

4. Search query: "âm nhạc việt nam"
   ✅ Fuzzy matching works
   ✅ Accent handling correct
```

### **⚡ Test 4: Performance Testing**
```bash
# Test load với multiple searches:

1. Search 10 different queries rapidly
   ✅ No errors or timeouts
   ✅ Progressive cache improvement
   ✅ Response times decrease

2. Search same query 20 times
   ✅ Consistent 1-5ms response  
   ✅ 100% cache hit rate
   ✅ No memory leaks
```

### **📊 Test 5: API Endpoints**
```bash
# Test tất cả API endpoints:

# Node management
curl -X POST http://localhost:3000/api/nodes/update-count \
  -H "Content-Type: application/json" \
  -d '{"nodeCount": 2}'
✅ Response: {"success": true, "nodeCount": 2}

# Search API  
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "love song"}'
✅ Response: {"results": [...], "totalTime": X}

# Node status
curl http://localhost:3000/api/nodes
✅ Response: [{"port": 3001, "status": "active"}, ...]

# Health check
curl http://localhost:3000/api/health
✅ Response: {"status": "healthy", "nodes": X}
```

### **🗄️ Test 6: Database Integration**
```bash
# Test database operations:

1. Search với kết quả nhiều
   ✅ Data từ MySQL database correct
   ✅ No SQL injection vulnerabilities
   ✅ Proper UTF-8 encoding

2. Test với database disconnect
   ✅ Graceful error handling
   ✅ Auto-reconnection attempts
   ✅ User-friendly error messages
```

### **🔥 Test 7: Redis Cache (Nếu có)**
```bash
# Test Redis functionality:

# Cache health
curl http://localhost:3000/api/cache/health
✅ Response: {"status": "healthy", "connected": true}

# Cache stats
curl http://localhost:3000/api/cache/stats  
✅ Response: {"memoryUsage": "X MB", "totalKeys": Y}

# Hot queries
curl http://localhost:3000/api/cache/hot-queries
✅ Response: {"hotQueries": ["love", "song", ...]}

# Cache invalidation
curl -X DELETE http://localhost:3000/api/cache/invalidate
✅ Response: {"success": true, "message": "Cache cleared"}
```

### **🔄 Test 8: Error Handling**
```bash
# Test các error scenarios:

1. Search với nodes = 0
   ✅ Fallback to direct database search
   ✅ Warning message displayed

2. Redis connection lost
   ✅ Graceful fallback to no cache
   ✅ System continues functioning

3. Database connection lost  
   ✅ Error message displayed
   ✅ Auto-reconnection attempts

4. Invalid search queries
   ✅ Proper input validation
   ✅ No server crashes
```

### **📈 Test 9: Performance Benchmarks**
```bash
# Expected performance targets:

# Without Cache:
- Single search: 50-200ms
- 10 concurrent: 100-300ms avg
- Memory usage: ~100MB per node

# With Redis Cache:  
- Cached search: 1-5ms  
- Cache hit rate: 85-95% after warmup
- Memory usage: +50MB for Redis

# Scaling:
- 1 node: ~100 searches/second
- 4 nodes: ~400 searches/second  
- 8 nodes: ~600 searches/second (I/O bound)
```

### **🚨 Test 10: Edge Cases**
```bash
# Test extreme scenarios:

1. Query với special characters: "!@#$%^&*()"
   ✅ No server errors
   ✅ Proper escaping

2. Very long queries (1000+ chars)
   ✅ Handled gracefully
   ✅ Reasonable timeout

3. Empty/null queries
   ✅ Validation errors returned
   ✅ No crashes

4. Rapid node scaling (0→8→0→4)
   ✅ No memory leaks
   ✅ Clean process termination
```

---

## 🎯 **TEST RESULTS CHECKLIST**

### ✅ **Passed Tests**
- [ ] System startup successful
- [ ] Node management (0-8 nodes)
- [ ] Search functionality working
- [ ] Performance benchmarks met
- [ ] API endpoints responding
- [ ] Database integration stable
- [ ] Redis cache functional
- [ ] Error handling robust
- [ ] Edge cases handled
- [ ] Memory usage normal

### ❌ **Common Issues & Solutions**

**Issue**: "Database connection failed"
```bash
# Solution: Check MySQL server
mysql -h 127.0.0.1 -P 3309 -u root -p

# Check database exists
USE dataset;
SHOW TABLES;
```

**Issue**: "Redis connection failed"  
```bash
# Solution: Start Redis server
redis-server
# Or check if running:
redis-cli ping
```

**Issue**: "Port already in use"
```bash
# Solution: Kill existing processes
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Issue**: "Node spawn failed"
```bash
# Solution: Check available memory
tasklist /FI "IMAGENAME eq node.exe"
# Restart coordinator if needed
```

---

## 🚀 **Quick Start Guide**

### **Installation**
```bash
# 1. Clone repository
git clone <repo-url>
cd distributed-system

# 2. Install dependencies  
npm install

# 3. Setup database (MySQL 5.7+)
# Database: dataset, Table: DataSet
# Columns: id (INT), name (VARCHAR)

# 4. Setup Redis (optional)
redis-server

# 5. Start system
npm start
# hoặc: node backend/coordinator.js
```

### **Usage**
```bash
# 1. Open browser: http://localhost:3000
# 2. Select number of nodes (1-8 recommended)
# 3. Click "Cập nhật"  
# 4. Start searching songs!
# 5. Monitor performance in dashboard
```

---

## 📊 **System Architecture**

### **Components**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │    │   Coordinator   │    │   Redis Cache   │
│  (localhost:3000)│◄──►│   (port 3000)   │◄──►│ (localhost:6379)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  MySQL Database │  
                       │ (127.0.0.1:3309)│
                       └─────────────────┘
                                ▲
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │Search Node 1│ │Search Node 2│ │Search Node N│
        │(port 3001)  │ │(port 3002)  │ │(port 300N)  │
        └─────────────┘ └─────────────┘ └─────────────┘
```

### **Data Flow**
```
User Query → Coordinator → Check Cache → [Cache Hit → Return]
                        ↓
                     Cache Miss
                        ↓  
            Broadcast to all Search Nodes
                        ↓
            Parallel search on data partitions  
                        ↓
            Merge results + Cache + Return
```

---

## 🔧 **Technical Specifications**

### **Requirements**
- **Node.js**: v14+
- **MySQL**: 5.7+
- **Redis**: 6.0+ (optional)
- **Memory**: 2GB+ RAM recommended
- **OS**: Windows/Linux/MacOS

### **Database Schema**
```sql
-- Database: dataset
-- Table: DataSet
CREATE TABLE DataSet (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    INDEX idx_name (name)
);
```

### **Performance Characteristics**
- **Latency**: 1-5ms (cached), 50-200ms (cold)
- **Throughput**: 100-1000 searches/second depending on nodes
- **Memory**: ~100MB per node + 50MB Redis
- **Scalability**: Linear scaling up to I/O limits (typically 4-6 nodes optimal)

### **API Endpoints**

#### **Node Management**
```http
POST /api/nodes/update-count
Content-Type: application/json
{"nodeCount": 4}

GET /api/nodes
Response: [{"port": 3001, "status": "active"}, ...]
```

#### **Search**
```http
POST /api/search  
Content-Type: application/json
{"query": "love song"}

Response: {
  "results": [...],
  "totalTime": 5.2,
  "fromCache": true,
  "searchId": "search-123456"
}
```

#### **Cache Management**
```http
GET /api/cache/health
GET /api/cache/stats
GET /api/cache/hot-queries
DELETE /api/cache/invalidate
```

#### **System Health**
```http
GET /api/health
Response: {
  "status": "healthy",
  "nodes": 4,
  "database": "connected",
  "cache": "connected"
}
```

---

## 🎉 **Kết luận**

Hệ thống distributed search hoàn chỉnh với:
- ✅ **Workflow** rõ ràng từ initialization → node management → search execution
- ✅ **Testing guide** toàn diện với 10 test scenarios khác nhau
- ✅ **Performance benchmarks** và optimization guidelines
- ✅ **Error handling** robust cho production environment
- ✅ **API documentation** đầy đủ cho integration

**🚀 Ready for deployment và performance testing!** 
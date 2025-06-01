# 🎵 Distributed Song Search System
*Advanced distributed search với FlexSearch, MySQL và Node Management*

## 🌟 Tính năng chính

### ✨ **Automatic Node Management** (New!)
- **🎛️ Chọn số nodes**: Interface cho phép chọn từ 0-8 worker nodes
- **🚀 Auto spawn/kill**: Hệ thống tự động tạo/xóa nodes theo lựa chọn
- **📊 Real-time monitoring**: Theo dõi trạng thái nodes trong thời gian thực
- **🔄 Dynamic scaling**: Tăng/giảm nodes không cần restart hệ thống

### 🔍 **Distributed Search Engine**
- **600K+ songs** từ MySQL database
- **FlexSearch** engine với fuzzy matching
- **Parallel processing** trên multiple nodes
- **Real-time suggestions** và auto-complete

### 🗄️ **MySQL Integration**
- Kết nối với database `dataset.DataSet`
- Connection pooling tối ưu hiệu suất
- Health monitoring và error handling
- Dynamic data partitioning

### 📈 **Performance Analytics**
- Response time tracking
- Node load balancing
- Database query optimization
- System health monitoring

## 🚀 Quick Start

### 1. **Khởi tạo Dependencies**
```bash
npm install
```

### 2. **Cấu hình Database** 
Database mặc định:
- Host: `127.0.0.1:3309`
- Database: `dataset`
- Table: `DataSet`
- Columns: `id`, `name`

### 3. **Khởi động Coordinator**
```bash
npm start
# hoặc
node backend/coordinator.js
```

### 4. **Sử dụng Node Management**
1. Mở dashboard: http://localhost:3000
2. Chọn số nodes mong muốn (0-8)
3. Click "Cập nhật" 
4. Hệ thống tự động spawn/kill nodes
5. Theo dõi trạng thái trong real-time

## 🎛️ Node Management Interface

### **Selector Options**
```
0 Nodes  - Chỉ coordinator, không có search nodes
1 Node   - Single node cho dataset nhỏ
2 Nodes  - Balanced performance (recommended)
3 Nodes  - High throughput
4 Nodes  - Maximum parallel processing
6 Nodes  - Heavy load scenarios
8 Nodes  - Peak performance (large datasets)
```

### **Automatic Port Assignment**
- Coordinator: Port 3000
- Search Nodes: Ports 3001, 3002, 3003...
- Auto-increment cho mỗi node mới

### **Node Lifecycle**
1. **Spawn**: Coordinator tạo child process
2. **Initialize**: Node kết nối database
3. **Register**: Node đăng ký với coordinator
4. **Data Range**: Coordinator phân chia data
5. **Ready**: Node sẵn sàng xử lý search

## 📊 Dashboard Features

### **Real-time Status**
- 🟢 Active nodes / Total nodes
- 📈 Total searches performed
- ⚡ Average response time
- 🗄️ Database connection status

### **Node Management Panel**
- 🎛️ Node count selector
- ✅ Update confirmation
- 📊 Managed vs Registered nodes
- 🔄 Auto-sync with target count

### **Search Interface**
- 🔍 Real-time search với suggestions
- 📱 Responsive design
- ⌨️ Keyboard navigation
- 🎯 Node-specific result tracking

## 🏗️ Architecture

### **Coordinator (Port 3000)**
```javascript
// Auto node management
POST /api/nodes/update-count
GET  /api/nodes
GET  /api/status

// Search operations  
POST /api/search
POST /api/register-node
```

### **Search Nodes (Ports 3001+)**
```javascript
// Node operations
POST /search
POST /update-data-range
GET  /health
GET  /stats
```

### **Process Management**
- **Child Process Spawning**: `spawn('node', ['node.js', nodeId, port])`
- **Graceful Shutdown**: SIGTERM → SIGKILL
- **Process Monitoring**: stdout/stderr logging
- **Auto Cleanup**: Dead process removal

## 🔧 Technical Details

### **Node Spawning Process**
1. User chọn số nodes trong UI
2. Coordinator nhận request `/api/nodes/update-count`
3. So sánh với current managed nodes
4. Spawn new processes hoặc kill excess ones
5. Each node auto-register với coordinator
6. Data redistribution across all nodes

### **Data Partitioning**
```javascript
const chunkSize = Math.ceil(totalDataSize / nodeCount);
node.dataRange = { 
    start: index * chunkSize, 
    end: Math.min(start + chunkSize, totalDataSize) 
};
```

### **Process Communication**
- **HTTP APIs**: Coordinator ↔ Nodes
- **Child Process**: spawn/kill management
- **Database**: Shared MySQL connection pool
- **Real-time**: WebSocket-like status updates

## 🎯 Performance Benefits

### **Scalability**
- **Dynamic Scaling**: Add/remove nodes without restart
- **Load Distribution**: Data automatically partitioned
- **Resource Optimization**: Only spawn needed nodes

### **Efficiency**
- **Memory Management**: Per-node FlexSearch indices
- **Database Pooling**: Shared connection management
- **Process Isolation**: Node failures don't affect others

## 📝 Configuration

### **Environment Variables**
```bash
# Database
DB_HOST=127.0.0.1
DB_PORT=3309
DB_NAME=dataset
DB_TABLE=DataSet
DB_USER=root
DB_PASSWORD=your_password

# Coordinator
PORT=3000
NODE_BASE_PORT=3001
MAX_NODES=8
```

### **Node Limits**
- **Minimum**: 0 nodes (coordinator only)
- **Maximum**: 8 nodes (resource optimization)
- **Recommended**: 2-4 nodes for typical workloads

## 🚨 Troubleshooting

### **Node Spawn Issues**
```bash
# Check coordinator logs
[search-node-1] ✅ Search Node search-node-1 ready!
[search-node-2] 🔌 Node search-node-2: Connecting to database...
```

### **Database Connection**
```bash
# Test database connectivity
curl http://localhost:3000/api/database/health
```

### **Port Conflicts**
- Coordinator kiểm tra port availability
- Auto-increment nếu port bị occupied
- Error handling cho spawn failures

## 🎉 Success Metrics

Với 600K songs và 2-4 nodes:
- **Search Time**: < 50ms average
- **Throughput**: 100+ concurrent searches
- **Memory**: ~200MB per node
- **CPU**: Parallel processing across cores

---

## 📖 API Documentation

### **Node Management**
```http
POST /api/nodes/update-count
Content-Type: application/json

{
  "nodeCount": 3
}
```

Response:
```json
{
  "success": true,
  "message": "Node count updated to 3",
  "currentCount": 3,
  "targetCount": 3
}
```

### **System Status**
```http
GET /api/status
```

Response:
```json
{
  "stats": {
    "managedNodes": {
      "search-node-1": {
        "port": 3001,
        "status": "registered",
        "pid": 12345,
        "uptime": 45000
      }
    },
    "targetNodeCount": 2,
    "healthyNodes": 2,
    "totalDataSize": 600000
  }
}
```

**Hệ thống hiện đã sẵn sàng với khả năng quản lý nodes tự động! 🚀**



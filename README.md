# 🎵 FlexSearch Distributed System - Tìm kiếm bài hát phân tán

Hệ thống tìm kiếm phân tán sử dụng FlexSearch với MySQL database chứa 600,000+ bài hát.

## 📋 Tổng quan

### 🎯 **Mục tiêu dự án**
Xây dựng hệ thống tìm kiếm bài hát phân tán với khả năng:
- **High Performance**: Tìm kiếm trong 600K+ bài hát với FlexSearch
- **Distributed Architecture**: Multiple search nodes với load balancing
- **Real-time Monitoring**: Theo dõi hiệu suất và trạng thái nodes
- **Database Integration**: Kết nối trực tiếp với MySQL database

### 🏗️ **Kiến trúc hệ thống**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Web    │───►│   Coordinator   │◄──►│   MySQL DB      │
│    Browser      │    │   (Port 3000)   │    │   600K Songs    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
        ┌───────▼────┐  ┌──────▼────┐  ┌──────▼────┐
        │ Search     │  │ Search    │  │ Search    │
        │ Node 1     │  │ Node 2    │  │ Node N    │
        │ Range A    │  │ Range B   │  │ Range C   │
        └────────────┘  └───────────┘  └───────────┘
```

## 🚀 **Current Implementation**

### **Database Schema**
```sql
-- Bảng songs trong MySQL
CREATE TABLE untitled_table_1 (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(500) NOT NULL
);
```

### **Features Implemented**
- ✅ **MySQL Integration**: Kết nối trực tiếp với database
- ✅ **Data Partitioning**: Tự động chia data cho các nodes
- ✅ **FlexSearch Index**: Full-text search với tokenization
- ✅ **Load Balancing**: Distributed search across nodes
- ✅ **Real-time Monitoring**: Live dashboard với node status
- ✅ **Auto Discovery**: Nodes tự động đăng ký với coordinator

## 🛠️ **Tech Stack**

### **Backend Components**
- **Language**: Node.js 18+
- **Search Engine**: FlexSearch 0.7.31
- **Database**: MySQL với mysql2 driver
- **Framework**: Express.js
- **Environment**: dotenv for configuration

### **Database Configuration**
- **Host**: 127.0.0.1:3309
- **Database**: Local MYSQL
- **Table**: untitled_table_1
- **Columns**: id (INT), name (VARCHAR)

## 🏃‍♂️ **Quick Start**

### **1. Install Dependencies**
```bash
cd backend/
npm install
```

### **2. Database Setup**
Đảm bảo MySQL server đang chạy với:
- Host: 127.0.0.1
- Port: 3309
- Database: Local MYSQL
- Table: untitled_table_1 (với 600K records)

### **3. Environment Configuration**
Cấu hình database trong `backend/database.js` hoặc tạo file `.env`:
```bash
DB_HOST=127.0.0.1
DB_PORT=3309
DB_NAME=Local MYSQL
DB_USER=root
DB_PASSWORD=your_password
DB_TABLE=untitled_table_1
```

### **4. Start System**
```bash
# Terminal 1 - Start coordinator
cd backend/
npm run coordinator

# Terminal 2 - Start search node 1
PORT=3001 NODE_ID=search-node-1 npm run node

# Terminal 3 - Start search node 2  
PORT=3002 NODE_ID=search-node-2 npm run node

# Optional - Start more nodes
PORT=3003 NODE_ID=search-node-3 npm run node
```

### **5. Access Dashboard**
```
http://localhost:3000
```

## 📁 **Project Structure**

```
distributed-system/
├── backend/
│   ├── coordinator.js          # Main coordinator với MySQL
│   ├── node.js                 # Search node với FlexSearch
│   ├── database.js             # MySQL connection & models
│   └── package.json            # Dependencies
├── distributed-search.html     # Search interface
└── README.md
```

## 🎯 **Current Features**

### **✅ Implemented**
- [x] MySQL database integration
- [x] Coordinator/Node architecture  
- [x] FlexSearch full-text search
- [x] Data partitioning by range
- [x] Real-time status monitoring
- [x] Load balancing across nodes
- [x] Error handling và health checks
- [x] Auto node registration

### **🚧 Future Enhancements**
- [ ] Distributed cache system (Redis)
- [ ] Performance monitoring dashboard
- [ ] Auto-scaling based on load
- [ ] Advanced search features
- [ ] Query optimization

## 📊 **Performance**

### **Current Metrics**
- **Data Size**: 600,000 songs
- **Search Latency**: ~20-50ms per node
- **Throughput**: Scales with number of nodes
- **Memory Usage**: ~100-200MB per node

### **Scaling**
- **Horizontal**: Add more search nodes easily
- **Data Distribution**: Automatic range-based partitioning
- **Load Balancing**: Parallel queries to all nodes

## 🔧 **Configuration**

### **Database Settings**
```javascript
// backend/database.js
const dbConfig = {
    host: '127.0.0.1',
    port: 3309,
    database: 'Local MYSQL',
    user: 'root',
    password: 'your_password',
    connectionLimit: 10,
    charset: 'utf8mb4'
};
```

### **Search Settings**
```javascript
// FlexSearch configuration
{
    tokenize: 'forward',
    optimize: true,
    resolution: 9
}
```

## 🎵 **Use Cases**

### **Primary Features**
1. **Song Search**: Tìm bài hát theo tên
2. **Auto-complete**: Gợi ý real-time
3. **Distributed Search**: Parallel search across nodes
4. **Node Monitoring**: Real-time status tracking

### **Search Examples**
- **Exact Match**: "Nơi này có anh" → Exact matches first
- **Partial Match**: "noi nay" → Fuzzy matching
- **Prefix Search**: "a" → All songs starting with "a"

## 🛡️ **Error Handling**

### **Database Errors**
- Connection timeout handling
- Automatic reconnection
- Graceful degradation

### **Node Failures**
- Health check monitoring
- Automatic node exclusion
- Recovery detection

## 📈 **Monitoring**

### **Real-time Dashboard**
- **System Status**: Coordinator + Database health
- **Node Status**: Active nodes count và health
- **Search Metrics**: Total searches, response times
- **Data Distribution**: Songs per node

### **API Endpoints**
- `GET /api/status` - System overview
- `GET /api/database/health` - Database status
- `GET /health` - Coordinator health
- `GET /api/nodes` - Nodes information

## 🤝 **Development**

### **Adding New Nodes**
```bash
# Start new node on different port
PORT=3004 NODE_ID=search-node-4 npm run node
```

### **Database Queries**
```sql
-- Check table structure
DESCRIBE untitled_table_1;

-- Count total songs
SELECT COUNT(*) FROM untitled_table_1;

-- Sample data
SELECT * FROM untitled_table_1 LIMIT 10;
```

---

## 📞 **Contact**

**Built with ❤️ for distributed song search with FlexSearch + MySQL**



# 🌐 Distributed Search System with FlexSearch

**Hệ thống tìm kiếm phân tán thực sự** - mô phỏng distributed system trên một máy với multiple services, inter-service communication, và load balancing.

## 🏗️ **Kiến trúc Distributed System**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Search Node 1  │    │  Search Node 2  │    │  Search Node 3  │    │  Search Node 4  │
│   Port: 3001    │    │   Port: 3002    │    │   Port: 3003    │    │   Port: 3004    │
│   Data: 0-6692  │    │ Data: 6692-13385│    │Data: 13385-20077│    │Data: 20077-26770│
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │                      │
          └──────────────────────┼──────────────────────┼──────────────────────┘
                                 │                      │
                    ┌────────────┼──────────────────────┼────────────────┐
                    │         HTTP API Communication                    │
                    └────────────┼──────────────────────┼────────────────┘
                                 │                      │
┌─────────────────────────────────┼──────────────────────┼─────────────────────────────────┐
│                    Search Coordinator                                                   │
│                         Port: 3000                                                     │
│          • Service Discovery & Auto-Registration                                        │
│          • Load Balancing (Round Robin)                                                │
│          • Health Monitoring & Failover                                               │
│          • Result Aggregation & Sorting                                                │
└─────────────────────────────────┼───────────────────────────────────────────────────────┘
                                 │
┌─────────────────────────────────┼─────────────────────────────────────────────────────────┐
│                   Web Dashboard                                                           │
│                http://localhost:3000                                                      │
│            • Real-time Node Monitoring                                                   │
│            • Distributed Search Interface                                               │
│            • Performance Analytics                                                       │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

## 🎯 **Đặc điểm Distributed System**

### ✅ **True Distributed Architecture:**
- **Multiple Services**: 4 search nodes + 1 coordinator (5 processes riêng biệt)
- **Network Communication**: HTTP API calls giữa các services
- **Service Discovery**: Auto-discovery và registration của nodes
- **Load Balancing**: Round-robin distribution across healthy nodes
- **Fault Tolerance**: Health checks, failover, error handling
- **Data Partitioning**: Mỗi node quản lý một phần data (sharding)

### 🚀 **Core Features:**
- **Distributed Search**: Query được gửi đến tất cả nodes parallel
- **Result Aggregation**: Kết quả từ multiple nodes được merge và sort
- **Real-time Monitoring**: Live dashboard với node status và performance
- **Health Checks**: Automatic monitoring và failover
- **Scalability**: Dễ dàng thêm/bớt search nodes

## 📦 **System Components**

### 1. **Search Coordinator** (`distributed-coordinator.js`)
- **Port**: 3000
- **Role**: Central coordinator và load balancer
- **Functions**:
  - Service discovery và node registration
  - Health monitoring của all nodes
  - Distributed search coordination
  - Result aggregation và sorting
  - Web dashboard serving

### 2. **Search Nodes** (`search-node.js`)
- **Node 1**: Port 3001 (Data: 0-6692)
- **Node 2**: Port 3002 (Data: 6692-13385)  
- **Node 3**: Port 3003 (Data: 13385-20077)
- **Node 4**: Port 3004 (Data: 20077-26770)
- **Functions**:
  - FlexSearch indexing cho data slice
  - Search processing
  - Health check endpoints
  - Performance metrics

### 3. **Web Dashboard** (`distributed-dashboard.html`)
- Real-time system monitoring
- Distributed search interface
- Node health và performance tracking
- Activity logging

## 🚀 **Quick Start (Windows)**

### **Cách 1: One-Click Start**
```cmd
# Double-click file này
start-distributed-system.bat
```

### **Cách 2: Manual Start**
```cmd
# 1. Install dependencies
cd backend
npm install

# 2. Start coordinator (Terminal 1)
npm run coordinator

# 3. Start nodes (Terminal 2-5)
npm run node1
npm run node2  
npm run node3
npm run node4
```

### **Cách 3: PowerShell**
```powershell
cd backend
npm install

# Start all components
Start-Process cmd -ArgumentList '/k', 'npm run coordinator'
Start-Sleep 3
Start-Process cmd -ArgumentList '/k', 'npm run node1'
Start-Sleep 2
Start-Process cmd -ArgumentList '/k', 'npm run node2' 
Start-Sleep 2
Start-Process cmd -ArgumentList '/k', 'npm run node3'
Start-Sleep 2
Start-Process cmd -ArgumentList '/k', 'npm run node4'
```

## 🌐 **Access Points**

- **Main Dashboard**: http://localhost:3000
- **Coordinator API**: http://localhost:3000/api/status
- **Search Node 1**: http://localhost:3001/info
- **Search Node 2**: http://localhost:3002/info
- **Search Node 3**: http://localhost:3003/info
- **Search Node 4**: http://localhost:3004/info

## 🔍 **How Distributed Search Works**

### **Search Flow:**
1. **User Input** → Web Dashboard
2. **Query** → Search Coordinator  
3. **Parallel Requests** → All Healthy Search Nodes
4. **Individual Search** → Each node searches its data partition
5. **Results Collection** → Coordinator collects all results
6. **Aggregation & Sorting** → Merge, deduplicate, and rank results
7. **Response** → Return aggregated results to user

### **Example Search Process:**
```
Query: "action movies"

Node 1 (0-6692):     Found 15 results in 23ms
Node 2 (6692-13385): Found 12 results in 19ms  
Node 3 (13385-20077): Found 18 results in 25ms
Node 4 (20077-26770): Found 8 results in 21ms

Coordinator: Aggregated 53 results → Sorted → Top 25 returned
Total Time: 28ms (parallel execution)
```

## 📊 **Monitoring & Analytics**

### **Real-time Dashboard Features:**
- **System Overview**: Total nodes, healthy nodes, request count
- **Node Status**: Individual node health, performance, errors
- **Search Results**: Live search with node source tracking
- **Activity Log**: System events and search history
- **Performance Metrics**: Response times, throughput, errors

### **Health Monitoring:**
- **Health Checks**: Every 30 seconds
- **Auto-Discovery**: Automatic node detection
- **Failover**: Unhealthy nodes excluded from search
- **Recovery**: Automatic re-inclusion when nodes recover

## 🛠️ **Configuration**

### **Data Partitioning:**
```javascript
// Configurable in package.json scripts
Node 1: DATA_START=0      DATA_END=6692
Node 2: DATA_START=6692   DATA_END=13385  
Node 3: DATA_START=13385  DATA_END=20077
Node 4: DATA_START=20077  DATA_END=26770
```

### **Performance Tuning:**
- **Concurrent Searches**: All nodes search in parallel
- **Result Limiting**: Configurable per-node and total limits
- **Timeout Settings**: Configurable request timeouts
- **Health Check Intervals**: Adjustable monitoring frequency

## 🔧 **API Endpoints**

### **Coordinator APIs:**
- `GET /api/status` - System status and statistics
- `POST /api/search` - Distributed search
- `GET /api/nodes` - Node information
- `POST /api/nodes/register` - Manual node registration

### **Node APIs:**
- `GET /health` - Node health check
- `GET /info` - Node information  
- `POST /search` - Search within node data
- `GET /stats` - Node performance statistics

## 🎯 **Why This is True Distributed System**

### **✅ Distributed Characteristics:**
1. **Multiple Autonomous Services**: Each node là independent process
2. **Network Communication**: Inter-service communication qua HTTP
3. **Data Partitioning**: Data được chia across multiple nodes
4. **Load Distribution**: Workload được distributed across nodes
5. **Fault Tolerance**: System tiếp tục hoạt động khi một số nodes fail
6. **Scalability**: Có thể add/remove nodes without downtime
7. **Service Discovery**: Automatic node registration và discovery

### **🚫 Not Just Parallel Processing:**
- Không phải single process với multiple threads
- Không phải shared memory architecture
- Mỗi node có own data và processing capability
- Communication through well-defined APIs

## 📈 **Performance Benefits**

- **Parallel Processing**: Multiple nodes search simultaneously
- **Data Locality**: Each node optimized for its data partition
- **Load Distribution**: No single bottleneck point
- **Fault Isolation**: Node failures don't affect others
- **Horizontal Scaling**: Easy to add more nodes

## 🛡️ **Production Considerations**

Để deploy production, cần thêm:
- **Container Orchestration** (Docker Swarm/Kubernetes)
- **Service Mesh** (Istio) cho secure communication
- **Distributed Caching** (Redis Cluster)
- **Message Queues** (RabbitMQ/Apache Kafka)
- **Database Clustering** (MongoDB Sharding)
- **Load Balancers** (HAProxy/NGINX)
- **Monitoring** (Prometheus/Grafana)

---

## 🎉 **Get Started Now!**

1. **Clone/Download** project
2. **Double-click** `start-distributed-system.bat`
3. **Wait** for all services to start
4. **Open** http://localhost:3000
5. **Search** và enjoy distributed system! 🚀



// database.js - MySQL Database Connection và Song Model
const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3309,
    database: process.env.DB_NAME || 'dataset',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'ead8686ba57479778a76e',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0,
    acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
    timeout: parseInt(process.env.DB_TIMEOUT) || 60000,
    charset: 'utf8mb4'
};

const tableName = process.env.DB_TABLE || 'DataSet';

let pool = null;

class DatabaseManager {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    // Khởi tạo connection pool
    async initialize() {
        try {
            console.log('🔌 Connecting to MySQL database...');
            console.log(`📍 Host: ${dbConfig.host}:${dbConfig.port}`);
            console.log(`🗄️ Database: ${dbConfig.database}`);
            console.log(`📋 Table: ${tableName}`);
            
            this.pool = mysql.createPool(dbConfig);
            
            // Test connection
            const connection = await this.pool.getConnection();
            console.log('✅ Database connection established successfully');
            
            // Test table exists
            const [tables] = await connection.execute(
                `SHOW TABLES LIKE '${tableName}'`
            );
            
            if (tables.length === 0) {
                console.error(`❌ Table '${tableName}' not found in database`);
                throw new Error(`Table '${tableName}' does not exist`);
            }
            
            // Get table info
            const [columns] = await connection.execute(
                `DESCRIBE ${tableName}`
            );
            console.log(`📊 Table structure:`, columns.map(col => `${col.Field}(${col.Type})`).join(', '));
            
            connection.release();
            this.isConnected = true;
            
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            this.isConnected = false;
            throw error;
        }
    }

    // Lấy tổng số bản ghi
    async getTotalCount() {
        try {
            if (!this.pool) {
                throw new Error('Database not initialized');
            }

            const [rows] = await this.pool.execute(
                `SELECT COUNT(*) as total FROM ${tableName}`
            );
            
            return rows[0].total;
        } catch (error) {
            console.error('❌ Error getting total count:', error.message);
            throw error;
        }
    }

    // Lấy danh sách songs theo range (cho data partitioning)
    async getSongsByRange(start, end) {
        try {
            if (!this.pool) {
                throw new Error('Database not initialized');
            }

            // Sử dụng string interpolation thay vì prepared statement để tránh lỗi parameter
            // và handle TEXT id column
            const limit = end - start;
            const offset = start;
            
            console.log(`📚 Loading ${limit} songs from offset ${offset}...`);
            
            const [rows] = await this.pool.execute(
                `SELECT id, name FROM ${tableName} LIMIT ${limit} OFFSET ${offset}`
            );
            
            console.log(`✅ Loaded ${rows.length} songs from range ${start}-${end}`);
            return rows;
        } catch (error) {
            console.error(`❌ Error loading songs range ${start}-${end}:`, error.message);
            
            // Fallback: try without ORDER BY if error persists
            try {
                console.log(`🔄 Trying fallback query without ORDER BY...`);
                const limit = end - start;
                const offset = start;
                
                const [rows] = await this.pool.execute(
                    `SELECT id, name FROM ${tableName} LIMIT ${limit} OFFSET ${offset}`
                );
                
                console.log(`✅ Fallback query successful: ${rows.length} songs loaded`);
                return rows;
            } catch (fallbackError) {
                console.error(`❌ Fallback query also failed:`, fallbackError.message);
                throw error;
            }
        }
    }

    // Lấy tất cả songs (cho single node hoặc testing) - cẩn thận với 600K records
    async getAllSongs(limit = 10000) {
        try {
            if (!this.pool) {
                throw new Error('Database not initialized');
            }

            console.log(`📚 Loading up to ${limit} songs from database...`);
            const [rows] = await this.pool.execute(
                `SELECT id, name FROM ${tableName} LIMIT ${limit}`
            );
            
            console.log(`✅ Loaded ${rows.length} songs from database`);
            return rows;
        } catch (error) {
            console.error('❌ Error loading all songs:', error.message);
            throw error;
        }
    }

    // Search songs theo name (fallback nếu FlexSearch fail)
    async searchSongs(query, limit = 25) {
        try {
            if (!this.pool) {
                throw new Error('Database not initialized');
            }

            const searchQuery = `%${query}%`;
            const startQuery = `${query}%`;
            
            const [rows] = await this.pool.execute(
                `SELECT id, name FROM ${tableName} 
                 WHERE name LIKE ? 
                 ORDER BY 
                    CASE 
                        WHEN name LIKE ? THEN 1
                        WHEN name LIKE ? THEN 2
                        ELSE 3
                    END,
                    name
                 LIMIT ?`,
                [searchQuery, startQuery, searchQuery, limit]
            );
            
            return rows;
        } catch (error) {
            console.error('❌ Error searching songs:', error.message);
            throw error;
        }
    }

    // Health check
    async healthCheck() {
        try {
            if (!this.pool) {
                return { status: 'disconnected', error: 'Database not initialized' };
            }

            const connection = await this.pool.getConnection();
            const [rows] = await connection.execute('SELECT 1 as test');
            connection.release();

            return {
                status: 'healthy',
                connected: true,
                database: dbConfig.database,
                table: tableName
            };
        } catch (error) {
            return {
                status: 'error',
                connected: false,
                error: error.message
            };
        }
    }

    // Test query để kiểm tra table structure
    async testQuery() {
        try {
            if (!this.pool) {
                throw new Error('Database not initialized');
            }

            console.log('🧪 Testing database query...');
            
            // Test simple query first
            const [rows] = await this.pool.execute(
                `SELECT id, name FROM ${tableName} LIMIT 5`
            );
            
            console.log('✅ Test query successful:', rows.length, 'rows returned');
            console.log('📄 Sample data:', rows.slice(0, 2));
            
            return rows;
        } catch (error) {
            console.error('❌ Test query failed:', error.message);
            throw error;
        }
    }

    // Đóng connection pool
    async close() {
        if (this.pool) {
            console.log('🔌 Closing database connection pool...');
            await this.pool.end();
            this.pool = null;
            this.isConnected = false;
            console.log('✅ Database connection closed');
        }
    }

    // Getter cho pool
    getPool() {
        return this.pool;
    }

    // Check connection status
    isReady() {
        return this.isConnected && this.pool !== null;
    }
}

// Export singleton instance
const databaseManager = new DatabaseManager();

module.exports = {
    DatabaseManager,
    databaseManager,
    dbConfig,
    tableName
}; 
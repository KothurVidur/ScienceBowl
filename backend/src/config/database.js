/**
 * ============================================================================
 * DATABASE.JS - MONGODB CONNECTION CONFIGURATION
 * ============================================================================
 * 
 * This file handles connecting to MongoDB, the database where we store:
 * - User accounts and profiles
 * - Questions for the quiz
 * - Game history and results
 * 
 * MONGODB BASICS:
 * MongoDB is a "NoSQL" database that stores data as JSON-like documents.
 * Unlike SQL databases (tables with rows), MongoDB has:
 * - Collections (like tables)
 * - Documents (like rows, but flexible JSON objects)
 * 
 * Example document in "users" collection:
 * {
 *   "_id": "507f1f77bcf86cd799439011",
 *   "username": "sciencemaster",
 *   "email": "user@example.com",
 *   "rating": 1500
 * }
 * 
 * MONGOOSE:
 * Mongoose is an ODM (Object Data Modeling) library for MongoDB.
 * It provides:
 * - Schema definitions (what fields each document should have)
 * - Validation (ensure data is correct before saving)
 * - Query helpers (easier syntax for database operations)
 * - Middleware (run code before/after database operations)
 * 
 * ============================================================================
 */

const mongoose = require('mongoose');

/**
 * connectDB - Establishes connection to MongoDB
 * 
 * WHY ASYNC/AWAIT?
 * Connecting to a database takes time (network request).
 * async/await lets us write asynchronous code that looks synchronous.
 * 
 * CONNECTION STRING (MONGODB_URI):
 * Format: mongodb://[username:password@]host:port/database
 * 
 * Examples:
 * - Local: mongodb://localhost:27017/sciencebowl
 * - Cloud (MongoDB Atlas): mongodb+srv://user:pass@cluster.mongodb.net/sciencebowl
 * 
 * PRODUCTION TIP: Always use MongoDB Atlas or a managed service in production.
 * Running MongoDB yourself requires expertise in security, backups, and scaling.
 */
const connectDB = async () => {
  try {
    /**
     * mongoose.connect() establishes the connection
     * 
     * It returns a connection object with information about:
     * - The host we connected to
     * - The database name
     * - Connection state
     * 
     * In older Mongoose versions (< 6), you needed options like:
     * { useNewUrlParser: true, useUnifiedTopology: true }
     * These are now the default in Mongoose 6+.
     */
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Modern Mongoose doesn't need additional options
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    /**
     * CONNECTION EVENT LISTENERS
     * 
     * MongoDB connections can have issues (network problems, server restarts).
     * These event listeners help us handle those situations gracefully.
     * 
     * Mongoose automatically tries to reconnect, but these logs help us
     * know when issues occur.
     */
    
    // Fires if connection has an error
    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err}`);
    });

    // Fires if connection is lost
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    // Fires when connection is restored
    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    return conn;
  } catch (error) {
    /**
     * If we can't connect to the database, exit the application.
     * 
     * process.exit(1) means "exit with an error".
     * process.exit(0) means "exit successfully".
     * 
     * In production with Docker/Kubernetes, this causes the container
     * to restart, which usually fixes temporary connection issues.
     */
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

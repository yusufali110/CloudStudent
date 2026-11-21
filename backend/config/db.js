const mongoose = require('mongoose');

/**
 * Connect to MongoDB with retry logic to handle Kubernetes pod startup order.
 * In a Kubernetes or Docker Compose environment, the application pod may start
 * before the database pod is fully initialized.
 */
const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudstudent';
  const maxRetries = 5;
  const retryInterval = 5000; // 5 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[MongoDB] Connecting to database (Attempt ${attempt}/${maxRetries})...`);
      
      const conn = await mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      console.log(`[MongoDB] Successfully connected to host: ${conn.connection.host}`);
      return;
    } catch (error) {
      console.error(`[MongoDB] Connection attempt ${attempt} failed: ${error.message}`);
      if (attempt < maxRetries) {
        console.log(`[MongoDB] Retrying in ${retryInterval / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      } else {
        console.error('[MongoDB] All connection attempts exhausted.');
        // Allow the app to boot so readiness/liveness probes can report status
      }
    }
  }
};

// Event listeners for connection monitoring
mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB] Warning: Connection disconnected. Attempting reconnection...');
});

mongoose.connection.on('error', (err) => {
  console.error(`[MongoDB] Runtime error: ${err.message}`);
});

module.exports = connectDB;

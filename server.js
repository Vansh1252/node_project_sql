// server.js (This is a new file, typically in your project's root directory)
const http = require('http');
const app = require('./app.js'); // Import your Express application from src/app.js
const { connectDB } = require('./src/utils/db.js'); // Import your DB connection utility
const { init } = require('./socket.js'); // Import socket module (adjust path)
require('dotenv').config(); // Load environment variables for server startup

const port = process.env.PORT || 3000;

// Validate environment variables early
if (!process.env.JWT_SECRET) {
    console.error('Missing environment variables: DATABASE_URL or JWT_SECRET');
    process.exit(1);
}

// Create the HTTP server using the exported app instance
const server = http.createServer(app);

// Initialize Socket.io with the server
const io = init(server);

// Connect to MongoDB, then start the server
connectDB()
    .then(() => {
        server.listen(port, () => {
            console.log(`Server is listening on port ${port}`);
        });
    })
    .catch((err) => {
        console.error("Failed to connect to the database. Exiting...", err);
        process.exit(1); // Exit process if DB connection fails
    });

// You might export the server instance if you need to access it elsewhere (e.g., for graceful shutdown)
// module.exports = server;
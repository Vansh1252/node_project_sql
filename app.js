const express = require('express');
const bodyParser = require('body-parser');
const url = require('url');
const fs = require('fs');
const path = require('path');
const createError = require('http-errors');
const socketIo = require('socket.io');
const http = require('http');
const { init } = require('./socket'); // Import the socket module
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();
const { connectDB, sequelize } = require('./src/utils/db');

// Routers
const userrouter = require('./src/routes/user.routes.js');
const tutorrouter = require('./src/routes/tutor.routes.js');
const studentrouter = require('./src/routes/student.routes.js');
const slotrouter = require('./src/routes/slot.routes.js');
const reportsRouter = require('./src/routes/report.routes.js');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;



// Set view engine and views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views')); // Assuming 'views' is directly under 'src'


// Middleware
app.use(morgan('dev'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'Uploads')));
app.use(express.json());
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://checkout.razorpay.com', "'unsafe-inline'"], // Consider CSP nonce
            frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
            frameAncestors: ["'self'", 'https://checkout.razorpay.com', 'https://api.razorpay.com'],
            connectSrc: [
                "'self'",
                'https://api.razorpay.com',
                'https://lumberjack.razorpay.com',
                'https://checkout.razorpay.com',
                'https://node-complete-ycnd.onrender.com',
                'http://localhost:3000',
                'wss://node-complete-ycnd.onrender.com'
            ],
            imgSrc: ["'self'", 'data:', 'https://*.razorpay.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'], // Consider CSP nonce
        },
    })
); const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

connectDB();
// Routes
app.use('/', userrouter);
app.use('/tutor', tutorrouter);
app.use('/student', studentrouter);
app.use('/slot', slotrouter);
app.use('/reports', reportsRouter);

// Weekly Slot Auto-Generation Cron
require('./src/utils/weeklySlotCron');

// Error handler middleware
app.use((err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Something went wrong';

    // Handle Sequelize-specific errors
    if (err.name === 'SequelizeValidationError') {
        statusCode = 400;
        message = err.errors.map(e => e.message).join(', ');
    } else if (err.name === 'SequelizeDatabaseError') {
        statusCode = 500;
        message = 'Database error occurred';
    }

    res.status(statusCode).json({
        success: false,
        statusCode,
        message,
    });
});

// Start the server
const server = app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});

// Initialize Socket.IO
const io = init(server);
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
});

module.exports = app;
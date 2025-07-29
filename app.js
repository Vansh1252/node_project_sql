const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config(); // Load env vars for app logic (e.g., JWT_SECRET)

const userrouter = require('./src/routes/user.routes.js');
const tutorrouter = require('./src/routes/tutor.routes.js');
const studentrouter = require('./src/routes/student.routes.js');
const slotrouter = require('./src/routes/slot.routes.js');
const reportsRouter = require('./src/routes/report.routes.js');

const app = express();
app.disable('x-powered-by');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views')); // Assuming 'views' is directly under 'src'

if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
}
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
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
);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter); // Apply rate limiting only to API routes (adjust if your API routes are not under /api)

// Routes
app.use('/api/auth', userrouter);
app.use('/api/tutor', tutorrouter);
app.use('/api/student', studentrouter);
app.use('/api/slot', slotrouter);
app.use('/api/reports', reportsRouter);


// Error handler middleware
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Something went wrong';
    if (process.env.NODE_ENV !== 'test') {
        console.error(`Error: ${message}, Status: ${statusCode}, Path: ${req.path}`);
    }
    res.status(statusCode).json({
        success: false,
        statusCode,
        message,
    });
});

// EXPORT THE APP INSTANCE
module.exports = app;
// db.js

const { Sequelize } = require('sequelize');
// Make sure you import the correct constants here (tables, roles, userStatus, attendnace, slotstatus, paymentstatus)
const { tables, roles, userStatus, attendnace, slotstatus, paymentstatus } = require('../constants/sequelizetableconstants');

const db = {};
const sequelize = new Sequelize(
    process.env.MYSQLDATABASE,
    process.env.MYSQLUSER,
    process.env.MYSQLPASSWORD,
    {
        host: process.env.MYSQLHOST,
        port: process.env.MYSQLPORT,
        dialect: process.env.DB_DIALECT || 'mysql',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        define: {
            freezeTableName: true, // Prevents Sequelize from pluralizing table names
            underscored: true // Use snake_case for automatically generated foreign keys (e.g., userId instead of UserId)
        }
    }
);

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// --- Load Models ---
// Load models directly from their files. The require will call the function within their file
// and pass `sequelize` to define the model.
db.User = require('../models/user.models')(sequelize);
db.RefreshToken = require('../models/RefreshToken')(sequelize);
db.Student = require('../models/student.models')(sequelize);
db.Tutor = require('../models/tutor.models')(sequelize);
db.WeeklyHourBlock = require('../models/WeeklyHourBlock')(sequelize);
db.Slot = require('../models/slot.models')(sequelize);
db.RecurringBookingPattern = require('../models/RecurringBookingPattern')(sequelize);
db.Payment = require('../models/payment.models')(sequelize);

// --- Apply Associations ---
// Loop through all models and call their `associate` method
// This method needs to exist on each model (as added above)
Object.keys(db).forEach(modelName => {
    if (modelName === 'Sequelize' || modelName === 'sequelize') {
        return;
    }
    if (db[modelName] && typeof db[modelName].associate === 'function') {
        db[modelName].associate(db); // Pass the `db` object itself containing all loaded models
    } else if (db[modelName]) {
        console.warn(`Model ${modelName} exists but does not have an 'associate' function. This might be intentional for some models.`);
    } else {
        console.error(`Model ${modelName} is undefined or null. Check its import path or if it exports correctly.`);
    }
});

// Connects to the SQL database using Sequelize.
const connectDB = async () => {
    try {
        // Validate environment variables
        if (!process.env.MYSQLDATABASE || !process.env.MYSQLUSER || !process.env.MYSQLHOST) {
            throw new Error('Missing required environment variables: DB_NAME, DB_USER, or DB_HOST');
        }

        await sequelize.authenticate();
        console.log('Connected successfully to the SQL database.');

        // Use { alter: true } carefully in production; migrations are preferred.
        // It will try to make necessary changes to the database to match the models.
        // await sequelize.sync({ alter: true });
        console.log('Database models synchronized successfully.');
    } catch (error) {
        console.error(`Database connection failed: ${error.message}`);
        process.exit(1); // Exit process if DB connection fails
    }
};

module.exports = { connectDB, sequelize, db };
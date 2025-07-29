const { Sequelize } = require('sequelize');
const db = {};
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: process.env.DB_DIALECT || 'mysql',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        define: {
            freezeTableName: true,
            underscored: true
        }
    }
);
db.Sequelize = Sequelize;
db.sequelize = sequelize;
db.User = require('../models/user.models')(sequelize);
db.Tutor = require('../models/tutor.models')(sequelize);
db.Student = require('../models/student.models')(sequelize);
db.Slot = require('../models/slot.models')(sequelize);
db.Payment = require('../models/payment.models')(sequelize);
db.AvailabilitySlot = require('../models/availabilitySlot.models')(sequelize);
require('dotenv').config();
// Apply associations
Object.keys(db).forEach(modelName => {
    if (modelName === 'Sequelize' || modelName === 'sequelize') {
        return;
    }
    if (db[modelName] && typeof db[modelName].associate === 'function') {
        db[modelName].associate(db); // Pass the `db` object itself
    } else if (db[modelName]) {
        console.warn(`Model ${modelName} exists but does not have an 'associate' function. This might be intentional for some models.`);
    } else {
        console.error(`Model ${modelName} is undefined or null. Check its import path or if it exports correctly.`);
    }
});

//  Connects to the SQL database using Sequelize.
const connectDB = async () => {
    try {
        // Validate environment variables
        if (!process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_HOST) {
            throw new Error('Missing required environment variables: DB_NAME, DB_USER, or DB_HOST');
        }

        await sequelize.authenticate();
        console.log('Connected successfully to the SQL database.');
        await sequelize.sync({ alter: true });
        console.log('Database models synchronized successfully.');
    } catch (error) {
        console.error(`Database connection failed: ${error.message}`);
        process.exit(1);
    }
};

module.exports = { connectDB, sequelize, db }; 

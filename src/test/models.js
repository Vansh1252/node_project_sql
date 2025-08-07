// models/index.js
const { Sequelize, DataTypes } = require('sequelize');

// ✅ In-memory SQLite DB for testing
const sequelize = new Sequelize('sqlite::memory:', { logging: false });

// Load models with both sequelize and DataTypes
const db = {};
db.sequelize = sequelize;

db.User = require('../models/user.models')(sequelize, DataTypes);
db.RefreshToken = require('../models/RefreshToken')(sequelize, DataTypes);
db.Student = require('../models/student.models')(sequelize, DataTypes);
db.Tutor = require('../models/tutor.models')(sequelize, DataTypes);
db.WeeklyHourBlock = require('../models/WeeklyHourBlock')(sequelize, DataTypes);
db.Slot = require('../models/slot.models')(sequelize, DataTypes);
db.RecurringBookingPattern = require('../models/RecurringBookingPattern')(sequelize, DataTypes);
db.Payment = require('../models/payment.models')(sequelize, DataTypes);

// Call associations if defined
Object.values(db).forEach(model => {
    if (typeof model.associate === 'function') {
        model.associate(db);
    }
});

module.exports = db;

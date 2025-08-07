// models/RecurringBookingPattern.js
const { DataTypes } = require('sequelize');
const { tables, userStatus } = require('../constants/sequelizetableconstants');

module.exports = (sequelize) => {
    const RecurringBookingPattern = sequelize.define(tables.RECURRING_BOOKING_PATTERN, {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false,
        },
        obj_tutor: {
            type: DataTypes.UUID,
            references: {
                model: tables.TUTOR,
                key: 'id',
            },
            allowNull: false,
        },
        obj_student: {
            type: DataTypes.UUID,
            references: {
                model: tables.STUDENT,
                key: 'id',
            },
            allowNull: false,
        },
        dt_recurringStartDate: {
            type: DataTypes.DATE,
            allowNull: false
        },
        dt_recurringEndDate: {
            type: DataTypes.DATE,
            allowNull: true
        },
        str_dayOfWeek: {
            type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
            allowNull: false,
        },
        str_startTime: {
            type: DataTypes.STRING(5),
            allowNull: false,
        },
        str_endTime: {
            type: DataTypes.STRING(5),
            allowNull: false,
        },
        int_durationMinutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        int_startMinutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        int_endMinutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        obj_paymentId: {
            type: DataTypes.UUID,
            references: {
                model: tables.PAYMENT,
                key: 'id',
            },
            allowNull: true,
        },
        str_status: {
            type: DataTypes.ENUM(userStatus.ACTIVE, userStatus.PAUSED, userStatus.INACTIVE),
            defaultValue: userStatus.ACTIVE,
            allowNull: false,
        },
        objectId_createdBy: {
            type: DataTypes.UUID,
            references: {
                model: tables.USERS,
                key: 'id',
            },
            allowNull: false,
        },
        int_initialBatchSizeMonths: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        dt_lastExtensionDate: {
            type: DataTypes.DATE,
            allowNull: true,
        }
    }, {
        timestamps: true,
        tableName: tables.RECURRING_BOOKING_PATTERN,
        indexes: [
            {
                unique: true,
                name: 'tb_recurring_patterns_unique', 
                fields: ['obj_tutor', 'obj_student', 'str_day_of_week', 'str_start_time']
            },
            {
                name: 'tb_recurring_patterns_tutor', 
                fields: ['obj_tutor']
            },
            {
                name: 'tb_recurring_patterns_student', 
                fields: ['obj_student']
            },
            {
                name: 'tb_recurring_patterns_day_time', 
                fields: ['str_day_of_week', 'str_start_time']
            }
        ],
        underscored: true,
    });

    RecurringBookingPattern.associate = (db) => {
        RecurringBookingPattern.belongsTo(db.Tutor, { foreignKey: 'obj_tutor', as: 'tutor' });
        RecurringBookingPattern.belongsTo(db.Student, { foreignKey: 'obj_student', as: 'student' });
        RecurringBookingPattern.belongsTo(db.Payment, { foreignKey: 'obj_paymentId', as: 'payment' });
        RecurringBookingPattern.belongsTo(db.User, { foreignKey: 'objectId_createdBy', as: 'createdBy' });
        RecurringBookingPattern.hasMany(db.Slot, { foreignKey: 'obj_recurringPatternId', as: 'slots' });
    };

    return RecurringBookingPattern;
};
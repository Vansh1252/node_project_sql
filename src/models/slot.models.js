// models/Slot.js
const { DataTypes } = require('sequelize');
const { tables, attendnace, slotstatus } = require('../constants/sequelizetableconstants');

module.exports = (sequelize) => {
    const Slot = sequelize.define(tables.SLOT, {
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
            allowNull: true,
        },
        obj_recurringPatternId: {
            type: DataTypes.UUID,
            references: {
                model: tables.RECURRING_BOOKING_PATTERN,
                key: 'id',
            },
            allowNull: true,
        },
        dt_date: {
            type: DataTypes.DATEONLY,
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
        int_startMinutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        int_endMinutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        str_attendance: {
            type: DataTypes.ENUM(attendnace.ATTENDED, attendnace.MISSED),
            allowNull: true,
        },
        str_status: {
            type: DataTypes.ENUM(slotstatus.AVAILABLE, slotstatus.BOOKED, slotstatus.COMPLETED, slotstatus.CANCELLED),
            defaultValue: slotstatus.AVAILABLE,
            allowNull: false,
        },
        int_tutorPayout: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
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
    }, {
        timestamps: true,
        tableName: tables.SLOT,
        indexes: [
            {
                unique: true,
                name: 'tb_slots_unique_tutor_date_time',
                fields: ['obj_tutor', 'dt_date', 'str_start_time', 'str_end_time']
            },
            {
                name: 'tb_slots_student_date_status', // Short, unique name within 64 characters
                fields: ['obj_student', 'dt_date', 'int_start_minutes', 'int_end_minutes', 'str_status']
            },
            {
                name: 'tb_slots_date_status', // Explicit name for clarity
                fields: ['dt_date', 'str_status']
            },
            {
                name: 'tb_slots_recurring_pattern', // Explicit name for clarity
                fields: ['obj_recurring_pattern_id']
            }
        ],
        underscored: true,
    });

    Slot.associate = (db) => {
        Slot.belongsTo(db.Tutor, { foreignKey: 'obj_tutor', as: 'tutor' });
        Slot.belongsTo(db.Student, { foreignKey: 'obj_student', as: 'student' });
        Slot.belongsTo(db.User, { foreignKey: 'objectId_createdBy', as: 'createdBy' });
        Slot.belongsTo(db.RecurringBookingPattern, { foreignKey: 'obj_recurringPatternId', as: 'recurringPattern' });
    };

    return Slot;
};
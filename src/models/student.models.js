// models/Student.js
const { DataTypes } = require('sequelize');
const { tables, userStatus } = require('../constants/sequelizetableconstants');

module.exports = (sequelize) => {
    const Student = sequelize.define(tables.STUDENT, {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false,
        },
        int_studentNumber: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true,
        },
        str_firstName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_lastName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_familyName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_grade: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_year: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true, // Unique at student profile level
            validate: {
                isEmail: true,
            },
        },
        str_phoneNumber: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        str_address: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_city: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_state: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_country: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        dt_startDate: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        dt_dischargeDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        bln_accountCreated: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        str_referralSource: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        str_meetingLink: {
            type: DataTypes.STRING(2048), // URL can be long
            allowNull: true,
        },
        objectId_assignedTutor: { // Renamed from objectId_assignedTutor
            type: DataTypes.UUID,
            references: {
                model: tables.TUTOR, // Name of the Tutor table
                key: 'id',
            },
            allowNull: true,
        },
        str_timezone: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        int_sessionDuration: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        str_status: {
            type: DataTypes.ENUM(userStatus.ACTIVE, userStatus.INACTIVE, userStatus.PAUSED),
            defaultValue: userStatus.ACTIVE,
            allowNull: false,
        },
        objectId_createdBy: { // User who created this student profile
            type: DataTypes.UUID,
            references: {
                model: tables.USERS, // Name of the User table
                key: 'id',
            },
            allowNull: false,
        }
    }, {
        timestamps: true,
        tableName: tables.STUDENT,
            underscored: true, // ✅ recommended

    });

      Student.associate = (db) => {
        Student.belongsTo(db.User, { foreignKey: 'objectId_createdBy', as: 'createdBy' });
        Student.belongsTo(db.Tutor, { foreignKey: 'objectId_assignedTutor', as: 'assignedTutor' });
        Student.hasMany(db.Slot, { foreignKey: 'obj_student', as: 'slots' }); // obj_student in Slot model
        Student.hasMany(db.Payment, { foreignKey: 'obj_studentId', as: 'payments' }); // obj_studentId in Payment model
        Student.hasMany(db.RecurringBookingPattern, { foreignKey: 'obj_student', as: 'recurringPatterns' }); // obj_student in RecurringBookingPattern
        // Student.hasMany(db.Assessment, { foreignKey: 'studentId', as: 'assessments' }); // If you re-add Assessment
        // Student.hasMany(db.StudentAuditLog, { foreignKey: 'studentId', as: 'auditLogs' }); // If you re-add StudentAuditLog
    };

    return Student;
};
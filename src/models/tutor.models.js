const { DataTypes } = require('sequelize');
const { tables, userStatus } = require('../constants/sequelizetableconstants');

module.exports = (sequelize) => {
    const Tutor = sequelize.define(tables.TUTOR, {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false,
        },
        str_firstName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_lastName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
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
        str_province: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_postalCode: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_country: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        int_rate: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        str_timezone: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_status: {
            type: DataTypes.ENUM(userStatus.ACTIVE, userStatus.INACTIVE),
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
        }
    }, {
        timestamps: true,
        tableName: tables.TUTOR,
            underscored: true, 

    });

    Tutor.associate = (db) => {
        Tutor.belongsTo(db.User, { foreignKey: 'objectId_createdBy', as: 'createdBy' });
        Tutor.hasMany(db.Student, { foreignKey: 'objectId_assignedTutor', as: 'assignedStudents' });
        Tutor.hasMany(db.WeeklyHourBlock, { foreignKey: 'tutorId', as: 'weeklyHours', sourceKey: 'id' });
        Tutor.hasMany(db.Slot, { foreignKey: 'obj_tutor', as: 'slots' });
        Tutor.hasMany(db.Payment, { foreignKey: 'obj_tutorId', as: 'payments' });
        Tutor.hasMany(db.RecurringBookingPattern, { foreignKey: 'obj_tutor', as: 'recurringPatterns' });
    };

    return Tutor;
};

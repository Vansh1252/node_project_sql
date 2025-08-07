// models/User.js
const { DataTypes } = require('sequelize');
const { tables, roles, userStatus } = require('../constants/sequelizetableconstants');

module.exports = (sequelize) => {
    const User = sequelize.define(tables.USERS, {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false,
        },
        str_fullName: {
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
        str_password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_role: {
            type: DataTypes.ENUM(roles.ADMIN, roles.STUDENT, roles.TUTOR),
            defaultValue: roles.ADMIN,
            allowNull: false,
        },
        obj_profileId: { // Renamed from ObjectId_profileId for Sequelize
            type: DataTypes.UUID, // Will store the UUID of the associated Student or Tutor
            allowNull: true, // Can be null initially or if profile not yet created
        },
        str_profileType: { // Stores the type of profile (e.g., 'Student', 'Tutor')
            type: DataTypes.ENUM(tables.STUDENT, tables.TUTOR),
            allowNull: true,
        },
        str_status: {
            type: DataTypes.ENUM(userStatus.ACTIVE, userStatus.INACTIVE),
            defaultValue: userStatus.ACTIVE,
            allowNull: false,
        },
        resetToken: { // For password reset
            type: DataTypes.STRING,
            allowNull: true,
        },
        resetTokenExpiration: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        timestamps: true, // Adds createdAt and updatedAt fields
        tableName: tables.USERS, // Ensure table name matches constant
        underscored: true, // ✅ recommended

    });
    User.associate = (db) => {
        User.hasMany(db.RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
    };

    return User;
};
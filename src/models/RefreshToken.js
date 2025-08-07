// models/RefreshToken.js
const { DataTypes } = require('sequelize');
const { tables } = require('../constants/sequelizetableconstants');

module.exports = (sequelize) => {
    const RefreshToken = sequelize.define(tables.REFRESH_TOKEN, { // Use a singular name for the model
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false,
        },
        str_refreshToken: {
            type: DataTypes.STRING(512), // Adjust length as needed for JWTs
            allowNull: false,
            unique: true,
        },
        str_device: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        str_ip: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        userId: { 
            type: DataTypes.UUID,
            references: {
                model: tables.USERS, 
                key: 'id',
            },
            allowNull: false,
        },
    }, {
        timestamps: true, // Adds createdAt and updatedAt
        tableName: tables.REFRESH_TOKEN, // Explicit table name (Sequelize defaults to plural)
            underscored: true, // ✅ recommended

    });

      RefreshToken.associate = (db) => {
        RefreshToken.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
    };

    return RefreshToken;
};
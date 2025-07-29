const { DataTypes } = require('sequelize');
const { roles, userStatus, tables } = require('../constants/sequelizetableconstants');

module.exports = (sequelize) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        str_fullName: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_fullName'
        },
        str_email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            field: 'str_email'
        },
        str_password: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_password'
        },
        str_role: {
            type: DataTypes.ENUM(roles.ADMIN, roles.STUDENT, roles.TUTOR),
            allowNull: false,
            defaultValue: roles.ADMIN,
            field: 'str_role'
        },
        obj_profileId: {
            type: DataTypes.UUID,
            allowNull: true,
            field: 'obj_profileId'
        },
        obj_profileType: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'obj_profileType'
        },
        str_status: {
            type: DataTypes.ENUM(userStatus.ACTIVE, userStatus.INACTIVE),
            defaultValue: userStatus.ACTIVE,
            field: 'str_status'
        },
        str_resetToken: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'str_resetToken'
        },
        str_resetTokenExpiration: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'str_resetTokenExpiration'
        }
    }, {
        tableName: tables.USERS,
        timestamps: true,
        underscored: true
    });

    User.associate = (models) => {
        User.hasOne(models.Student, {
            foreignKey: 'obj_profileId',
            constraints: false,
            scope: { obj_profileType: roles.STUDENT },
            as: 'studentProfile'
        });

        User.hasOne(models.Tutor, {
            foreignKey: 'obj_profileId',
            constraints: false,
            scope: { obj_profileType: roles.TUTOR },
            as: 'tutorProfile'
        });

        User.hasMany(models.Student, { foreignKey: 'objectId_createdBy', as: 'createdStudents' });
        User.hasMany(models.Tutor, { foreignKey: 'objectId_createdBy', as: 'createdTutors' });
        User.hasMany(models.Slot, { foreignKey: 'objectId_createdBy', as: 'createdSlots' });
    };

    return User;
};

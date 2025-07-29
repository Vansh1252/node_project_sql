const { DataTypes } = require('sequelize');
const { userStatus, tables } = require('../constants/sequelizetableconstants');

module.exports = (sequelize) => {
    const Tutor = sequelize.define('Tutor', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        str_firstName: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_firstName'
        },
        str_lastName: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_lastName'
        },
        str_email: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false,
            field: 'str_email'
        },
        str_phoneNumber: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false,
            field: 'str_phoneNumber'
        },
        str_address: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_address'
        },
        str_city: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_city'
        },
        str_province: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_province'
        },
        str_postalCode: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_postalCode'
        },
        str_country: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_country'
        },
        int_rate: {
            type: DataTypes.FLOAT,
            allowNull: false,
            field: 'int_rate'
        },
        str_timezone: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_timezone'
        },
        objectId_createdBy: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'objectId_createdBy'
        },
        str_status: {
            type: DataTypes.ENUM(userStatus.ACTIVE, userStatus.INACTIVE),
            defaultValue: userStatus.ACTIVE,
            field: 'str_status'
        }
    }, {
        tableName: tables.TUTOR, // Use tables constant
        timestamps: true,
        underscored: true
    });

    Tutor.associate = (models) => {
        Tutor.belongsTo(models.User, { foreignKey: 'objectId_createdBy', as: 'createdBy' });
        Tutor.belongsToMany(models.Student, { through: 'TutorStudents', foreignKey: 'obj_tutorId', otherKey: 'obj_studentId', as: 'arr_assignedStudents' });

        // Polymorphic association to AvailabilitySlot
        Tutor.hasMany(models.AvailabilitySlot, {
            foreignKey: 'obj_entityId',
            constraints: false,
            scope: { obj_entityType: 'Tutor' },
            as: 'arr_weeklyAvailability'
        });
    };

    return Tutor;
};

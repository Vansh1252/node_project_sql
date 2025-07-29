const { DataTypes } = require('sequelize');
const { attendnace, slotstatus, tables } = require('../constants/sequelizetableconstants'); // Adjust path as needed

module.exports = (sequelize) => {
    const Slot = sequelize.define('Slot', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        obj_tutor: { // Foreign key
            type: DataTypes.UUID,
            allowNull: false,
            field: 'obj_tutor'
        },
        obj_student: { // Foreign key
            type: DataTypes.UUID,
            allowNull: true,
            field: 'obj_student'
        },
        dt_date: {
            type: DataTypes.DATEONLY, // Date only for the specific day
            allowNull: false,
            field: 'dt_date'
        },
        str_startTime: {
            type: DataTypes.STRING, // Store as string "HH:mm"
            allowNull: false,
            field: 'str_startTime'
        },
        str_endTime: {
            type: DataTypes.STRING, // Store as string "HH:mm"
            allowNull: false,
            field: 'str_endTime'
        },
        str_attendance: {
            type: DataTypes.ENUM(attendnace.ATTENDED, attendnace.MISSED),
            allowNull: true, // `null` is a valid default
            field: 'str_attendance'
        },
        str_status: {
            type: DataTypes.ENUM(slotstatus.AVAILABLE, slotstatus.BOOKED, slotstatus.COMPLETED, slotstatus.CANCELLED),
            defaultValue: slotstatus.AVAILABLE,
            field: 'str_status'
        },
        int_tutorPayout: {
            type: DataTypes.FLOAT, // Use FLOAT for currency
            defaultValue: 0,
            field: 'int_tutorPayout'
        },
        objectId_createdBy: {
            type: DataTypes.UUID, // Foreign key to User
            allowNull: false,
            field: 'objectId_createdBy'
        }
    }, {
        tableName: tables.SLOT,
        timestamps: true,
        underscored: true,
        indexes: [
            {
                unique: true,
                fields: ['obj_tutor', 'dt_date', 'str_startTime', 'str_endTime']
            }
        ]
    });

    Slot.associate = (models) => {
        Slot.belongsTo(models.Tutor, { foreignKey: 'obj_tutor', as: 'tutor' });
        Slot.belongsTo(models.Student, { foreignKey: 'obj_student', as: 'student' });
        Slot.belongsTo(models.User, { foreignKey: 'objectId_createdBy', as: 'createdBy' });
    };

    return Slot;
};
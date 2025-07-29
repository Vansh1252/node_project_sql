// tutorStudents.model.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('TutorStudents', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        obj_tutorId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        obj_studentId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
    }, {
        tableName: 'TutorStudents',
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['obj_tutorId', 'obj_studentId'],
            },
        ],
    })
};

const { DataTypes } = require('sequelize');
const { tables } = require('../constants/sequelizetableconstants'); 

module.exports = (sequelize) => {
    const AvailabilitySlot = sequelize.define('AvailabilitySlot', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        obj_entityId: { 
            type: DataTypes.UUID,
            allowNull: false,
            field: 'obj_entityId'
        },
        obj_entityType: {
            type: DataTypes.ENUM('Tutor', 'Student'),
            allowNull: false,
            field: 'obj_entityType'
        },
        str_day: { 
            type: DataTypes.STRING(10), 
            allowNull: false,
            field: 'str_day'
        },
        str_start: { 
            type: DataTypes.STRING(5), 
            allowNull: false,
            field: 'str_start'
        },
        str_end: { 
            type: DataTypes.STRING(5), 
            allowNull: false,
            field: 'str_end'
        }
    }, {
        tableName: tables.AVAILABILITY_SLOT,
        timestamps: false,
        underscored: true,
        indexes: [
            {
                unique: true,
                fields: ['obj_entityId', 'obj_entityType', 'str_day', 'str_start', 'str_end'],
                name: 'unique_entity_day_slot'
            }
        ]
    });
    AvailabilitySlot.associate = (models) => {
        AvailabilitySlot.belongsTo(models.Tutor, {
            foreignKey: 'obj_entityId',
            constraints: false,
            scope: { obj_entityType: 'Tutor' },
            as: 'tutor'
        });
        AvailabilitySlot.belongsTo(models.Student, {
            foreignKey: 'obj_entityId',
            constraints: false,
            scope: { obj_entityType: 'Student' },
            as: 'student'
        });
    }
    return AvailabilitySlot;
};

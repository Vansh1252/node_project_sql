const { DataTypes } = require('sequelize');
const { tables } = require('../constants/sequelizetableconstants');

module.exports = (sequelize) => {
  const WeeklyHourBlock = sequelize.define(tables.WEEKLY_HOUR_BLOCK, {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    str_day: {
      type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
      allowNull: false,
    },
    str_start: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    str_end: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    int_start_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    int_end_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tutor_id: {
      type: DataTypes.UUID,
      references: {
        model: tables.TUTOR,
        key: 'id',
      },
      allowNull: false,
    }
  }, {
    timestamps: true,
    tableName: tables.WEEKLY_HOUR_BLOCK,
    underscored: true, 
    indexes: [
      {
        unique: true,
        fields: ['tutor_id', 'str_day', 'str_start', 'str_end']
      }
    ]
  });

  WeeklyHourBlock.associate = (db) => {
    WeeklyHourBlock.belongsTo(db.Tutor, { foreignKey: 'tutor_id', as: 'tutor' });
  };

  return WeeklyHourBlock;
};

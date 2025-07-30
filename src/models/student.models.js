const { DataTypes } = require('sequelize');
const { userStatus, tables } = require('../constants/sequelizetableconstants');

module.exports = (sequelize) => {
    const Student = sequelize.define('Student', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        int_studentNumber: {
            type: DataTypes.INTEGER,
            unique: true,
            allowNull: false,
            field: 'int_studentNumber'
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
        str_familyName: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_familyName'
        },
        str_grade: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_grade'
        },
        str_year: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_year'
        },
        str_email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            field: 'str_email'
        },
        str_phoneNumber: {
            type: DataTypes.STRING,
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
        str_state: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_state'
        },
        str_country: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_country'
        },
        dt_startDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            field: 'dt_startDate'
        },
        dt_dischargeDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            field: 'dt_dischargeDate'
        },
        bln_accountCreated: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            field: 'bln_accountCreated'
        },
        str_referralSource: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'str_referralSource'
        },
        str_meetingLink: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'str_meetingLink'
        },
        objectId_assignedTutor: {
            type: DataTypes.UUID,
            allowNull: true,
            field: 'objectId_assignedTutor'
        },
        str_timezone: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'str_timezone'
        },
        int_sessionDuration: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'int_sessionDuration'
        },
        str_paymentMethod: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'str_paymentMethod'
        },
        int_transactionFee: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'int_transactionFee'
        },
        int_totalAmount: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'int_totalAmount'
        },
        int_tutorPayout: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'int_tutorPayout'
        },
        int_profitWeek: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'int_profitWeek'
        },
        int_profitMonth: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'int_profitMonth'
        },
        arr_assessments: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: [],
            field: 'arr_assessments'
        },
        str_status: {
            type: DataTypes.ENUM(userStatus.ACTIVE, userStatus.INACTIVE, userStatus.PAUSED),
            defaultValue: userStatus.ACTIVE,
            field: 'str_status'
        },
        objectId_createdBy: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'objectId_createdBy'
        }
    }, {
        tableName: tables.STUDENT,
        timestamps: true,
        underscored: true
    });

    Student.associate = (models) => {
        Student.belongsTo(models.User, { foreignKey: 'objectId_createdBy', as: 'obj_createdBy' });
        Student.belongsTo(models.Tutor, { foreignKey: 'objectId_assignedTutor', as: 'obj_assignedTutor' });
        Student.belongsToMany(models.Tutor, { through: tables.TUTOR_STUDENTS, foreignKey: 'obj_studentId', otherKey: 'obj_tutorId', as: 'assignedTutors' });
        Student.hasMany(models.AvailabilitySlot, {
            foreignKey: 'obj_entityId',
            constraints: false,
            scope: { obj_entityType: 'Student' },
            as: 'arr_weeklyAvailability'
        });
    };

    return Student;
};

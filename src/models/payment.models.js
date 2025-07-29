const { DataTypes } = require('sequelize');
const { paymentstatus, tables } = require('../constants/sequelizetableconstants'); // Adjust path as needed

module.exports = (sequelize) => {
    const Payment = sequelize.define('Payment', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        str_razorpayOrderId: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_razorpayOrderId'
        },
        str_razorpayPaymentId: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_razorpayPaymentId'
        },
        str_razorpaySignature: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_razorpaySignature'
        },
        obj_studentId: { // Foreign key
            type: DataTypes.UUID,
            allowNull: false,
            field: 'obj_studentId'
        },
        obj_tutorId: { // Foreign key
            type: DataTypes.UUID,
            allowNull: false,
            field: 'obj_tutorId'
        },
        int_amount: {
            type: DataTypes.FLOAT,
            allowNull: false,
            field: 'int_amount'
        },
        int_transactionFee: {
            type: DataTypes.FLOAT,
            allowNull: false,
            field: 'int_transactionFee'
        },
        int_totalAmount: {
            type: DataTypes.FLOAT,
            allowNull: false,
            field: 'int_totalAmount'
        },
        str_paymentMethod: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'str_paymentMethod'
        },
        obj_slotId: { // Foreign key
            type: DataTypes.UUID,
            allowNull: false,
            field: 'obj_slotId'
        },
        str_status: {
            type: DataTypes.ENUM(paymentstatus.PENDING, paymentstatus.COMPLETED, paymentstatus.FAILED),
            defaultValue: paymentstatus.PENDING,
            field: 'str_status'
        }
    }, {
        tableName: tables.PAYMENT,
        timestamps: true,
        underscored: true
    });

    Payment.associate = (models) => {
        Payment.belongsTo(models.Student, { foreignKey: 'obj_studentId', as: 'student' });
        Payment.belongsTo(models.Tutor, { foreignKey: 'obj_tutorId', as: 'tutor' });
        Payment.belongsTo(models.Slot, { foreignKey: 'obj_slotId', as: 'slot' });
    };

    return Payment;
};
// MongoDB collection names used throughout the project
exports.tables = {
    USERS: "tb_users",
    STUDENT: "tb_students",
    TUTOR: "tb_tutors",
    SLOT: "tb_slots",
    PAYMENT: "tb_payments",
    AVAILABILITY_SLOT: "tb_availability_slots", 
    TUTOR_STUDENTS: "tb_tutor_students"   
};

exports.roles = {
    ADMIN: "admin",
    STUDENT: "student",
    TUTOR: "tutor",

}

exports.slotstatus = {
    AVAILABLE: "available",
    BOOKED: "booked",
    COMPLETED: "completed",
    CANCELLED: "cancelled"
}

exports.attendnace = {
    ATTENDED: "attended",
    MISSED: "missed"
}

exports.userStatus = {
    ACTIVE: "active",
    INACTIVE: "inactive",
    PAUSED: "paused"
}

exports.paymentstatus = {
    PENDING: "pending",
    COMPLETED: "completed",
    FAILED: "failed"
}
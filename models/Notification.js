const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lead: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead'
    },
    task: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task'
    },
    type: {
        type: String,
        enum: ['status_change', 'comment', 'assignment', 'reassignment', 'task_created', 'task_completed'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    read: {
        type: Boolean,
        default: false
    },
    readAt: {
        type: Date
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);

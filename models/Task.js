const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    lead: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    dueDate: {
        type: Date,
        required: true
    },
    action: {
        type: String,
        enum: ['call', 'email', 'meeting', 'follow-up', 'demo', 'site-visit', 'other'],
        required: true,
        default: 'follow-up'
    },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    statusUpdates: [{
        text: String,
        authorName: String,
        timestamp: { type: Date, default: Date.now }
    }],
    remarks: {
        type: String,
        trim: true
    },
    reminder: {
        enabled: { type: Boolean, default: false },
        time: { type: Date },
        sent: { type: Boolean, default: false }
    },
    notes: {
        type: String,
        trim: true
    },
    completedAt: {
        type: Date
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

taskSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    if (this.status === 'completed' && !this.completedAt) {
        this.completedAt = Date.now();
    }
    next();
});

module.exports = mongoose.model('Task', taskSchema);

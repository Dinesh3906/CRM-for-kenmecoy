const mongoose = require('mongoose');

const communicationSchema = new mongoose.Schema({
    lead: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        required: true
    },
    type: {
        type: String,
        enum: ['email', 'whatsapp', 'call', 'meeting', 'note'],
        required: true
    },
    direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        default: 'outbound'
    },
    subject: {
        type: String,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    from: {
        type: String,
        trim: true
    },
    to: {
        type: String,
        trim: true,
        required: true
    },
    cc: [{
        type: String,
        trim: true
    }],
    attachments: [{
        filename: String,
        path: String,
        mimetype: String,
        size: Number
    }],
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'failed', 'pending'],
        default: 'pending'
    },
    metadata: {
        messageId: String,
        whatsappId: String,
        callDuration: Number,
        meetingDuration: Number
    },
    sentBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
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

communicationSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Index for faster queries
communicationSchema.index({ lead: 1, createdAt: -1 });
communicationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Communication', communicationSchema);

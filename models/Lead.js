const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
    companyName: {
        type: String,
        required: true,
        trim: true
    },
    customerCode: {
        type: String,
        trim: true
    },
    gstNo: {
        type: String,
        trim: true
    },
    category: {
        type: String,
        enum: ['Corporate Office', 'Plant / Site', 'Other office', ''],
        trim: true
    },
    contactPerson: {
        type: String,
        trim: true
    },
    designation: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    mobile: {
        type: String,
        trim: true
    },
    address: {
        type: String,
        trim: true
    },
    contacts: [{
        name: { type: String, trim: true },
        designation: { type: String, trim: true },
        mobile: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true }
    }],
    status: {
        type: String,
        default: 'New Lead'
    },
    statusDetails: {
        type: String,
        trim: true
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
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    notes: [{
        content: String,
        createdAt: {
            type: Date,
            default: Date.now
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    timeline: [{
        action: {
            type: String,
            enum: ['created', 'updated', 'status_changed', 'assigned', 'note_added', 'email_sent', 'whatsapp_sent', 'call_made', 'meeting_held', 'file_attached', 'task_created']
        },
        description: String,
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        metadata: mongoose.Schema.Types.Mixed,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    attachments: [{
        filename: String,
        originalName: String,
        path: String,
        mimetype: String,
        size: Number,
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    customFields: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    tags: [{
        type: String,
        trim: true
    }],
    lastContact: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

// Update the updatedAt field before saving
leadSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Lead', leadSchema); 
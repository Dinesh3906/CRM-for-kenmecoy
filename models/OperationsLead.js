const mongoose = require('mongoose');

const operationsLeadSchema = new mongoose.Schema({
    ticketNumber: {
        type: String,
        unique: true,
        sparse: true // Allow null during creation, will be set by pre-save hook
    },
    clientName: {
        type: String,
        required: true,
        trim: true
    },
    company: {
        type: String,
        required: true,
        trim: true
    },
    emails: [{
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        type: {
            type: String,
            enum: ['primary', 'work', 'personal'],
            default: 'primary'
        }
    }],
    phones: [{
        phone: {
            type: String,
            trim: true
        },
        type: {
            type: String,
            enum: ['mobile', 'work', 'home'],
            default: 'mobile'
        }
    }],
    status: {
        type: String,
        default: 'new-request'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    category: {
        type: String,
        enum: ['support', 'maintenance', 'installation', 'complaint', 'query', 'other'],
        default: 'support'
    },
    description: {
        type: String,
        trim: true
    },
    resolution: {
        type: String,
        trim: true
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    estimatedTime: {
        type: Number, // in hours
        default: 0
    },
    actualTime: {
        type: Number, // in hours
        default: 0
    },
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
        },
        description: String
    }],
    timeline: [{
        action: String,
        description: String,
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        metadata: mongoose.Schema.Types.Mixed
    }],
    tags: [String],
    source: {
        type: String,
        enum: ['phone', 'email', 'website', 'chat', 'referral', 'walk-in', 'other'],
        default: 'phone'
    },
    sla: {
        responseTime: Number, // in minutes
        resolutionTime: Number, // in minutes
        status: {
            type: String,
            enum: ['met', 'at-risk', 'breached'],
            default: 'met'
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    closedAt: {
        type: Date
    }
});

// Auto-generate ticket number
operationsLeadSchema.pre('save', async function(next) {
    if (this.isNew && !this.ticketNumber) {
        try {
            // Find the last ticket number and increment
            const lastTicket = await mongoose.model('OperationsLead')
                .findOne({}, { ticketNumber: 1 })
                .sort({ createdAt: -1 })
                .lean();
            
            let nextNumber = 1;
            if (lastTicket && lastTicket.ticketNumber) {
                const match = lastTicket.ticketNumber.match(/OPS-(\d+)/);
                if (match) {
                    nextNumber = parseInt(match[1]) + 1;
                }
            }
            
            this.ticketNumber = `OPS-${String(nextNumber).padStart(6, '0')}`;
        } catch (error) {
            console.error('Error generating ticket number:', error);
            // Fallback to timestamp-based
            this.ticketNumber = `OPS-${Date.now()}`;
        }
    }
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('OperationsLead', operationsLeadSchema);

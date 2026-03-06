const mongoose = require('mongoose');

const pipelineSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    columns: [{
        id: {
            type: String,
            required: true,
            trim: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        icon: {
            type: String,
            default: 'fas fa-circle'
        },
        color: {
            type: String,
            default: '#667eea'
        },
        order: {
            type: Number,
            required: true
        },
        statusMapping: {
            type: String,
            enum: ['new', 'work-in-progress', 'test-assignment', 'won', 'lost']
        }
    }],
    isDefault: {
        type: Boolean,
        default: false
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

// Update the updatedAt field before saving
pipelineSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Pipeline', pipelineSchema); 
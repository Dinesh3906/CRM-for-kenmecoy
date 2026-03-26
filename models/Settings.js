const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    company: {
        name: { type: String, trim: true },
        logo: { type: String }, // URL or path to logo
        website: { type: String, trim: true },
        address: { type: String, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true }
    },
    email: {
        senderName: { type: String, default: 'CRM System' },
        senderEmail: { type: String },
        smtpHost: { type: String },
        smtpPort: { type: Number, default: 587 },
        smtpUser: { type: String },
        smtpPassword: { type: String },
        smtpSecure: { type: Boolean, default: false }
    },
    whatsapp: {
        apiKey: { type: String },
        phoneNumberId: { type: String },
        businessAccountId: { type: String },
        enabled: { type: Boolean, default: false }
    },
    pipeline: {
        defaultStages: {
            type: [String],
            default: ['qualification', 'meeting', 'proposal', 'negotiation', 'closed', 'lost']
        },
        customStages: [{
            name: String,
            color: String,
            order: Number
        }]
    },
    notifications: {
        emailNotifications: { type: Boolean, default: true },
        taskReminders: { type: Boolean, default: true },
        leadAssignments: { type: Boolean, default: true },
        dailyDigest: { type: Boolean, default: false }
    },
    customFields: {
        leads: [{
            name: String,
            label: String,
            type: { type: String, enum: ['text', 'number', 'date', 'dropdown', 'checkbox', 'textarea'] },
            options: [String],
            required: Boolean,
            order: Number
        }]
    },
    backup: {
        autoBackup: { type: Boolean, default: true },
        backupFrequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
        lastBackup: { type: Date }
    },
    invoiceDefaults: {
        defaultSignatoryName: { type: String, trim: true },
        defaultSealUrl: { type: String },
        defaultTemplate: { type: String, enum: ['image1', 'image2'], default: 'image1' }
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

settingsSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Settings', settingsSchema);

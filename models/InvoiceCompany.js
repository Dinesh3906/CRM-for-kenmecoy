const mongoose = require('mongoose');

const invoiceCompanySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    tagline: {
        type: String,
        trim: true,
        default: 'Sourcing · Recruiting · Onboarding'
    },
    sacCode: {
        type: String,
        trim: true,
        default: '998516'
    },
    panNumber: {
        type: String,
        trim: true
    },
    accountName: {
        type: String,
        trim: true
    },
    bankName: {
        type: String,
        trim: true
    },
    branchName: {
        type: String,
        trim: true
    },
    caNumber: {
        type: String,
        trim: true
    },
    gstn: {
        type: String,
        trim: true
    },
    isPrimary: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
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

invoiceCompanySchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('InvoiceCompany', invoiceCompanySchema);

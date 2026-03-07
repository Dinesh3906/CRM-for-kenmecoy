const mongoose = require('mongoose');

const invoiceCustomerSchema = new mongoose.Schema({
    customerId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        type: String,
        trim: true
    },
    contactNo: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    gstNo: {
        type: String,
        trim: true,
        uppercase: true
    },
    vendorCode: {
        type: String,
        trim: true,
        default: 'NA'
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

invoiceCustomerSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('InvoiceCustomer', invoiceCustomerSchema);

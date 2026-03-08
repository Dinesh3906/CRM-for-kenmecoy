const mongoose = require('mongoose');

const invoiceCounterSchema = new mongoose.Schema({
    financialYear: {
        type: String,
        required: true,
        unique: true,
        trim: true
        // e.g., "2526", "2627"
    },
    currentSequence: {
        type: Number,
        default: 0,
        min: 0
    },
    prefix: {
        type: String,
        default: 'KM',
        trim: true
        // Invoice number format: [prefix]/[financialYear]/[sequence]
        // e.g., KM/2526/001
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

invoiceCounterSchema.statics.getNextInvoiceNumber = async function(financialYear, prefix = 'KM') {
    const counter = await this.findOneAndUpdate(
        { financialYear, prefix },
        { 
            $inc: { currentSequence: 1 },
            $set: { updatedAt: Date.now() }
        },
        { upsert: true, new: true }
    );
    
    const sequence = String(counter.currentSequence).padStart(3, '0');
    return `${prefix}/${financialYear}/${sequence}`;
};

invoiceCounterSchema.statics.resetSequence = async function(financialYear, prefix = 'KM') {
    return await this.findOneAndUpdate(
        { financialYear, prefix },
        { currentSequence: 0, updatedAt: Date.now() },
        { upsert: true, new: true }
    );
};

invoiceCounterSchema.statics.setSequence = async function(financialYear, sequence, prefix = 'KM') {
    return await this.findOneAndUpdate(
        { financialYear, prefix },
        { currentSequence: sequence, updatedAt: Date.now() },
        { upsert: true, new: true }
    );
};

module.exports = mongoose.model('InvoiceCounter', invoiceCounterSchema);

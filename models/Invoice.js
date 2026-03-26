const mongoose = require('mongoose');

// Snapshot of billing company at invoice creation time
const companySnapshotSchema = {
    name: String,
    tagline: String,
    logo: String,
    sacCode: String,
    panNumber: String,
    accountName: String,
    bankName: String,
    branchName: String,
    caNumber: String,
    gstn: String
};

const candidateSchema = new mongoose.Schema({
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
    level: { type: String, trim: true },
    dateOfJoining: { type: Date }
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    invoiceDate: {
        type: Date,
        default: Date.now
    },
    dueDate: {
        type: Date
    },
    // Snapshot of customer details at invoice time
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InvoiceCustomer',
        required: true
    },
    customerSnapshot: {
        customerId: String,
        name: String,
        address: String,
        contactNo: String,
        email: String,
        gstNo: String,
        vendorCode: String
    },
    deptCode: {
        type: String,
        trim: true,
        default: 'NA'
    },
    poId: {
        type: String,
        trim: true
    },
    serviceType: {
        type: String,
        enum: ['sourcing', 'assessment', 'both'],
        default: 'sourcing'
    },
    chargesFor: {
        type: String,
        trim: true,
        default: ''
    },
    candidates: [candidateSchema],
    // Financial fields
    chargeableSalary: {
        type: Number,
        required: true,
        min: 0
    },
    rate: {
        type: Number,
        required: true,
        min: 0,
        comment: 'Percentage, e.g. 8.33 means 8.33%'
    },
    chargeableAmount: {
        type: Number,
        default: 0
    },
    cgst: {
        type: Number,
        default: 0
    },
    sgst: {
        type: Number,
        default: 0
    },
    igst: {
        type: Number,
        default: 0
    },
    totalGst: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        default: 0
    },
    netPayable: {
        type: Number,
        default: 0
    },
    // Payment tracking
    paymentStatus: {
        type: String,
        enum: ['unpaid', 'paid', 'overdue', 'partial'],
        default: 'unpaid'
    },
    receivableAmount: {
        type: Number,
        default: 0
    },
    tdsAmount: {
        type: Number,
        default: 0
    },
    receivedDate: {
        type: Date
    },
    notes: {
        type: String,
        trim: true
    },
    // Billing company (who is invoicing)
    billingCompany: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InvoiceCompany'
    },
    billingCompanySnapshot: companySnapshotSchema,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Permission & editing tracking
    isLocked: {
        type: Boolean,
        default: false,
        comment: 'If true, only superadmin can edit financial details. Invoice number and date cannot be changed.'
    },
    lastEditedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastEditedAt: {
        type: Date
    },
    editHistory: [{
        editedBy: mongoose.Schema.Types.ObjectId,
        editedAt: Date,
        changedFields: [String]
    }],
    // Digital signatures
    signatures: [{
        signedBy: mongoose.Schema.Types.ObjectId,
        signedAt: Date,
        signatoryName: String,
        signatureImage: String, // Base64 encoded drawn signature
        sealImage: String,      // Base64 encoded company seal/stamp
        _id: false
    }],
    // Attachments
    attachments: [{
        type: {
            type: String,
            enum: ['customer-agreement', 'offer-letter', 'other'],
            default: 'other'
        },
        fileName: String,
        fileUrl: String, // Path or URL to the file
        uploadedAt: Date,
        uploadedBy: mongoose.Schema.Types.ObjectId,
        _id: false
    }],
    // Approval workflow
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    approvalNote: {
        type: String,
        trim: true
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: {
        type: Date
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

// Auto-calculate derived fields before saving
invoiceSchema.pre('save', function (next) {
    this.updatedAt = Date.now();

    // Calculate chargeable amount: salary × (rate/100)
    this.chargeableAmount = Math.round(this.chargeableSalary * (this.rate / 100) * 100) / 100;

    // Determine GST type based on customer GSTN
    const gstNo = (this.customerSnapshot && this.customerSnapshot.gstNo) || '';
    const isMaharashtra = gstNo.startsWith('27');

    if (isMaharashtra) {
        this.cgst = Math.round(this.chargeableAmount * 0.09 * 100) / 100;
        this.sgst = Math.round(this.chargeableAmount * 0.09 * 100) / 100;
        this.igst = 0;
    } else {
        this.cgst = 0;
        this.sgst = 0;
        this.igst = Math.round(this.chargeableAmount * 0.18 * 100) / 100;
    }

    this.totalGst = Math.round((this.cgst + this.sgst + this.igst) * 100) / 100;
    this.totalAmount = Math.round((this.chargeableAmount + this.totalGst) * 100) / 100;
    this.netPayable = Math.round(this.totalAmount);

    // NOTE: Due date is now mandatory and must be provided by user (no auto-calculation)

    next();
});

// Check for overdue status
invoiceSchema.virtual('isOverdue').get(function () {
    return this.paymentStatus === 'unpaid' && new Date() > this.dueDate;
});

module.exports = mongoose.model('Invoice', invoiceSchema);

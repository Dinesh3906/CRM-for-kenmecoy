const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const multer = require('multer');
const auth = require('../middleware/auth');
const Invoice = require('../models/Invoice');
const InvoiceCustomer = require('../models/InvoiceCustomer');
const InvoiceCompany = require('../models/InvoiceCompany');
const InvoiceCounter = require('../models/InvoiceCounter');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { getFinancialYear } = require('../utils/invoiceNumbering');
const { generateInvoiceWord } = require('../utils/wordGenerator');
const moment = require('moment-timezone');

// All routes require authentication
router.use(auth);

// ─── Admin-only guard ────────────────────────────────────────────────────────
function adminOnly(req, res, next) {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Admin access required.' });
    }
    next();
}

function superadminOnly(req, res, next) {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only Super Admin can download invoice PDFs.' });
    }
    next();
}

function canAccessInvoice(req, invoice) {
    if (!invoice) return false;
    if (req.user.role === 'superadmin') return true;
    return invoice.createdBy?.toString() === req.user._id.toString();
}

// ════════════════════════════════════════════════════════════
//   BILLING COMPANY ROUTES
// ════════════════════════════════════════════════════════════

// Helper: get company snapshot object
function companySnapshot(c) {
    return {
        name: c.name,
        tagline: c.tagline,
        logo: c.logo,
        sacCode: c.sacCode,
        panNumber: c.panNumber,
        accountName: c.accountName,
        bankName: c.bankName,
        branchName: c.branchName,
        caNumber: c.caNumber,
        gstn: c.gstn
    };
}

// GET /api/invoices/billing-companies  — list all
router.get('/billing-companies', async (req, res) => {
    try {
        const companies = await InvoiceCompany.find().sort({ isPrimary: -1, name: 1 });
        res.json(companies);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/invoices/billing-companies  — create
router.post('/billing-companies', adminOnly, async (req, res) => {
    try {
        const { name, tagline, sacCode, panNumber, accountName, bankName, branchName, caNumber, gstn, isPrimary } = req.body;
        if (isPrimary) {
            await InvoiceCompany.updateMany({}, { isPrimary: false });
        }
        const company = new InvoiceCompany({ name, tagline, sacCode, panNumber, accountName, bankName, branchName, caNumber, gstn, isPrimary: !!isPrimary });
        await company.save();
        res.status(201).json(company);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/invoices/billing-companies/:id  — update
router.put('/billing-companies/:id', adminOnly, async (req, res) => {
    try {
        const { name, tagline, sacCode, panNumber, accountName, bankName, branchName, caNumber, gstn, isPrimary } = req.body;
        if (isPrimary) {
            await InvoiceCompany.updateMany({ _id: { $ne: req.params.id } }, { isPrimary: false });
        }
        const company = await InvoiceCompany.findByIdAndUpdate(
            req.params.id,
            { name, tagline, sacCode, panNumber, accountName, bankName, branchName, caNumber, gstn, isPrimary: !!isPrimary, updatedAt: Date.now() },
            { new: true, runValidators: true }
        );
        if (!company) return res.status(404).json({ message: 'Company not found.' });
        res.json(company);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/invoices/billing-companies/:id  — delete
router.delete('/billing-companies/:id', adminOnly, async (req, res) => {
    try {
        const inUse = await Invoice.exists({ billingCompany: req.params.id });
        if (inUse) {
            return res.status(400).json({ message: 'Cannot delete — invoices exist for this company.' });
        }
        const company = await InvoiceCompany.findByIdAndDelete(req.params.id);
        if (!company) return res.status(404).json({ message: 'Company not found.' });
        res.json({ message: 'Company deleted.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ════════════════════════════════════════════════════════════
//   INVOICE CUSTOMER ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/invoices/customers  — list all customers
router.get('/customers', async (req, res) => {
    try {
        const customers = await InvoiceCustomer.find().sort({ name: 1 });
        res.json(customers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/invoices/customers  — create customer
router.post('/customers', adminOnly, async (req, res) => {
    try {
        const { customerId, name, address, contactNo, email, gstNo, vendorCode } = req.body;
        const customer = new InvoiceCustomer({ customerId, name, address, contactNo, email, gstNo, vendorCode });
        await customer.save();
        res.status(201).json(customer);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Customer ID already exists.' });
        }
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/invoices/customers/:id  — update customer
router.put('/customers/:id', adminOnly, async (req, res) => {
    try {
        const { customerId, name, address, contactNo, email, gstNo, vendorCode } = req.body;
        const customer = await InvoiceCustomer.findByIdAndUpdate(
            req.params.id,
            { customerId, name, address, contactNo, email, gstNo, vendorCode, updatedAt: Date.now() },
            { new: true, runValidators: true }
        );
        if (!customer) return res.status(404).json({ message: 'Customer not found.' });
        res.json(customer);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/invoices/customers/:id  — delete customer
router.delete('/customers/:id', adminOnly, async (req, res) => {
    try {
        const inUse = await Invoice.exists({ customer: req.params.id });
        if (inUse) {
            return res.status(400).json({ message: 'Cannot delete customer — invoices exist for this customer.' });
        }
        const customer = await InvoiceCustomer.findByIdAndDelete(req.params.id);
        if (!customer) return res.status(404).json({ message: 'Customer not found.' });
        res.json({ message: 'Customer deleted.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ════════════════════════════════════════════════════════════
//   INVOICE ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/invoices  — list all invoices
router.get('/', async (req, res) => {
    try {
        const { status, customerId, from, to, search, approvalStatus } = req.query;
        let filter = {};

        // Only superadmin can see all invoices; everyone else sees only their own.
        if (req.user.role !== 'superadmin') {
            filter.createdBy = req.user._id;
        }

        if (status) filter.paymentStatus = status;
        if (approvalStatus) filter.approvalStatus = approvalStatus;
        if (customerId) filter.customer = customerId;
        if (from || to) {
            filter.invoiceDate = {};
            if (from) filter.invoiceDate.$gte = new Date(from);
            if (to) filter.invoiceDate.$lte = new Date(to);
        }
        if (search) {
            filter.$or = [
                { invoiceNumber: { $regex: search, $options: 'i' } },
                { 'customerSnapshot.name': { $regex: search, $options: 'i' } },
                { 'candidates.name': { $regex: search, $options: 'i' } }
            ];
        }

        const invoices = await Invoice.find(filter)
            .populate('customer', 'customerId name')
            .populate('createdBy', 'name email')
            .sort({ invoiceDate: -1 });

        // Auto-mark overdue invoices
        const today = new Date();
        const updates = [];
        for (const inv of invoices) {
            if (inv.paymentStatus === 'unpaid' && inv.dueDate && today > inv.dueDate) {
                inv.paymentStatus = 'overdue';
                updates.push(Invoice.findByIdAndUpdate(inv._id, { paymentStatus: 'overdue' }));
            }
        }
        await Promise.all(updates);

        res.json(invoices);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/invoices/stats  — summary stats
router.get('/stats', async (req, res) => {
    try {
        const today = new Date();
        const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
        const filter = isAdmin ? {} : { createdBy: req.user._id };

        // Auto-update overdue (for relevant invoices)
        await Invoice.updateMany(
            { ...filter, paymentStatus: 'unpaid', dueDate: { $lt: today } },
            { paymentStatus: 'overdue' }
        );

        const [total, paid, unpaid, overdue, totalValue] = await Promise.all([
            Invoice.countDocuments(filter),
            Invoice.countDocuments({ ...filter, paymentStatus: 'paid' }),
            Invoice.countDocuments({ ...filter, paymentStatus: 'unpaid' }),
            Invoice.countDocuments({ ...filter, paymentStatus: 'overdue' }),
            Invoice.aggregate([
                { $match: filter },
                { $group: { _id: null, sum: { $sum: '$netPayable' } } }
            ])
        ]);

        res.json({
            total,
            paid,
            unpaid,
            overdue,
            totalValue: totalValue[0]?.sum || 0
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ════════════════════════════════════════════════════════════
//   INVOICE NUMBERING MANAGEMENT
// ════════════════════════════════════════════════════════════

// GET /api/invoices/numbering/series  — get current invoice series info
router.get('/numbering/series', adminOnly, async (req, res) => {
    try {
        const counters = await InvoiceCounter.find().sort({ financialYear: -1 });
        res.json(counters);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/invoices/numbering/series/:fy  — update sequence for a financial year
router.put('/numbering/series/:fy', adminOnly, async (req, res) => {
    try {
        const { fy } = req.params;
        const { sequence, prefix } = req.body;

        if (sequence < 0) {
            return res.status(400).json({ message: 'Sequence must be 0 or greater.' });
        }

        const counter = await InvoiceCounter.setSequence(fy, sequence, prefix || 'KM');
        res.json(counter);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/invoices/numbering/reset  — reset sequence for a financial year
router.post('/numbering/reset', adminOnly, async (req, res) => {
    try {
        const { fy, prefix } = req.body;

        if (!fy) {
            return res.status(400).json({ message: 'Financial year is required.' });
        }

        const counter = await InvoiceCounter.resetSequence(fy, prefix || 'KM');
        res.json({ message: `Invoice sequence reset for FY ${fy}`, counter });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/invoices/:id  — single invoice
router.get('/:id', async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('customer')
            .populate('createdBy', 'name email');
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        // Only superadmin can view all invoices; everyone else can view only created invoices.
        if (req.user.role !== 'superadmin') {
            if (invoice.createdBy?._id?.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'Access denied.' });
            }
        }
        res.json(invoice);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/invoices  — create invoice (any authenticated user)
router.post('/', async (req, res) => {
    try {
        const {
            invoiceNumber, invoiceDate, customerId, billingCompanyId, deptCode, poId,
            serviceType, chargesFor, candidates, chargeableSalary, rate,
            paymentStatus, receivableAmount, tdsAmount, receivedDate, notes, dueDate
        } = req.body;

        // Fetch customer
        const customer = await InvoiceCustomer.findById(customerId);
        if (!customer) return res.status(404).json({ message: 'Customer not found.' });

        // Fetch billing company (fall back to primary)
        let bCompany = billingCompanyId ? await InvoiceCompany.findById(billingCompanyId) : null;
        if (!bCompany) bCompany = await InvoiceCompany.findOne({ isPrimary: true });
        if (!bCompany) bCompany = await InvoiceCompany.findOne();

        // Determine invoice date (default to now)
        const finalInvoiceDate = invoiceDate ? new Date(invoiceDate) : new Date();

        // Auto-generate invoice number if not provided
        let finalInvoiceNumber = invoiceNumber;
        if (!finalInvoiceNumber) {
            const fy = getFinancialYear(finalInvoiceDate);
            finalInvoiceNumber = await InvoiceCounter.getNextInvoiceNumber(fy, 'KM');
        }

        // Handle due date - keep it flexible and mandatory
        if (!dueDate) {
            return res.status(400).json({ message: 'Due date is required.' });
        }

        const invoice = new Invoice({
            invoiceNumber: finalInvoiceNumber,
            invoiceDate: finalInvoiceDate,
            dueDate: new Date(dueDate),
            customer: customer._id,
            customerSnapshot: {
                customerId: customer.customerId,
                name: customer.name,
                address: customer.address,
                contactNo: customer.contactNo,
                email: customer.email,
                gstNo: customer.gstNo,
                vendorCode: customer.vendorCode
            },
            billingCompany: bCompany ? bCompany._id : undefined,
            billingCompanySnapshot: bCompany ? companySnapshot(bCompany) : undefined,
            deptCode: deptCode || 'NA',
            poId,
            serviceType: serviceType || 'sourcing',
            chargesFor: chargesFor || '',
            candidates: candidates || [],
            chargeableSalary: Number(chargeableSalary),
            rate: Number(rate),
            paymentStatus: paymentStatus || 'unpaid',
            receivableAmount: receivableAmount ? Number(receivableAmount) : 0,
            tdsAmount: tdsAmount ? Number(tdsAmount) : 0,
            receivedDate: receivedDate || null,
            notes,
            createdBy: req.user._id,
            approvalStatus: req.user.role === 'superadmin' ? 'approved' : 'pending',
            approvedBy: req.user.role === 'superadmin' ? req.user._id : null,
            approvedAt: req.user.role === 'superadmin' ? new Date() : null
        });

        await invoice.save();

        // Notify superadmins about invoices that need approval
        if (invoice.approvalStatus === 'pending') {
            const superadmins = await User.find({ role: 'superadmin' }).select('_id');
            if (superadmins.length > 0) {
                await Notification.insertMany(
                    superadmins.map((admin) => ({
                        recipient: admin._id,
                        sender: req.user._id,
                        invoice: invoice._id,
                        type: 'invoice_created',
                        message: `Invoice ${invoice.invoiceNumber} was created by ${req.user.name} and requires your approval.`
                    }))
                );
            }
        } else {
            // Auto-approved (superadmin created) — notify other superadmins
            const superadmins = await User.find({
                role: 'superadmin',
                _id: { $ne: req.user._id }
            }).select('_id');
            if (superadmins.length > 0) {
                await Notification.insertMany(
                    superadmins.map((admin) => ({
                        recipient: admin._id,
                        sender: req.user._id,
                        invoice: invoice._id,
                        type: 'invoice_created',
                        message: `Invoice ${invoice.invoiceNumber} was created by ${req.user.name} (auto-approved).`
                    }))
                );
            }
        }

        res.status(201).json(invoice);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Invoice number already exists.' });
        }
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/invoices/:id  — update invoice
router.put('/:id', async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

        const isCreator = invoice.createdBy?.toString() === req.user._id.toString();
        const isAdmin = ['admin', 'superadmin'].includes(req.user.role);

        if (!isAdmin && !isCreator) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        // Managers and Staff can only edit if it's still pending and not locked
        if (!isAdmin && invoice.approvalStatus !== 'pending') {
            return res.status(403).json({ message: 'Cannot edit an invoice that is already approved or rejected.' });
        }

        const {
            invoiceNumber, invoiceDate, customerId, billingCompanyId, deptCode, poId,
            serviceType, chargesFor, candidates, chargeableSalary, rate,
            paymentStatus, receivableAmount, tdsAmount, receivedDate, notes, dueDate
        } = req.body;

        // PERMISSION CHECK: Only Super User can edit if invoice is locked
        if (invoice.isLocked && req.user.role !== 'superadmin') {
            return res.status(403).json({
                message: 'Only Super User can edit locked invoices. Invoice number and date are permanently locked.'
            });
        }

        const changedFields = [];

        // LOCKED FIELDS: Invoice number and date cannot be changed
        if (invoiceNumber && invoiceNumber !== invoice.invoiceNumber) {
            return res.status(400).json({
                message: 'Invoice number is locked and cannot be changed once created.'
            });
        }
        if (invoiceDate) {
            return res.status(400).json({
                message: 'Invoice date is locked and cannot be changed once created.'
            });
        }

        // EDITABLE FIELDS: Financial details and payment info only
        if (chargeableSalary !== undefined && invoice.chargeableSalary !== Number(chargeableSalary)) {
            invoice.chargeableSalary = Number(chargeableSalary);
            changedFields.push('chargeableSalary');
        }
        if (rate !== undefined && invoice.rate !== Number(rate)) {
            invoice.rate = Number(rate);
            changedFields.push('rate');
        }
        if (dueDate && invoice.dueDate.toString() !== new Date(dueDate).toString()) {
            invoice.dueDate = new Date(dueDate);
            changedFields.push('dueDate');
        }
        if (paymentStatus && invoice.paymentStatus !== paymentStatus) {
            invoice.paymentStatus = paymentStatus;
            changedFields.push('paymentStatus');
        }
        if (receivableAmount !== undefined && invoice.receivableAmount !== Number(receivableAmount)) {
            invoice.receivableAmount = Number(receivableAmount);
            changedFields.push('receivableAmount');
        }
        if (tdsAmount !== undefined && invoice.tdsAmount !== Number(tdsAmount)) {
            invoice.tdsAmount = Number(tdsAmount);
            changedFields.push('tdsAmount');
        }
        if (receivedDate !== undefined) {
            invoice.receivedDate = receivedDate || null;
            if (receivedDate) changedFields.push('receivedDate');
        }
        if (notes !== undefined && invoice.notes !== notes) {
            invoice.notes = notes;
            changedFields.push('notes');
        }
        if (deptCode !== undefined && invoice.deptCode !== deptCode) {
            invoice.deptCode = deptCode;
            changedFields.push('deptCode');
        }
        if (poId !== undefined && invoice.poId !== poId) {
            invoice.poId = poId;
            changedFields.push('poId');
        }
        if (chargesFor !== undefined && invoice.chargesFor !== chargesFor) {
            invoice.chargesFor = chargesFor;
            changedFields.push('chargesFor');
        }

        // Track edit history if changes were made
        if (changedFields.length > 0) {
            invoice.lastEditedBy = req.user._id;
            invoice.lastEditedAt = new Date();

            if (!invoice.editHistory) invoice.editHistory = [];
            invoice.editHistory.push({
                editedBy: req.user._id,
                editedAt: new Date(),
                changedFields: changedFields
            });
        }

        await invoice.save();
        res.json(invoice);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Invoice number already exists.' });
        }
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/invoices/:id  — delete invoice
router.delete('/:id', async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

        const isCreator = invoice.createdBy?.toString() === req.user._id.toString();
        const isAdmin = ['admin', 'superadmin'].includes(req.user.role);

        if (!isAdmin && !isCreator) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        // Managers and Staff can only delete if it's still pending
        if (!isAdmin && invoice.approvalStatus !== 'pending') {
            return res.status(403).json({ message: 'Cannot delete an invoice that is already processed.' });
        }

        await Invoice.findByIdAndDelete(req.params.id);
        res.json({ message: 'Invoice deleted.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ════════════════════════════════════════════════════════════
//   INVOICE APPROVAL WORKFLOW
// ════════════════════════════════════════════════════════════

// POST /api/invoices/:id/approve  — approve an invoice (superadmin only)
router.post('/:id/approve', async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only Super Admin can approve invoices.' });
    }
    try {
        const { note } = req.body;
        const invoice = await Invoice.findByIdAndUpdate(
            req.params.id,
            {
                approvalStatus: 'approved',
                approvalNote: note || '',
                approvedBy: req.user._id,
                approvedAt: new Date()
            },
            { new: true }
        );
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

        if (invoice.createdBy) {
            await Notification.create({
                recipient: invoice.createdBy,
                sender: req.user._id,
                invoice: invoice._id,
                type: 'invoice_approved',
                message: `Your invoice ${invoice.invoiceNumber} has been approved.`
            });
        }

        res.json(invoice);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/invoices/:id/reject  — reject an invoice (superadmin only)
router.post('/:id/reject', async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only Super Admin can reject invoices.' });
    }
    try {
        const { note } = req.body;
        const invoice = await Invoice.findByIdAndUpdate(
            req.params.id,
            {
                approvalStatus: 'rejected',
                approvalNote: note || ''
            },
            { new: true }
        );
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

        // Notify the invoice creator about the rejection
        if (invoice.createdBy) {
            await Notification.create({
                recipient: invoice.createdBy,
                sender: req.user._id,
                invoice: invoice._id,
                type: 'invoice_rejected',
                message: `Your invoice ${invoice.invoiceNumber} was rejected by ${req.user.name}.${note ? ' Reason: ' + note : ''}`
            });
        }

        res.json(invoice);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ════════════════════════════════════════════════════════════
//   PDF GENERATION
// ════════════════════════════════════════════════════════════

// GET /api/invoices/:id/pdf  — download regular PDF
router.get('/:id/pdf', superadminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('customer')
            .populate('billingCompany');
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        if (!canAccessInvoice(req, invoice)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const settings = await Settings.findOne({ user: req.user._id }).select('invoiceDefaults');
        const template = settings?.invoiceDefaults?.defaultTemplate || 'image1';
        const settingsSealImage = settings?.invoiceDefaults?.defaultSealUrl || null;
        await generateInvoicePDF(invoice, res, { template, settingsSealImage });
    } catch (err) {
        console.error('PDF generation error:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /api/invoices/:id/pdf/signed  — download PDF with digital signature indicator
router.get('/:id/pdf/signed', superadminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('customer')
            .populate('billingCompany');
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        if (!canAccessInvoice(req, invoice)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        if (!invoice.signatures || invoice.signatures.length === 0) {
            return res.status(400).json({ message: 'Invoice has not been signed yet.' });
        }

        const latestSignature = invoice.signatures[invoice.signatures.length - 1];
        const settings = await Settings.findOne({ user: req.user._id }).select('invoiceDefaults');
        const template = settings?.invoiceDefaults?.defaultTemplate || 'image1';
        const settingsSealImage = settings?.invoiceDefaults?.defaultSealUrl || null;
        await generateInvoicePDF(invoice, res, {
            isSigned: true,
            signatureInfo: latestSignature,
            template,
            settingsSealImage
        });
    } catch (err) {
        console.error('Signed PDF generation error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ════════════════════════════════════════════════════════════
//   WORD & SIGNATURE EXPORT
// ════════════════════════════════════════════════════════════

// Multer config for attachment uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/invoice-attachments');
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadAttachment = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed. Please upload PDF or Word documents.'));
        }
    }
});

// POST /api/invoices/:id/attachments  — upload attachment
router.post('/:id/attachments', adminOnly, uploadAttachment.single('file'), async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        if (!req.file) return res.status(400).json({ message: 'No file provided.' });

        const { type } = req.body;
        const allowedTypes = ['customer-agreement', 'offer-letter', 'other'];
        const attachmentType = allowedTypes.includes(type) ? type : 'other';

        if (!invoice.attachments) invoice.attachments = [];
        invoice.attachments.push({
            type: attachmentType,
            fileName: req.file.originalname,
            fileUrl: `/uploads/invoice-attachments/${req.file.filename}`,
            uploadedAt: new Date(),
            uploadedBy: req.user._id
        });
        await invoice.save();
        res.status(201).json({
            message: 'Attachment uploaded successfully.',
            attachment: invoice.attachments[invoice.attachments.length - 1]
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/invoices/:id/attachments  — list attachments
router.get('/:id/attachments', adminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        res.json(invoice.attachments || []);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/invoices/:id/attachments/:index  — delete attachment
router.delete('/:id/attachments/:index', adminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        const index = parseInt(req.params.index);
        if (isNaN(index) || index < 0 || index >= (invoice.attachments || []).length) {
            return res.status(400).json({ message: 'Invalid attachment index.' });
        }
        invoice.attachments.splice(index, 1);
        await invoice.save();
        res.json({ message: 'Attachment deleted successfully.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/invoices/:id/word  — download invoice as Word document
router.get('/:id/word', adminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id).populate('customer');
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        const buffer = await generateInvoiceWord(invoice, invoice.billingCompanySnapshot);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.docx"`);
        res.send(buffer);
    } catch (err) {
        console.error('Word generation error:', err);
        res.status(500).json({ message: err.message });
    }
});
// ── SHARED PDF GENERATOR ──────────────────────────────────────
// ── SHARED PDF GENERATOR (PORTRAIT A4 PRECISION) ───────────
// ── SHARED PDF GENERATOR (PORTRAIT A4 PRECISION) ───────────
// ── SHARED PDF GENERATOR (PORTRAIT A4 PREMIUM) ───────────
// ── SHARED PDF GENERATOR (PORTRAIT A4 PREMIUM) ───────────
// ── SHARED PDF GENERATOR (PORTRAIT A4 PREMIUM) ───────────
// ── SHARED PDF GENERATOR (PORTRAIT A4 REFINED) ───────────
// ── SHARED PDF GENERATOR (PORTRAIT A4 REFINED) ───────────
// ── SHARED PDF GENERATOR (PORTRAIT A4 PIXEL PERFECT) ───────────
// ── SHARED PDF GENERATOR (PORTRAIT A4 PERFECTED) ───────────
async function generateInvoicePDF(invoice, res, options = {}) {
    const snap = invoice.customerSnapshot || invoice.customer || {};
    const co = invoice.billingCompany || invoice.billingCompanySnapshot || {};
    const coName = co.name || process.env.COMPANY_NAME || 'Ken McCoy Consulting';
    const coSac = co.sacCode || '998516';
    const KMC_LOGO = require('path').join(__dirname, '..', 'public', 'images', 'logo-kmc.jpg');
    const fs2 = require('fs');

    const txt = (v) => (v == null ? '' : String(v));
    const fmt = (n) => {
        const value = Number(String(n || 0).replace(/,/g, ''));
        return Number.isFinite(value) ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
    };
    const fmtDate = (d) => {
        if (!d) return '';
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return '';
        return require('moment-timezone')(dt).tz("Asia/Kolkata").format('DD-MM-YYYY');
    };

    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 0, autoFirstPage: true });
    const downloadVersion = Date.now();
    const filename = options.isSigned ? `Invoice-${invoice.invoiceNumber}-SIGNED-${downloadVersion}.pdf` : `Invoice-${invoice.invoiceNumber}-${downloadVersion}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const W = 595.28, H = 841.89, ML = 35, MR = W - 35, CW = MR - ML;
    const BLUE = '#2b5a8e', ORANGE = '#E65100', BLK = '#000000', GRY = '#555555', YEL = '#f6e05e';
    let y = 0;
    const T = (s, x, ty, o) => { doc.text(s, x, ty, Object.assign({ lineBreak: false }, o || {})); };

    // ──────── HEADER (aligned to margins) ────────
    const hH = 95;
    doc.rect(ML, 0, CW, hH).fill(BLUE);
    doc.rect(ML, 0, CW, hH).strokeColor(BLK).lineWidth(0.5).stroke();
    doc.fontSize(22).fillColor('white').font('Helvetica-Bold'); T('Ken McCoy Consulting', ML + 10, 18);
    doc.fontSize(9.5).fillColor('white').font('Helvetica');
    T('B201, Hind Saurashtra Ind.Est, Marol,', ML + 10, 45);
    T('Andheri - Kurla Road, Andheri (E), Mumbai 400059', ML + 10, 58);
    T('Tel: 91 22 42959123, Mail: info@kenmccoy.in, Web: www.kenmccoy.in', ML + 10, 71);

    const cW = 315, mW = CW - cW;
    const mX = ML + cW;
    doc.fontSize(14).fillColor(YEL).font('Helvetica-Bold');
    T('TAX INVOICE', mX, 65, { width: mW, align: 'center' });
    y = hH;

    // ──────── CUSTOMER + METADATA (flush to header) ────────
    const sY = y, cX = ML;
    const mRH = 18, mTH = 135; // Reduced height as per annotation

    doc.rect(ML, sY, CW, mTH).strokeColor(BLK).lineWidth(0.5).stroke();
    doc.moveTo(mX, sY).lineTo(mX, sY + mTH).strokeColor(BLK).lineWidth(0.5).stroke();

    doc.rect(cX, sY, cW, mRH).fill(BLUE);
    doc.fontSize(10).fillColor('white').font('Helvetica-Bold');
    T('CUSTOMER', cX + 10, sY + 4);

    const cd = [['Cust Name:', txt(snap.name)], ['Address:', txt(snap.address)], ['Tel:', txt(snap.contactNo)], ['Email:', txt(snap.email)]];
    let cf = sY + 22;
    cd.forEach(([l, v]) => {
        doc.fontSize(9.5).fillColor(BLK).font('Helvetica-Bold'); T(l, cX + 10, cf, { width: 75 });
        doc.font('Helvetica').fontSize(9.5);
        doc.text(v, cX + 90, cf, { width: cW - 100, lineBreak: true });
        const th = doc.heightOfString(v, { width: cW - 100, font: 'Helvetica', size: 9.5 });
        cf += Math.max(18, th + 4);
    });

    const md_rows = 8;
    const md_h = mTH / md_rows;
    const md = [['INVOICE NO:', txt(invoice.invoiceNumber), false], ['DATE:', fmtDate(invoice.invoiceDate), false], ['CUSTOMER ID:', txt(snap.customerId), false], ['DATE OF JOINING:', fmtDate((invoice.candidates || [])[0]?.dateOfJoining), false], ['DUE DATE:', fmtDate(invoice.dueDate), true], ['VENDOR CODE:', txt(snap.vendorCode || 'NA'), false], ['Dept Code:', txt(invoice.deptCode || 'NA'), false], ['Customer GSTN:', txt(snap.gstNo), false]];
    const mLW = Math.floor(mW * 0.55);
    let mf = sY;
    md.forEach(([l, v, o]) => {
        if (mf > sY) {
            doc.moveTo(mX, mf).lineTo(MR, mf).strokeColor('#aaaaaa').lineWidth(0.5).stroke();
        }
        // Label: Left-aligned for symmetry
        doc.fontSize(9).fillColor(o ? ORANGE : GRY).font('Helvetica-Bold'); 
        T(l, mX + 8, mf + 5, { width: mLW - 12, align: 'left' });
        
        doc.moveTo(mX + mLW, mf).lineTo(mX + mLW, mf + md_h).strokeColor('#aaaaaa').lineWidth(0.5).stroke();
        
        let vSize = 9.5;
        doc.font('Helvetica-Bold').fontSize(vSize);
        // Shrink font until it fits the width
        while (vSize > 5 && doc.widthOfString(v) > (mW - mLW - 12)) {
            vSize -= 0.5;
            doc.fontSize(vSize);
        }
        
        // Value: Left-aligned for symmetry
        doc.fillColor(o ? ORANGE : BLK); 
        T(v, mX + mLW + 8, mf + 5 + (9.5 - vSize) / 2, { width: mW - mLW - 12, align: 'left' });
        mf += md_h;
    });

    y = sY + mTH;

    // ──────── SERVICE TABLE ────────
    const sw = [30, 232, 110, 53, 105];
    const sx = [ML, ML + sw[0], ML + sw[0] + sw[1], ML + sw[0] + sw[1] + sw[2], ML + sw[0] + sw[1] + sw[2] + sw[3], MR];

    doc.rect(ML, y, CW, 22).fill(BLUE);
    doc.fontSize(9.5).fillColor('white').font('Helvetica-Bold');
    ['S.No.', 'Description of Service', 'Chargeable Salary', 'Rate', 'Chargeable Amt'].forEach((h, i) => T(h, sx[i], y + 6, { width: sw[i], align: 'center' }));
    y += 22;

    const chgText = 'Sourcing, Recruiting and Onboarding Charges'; // Removed redundant designation

    const chgH = Math.max(22, doc.heightOfString(chgText, { width: sw[1] - 10, font: 'Helvetica-Bold', size: 9.5 }) + 10);
    doc.rect(ML, y, CW, chgH).fill('#4379b3');
    doc.fontSize(9.5).fillColor('white').font('Helvetica-Bold');
    doc.text(chgText, sx[1] + 5, y + 5, { width: sw[1] - 10 });
    y += chgH;

    const tableHeaderY = sY + mTH;
    const sTableTop = tableHeaderY;
    let tableStartContentY = y;
    let sNoCounter = 1;

    (invoice.candidates || []).forEach((c, idx) => {
        let h2 = Math.max(20, doc.heightOfString(txt(c.designation), { width: sw[1] - 100, font: 'Helvetica', size: 9.5 }) + 8);
        let h3 = Math.max(20, doc.heightOfString(txt(c.level), { width: sw[1] - 100, font: 'Helvetica', size: 9.5 }) + 8);

        // draw backgrounds for row 2 left side, row 3 left side
        doc.rect(sx[1], y + 20, 90, h2).fill('#e2e2e2');
        doc.rect(sx[1], y + 20 + h2, 90, h3).fill('#e2e2e2');

        // row 1 content
        doc.fillColor(BLK).font('Helvetica');
        T(String(sNoCounter++), sx[0], y + 6, { width: sw[0], align: 'center' });
        doc.font('Helvetica-Bold');
        T(txt(c.name), sx[1], y + 6, { width: sw[1], align: 'center' });

        if (idx === 0) {
            doc.font('Helvetica-Bold');
            T('Rs. ' + fmt(invoice.chargeableSalary), sx[2], y + 6, { width: sw[2] - 10, align: 'right' });
            T((invoice.rate || 0).toFixed(2) + '%', sx[3], y + 6, { width: sw[3], align: 'center' });
            T('Rs. ' + fmt(invoice.chargeableAmount), sx[4], y + 6, { width: sw[4] - 10, align: 'right' });
        }

        // horizontal separator after row 1
        doc.dash(1, { space: 1.5 }).strokeColor(BLK).lineWidth(0.5);
        doc.moveTo(ML, y + 20).lineTo(MR, y + 20).stroke();
        doc.undash();

        // row 2 content
        doc.fillColor(BLK).font('Helvetica');
        T(String(sNoCounter++), sx[0], y + 20 + 6, { width: sw[0], align: 'center' });
        doc.fontSize(9.5).font('Helvetica-Bold');
        T('Designation:', sx[1] + 5, y + 20 + 6, { width: 80, align: 'right' });
        doc.font('Helvetica');
        doc.text(txt(c.designation), sx[1] + 95, y + 20 + 6, { width: sw[1] - 100 });

        // horizontal separator after row 2
        doc.dash(1, { space: 1.5 }).strokeColor(BLK).lineWidth(0.5);
        doc.moveTo(ML, y + 20 + h2).lineTo(MR, y + 20 + h2).stroke();
        doc.undash();

        // row 3 content
        doc.fillColor(BLK).font('Helvetica');
        T(String(sNoCounter++), sx[0], y + 20 + h2 + 6, { width: sw[0], align: 'center' });
        doc.fontSize(9.5).font('Helvetica-Bold');
        T('Level:', sx[1] + 5, y + 20 + h2 + 6, { width: 80, align: 'right' });
        doc.font('Helvetica');
        doc.text(txt(c.level), sx[1] + 95, y + 20 + h2 + 6, { width: sw[1] - 100 });

        // horizontal separator after row 3
        doc.dash(1, { space: 1.5 }).strokeColor(BLK).lineWidth(0.5);
        doc.moveTo(ML, y + 20 + h2 + h3).lineTo(MR, y + 20 + h2 + h3).stroke();

        // Vertical lines restricted to this candidate block ONLY
        [sx[1], sx[2], sx[3], sx[4]].forEach(x => {
            doc.moveTo(x, y).lineTo(x, y + 20 + h2 + h3).stroke();
        });
        doc.moveTo(sx[1] + 90, y + 20).lineTo(sx[1] + 90, y + 20 + h2 + h3).stroke(); // between label and value
        doc.undash();

        y += 20 + h2 + h3;
    });

    // Add empty space if needed
    let emptySpaceStart = y;
    if (y - tableStartContentY < 60) {
        y = tableStartContentY + 60;
    }

    // ──────── GST & TOTAL SECTION (aligned under table) ────────
    // Use sx[3] as divider (Rate col start) so amount column is wider
    const gL = sx[2], gVL = sx[3], gVW = MR - sx[3];
    const gstH = 26; // Increased from 22 for better visibility

    const dR_T = (l, v, b, dts = true) => {
        if (dts) {
            doc.dash(1, { space: 1.5 }).strokeColor(BLK).lineWidth(0.5);
            doc.moveTo(gVL, y).lineTo(MR, y).stroke();
            doc.moveTo(gVL, y).lineTo(gVL, y + gstH).stroke();
            doc.undash();
        } else {
            // Net Payable row
            doc.dash(1, { space: 1.5 }).strokeColor(BLK).lineWidth(0.5);
            doc.moveTo(ML, y).lineTo(MR, y).stroke(); // Horizontal Top of Net Payable
            doc.moveTo(gVL, y).lineTo(gVL, y + gstH).stroke(); // Vertical split
            doc.moveTo(ML, y + gstH).lineTo(MR, y + gstH).stroke(); // Bottom border of the table
            doc.undash();
        }

        doc.fontSize(9.5).fillColor(BLK).font(b ? 'Helvetica-Bold' : 'Helvetica');
        T(l, ML + 10, y + 6, { width: gVL - ML - 15, align: 'right' });

        doc.fontSize(10).fillColor(BLK).font(b ? 'Helvetica-Bold' : 'Helvetica');
        T('Rs. ' + fmt(v), gVL + 5, y + 5, { width: gVW - 15, align: 'right' });
        y += gstH;
    };

    const gstTop = y;
    if (invoice.cgst > 0) { dR_T('CGST@9%', invoice.cgst, false); dR_T('SGST@9%', invoice.sgst, false); }
    else if (invoice.igst > 0) { dR_T('IGST@18%', invoice.igst, false); }
    dR_T('Total GST', invoice.totalGst, true);
    dR_T('Total Amount', invoice.totalAmount, true);
    dR_T('Net Payable', invoice.netPayable, true, false);

    // Outer Borders: Top header borders are drawn in header. Now we draw ML and MR 
    // down to the very bottom of the table (y).
    doc.dash(1, { space: 1.5 }).strokeColor(BLK).lineWidth(0.5);
    doc.moveTo(ML, tableHeaderY).lineTo(ML, y).stroke(); // Left outer
    doc.moveTo(MR, tableHeaderY).lineTo(MR, y).stroke(); // Right outer

    // The ONE internal vertical line continuing through empty space and GST section
    doc.moveTo(gVL, emptySpaceStart).lineTo(gVL, gstTop).stroke();
    doc.undash();

    // ──────── AMT IN WORDS ────────
    if (y + 165 > H - 22) {
        // Draw footer on current page before splitting
        doc.rect(ML, H - 22, CW, 22).fill(ORANGE);
        doc.fontSize(8).fillColor('white').font('Helvetica-Bold');
        T('Thank you for giving us business! Any invoice / accounts related query please call our Accounts - +91 22 42959123', ML + 10, H - 22 + 7);
        doc.addPage();
        y = 50;
    }

    y += 10;
    const ws = numberToWords(invoice.netPayable) + ' Only';
    doc.fontSize(10).fillColor(BLK).font('Helvetica-Bold');
    const al = 'Amt In Words: ', af = al + ws;
    T(al, MR - doc.widthOfString(af), y); doc.fillColor(ORANGE); T(ws, MR - doc.widthOfString(ws), y);
    y += 20;

    // ──────── BANK + SIGNATURE (Expanded for visibility) ────────
    const bW2 = Math.floor(CW * 0.65), sW2 = CW - bW2, bY = y, bR2 = 32; // Increased bW2 for multi-line values
    const sigBoxH = 175;

    doc.rect(ML, bY, bW2, 18).fill(BLUE);
    doc.fontSize(10).fillColor('white').font('Helvetica-Bold'); T('OUR BANK & OTHER DETAILS', ML, bY + 4, { width: bW2, align: 'center' });

    const sigX = ML + bW2;
    doc.rect(sigX, bY, sW2, 18).fill(BLUE);
    doc.fontSize(10).fillColor('white').font('Helvetica-Bold'); T('AUTHORISED SIGNATURE', sigX, bY + 4, { width: sW2, align: 'center' });

    // Draw Bank/Signature borders as dotted lines per request
    doc.dash(1, { space: 1.5 }).strokeColor(BLK).lineWidth(0.5);
    doc.moveTo(ML, bY).lineTo(MR, bY).stroke(); // Top
    doc.moveTo(ML, bY + sigBoxH).lineTo(MR, bY + sigBoxH).stroke(); // Bottom
    doc.moveTo(ML, bY).lineTo(ML, bY + sigBoxH).stroke(); // Left
    doc.moveTo(MR, bY).lineTo(MR, bY + sigBoxH).stroke(); // Right
    doc.moveTo(sigX, bY).lineTo(sigX, bY + sigBoxH).stroke(); // Vertical divider
    doc.undash();

    doc.fontSize(11).fillColor(BLUE).font('Helvetica-Bold'); T('For ' + coName, sigX, bY + 30, { width: sW2, align: 'center' });

    let sigRowsY = bY + 18;
    const bkL_Col = 170, bkR_Col = bW2 - bkL_Col; // Re-balanced for 2-line values
    const bD = [['PAN NUMBER:', txt(co.panNumber), 'Account Name:', txt(co.accountName || coName)],
    ['GSTN:', txt(co.gstn), 'Bank & Branch:', txt((co.bankName || '') + ', ' + (co.branchName || ''))],
    ['SAC Code:', txt(coSac), 'CA Number:', txt(co.caNumber)],
    ['IFSC Code:', txt(co.ifscCode), 'IFS Code:', txt(co.ifscCode)]];

    bD.forEach(([l1, v1, l2, v2]) => {
        if (sigRowsY > bY + 18) {
            doc.dash(1, { space: 1.5 }).strokeColor(BLK).lineWidth(0.5);
            doc.moveTo(ML, sigRowsY).lineTo(sigX, sigRowsY).stroke();
            doc.undash();
        }
        
        const labelSize = 9.5, valSizeBase = 9.5;
        const padY = (bR2 - 12) / 2; // Robust vertical centering for ~10-12pt text in 32pt row

        // Label L1
        doc.fontSize(labelSize).fillColor(GRY).font('Helvetica-Bold'); 
        T(l1, ML + 8, sigRowsY + padY, { width: 73, align: 'left' });
        
        doc.fillColor(BLK).font('Helvetica');
        let v1Size = valSizeBase;
        doc.fontSize(v1Size);
        while (v1Size >= 8 && doc.widthOfString(v1) > (bkL_Col - 82)) {
            v1Size -= 0.5;
            doc.fontSize(v1Size);
        }
        // Value V1: Centered vertically
        T(v1, ML + 80, sigRowsY + padY + (valSizeBase - v1Size) / 2, { width: bkL_Col - 82, align: 'left' });

        doc.dash(1, { space: 1.5 }).strokeColor(BLK).lineWidth(0.5);
        doc.moveTo(ML + bkL_Col, sigRowsY).lineTo(ML + bkL_Col, sigRowsY + bR2).stroke();
        doc.undash();

        // Label L2
        doc.fontSize(labelSize).fillColor(GRY).font('Helvetica-Bold'); 
        T(l2, ML + bkL_Col + 8, sigRowsY + padY, { width: 75, align: 'left' });
        
        doc.fillColor(BLK).font('Helvetica');
        let v2Size = valSizeBase;
        doc.fontSize(v2Size);
        // Robust multiline height check for V2
        while (v2Size >= 8 && doc.heightOfString(v2, { width: bkR_Col - 83, size: v2Size }) > (bR2 - 4)) {
            v2Size -= 0.5;
            doc.fontSize(v2Size);
        }
        const v2h = doc.heightOfString(v2, { width: bkR_Col - 83, size: v2Size });
        const v2Y_centered = sigRowsY + (bR2 - v2h) / 2;
        
        // Value V2: Left-aligned, perfectly centered vertically
        doc.text(v2, ML + bkL_Col + 83, v2Y_centered, { width: bkR_Col - 83, align: 'left', lineBreak: true, height: bR2 });
        sigRowsY += bR2;
    });

    // Close the bank details rows with a final dotted line
    doc.dash(1, { space: 1.5 }).strokeColor(BLK).lineWidth(0.5);
    doc.moveTo(ML, sigRowsY).lineTo(sigX, sigRowsY).stroke();
    doc.undash();

    const sO = (invoice.signatures && invoice.signatures.length > 0) ? invoice.signatures[invoice.signatures.length - 1] : null;
    const sigImg = (sO && sO.isSigned && sO.signatureImage) ? sO.signatureImage : null;
    const sealImg = (sO && sO.sealImage) ? sO.sealImage : options.settingsSealImage;

    // Defined gap between "For..." (ends ~bY+42) and "Authorised Signatory" (starts ~bY+153)
    const sigNameTop = bY + sigBoxH - 22;
    const sigAreaTop = bY + 47; // Shifted even more UP for visual centering
    const sigAreaH = 80;        
    const sigCenterX = sigX + (sW2 / 2);

    if (sigImg) {
        try {
            const b6 = sigImg.replace(/^data:image\/\w+;base64,/, '');
            const imgW = Math.min(sW2 - 20, 150);
            doc.image(Buffer.from(b6, 'base64'), sigCenterX - (imgW / 2), sigAreaTop, { fit: [imgW, sigAreaH * 0.6], align: 'center' });
        } catch (e) { }
    }
    if (sealImg) {
        try {
            const sb = (typeof sealImg === 'string' && sealImg.startsWith('data:image')) ? Buffer.from(sealImg.replace(/^data:image\/\w+;base64,/, ''), 'base64') : sealImg;
            const sealW = Math.min(sW2 - 20, 130);
            doc.image(sb, sigCenterX - (sealW / 2), sigAreaTop + (sigAreaH * 0.35), { fit: [sealW, sigAreaH * 0.6], align: 'center' });
        } catch (e) { }
    }

    doc.fontSize(11).fillColor(BLK).font('Helvetica-Bold');
    T('Authorised Signatory', sigX, sigNameTop, { width: sW2, align: 'center' });

    y = bY + sigBoxH;

    // ──────── TERMS & CONDITIONS ────────
    if (y + 110 > H - 22) {
        // Draw footer on current page before splitting
        doc.rect(ML, H - 22, CW, 22).fill(ORANGE);
        doc.fontSize(8).fillColor('white').font('Helvetica-Bold');
        T('Thank you for giving us business! Any invoice / accounts related query please call our Accounts - +91 22 42959123', ML + 10, H - 22 + 7);
        doc.addPage();
        y = 50;
    }

    y += 8;
    const tcHdr = 16, tcBody = 70;
    doc.rect(ML, y, CW, tcHdr).fill(BLUE);
    doc.fontSize(10).fillColor('white').font('Helvetica-Bold');
    T('TERMS & CONDITIONS', ML, y + 4, { width: CW, align: 'center' });
    doc.dash(1, { space: 1.5 }).strokeColor(BLK).lineWidth(0.5);
    doc.rect(ML, y + tcHdr, CW, tcBody).stroke();
    doc.undash();
    doc.fontSize(9).fillColor(BLK).font('Helvetica');
    const tms = ['1. Please comply with TDS provisions, if applicable.', '2. All payments should be made in favour of "' + coName + '" only.', '3. Interest @21% per annum will be charged beyond due date.', '4. Payment once made shall not be refunded.', '5. All disputes are within Mumbai jurisdiction only.'];
    tms.forEach((t, i) => T(t, ML + 15, y + tcHdr + 8 + (i * 13)));

    // ──────── FOOTER (aligned to margins) ────────
    const footH = 22, footY = H - footH;
    doc.rect(ML, footY, CW, footH).fill(ORANGE);
    doc.fontSize(8).fillColor('white').font('Helvetica-Bold');
    T('Thank you for giving us business! Any invoice / accounts related query please call our Accounts - +91 22 42959123', ML + 10, footY + 7);

    doc.end();
}

// ════════════════════════════════════════════════════════════
function numberToWords(num) {
    const raw = Number(String(num ?? 0).replace(/,/g, ''));
    if (!Number.isFinite(raw) || raw === 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function convert(n) {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
        return '';
    }
    let n = Math.floor(Math.abs(raw));
    const paise = Math.round((Math.abs(raw) - n) * 100);
    let result = '';
    if (n >= 10000000) { result += convert(Math.floor(n / 10000000)) + ' Crore '; n %= 10000000; }
    if (n >= 100000) { result += convert(Math.floor(n / 100000)) + ' Lakh '; n %= 100000; }
    if (n >= 1000) { result += convert(Math.floor(n / 1000)) + ' Thousand '; n %= 1000; }
    if (n > 0) result += convert(n);
    result = 'Rupees ' + result.trim();
    if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
    return result;
}

module.exports = router;



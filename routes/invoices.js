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
const { getFinancialYear } = require('../utils/invoiceNumbering');
const { generateInvoiceWord } = require('../utils/wordGenerator');

// All routes require authentication
router.use(auth);

// ─── Admin-only guard ────────────────────────────────────────────────────────
function adminOnly(req, res, next) {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Admin access required.' });
    }
    next();
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
router.get('/billing-companies', adminOnly, async (req, res) => {
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
router.get('/customers', adminOnly, async (req, res) => {
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
router.get('/', adminOnly, async (req, res) => {
    try {
        const { status, customerId, from, to, search } = req.query;
        let filter = {};

        if (status) filter.paymentStatus = status;
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
router.get('/stats', adminOnly, async (req, res) => {
    try {
        const today = new Date();

        // Auto-update overdue
        await Invoice.updateMany(
            { paymentStatus: 'unpaid', dueDate: { $lt: today } },
            { paymentStatus: 'overdue' }
        );

        const [total, paid, unpaid, overdue, totalValue] = await Promise.all([
            Invoice.countDocuments(),
            Invoice.countDocuments({ paymentStatus: 'paid' }),
            Invoice.countDocuments({ paymentStatus: 'unpaid' }),
            Invoice.countDocuments({ paymentStatus: 'overdue' }),
            Invoice.aggregate([{ $group: { _id: null, sum: { $sum: '$netPayable' } } }])
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
router.get('/:id', adminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('customer')
            .populate('createdBy', 'name email');
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        res.json(invoice);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/invoices  — create invoice
router.post('/', adminOnly, async (req, res) => {
    try {
        const {
            invoiceNumber, invoiceDate, customerId, billingCompanyId, deptCode, poId,
            serviceType, candidates, chargeableSalary, rate,
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
            candidates: candidates || [],
            chargeableSalary: Number(chargeableSalary),
            rate: Number(rate),
            paymentStatus: paymentStatus || 'unpaid',
            receivableAmount: receivableAmount ? Number(receivableAmount) : 0,
            tdsAmount: tdsAmount ? Number(tdsAmount) : 0,
            receivedDate: receivedDate || null,
            notes,
            createdBy: req.user._id
        });

        await invoice.save();
        res.status(201).json(invoice);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Invoice number already exists.' });
        }
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/invoices/:id  — update invoice
router.put('/:id', adminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

        const {
            invoiceNumber, invoiceDate, customerId, billingCompanyId, deptCode, poId,
            serviceType, candidates, chargeableSalary, rate,
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
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findByIdAndDelete(req.params.id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        res.json({ message: 'Invoice deleted.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ════════════════════════════════════════════════════════════
//   PDF GENERATION
// ════════════════════════════════════════════════════════════

// GET /api/invoices/:id/pdf  — download regular PDF
router.get('/:id/pdf', adminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('customer')
            .populate('billingCompany');
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

        await generateInvoicePDF(invoice, res);
    } catch (err) {
        console.error('PDF generation error:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /api/invoices/:id/pdf/signed  — download PDF with digital signature indicator
router.get('/:id/pdf/signed', adminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('customer')
            .populate('billingCompany');
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

        if (!invoice.signatures || invoice.signatures.length === 0) {
            return res.status(400).json({ message: 'Invoice has not been signed yet.' });
        }

        const latestSignature = invoice.signatures[invoice.signatures.length - 1];
        await generateInvoicePDF(invoice, res, { 
            isSigned: true, 
            signatureInfo: latestSignature 
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

// POST /api/invoices/:id/sign  — mark invoice as signed
router.post('/:id/sign', adminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        const { signatoryName, signatureImageBase64 } = req.body;
        if (!signatoryName) return res.status(400).json({ message: 'Signatory name is required.' });

        if (!invoice.signatures) invoice.signatures = [];
        invoice.signatures.push({
            signedBy: req.user._id,
            signedAt: new Date(),
            signatoryName: signatoryName,
            signatureImage: signatureImageBase64 || null,
            isSigned: true
        });
        invoice.isLocked = true;
        invoice.lastEditedBy = req.user._id;
        invoice.lastEditedAt = new Date();
        await invoice.save();
        res.json({ message: 'Invoice signed successfully.', invoice });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── SHARED PDF GENERATOR ──────────────────────────────────────
async function generateInvoicePDF(invoice, res, options = {}) {
    const snap = invoice.customerSnapshot || invoice.customer || {};
    const co = invoice.billingCompany || {};
    const coName = co.name || process.env.COMPANY_NAME || 'Your Company Name';
    const coTagline = co.tagline || process.env.COMPANY_TAGLINE || 'Excellence in Service';
    const coSac = co.sacCode || '998513';

    const fmt = (n) => n ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const filename = options.isSigned ? `Invoice-${invoice.invoiceNumber}-SIGNED.pdf` : `Invoice-${invoice.invoiceNumber}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const W = 595.28, H = 841.89, ML = 40, MR = W - 40, CW = MR - ML;
    const BLUE = '#003087', LIGHTBLUE = '#e8f0fe', GRAY = '#666666', BLACK = '#000000';
    let y = 30;

    if (co.logo) {
        try {
            if (co.logo.startsWith('data:image')) {
                doc.image(co.logo, ML, y, { height: 40 });
            } else if (!co.logo.startsWith('http')) {
                const logoPath = path.isAbsolute(co.logo) ? co.logo : path.join(__dirname, '..', co.logo);
                doc.image(logoPath, ML, y, { height: 40 });
            }
            y += 50;
        } catch (err) { console.warn('Logo failed:', err.message); }
    }

    doc.rect(0, y, W, 70).fill(BLUE);
    doc.fontSize(24).fillColor('white').font('Helvetica-Bold').text('TAX INVOICE', ML, y + 16, { width: CW / 2 });
    doc.fontSize(20).fillColor('white').font('Helvetica-Bold').text(coName, ML + CW / 2, y + 12, { width: CW / 2, align: 'right' });
    doc.fontSize(9).fillColor('#ccddff').font('Helvetica').text(coTagline, ML + CW / 2, y + 36, { width: CW / 2, align: 'right' });
    doc.fontSize(8).fillColor('#ccddff').text('SAC Code: ' + coSac, ML + CW / 2, y + 50, { width: CW / 2, align: 'right' });
    y += 85;

    const col1X = ML, col2X = ML + CW / 2 + 15, colW = CW / 2 - 15;
    const infoBoxY = y;
    const custBoxHeight = 130;
    const detailsBoxHeight = 100; // Reduced height

    doc.rect(col1X, y, colW, 16).fill(BLUE);
    doc.fontSize(10).fillColor('white').font('Helvetica-Bold').text('CUSTOMER', col1X + 4, y + 3);
    y += 16;
    doc.rect(col1X, y, colW, custBoxHeight).strokeColor('#aaaaaa').stroke();
    doc.fontSize(8).fillColor(GRAY).font('Helvetica').text('Cust. Name:', col1X + 4, y + 6);
    doc.fontSize(14).fillColor(BLACK).font('Helvetica-Bold').text(snap.name || '—', col1X + 78, y + 4, { width: colW - 82, height: 25 });
    
    const lbl = (label, value, yy) => {
        doc.fontSize(8).fillColor(GRAY).font('Helvetica').text(label, col1X + 4, yy);
        doc.fontSize(8.5).fillColor(BLACK).font('Helvetica-Bold').text(value || '—', col1X + 78, yy, { width: colW - 82 });
    };
    lbl('Address:', snap.address || '', y + 30);
    lbl('Tel:', snap.contactNo || '', y + 60);
    lbl('Email:', snap.email || '', y + 80);
    lbl('GSTN:', snap.gstNo || '—', y + 100);

    const rTop = infoBoxY;
    doc.rect(col2X, rTop, colW, 16).fill(BLUE);
    doc.fontSize(10).fillColor('white').font('Helvetica-Bold').text('INVOICE DETAILS', col2X + 4, rTop + 3);
    doc.rect(col2X, rTop + 16, colW, detailsBoxHeight).strokeColor('#aaaaaa').stroke();
    const rLbl = (label, value, yy) => {
        doc.fontSize(8).fillColor(GRAY).font('Helvetica').text(label, col2X + 4, yy, { width: 75 });
        doc.fontSize(8.5).fillColor(BLACK).font('Helvetica-Bold').text(value || '—', col2X + 80, yy, { width: colW - 84 });
    };
    const rY = rTop + 20;
    rLbl('Invoice No:', invoice.invoiceNumber, rY);
    rLbl('Date:', fmtDate(invoice.invoiceDate), rY + 18);
    rLbl('Due Date:', fmtDate(invoice.dueDate), rY + 36);
    rLbl('Dept Code:', invoice.deptCode || 'NA', rY + 54);
    rLbl('PO ID:', invoice.poId || '—', rY + 72);

    y = infoBoxY + custBoxHeight + 25; // Increased spacing

    const serviceLabel = 'Sourcing & Onboarding Charges';
    doc.fontSize(10).fillColor(BLUE).font('Helvetica-Bold').text(serviceLabel, ML, y, { width: CW });
    y += 20;

    const colWidths = [40, 170, 140, 90, 90], tblX = [ML, ML + 40, ML + 210, ML + 350, ML + 440];
    doc.rect(ML, y, CW, 18).fill(BLUE);
    ['S.No.', 'Candidate Name', 'Designation / Level', 'Date of Joining', 'Monthly Salary'].forEach((h, i) => {
        doc.fontSize(8.5).fillColor('white').font('Helvetica-Bold').text(h, tblX[i] + 4, y + 5, { width: colWidths[i] - 8, align: i === 4 ? 'right' : 'left' });
    });
    y += 18;

    (invoice.candidates || []).forEach((c, idx) => {
        // Removed borders/boxes around rows, just alternate background
        if (idx % 2 === 0) {
            doc.rect(ML, y, CW, 18).fill('#f9f9f9');
        }
        const desigLevel = [c.designation, c.level].filter(Boolean).join(' / ');
        const cells = [String(idx + 1), c.name || '—', desigLevel || '—', fmtDate(c.dateOfJoining), fmt(invoice.chargeableSalary)];
        cells.forEach((cell, i) => { 
            doc.fontSize(8).fillColor(BLACK).font('Helvetica').text(cell, tblX[i] + 4, y + 5, { width: colWidths[i] - 8, align: i === 4 ? 'right' : 'left' }); 
        });
        y += 18;
    });

    y += 15;
    const sumX = ML + CW - 200, sumW = 200;
    const sumRow = (label, value, isBold = false, bgColor = null, textColor = BLACK) => {
        if (bgColor) doc.rect(sumX, y, sumW, 16).fill(bgColor);
        doc.fontSize(8.5).fillColor(isBold ? BLUE : GRAY).font(isBold ? 'Helvetica-Bold' : 'Helvetica').text(label, sumX + 4, y + 4, { width: 100 });
        doc.fontSize(8.5).fillColor(textColor).font(isBold ? 'Helvetica-Bold' : 'Helvetica').text(value, sumX + 100, y + 4, { width: 96, align: 'right' });
        doc.rect(sumX, y, sumW, 16).strokeColor('#dddddd').stroke();
        y += 16;
    };
    sumRow(`Rate (${invoice.rate}%)`, `Rs. ${fmt(invoice.chargeableAmount)}`);
    if (invoice.cgst > 0) { 
        sumRow('CGST @ 9%', `Rs. ${fmt(invoice.cgst)}`); 
        sumRow('SGST @ 9%', `Rs. ${fmt(invoice.sgst)}`); 
    } else { 
        sumRow('IGST @ 18%', `Rs. ${fmt(invoice.igst)}`); 
    }
    sumRow('Total GST', `Rs. ${fmt(invoice.totalGst)}`);
    sumRow('Net Payable', `Rs. ${fmt(invoice.netPayable)}`, true, BLUE, 'white');

    y += 10;
    doc.fontSize(8).fillColor(GRAY).font('Helvetica').text('Amount in Words:', ML, y + 6);
    doc.fontSize(9).fillColor(BLUE).font('Helvetica-Bold').text(numberToWords(invoice.netPayable) + ' Only', ML + 90, y + 6, { width: CW - 90 });
    y += 35;

    const bW = CW / 2 - 10;
    doc.rect(ML, y, bW, 14).fill(BLUE);
    doc.fontSize(9).fillColor('white').font('Helvetica-Bold').text('OUR BANK & OTHER DETAILS', ML + 4, y + 3);
    doc.rect(col2X, y, bW, 14).fill(BLUE);
    doc.fontSize(9).fillColor('white').font('Helvetica-Bold').text('AUTHORISED SIGNATURE', col2X + 4, y + 3);
    y += 14;
    const bankBoxH = 90;
    const sigBoxH = 140; // Increased significantly
    doc.rect(ML, y, bW, bankBoxH).strokeColor('#aaaaaa').stroke();
    doc.rect(col2X, y, bW, sigBoxH).strokeColor('#aaaaaa').stroke();
    const bLbl = (label, value, yy) => {
        doc.fontSize(8).fillColor(GRAY).font('Helvetica').text(label, ML + 4, yy, { width: 80 });
        doc.fontSize(8.5).fillColor(BLACK).font('Helvetica-Bold').text(value || '', ML + 86, yy, { width: bW - 90 });
    };
    bLbl('PAN Number:', co.panNumber || '', y + 8);
    bLbl('Account Name:', co.accountName || coName, y + 21);
    bLbl('Bank & Branch:', [co.bankName, co.branchName].filter(Boolean).join(', '), y + 34);
    bLbl('CA Number:', co.caNumber || '', y + 47);
    bLbl('GSTN:', co.gstn || '', y + 60);

    doc.fontSize(8.5).fillColor(BLUE).font('Helvetica-Bold').text('For ' + coName, col2X + 4, y + 8);
    doc.fontSize(7.5).fillColor(GRAY).font('Helvetica').text('(Authorised Signatory & Seal)', col2X + 4, y + sigBoxH - 14);
    y += Math.max(bankBoxH, sigBoxH) + 15;

    doc.rect(ML, y, CW, 14).fill(BLUE);
    doc.fontSize(9).fillColor('white').font('Helvetica-Bold').text('TERMS & CONDITIONS', ML + 4, y + 3);
    y += 14;
    ['1. Please comply with TDS provisions, if applicable.', `2. All payments made in favor of "${coName}" only.`, '3. Interest @ 21% p.a. charged beyond due date.', '4. Payment once made shall not be refunded.', '5. All disputes within Mumbai jurisdiction only.'].forEach(t => { doc.fontSize(7.5).fillColor(BLACK).font('Helvetica').text(t, ML + 4, y + 2); y += 12; });

    y += 20; // Increased spacing
    doc.fontSize(8).fillColor(GRAY).font('Helvetica-Oblique').text('Thank you for your business! For queries: Accounts – Ravi: +91 7506327582', ML, y, { width: CW, align: 'center' });
    
    if (options.isSigned) {
        doc.save().opacity(0.15);
        doc.fontSize(50).fillColor('#00cc00').font('Helvetica-Bold').text('DIGITALLY SIGNED', 0, 400, { width: W, align: 'center', oblique: 15 });
        doc.restore();
        const sig = options.signatureInfo;
        if (sig) doc.fontSize(8).fillColor('#00cc00').font('Helvetica-Bold').text(`Digitally Signed by ${sig.signatoryName} on ${new Date(sig.signedAt).toLocaleString()}`, ML, H - 25, { width: CW, align: 'right' });
    }

    doc.lineWidth(4).strokeColor('#FF9900').moveTo(0, H - 10).lineTo(W, H - 10).stroke();
    doc.end();
}

// ════════════════════════════════════════════════════════════
//   HELPER: Number to Words (Indian numbering)
// ════════════════════════════════════════════════════════════
function numberToWords(num) {
    if (!num || num === 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function convert(n) {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
        return '';
    }
    let n = Math.floor(Math.abs(num));
    const paise = Math.round((Math.abs(num) - n) * 100);
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

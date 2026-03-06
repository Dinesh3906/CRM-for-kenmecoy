const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const auth = require('../middleware/auth');
const Invoice = require('../models/Invoice');
const InvoiceCustomer = require('../models/InvoiceCustomer');
const InvoiceCompany = require('../models/InvoiceCompany');

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
            paymentStatus, receivableAmount, tdsAmount, receivedDate, notes
        } = req.body;

        // Fetch customer
        const customer = await InvoiceCustomer.findById(customerId);
        if (!customer) return res.status(404).json({ message: 'Customer not found.' });

        // Fetch billing company (fall back to primary)
        let bCompany = billingCompanyId ? await InvoiceCompany.findById(billingCompanyId) : null;
        if (!bCompany) bCompany = await InvoiceCompany.findOne({ isPrimary: true });
        if (!bCompany) bCompany = await InvoiceCompany.findOne();

        const invoice = new Invoice({
            invoiceNumber,
            invoiceDate: invoiceDate || Date.now(),
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

        // If billing company changed, update snapshot
        if (billingCompanyId && (!invoice.billingCompany || billingCompanyId.toString() !== invoice.billingCompany.toString())) {
            const bCompany = await InvoiceCompany.findById(billingCompanyId);
            if (bCompany) {
                invoice.billingCompany = bCompany._id;
                invoice.billingCompanySnapshot = companySnapshot(bCompany);
            }
        }

        // If customer changed, update snapshot
        if (customerId && customerId.toString() !== invoice.customer.toString()) {
            const customer = await InvoiceCustomer.findById(customerId);
            if (!customer) return res.status(404).json({ message: 'Customer not found.' });
            invoice.customer = customer._id;
            invoice.customerSnapshot = {
                customerId: customer.customerId,
                name: customer.name,
                address: customer.address,
                contactNo: customer.contactNo,
                email: customer.email,
                gstNo: customer.gstNo,
                vendorCode: customer.vendorCode
            };
        }

        if (invoiceNumber) invoice.invoiceNumber = invoiceNumber;
        if (invoiceDate) invoice.invoiceDate = invoiceDate;
        if (dueDate) invoice.dueDate = dueDate;
        if (deptCode !== undefined) invoice.deptCode = deptCode;
        if (poId !== undefined) invoice.poId = poId;
        if (serviceType) invoice.serviceType = serviceType;
        if (candidates) invoice.candidates = candidates;
        if (chargeableSalary !== undefined) invoice.chargeableSalary = Number(chargeableSalary);
        if (rate !== undefined) invoice.rate = Number(rate);
        if (paymentStatus) invoice.paymentStatus = paymentStatus;
        if (receivableAmount !== undefined) invoice.receivableAmount = Number(receivableAmount);
        if (tdsAmount !== undefined) invoice.tdsAmount = Number(tdsAmount);
        if (receivedDate !== undefined) invoice.receivedDate = receivedDate || null;
        if (notes !== undefined) invoice.notes = notes;

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

// GET /api/invoices/:id/pdf  — download invoice PDF
router.get('/:id/pdf', adminOnly, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id).populate('customer');
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

        const snap = invoice.customerSnapshot || {};
        const co = invoice.billingCompanySnapshot || {};
        const coName = co.name || 'Ken McCoy Consulting';
        const coTagline = co.tagline || 'Sourcing · Recruiting · Onboarding';
        const coSac = co.sacCode || '998516';
        const fmt = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '0.00';
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

        // ── Build PDF ────────────────────────────────────────
        const doc = new PDFDocument({ size: 'A4', margin: 0 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
        doc.pipe(res);

        const W = 595.28;  // A4 width
        const H = 841.89;  // A4 height
        const ML = 30;     // left margin
        const MR = W - 30; // right margin
        const CW = MR - ML; // content width
        const BLUE = '#003087';
        const LIGHTBLUE = '#e8f0fe';
        const GRAY = '#666666';
        const BLACK = '#000000';
        const RED = '#cc0000';

        let y = 0;

        // ── Header band ───────────────────────────────────
        doc.rect(0, 0, W, 70).fill(BLUE);
        doc.fontSize(22).fillColor('white').font('Helvetica-Bold')
            .text('TAX INVOICE', ML, 18, { width: CW / 2 });
        doc.fontSize(11).fillColor('white').font('Helvetica-Bold')
            .text(coName, ML + CW / 2, 16, { width: CW / 2, align: 'right' });
        doc.fontSize(8).fillColor('#ccddff').font('Helvetica')
            .text(coTagline, ML + CW / 2, 33, { width: CW / 2, align: 'right' });
        doc.fontSize(8).fillColor('#ccddff')
            .text('SAC Code: ' + coSac, ML + CW / 2, 46, { width: CW / 2, align: 'right' });

        y = 82;

        // ── Two-column info box ───────────────────────────
        const col1X = ML;
        const col2X = ML + CW / 2 + 10;
        const colW = CW / 2 - 10;

        // Left column: Customer
        doc.rect(col1X, y, colW, 14).fill(BLUE);
        doc.fontSize(9).fillColor('white').font('Helvetica-Bold')
            .text('CUSTOMER', col1X + 4, y + 3);

        y += 14;
        const custBoxTop = y;

        doc.rect(col1X, y, colW, 110).strokeColor('#aaaaaa').stroke();

        const lbl = (label, value, yy, xOff = 0) => {
            doc.fontSize(8).fillColor(GRAY).font('Helvetica')
                .text(label, col1X + 4 + xOff, yy);
            doc.fontSize(8.5).fillColor(BLACK).font('Helvetica-Bold')
                .text(value || '—', col1X + 72 + xOff, yy, { width: colW - 76 });
        };

        lbl('Cust. Name:', snap.name || '', y + 5);
        lbl('Address:', snap.address || '', y + 20, 0);
        doc.fontSize(8).fillColor(GRAY).font('Helvetica').text('Address:', col1X + 4, y + 20);
        doc.fontSize(8.5).fillColor(BLACK).font('Helvetica-Bold')
            .text(snap.address || '—', col1X + 72, y + 20, { width: colW - 76 });
        lbl('Tel:', snap.contactNo || '', y + 60);
        lbl('Email:', snap.email || '', y + 74);

        // Right column: Invoice details
        const rTop = custBoxTop - 14;
        doc.rect(col2X, rTop, colW, 14).fill(BLUE);
        doc.fontSize(9).fillColor('white').font('Helvetica-Bold')
            .text('INVOICE DETAILS', col2X + 4, rTop + 3);

        doc.rect(col2X, rTop + 14, colW, 110).strokeColor('#aaaaaa').stroke();

        const rLbl = (label, value, yy) => {
            doc.fontSize(8).fillColor(GRAY).font('Helvetica')
                .text(label, col2X + 4, yy, { width: 70 });
            doc.fontSize(8.5).fillColor(BLACK).font('Helvetica-Bold')
                .text(value || '—', col2X + 76, yy, { width: colW - 80 });
        };

        const rY = rTop + 18;
        rLbl('Invoice No:', invoice.invoiceNumber, rY);
        rLbl('Date:', fmtDate(invoice.invoiceDate), rY + 14);
        rLbl('Customer ID:', snap.customerId || '', rY + 28);
        rLbl('Due Date:', fmtDate(invoice.dueDate), rY + 42);
        rLbl('Vendor Code:', snap.vendorCode || 'NA', rY + 56);
        rLbl('Dept Code:', invoice.deptCode || 'NA', rY + 70);
        rLbl('PO ID:', invoice.poId || '—', rY + 84);
        rLbl('GSTN:', snap.gstNo || '—', rY + 98);

        y = custBoxTop + 115;

        // ── Service Description Header ───────────────────
        const serviceLabel = invoice.serviceType === 'assessment'
            ? 'Assessment Center Based Recommendation and Onboarding Charges For:'
            : 'Sourcing, Recruiting and Onboarding Charges For:';

        doc.rect(ML, y, CW, 14).fill(LIGHTBLUE);
        doc.fontSize(8.5).fillColor(BLUE).font('Helvetica-Bold')
            .text(serviceLabel, ML + 4, y + 3, { width: CW - 8 });
        y += 14;

        // ── Candidates Table ─────────────────────────────
        const colWidths = [30, 150, 130, 80, 90];
        const headers = ['S.No.', 'Candidate Name', 'Designation / Level', 'Date of Joining', 'Chargeable Salary'];
        const tblX = [ML, ML + 30, ML + 180, ML + 310, ML + 390];

        // Table header
        doc.rect(ML, y, CW, 16).fill(BLUE);
        headers.forEach((h, i) => {
            doc.fontSize(8).fillColor('white').font('Helvetica-Bold')
                .text(h, tblX[i] + 2, y + 4, { width: colWidths[i] - 4, align: i >= 3 ? 'right' : 'left' });
        });
        y += 16;

        // Candidate rows
        const candidates = invoice.candidates || [];
        if (candidates.length === 0) {
            // Empty placeholder row
            doc.rect(ML, y, CW, 18).strokeColor('#dddddd').stroke();
            doc.fontSize(8).fillColor(GRAY).text('—', ML + 4, y + 5);
            y += 18;
        } else {
            candidates.forEach((c, idx) => {
                const rowH = 18;
                doc.rect(ML, y, CW, rowH).fillAndStroke(idx % 2 === 0 ? '#f9f9f9' : 'white', '#dddddd');

                const desigLevel = [c.designation, c.level].filter(Boolean).join(' / ');
                const cells = [
                    String(idx + 1),
                    c.name || '—',
                    desigLevel || '—',
                    fmtDate(c.dateOfJoining),
                    fmt(invoice.chargeableSalary)
                ];
                cells.forEach((cell, i) => {
                    doc.fontSize(8).fillColor(BLACK).font('Helvetica')
                        .text(cell, tblX[i] + 2, y + 5, { width: colWidths[i] - 4, align: i >= 3 ? 'right' : 'left' });
                });
                y += rowH;
            });
        }

        y += 8;

        // ── Financial Summary ────────────────────────────
        const sumX = ML + CW - 220;
        const sumW = 220;

        const sumRow = (label, value, isBold = false, bgColor = null, textColor = BLACK) => {
            if (bgColor) {
                doc.rect(sumX, y, sumW, 16).fill(bgColor);
            }
            doc.fontSize(8.5)
                .fillColor(isBold ? BLUE : GRAY)
                .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
                .text(label, sumX + 4, y + 4, { width: 120 });
            doc.fontSize(8.5)
                .fillColor(textColor)
                .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
                .text(value, sumX + 120, y + 4, { width: 96, align: 'right' });
            doc.rect(sumX, y, sumW, 16).strokeColor('#dddddd').stroke();
            y += 16;
        };

        sumRow('Chargeable Salary', `Rs. ${fmt(invoice.chargeableSalary)}`);
        sumRow(`Rate (${invoice.rate}%)`, `Rs. ${fmt(invoice.chargeableAmount)}`);

        if (invoice.cgst > 0) {
            sumRow('CGST @ 9%', `Rs. ${fmt(invoice.cgst)}`);
            sumRow('SGST @ 9%', `Rs. ${fmt(invoice.sgst)}`);
        } else {
            sumRow('IGST @ 18%', `Rs. ${fmt(invoice.igst)}`);
        }
        sumRow('Total GST', `Rs. ${fmt(invoice.totalGst)}`);
        sumRow('Total Amount', `Rs. ${fmt(invoice.totalAmount)}`, true, LIGHTBLUE, BLUE);
        sumRow('Net Payable', `Rs. ${fmt(invoice.netPayable)}`, true, BLUE, 'white');

        y += 6;

        // Amount in words
        doc.rect(ML, y, CW, 20).fillAndStroke(LIGHTBLUE, '#aaaaaa');
        doc.fontSize(8).fillColor(GRAY).font('Helvetica').text('Amount in Words:', ML + 4, y + 6);
        doc.fontSize(8.5).fillColor(BLUE).font('Helvetica-Bold')
            .text(numberToWords(invoice.netPayable) + ' Only', ML + 100, y + 6, { width: CW - 106 });
        y += 26;

        // ── Bank & Signature ─────────────────────────────
        const bW = CW / 2 - 5;

        doc.rect(ML, y, bW, 14).fill(BLUE);
        doc.fontSize(9).fillColor('white').font('Helvetica-Bold')
            .text('OUR BANK & OTHER DETAILS', ML + 4, y + 3);

        doc.rect(col2X, y, bW, 14).fill(BLUE);
        doc.fontSize(9).fillColor('white').font('Helvetica-Bold')
            .text('AUTHORISED SIGNATURE', col2X + 4, y + 3);

        y += 14;
        const bankBoxH = 70;
        doc.rect(ML, y, bW, bankBoxH).strokeColor('#aaaaaa').stroke();
        doc.rect(col2X, y, bW, bankBoxH).strokeColor('#aaaaaa').stroke();

        const bLbl = (label, value, yy) => {
            doc.fontSize(8).fillColor(GRAY).font('Helvetica').text(label, ML + 4, yy, { width: 80 });
            doc.fontSize(8.5).fillColor(BLACK).font('Helvetica-Bold').text(value || '', ML + 86, yy, { width: bW - 90 });
        };
        bLbl('PAN Number:', co.panNumber || process.env.COMPANY_PAN || '', y + 5);
        bLbl('Account Name:', co.accountName || coName, y + 18);
        const bankBranch = [co.bankName, co.branchName].filter(Boolean).join(', ');
        bLbl('Bank & Branch:', bankBranch || process.env.COMPANY_BANK || '', y + 31);
        bLbl('CA Number:', co.caNumber || process.env.COMPANY_CA || '', y + 44);
        bLbl('GSTN:', co.gstn || process.env.COMPANY_GSTN || '', y + 57);

        doc.fontSize(8.5).fillColor(BLUE).font('Helvetica-Bold')
            .text('For ' + coName, col2X + 4, y + 5);
        doc.fontSize(7.5).fillColor(GRAY).font('Helvetica')
            .text('(Authorised Signatory)', col2X + 4, y + bankBoxH - 16);

        y += bankBoxH + 6;

        // ── Terms & Conditions ───────────────────────────
        doc.rect(ML, y, CW, 14).fill(BLUE);
        doc.fontSize(9).fillColor('white').font('Helvetica-Bold')
            .text('TERMS & CONDITIONS', ML + 4, y + 3);
        y += 14;

        const terms = [
            '1. Please comply with TDS provisions, if applicable.',
            `2. All payments should be made in favor of "${coName}" only.`,
            '3. Interest @ 21% per annum will be charged beyond due date.',
            '4. Payment once made shall not be refunded.',
            '5. All disputes are within Mumbai jurisdiction only.'
        ];
        terms.forEach(t => {
            doc.fontSize(7.5).fillColor(BLACK).font('Helvetica').text(t, ML + 4, y + 2);
            y += 12;
        });

        y += 4;
        doc.fontSize(7.5).fillColor(GRAY).font('Helvetica-Oblique')
            .text('Thank you for giving us business! For Invoice/Accounts queries please call Accounts – Ravi: +91 7506327582',
                ML, y, { width: CW, align: 'center' });

        doc.end();
    } catch (err) {
        console.error('PDF generation error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ════════════════════════════════════════════════════════════
//   HELPER: Number to Words (Indian numbering)
// ════════════════════════════════════════════════════════════
function numberToWords(num) {
    if (!num || num === 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'];
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

    if (n >= 10000000) {
        result += convert(Math.floor(n / 10000000)) + ' Crore ';
        n %= 10000000;
    }
    if (n >= 100000) {
        result += convert(Math.floor(n / 100000)) + ' Lakh ';
        n %= 100000;
    }
    if (n >= 1000) {
        result += convert(Math.floor(n / 1000)) + ' Thousand ';
        n %= 1000;
    }
    if (n > 0) result += convert(n);

    result = 'Rupees ' + result.trim();
    if (paise > 0) result += ' and ' + convert(paise) + ' Paise';

    return result;
}

module.exports = router;

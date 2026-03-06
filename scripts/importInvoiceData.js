/**
 * scripts/importInvoiceData.js
 *
 * Imports Customer Details and Invoice Data from the KM Invoice Excel (.xlsm)
 * into MongoDB.
 *
 * Usage:
 *   node scripts/importInvoiceData.js [path-to-xlsm]
 *
 * If no path given, it defaults to public/KM Invoice 2526.xlsm
 *
 * Prerequisites:
 *   npm install xlsx
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const InvoiceCustomer = require('../models/InvoiceCustomer');
const Invoice = require('../models/Invoice');

async function main() {
    let XLSX;
    try {
        XLSX = require('xlsx');
    } catch (e) {
        console.error('xlsx package not found. Run: npm install xlsx');
        process.exit(1);
    }

    const filePath = process.argv[2] || path.join(__dirname, '../public/KM Invoice 2526.xlsm');

    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        process.exit(1);
    }

    console.log('Reading file:', filePath);
    const wb = XLSX.readFile(filePath, { cellDates: true, bookVBA: false });

    // ── Connect to MongoDB ───────────────────────────────────────
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_sales';
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB:', uri);

    // ════════════════════════════════════
    //  1. Import Customer Details
    // ════════════════════════════════════
    const custSheet = wb.Sheets['Customer Details'];
    if (custSheet) {
        const rows = XLSX.utils.sheet_to_json(custSheet, { defval: null });
        let imported = 0, skipped = 0;

        for (const row of rows) {
            const customerId = (row['Customer Id'] || '').toString().trim().toUpperCase();
            if (!customerId) continue;

            try {
                await InvoiceCustomer.findOneAndUpdate(
                    { customerId },
                    {
                        customerId,
                        name: (row['Name'] || '').toString().trim(),
                        address: (row['Address'] || '').toString().trim(),
                        contactNo: (row['Contact No.'] || '').toString().trim(),
                        email: (row['Email'] || '').toString().trim().toLowerCase(),
                        gstNo: (row['GST No'] || '').toString().trim().toUpperCase(),
                        vendorCode: (row['Vendor Code'] || 'NA').toString().trim()
                    },
                    { upsert: true, new: true, runValidators: true }
                );
                imported++;
                console.log(`  ✓ Customer: ${customerId}`);
            } catch (e) {
                console.warn(`  ✗ Skipped ${customerId}: ${e.message}`);
                skipped++;
            }
        }
        console.log(`\nCustomers: ${imported} imported / ${skipped} skipped`);
    } else {
        console.warn('Sheet "Customer Details" not found in workbook');
    }

    // ════════════════════════════════════
    //  2. Import Invoice Data
    // ════════════════════════════════════
    const invSheet = wb.Sheets['Invoice Data'];
    if (invSheet) {
        const rows = XLSX.utils.sheet_to_json(invSheet, { defval: null });
        const nonEmpty = rows.filter(r => r['Invoice Number.']);
        console.log(`\nInvoice Data: ${nonEmpty.length} rows with data (${rows.length} total rows in sheet)`);

        if (nonEmpty.length === 0) {
            console.log('  No invoice data found to import (sheet appears to be a template).');
        } else {
            let imported = 0, skipped = 0;

            for (const row of nonEmpty) {
                const invoiceNumber = (row['Invoice Number.'] || '').toString().trim();
                if (!invoiceNumber) continue;

                // Try to find matching customer
                const custName = (row['Customer Company Name'] || '').toString().trim();
                const customer = await InvoiceCustomer.findOne({
                    name: { $regex: custName.substring(0, 10), $options: 'i' }
                });

                if (!customer) {
                    console.warn(`  ✗ Skipped invoice ${invoiceNumber}: customer "${custName}" not found`);
                    skipped++;
                    continue;
                }

                const chargeableAmount = parseFloat(row['Chargable Amt']) || 0;
                const gstAmt = parseFloat(row['GST Amt']) || 0;

                // Determine payment status
                let paymentStatus = 'unpaid';
                if (row['Received Date']) paymentStatus = 'paid';
                else if (row['Due Date'] && new Date(row['Due Date']) < new Date()) paymentStatus = 'overdue';

                try {
                    await Invoice.findOneAndUpdate(
                        { invoiceNumber },
                        {
                            invoiceNumber,
                            invoiceDate: row['Invoice Date '] ? new Date(row['Invoice Date ']) : new Date(),
                            dueDate: row['Due Date'] ? new Date(row['Due Date']) : null,
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
                            chargeableSalary: chargeableAmount > 0 ? chargeableAmount : 0,
                            rate: 100, // rate stored as 100% since chargeable amount = salary in this case
                            chargeableAmount,
                            totalGst: gstAmt,
                            totalAmount: chargeableAmount + gstAmt,
                            netPayable: Math.round(chargeableAmount + gstAmt),
                            candidates: row['Candidate Name']
                                ? [{
                                    name: (row['Candidate Name'] || '').toString().trim(),
                                    dateOfJoining: row['Candidate  DOJ'] ? new Date(row['Candidate  DOJ']) : null
                                }]
                                : [],
                            paymentStatus,
                            receivableAmount: parseFloat(row['Receivable Amt']) || 0,
                            tdsAmount: parseFloat(row['TDS Amt']) || 0,
                            receivedDate: row['Received Date'] ? new Date(row['Received Date']) : null
                        },
                        { upsert: true, new: true }
                    );
                    imported++;
                } catch (e) {
                    console.warn(`  ✗ Skipped invoice ${invoiceNumber}: ${e.message}`);
                    skipped++;
                }
            }
            console.log(`Invoices: ${imported} imported / ${skipped} skipped`);
        }
    } else {
        console.warn('Sheet "Invoice Data" not found in workbook');
    }

    await mongoose.disconnect();
    console.log('\nDone. Disconnected from MongoDB.');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

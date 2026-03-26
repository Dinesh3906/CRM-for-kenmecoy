/**
 * Utility functions for generating Word documents and handling digital signatures
 */

const { Document, Packer, Paragraph, Table, TableCell, TableRow, Bookmark, BorderStyle, VerticalAlign, AlignmentType, TextRun, PageBreak, UnderlineType, ImageRun } = require('docx');
const fs = require('fs');
const path = require('path');

/**
 * Generate a table cell with text
 */
function createTableCell(text, options = {}) {
    const { bold = false, align = AlignmentType.LEFT, width = 1500, shading = null } = options;
    return new TableCell({
        children: [
            new Paragraph({
                text: text || '—',
                bold,
                alignment: align,
                size: 16
            })
        ],
        width,
        shading,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
    });
}

/**
 * Generate invoice as Word document
 */
async function generateInvoiceWord(invoice, companyInfo) {
    const snap = invoice.customerSnapshot || invoice.customer || {};
    const co = invoice.billingCompany || invoice.billingCompanySnapshot || companyInfo || {};
    const coName = co.name || 'Ken McCoy Consulting';
    const coTagline = co.tagline || 'Sourcing · Recruiting · Onboarding';
    const coSac = co.sacCode || '998516';

    // Load logo
    const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo-kmc.jpg');
    let logoBuffer = null;
    try { if (fs.existsSync(logoPath)) logoBuffer = fs.readFileSync(logoPath); } catch (e) { /* no logo */ }

    const fmt = (n) => n ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '0.00';
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

    const candidates = invoice.candidates || [];
    const totalGst = (invoice.cgst || 0) + (invoice.sgst || 0) + (invoice.igst || 0);

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 720, // 0.5 inch
                        right: 720,
                        bottom: 720,
                        left: 720,
                    },
                },
            },
            children: [
                // Header Band (Simulated with Table)
                new Table({
                    width: { size: 100, type: 'pct' },
                    borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE },
                        right: { style: BorderStyle.NONE },
                    },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    shading: { fill: '003087' },
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({ text: 'TAX INVOICE', bold: true, color: 'FFFFFF', size: 48 }),
                                            ],
                                            alignment: AlignmentType.LEFT,
                                            spacing: { before: 200, after: 200 },
                                        })
                                    ],
                                    margins: { left: 200 },
                                }),
                                new TableCell({
                                    shading: { fill: '003087' },
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({ text: coName, bold: true, color: 'FFFFFF', size: 40 }), // Increased to 20pt
                                            ],
                                            alignment: AlignmentType.RIGHT,
                                        }),
                                        new Paragraph({
                                            children: [
                                                new TextRun({ text: coTagline, color: 'CCDDFF', size: 20 }),
                                            ],
                                            alignment: AlignmentType.RIGHT,
                                        }),
                                        new Paragraph({
                                            children: [
                                                new TextRun({ text: `SAC Code: ${coSac}`, color: 'CCDDFF', size: 18 }),
                                            ],
                                            alignment: AlignmentType.RIGHT,
                                            spacing: { after: 100 },
                                        }),
                                    ],
                                    margins: { right: 200 },
                                })
                            ]
                        })
                    ]
                }),

                new Paragraph({ text: '', spacing: { after: 300 } }),

                // Info columns
                new Table({
                    width: { size: 100, type: 'pct' },
                    borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE },
                        right: { style: BorderStyle.NONE },
                        insideHorizontal: { style: BorderStyle.NONE },
                        insideVertical: { style: BorderStyle.NONE },
                    },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    width: { size: 48, type: 'pct' },
                                    children: [
                                        new Paragraph({
                                            children: [new TextRun({ text: 'CUSTOMER', bold: true, color: 'FFFFFF' })],
                                            shading: { fill: '003087' },
                                            spacing: { before: 100, after: 100 },
                                            alignment: AlignmentType.LEFT,
                                        }),
                                        new Table({
                                            width: { size: 100, type: 'pct' },
                                            rows: [
                                                new TableRow({
                                                    children: [
                                                        new TableCell({
                                                            children: [
                                                                new Paragraph({ children: [new TextRun({ text: snap.name || '—', bold: true, size: 28 })], spacing: { before: 100, after: 100 } }), // Increased to 14pt
                                                                new Paragraph({ text: snap.address || '', size: 18, spacing: { after: 100 } }),
                                                                new Paragraph({ text: `Tel: ${snap.contactNo || '—'}`, size: 16, spacing: { after: 30 } }),
                                                                new Paragraph({ text: `Email: ${snap.email || '—'}`, size: 16, spacing: { after: 100 } }),
                                                                new Paragraph({ text: `GSTN: ${snap.gstNo || '—'}`, size: 18, bold: true }),
                                                            ],
                                                            margins: { left: 100, right: 100, top: 100, bottom: 100 },
                                                        })
                                                    ]
                                                })
                                            ]
                                        })
                                    ],
                                }),
                                new TableCell({ width: { size: 4, type: 'pct' }, children: [] }), // spacer
                                new TableCell({
                                    width: { size: 48, type: 'pct' },
                                    children: [
                                        new Paragraph({
                                            children: [new TextRun({ text: 'INVOICE DETAILS', bold: true, color: 'FFFFFF' })],
                                            shading: { fill: '003087' },
                                            spacing: { before: 100, after: 100 },
                                            alignment: AlignmentType.LEFT,
                                        }),
                                        new Table({
                                            width: { size: 100, type: 'pct' },
                                            rows: [
                                                new TableRow({
                                                    children: [
                                                        new TableCell({
                                                            children: [
                                                                new Paragraph({ text: `Invoice No: ${invoice.invoiceNumber}`, bold: true, size: 18, spacing: { before: 100, after: 60 } }),
                                                                new Paragraph({ text: `Date: ${fmtDate(invoice.invoiceDate)}`, size: 18, spacing: { after: 60 } }),
                                                                new Paragraph({ text: `Due Date: ${fmtDate(invoice.dueDate)}`, size: 18, spacing: { after: 60 }, bold: true }),
                                                                new Paragraph({ text: `Dept Code: ${invoice.deptCode || 'NA'}`, size: 18, spacing: { after: 60 } }),
                                                                new Paragraph({ text: `PO ID: ${invoice.poId || '—'}`, size: 18 }),
                                                            ],
                                                            margins: { left: 100, right: 100, top: 100, bottom: 100 },
                                                        })
                                                    ]
                                                })
                                            ]
                                        })
                                    ],
                                })
                            ]
                        })
                    ]
                }),

                new Paragraph({
                    text: `Sourcing, Recruiting and Onboarding Charges For: ${invoice.chargesFor || ''}`,
                    bold: true,
                    color: '003087',
                    size: 20,
                    spacing: { before: 400, after: 150 },
                }),

                // Candidates table
                new Table({
                    width: { size: 100, type: 'pct' },
                    rows: [
                        new TableRow({
                            children: [
                                createTableCell('S.No.', { bold: true, shading: { fill: '003087' } }),
                                createTableCell('Candidate Name', { bold: true, shading: { fill: '003087' } }),
                                createTableCell('Designation / Level', { bold: true, shading: { fill: '003087' } }),
                                createTableCell('Joining Date', { bold: true, shading: { fill: '003087' } }),
                                createTableCell('Chargeable Salary', { bold: true, shading: { fill: '003087' }, align: AlignmentType.RIGHT })
                            ]
                        }),
                        ...(candidates.length === 0
                            ? [new TableRow({
                                children: [createTableCell('—'), createTableCell(''), createTableCell(''), createTableCell(''), createTableCell('')]
                            })]
                            : candidates.map((c, idx) => new TableRow({
                                children: [
                                    createTableCell(String(idx + 1)),
                                    createTableCell(c.name || '—', { bold: true }),
                                    createTableCell([c.designation, c.level].filter(Boolean).join(' / ') || '—'),
                                    createTableCell(fmtDate(c.dateOfJoining)),
                                    createTableCell(fmt(invoice.chargeableSalary), { align: AlignmentType.RIGHT })
                                ]
                            }))
                        )
                    ]
                }),

                new Paragraph({ text: '', spacing: { after: 300 } }),

                // Summary and Signature area
                new Table({
                    width: { size: 100, type: 'pct' },
                    borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE },
                        right: { style: BorderStyle.NONE },
                        insideHorizontal: { style: BorderStyle.NONE },
                        insideVertical: { style: BorderStyle.NONE },
                    },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    width: { size: 60, type: 'pct' },
                                    children: [
                                        new Paragraph({ children: [new TextRun({ text: 'AMOUNT IN WORDS', size: 16, bold: true, color: '64748B' })], spacing: { after: 40 } }),
                                        new Paragraph({ children: [new TextRun({ text: `${numberToWords(invoice.netPayable)} Only`, bold: true, color: '003087', size: 18 })] }),
                                        new Paragraph({ text: '', spacing: { after: 400 } }),
                                        new Paragraph({ text: 'AUTHORISED SIGNATURE', bold: true, color: '003087', size: 18, spacing: { after: 60 } }),
                                        new Paragraph({ text: '', spacing: { after: 600 } }), // SPACE FOR SIGNATURE/STAMP
                                        new Paragraph({ text: `For ${coName}`, bold: true, size: 16 }),
                                        new Paragraph({ text: '(Authorised Signatory & Seal)', size: 14, color: '666666' }),
                                        // Logo bottom-right of signature cell
                                        ...(logoBuffer ? [
                                            new Paragraph({
                                                alignment: AlignmentType.RIGHT,
                                                children: [new ImageRun({ data: logoBuffer, transformation: { width: 100, height: 36 }, type: 'jpg' })],
                                                spacing: { before: 100 }
                                            })
                                        ] : [])
                                    ]
                                }),
                                new TableCell({
                                    width: { size: 40, type: 'pct' },
                                    children: [
                                        new Table({
                                            width: { size: 100, type: 'pct' },
                                            rows: [
                                                new TableRow({
                                                    children: [
                                                        createTableCell(`Rate (${invoice.rate}%)`, { size: 16 }),
                                                        createTableCell(fmt(invoice.chargeableAmount), { align: AlignmentType.RIGHT, size: 16 }),
                                                    ]
                                                }),
                                                new TableRow({
                                                    children: [
                                                        createTableCell('Total GST', { bold: true, size: 16 }),
                                                        createTableCell(fmt(totalGst), { bold: true, align: AlignmentType.RIGHT, size: 16 }),
                                                    ]
                                                }),
                                                new TableRow({
                                                    children: [
                                                        createTableCell('NET PAYABLE', { bold: true, color: '003087', size: 20, shading: { fill: 'F0F7FF' } }),
                                                        createTableCell(`Rs. ${fmt(invoice.netPayable)}`, { bold: true, align: AlignmentType.RIGHT, color: '003087', size: 20, shading: { fill: 'F0F7FF' } }),
                                                    ]
                                                })
                                            ]
                                        })
                                    ]
                                })
                            ]
                        })
                    ]
                }),
            ],
            footers: {
                default: new Paragraph({
                    border: { bottom: { color: 'FF9900', size: 24, style: BorderStyle.SINGLE } },
                    children: [
                        new TextRun({ text: 'Thank you for your business! For queries: Accounts – Tel: 91-22-42959123', size: 16, color: '666666', italic: true }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 200 },
                }),
            },
        }],
    });

    return await Packer.toBuffer(doc);
}

module.exports = {
    generateInvoiceWord,
    createTableCell
};

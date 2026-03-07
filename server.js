const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();
const session = require('express-session');
const ejs = require('ejs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|xls|xlsx|png|jpg|jpeg|gif|txt|csv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, DOC, DOCX, XLS, XLSX, PNG, JPG allowed.'));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: fileFilter
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public', {
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}));
app.use('/uploads', express.static('uploads')); // Serve uploaded files
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(session({ secret: 'crm_admin_secret', resave: false, saveUninitialized: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_sales', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', async () => {
    console.log('Connected to MongoDB');

    // Seed default billing company (Ken McCoy Consulting) if none exist
    try {
        const InvoiceCompany = require('./models/InvoiceCompany');
        const count = await InvoiceCompany.countDocuments();
        if (count === 0) {
            await InvoiceCompany.create({
                name: 'Ken McCoy Consulting',
                tagline: 'Sourcing · Recruiting · Onboarding',
                sacCode: '998516',
                panNumber: process.env.COMPANY_PAN || 'AADCK1234P',
                accountName: 'Ken McCoy Consulting',
                bankName: process.env.COMPANY_BANK || '',
                caNumber: process.env.COMPANY_CA || '',
                gstn: process.env.COMPANY_GSTN || '',
                isPrimary: true
            });
            console.log('Seeded default billing company: Ken McCoy Consulting');
        }
    } catch (e) {
        console.error('Billing company seed error:', e.message);
    }
});

// Import routes
const leadRoutes = require('./routes/leads');
const pipelineRoutes = require('./routes/pipeline');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const taskRoutes = require('./routes/tasks');
const communicationRoutes = require('./routes/communication');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');
const activityLogRoutes = require('./routes/activityLogs');
const statisticsRoutes = require('./routes/statistics');
const notificationRoutes = require('./routes/notifications');
const invoiceRoutes = require('./routes/invoices');

// Use routes
app.use('/api/leads', leadRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api/email', require('./routes/emailConfig'));
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/invoices', invoiceRoutes);

// File upload endpoint
const auth = require('./middleware/auth');
const Lead = require('./models/Lead');

app.post('/api/upload', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { leadId, description } = req.body;

        if (!leadId) {
            // Delete uploaded file if no leadId provided
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'Lead ID is required' });
        }

        const lead = await Lead.findOne({
            _id: leadId,
            $or: [
                { user: req.user._id },
                { assignedTo: req.user._id }
            ]
        });
        if (!lead) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ message: 'Lead not found or you do not have access' });
        }

        const attachment = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: `/uploads/${req.file.filename}`,
            mimetype: req.file.mimetype,
            size: req.file.size,
            description: description || '',
            uploadedBy: req.user._id
        };

        lead.attachments.push(attachment);

        lead.timeline.push({
            action: 'file_attached',
            description: `File attached: ${req.file.originalname}`,
            performedBy: req.user._id,
            metadata: { filename: req.file.originalname, size: req.file.size }
        });

        await lead.save();

        res.json({
            message: 'File uploaded successfully',
            file: attachment,
            lead: lead
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: 'Error uploading file', error: error.message });
    }
});

// Redirect root to professional dashboard
app.get('/', (req, res) => {
    res.render('dashboard');
});

// Serve the professional dashboard
app.get('/dashboard', (req, res) => {
    res.render('dashboard');
});

// Serve the basic pipeline view (old frontend)
app.get('/pipeline', (req, res) => {
    res.render('index');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 
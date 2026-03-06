// This script creates an initial admin user for the CRM system
// Run with: node scripts/createAdmin.js

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_sales', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

// Import User model after connection
const User = require('../models/User');

async function createAdminUser() {
    try {
        // Check if admin already exists
        const existingAdmin = await User.findOne({ email: 'admin@crm.com' });
        
        if (existingAdmin) {
            console.log('Admin user already exists!');
            console.log('Email:', existingAdmin.email);
            console.log('Role:', existingAdmin.role);
            process.exit(0);
        }

        // Generate API key
        const apiKey = crypto.randomBytes(32).toString('hex');

        // Create admin user
        const admin = new User({
            email: 'admin@crm.com',
            password: 'admin123', // Change this in production!
            fullName: 'System Administrator',
            username: 'admin',
            phone: '',
            department: 'Management',
            role: 'admin',
            apiKey,
            isActive: true
        });

        await admin.save();

        console.log('✅ Admin user created successfully!');
        console.log('\n=================================');
        console.log('Login Credentials:');
        console.log('Email: admin@crm.com');
        console.log('Password: admin123');
        console.log('=================================');
        console.log('\n⚠️  IMPORTANT: Change the password after first login!');
        console.log('API Key:', apiKey);
        console.log('=================================\n');

        process.exit(0);
    } catch (error) {
        console.error('Error creating admin user:', error);
        process.exit(1);
    }
}

db.once('open', () => {
    console.log('Connected to MongoDB');
    createAdminUser();
});

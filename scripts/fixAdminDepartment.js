require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function fixAdminDepartment() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_sales', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        const result = await User.updateOne(
            { email: 'admin@crm.com' },
            { $set: { department: 'sales' } }
        );

        console.log('Update result:', result);

        const admin = await User.findOne({ email: 'admin@crm.com' });
        console.log('Admin user verified:', {
            email: admin.email,
            role: admin.role,
            department: admin.department
        });

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Fix failed:', error);
        process.exit(1);
    }
}

fixAdminDepartment();

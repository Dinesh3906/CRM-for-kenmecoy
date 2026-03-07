require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function changeAdminDepartment() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_sales', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        const email = process.argv[2];
        const newDepartment = process.argv[3];

        if (!email || !newDepartment) {
            console.log('Usage: node changeUserDepartment.js <email> <sales|operations>');
            process.exit(1);
        }

        if (!['sales', 'operations'].includes(newDepartment)) {
            console.log('Department must be either "sales" or "operations"');
            process.exit(1);
        }

        const result = await User.updateOne(
            { email: email },
            { $set: { department: newDepartment } }
        );

        if (result.matchedCount === 0) {
            console.log(`User with email ${email} not found`);
        } else {
            console.log(`✓ Updated ${email} department to: ${newDepartment}`);
            
            const user = await User.findOne({ email: email });
            console.log('\nUser details:');
            console.log('  Email:', user.email);
            console.log('  Role:', user.role);
            console.log('  Department:', user.department);
            console.log('\n⚠️  User must LOGOUT and LOGIN again to see the changes!');
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

changeAdminDepartment();

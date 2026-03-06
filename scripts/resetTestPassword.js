require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function resetPassword() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        const email = process.argv[2] || 'superadmin@test.com';
        const newPassword = process.argv[3] || 'test123';

        console.log(`Resetting password for: ${email}`);
        
        const user = await User.findOne({ email });
        
        if (!user) {
            console.log(`User not found: ${email}`);
            process.exit(1);
        }

        console.log(`Found user: ${user.fullName} (${user.role})`);
        
        // Hash the password properly
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password directly
        user.password = hashedPassword;
        await user.save();
        
        console.log(`✓ Password updated successfully!`);
        console.log(`  Email: ${email}`);
        console.log(`  Password: ${newPassword}\n`);
        
        // Test the password
        const isMatch = await bcrypt.compare(newPassword, user.password);
        console.log(`Password verification: ${isMatch ? '✓ SUCCESS' : '✗ FAILED'}\n`);

        await mongoose.connection.close();
        
    } catch (error) {
        console.error('Error resetting password:', error);
        process.exit(1);
    }
}

resetPassword();

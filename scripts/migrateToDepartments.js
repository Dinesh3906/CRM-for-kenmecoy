require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrateToDepartments() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_sales', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        // Find all users without a department
        const usersWithoutDepartment = await User.find({
            $or: [
                { department: { $exists: false } },
                { department: null },
                { department: '' }
            ]
        });

        console.log(`Found ${usersWithoutDepartment.length} users without department assignment`);

        for (const user of usersWithoutDepartment) {
            // Default all existing users to sales department
            user.department = 'sales';
            
            // If managerId doesn't exist, set it to null
            if (!user.managerId) {
                user.managerId = null;
            }
            
            // Ensure teamMembers array exists
            if (!user.teamMembers) {
                user.teamMembers = [];
            }
            
            await user.save();
            console.log(`Updated user: ${user.email} - Department: ${user.department}, Role: ${user.role}`);
        }

        console.log('\n=== Migration Complete ===');
        console.log(`Total users updated: ${usersWithoutDepartment.length}`);
        console.log('All existing users have been assigned to Sales department by default');
        console.log('You can manually change departments through the user management interface');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateToDepartments();

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');

function generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
}

const testUsers = [
    {
        fullName: 'Super Admin',
        email: 'superadmin@test.com',
        password: 'test123',
        role: 'superadmin',
        department: 'sales' // Can see both departments
    },
    {
        fullName: 'Sales Admin',
        email: 'salesadmin@test.com',
        password: 'test123',
        role: 'admin',
        department: 'sales'
    },
    {
        fullName: 'Operations Admin',
        email: 'opsadmin@test.com',
        password: 'test123',
        role: 'admin',
        department: 'operations'
    },
    {
        fullName: 'Sales Manager',
        email: 'salesmanager@test.com',
        password: 'test123',
        role: 'manager',
        department: 'sales',
        managerId: null // Will be set to salesadmin
    },
    {
        fullName: 'Operations Manager',
        email: 'opsmanager@test.com',
        password: 'test123',
        role: 'manager',
        department: 'operations',
        managerId: null // Will be set to opsadmin
    },
    {
        fullName: 'Sales Staff 1',
        email: 'salesstaff1@test.com',
        password: 'test123',
        role: 'staff',
        department: 'sales',
        managerId: null // Will be set to salesmanager
    },
    {
        fullName: 'Sales Staff 2',
        email: 'salesstaff2@test.com',
        password: 'test123',
        role: 'staff',
        department: 'sales',
        managerId: null // Will be set to salesmanager
    },
    {
        fullName: 'Operations Staff 1',
        email: 'opsstaff1@test.com',
        password: 'test123',
        role: 'staff',
        department: 'operations',
        managerId: null // Will be set to opsmanager
    },
    {
        fullName: 'Operations Staff 2',
        email: 'opsstaff2@test.com',
        password: 'test123',
        role: 'staff',
        department: 'operations',
        managerId: null // Will be set to opsmanager
    }
];

async function createTestUsers() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Delete existing test users
        console.log('\nDeleting existing test users...');
        const testEmails = testUsers.map(u => u.email);
        await User.deleteMany({ email: { $in: testEmails } });
        console.log('Existing test users deleted');

        // Create users in order
        console.log('\nCreating test users...\n');
        const createdUsers = {};

        for (const userData of testUsers) {
            // Note: This system uses plain text passwords (NOT RECOMMENDED for production)
            // Using plain text to match the existing auth system
            
            // Set managerId based on role hierarchy
            let managerId = null;
            if (userData.role === 'manager') {
                if (userData.department === 'sales') {
                    managerId = createdUsers['salesadmin@test.com']?._id;
                } else if (userData.department === 'operations') {
                    managerId = createdUsers['opsadmin@test.com']?._id;
                }
            } else if (userData.role === 'staff') {
                if (userData.department === 'sales') {
                    managerId = createdUsers['salesmanager@test.com']?._id;
                } else if (userData.department === 'operations') {
                    managerId = createdUsers['opsmanager@test.com']?._id;
                }
            }

            const user = new User({
                fullName: userData.fullName,
                email: userData.email,
                password: userData.password, // Plain text to match existing auth system
                role: userData.role,
                department: userData.department,
                managerId: managerId,
                phone: `+1-555-${Math.floor(1000 + Math.random() * 9000)}`,
                apiKey: generateApiKey(),
                isActive: true
            });

            await user.save();
            createdUsers[userData.email] = user;

            // Update manager's teamMembers array
            if (managerId) {
                await User.findByIdAndUpdate(
                    managerId,
                    { $push: { teamMembers: user._id } }
                );
            }

            console.log(`✓ Created: ${userData.fullName} (${userData.email})`);
            console.log(`  Role: ${userData.role}`);
            console.log(`  Department: ${userData.department}`);
            if (managerId) {
                const manager = await User.findById(managerId);
                console.log(`  Manager: ${manager.fullName}`);
            }
            console.log(`  Password: ${userData.password}\n`);
        }

        console.log('\n=================================');
        console.log('TEST USERS CREATED SUCCESSFULLY!');
        console.log('=================================\n');

        console.log('Hierarchy Structure:');
        console.log('-------------------');
        console.log('Super Admin');
        console.log('  └─ superadmin@test.com (can see all departments)\n');
        
        console.log('Sales Department:');
        console.log('  Admin: salesadmin@test.com');
        console.log('    └─ Manager: salesmanager@test.com');
        console.log('        ├─ Staff: salesstaff1@test.com');
        console.log('        └─ Staff: salesstaff2@test.com\n');
        
        console.log('Operations Department:');
        console.log('  Admin: opsadmin@test.com');
        console.log('    └─ Manager: opsmanager@test.com');
        console.log('        ├─ Staff: opsstaff1@test.com');
        console.log('        └─ Staff: opsstaff2@test.com\n');

        console.log('All passwords: test123\n');
        
        console.log('Testing Instructions:');
        console.log('--------------------');
        console.log('1. SuperAdmin - Can see both sales and operations');
        console.log('2. Sales Admin - Can only see sales department');
        console.log('3. Operations Admin - Can only see operations department');
        console.log('4. Sales Manager - Can only see their sales team');
        console.log('5. Operations Manager - Can only see their operations team');
        console.log('6. Staff - Can only view assigned items and update status (no create/delete)\n');

        await mongoose.connection.close();
        console.log('MongoDB connection closed');
        
    } catch (error) {
        console.error('Error creating test users:', error);
        process.exit(1);
    }
}

createTestUsers();

// Fix invalid user permissions in database
// Run with: node scripts/fixUserPermissions.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_sales', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

async function fixUserPermissions() {
    try {
        console.log('Connected to MongoDB');
        console.log('Fixing user permissions...');
        
        // Get all users
        const users = await User.find();
        console.log(`Found ${users.length} users`);
        
        let fixedCount = 0;
        
        for (const user of users) {
            try {
                // Completely override permissions based on role
                const role = user.role.toLowerCase();
                
                if (role === 'superadmin') {
                    user.permissions = {
                        leads: { view: 'all', create: true, edit: 'all', delete: 'none', export: true, assign: true },
                        pipelines: { view: true, edit: true },
                        tasks: { view: 'all', create: true, edit: 'all', delete: 'all' },
                        users: { view: 'all', create: 'admin', edit: 'all', delete: 'all' },
                        analytics: { view: 'all' },
                        settings: { view: true, edit: true },
                        communications: { send: true, view: 'all' }
                    };
                } else if (role === 'admin') {
                    user.permissions = {
                        leads: { view: 'department', create: true, edit: 'department', delete: 'none', export: true, assign: true },
                        pipelines: { view: true, edit: true },
                        tasks: { view: 'department', create: true, edit: 'department', delete: 'department' },
                        users: { view: 'department', create: 'manager', edit: 'department', delete: 'department' },
                        analytics: { view: 'department' },
                        settings: { view: true, edit: true },
                        communications: { send: true, view: 'department' }
                    };
                } else if (role === 'manager') {
                    user.permissions = {
                        leads: { view: 'team', create: true, edit: 'team', delete: 'none', export: true, assign: true },
                        pipelines: { view: true, edit: false },
                        tasks: { view: 'team', create: true, edit: 'team', delete: 'team' },
                        users: { view: 'team', create: 'none', edit: 'none', delete: 'none' },
                        analytics: { view: 'team' },
                        settings: { view: false, edit: false },
                        communications: { send: true, view: 'team' }
                    };
                } else {
                    user.permissions = {
                        leads: { view: 'assigned', create: false, edit: 'assigned', delete: 'none', export: false, assign: false },
                        pipelines: { view: true, edit: false },
                        tasks: { view: 'assigned', create: true, edit: 'assigned', delete: 'none' },
                        users: { view: 'none', create: 'none', edit: 'none', delete: 'none' },
                        analytics: { view: 'own' },
                        settings: { view: false, edit: false },
                        communications: { send: true, view: 'own' }
                    };
                }
                
                // Mark permissions as modified and save
                user.markModified('permissions');
                await user.save();
                fixedCount++;
                console.log(`✓ Fixed: ${user.email} (${user.role})`);
            } catch (error) {
                console.error(`✗ Error fixing ${user.email}:`, error.message);
            }
        }
        
        console.log(`\n✅ Fixed ${fixedCount}/${users.length} users`);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

db.once('open', () => {
    fixUserPermissions();
});

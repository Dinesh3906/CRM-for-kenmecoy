const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');

async function migrateUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_sales', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB');
    
    // Find all users
    const users = await User.find({});
    console.log(`Found ${users.length} users to migrate`);
    
    for (const user of users) {
      console.log(`\nMigrating user: ${user.email}`);
      console.log(`Current role: ${user.role}`);
      
      let needsUpdate = false;
      let updates = {};
      
      // Normalize role to lowercase
      if (user.role && user.role !== user.role.toLowerCase()) {
        updates.role = user.role.toLowerCase();
        needsUpdate = true;
        console.log(`  - Normalizing role to: ${updates.role}`);
      }
      
      // Set proper permissions based on role
      const role = updates.role || user.role || 'staff';
      let permissions = {};
      
      if (role === 'admin') {
        permissions = {
          leads: { view: 'all', create: true, edit: 'all', delete: 'all', export: true },
          pipelines: { view: true, edit: true },
          tasks: { view: 'all', create: true, edit: 'all', delete: 'all' },
          users: { view: true, create: true, edit: true, delete: true },
          analytics: { view: true },
          settings: { view: true, edit: true },
          communications: { send: true, view: 'all' }
        };
      } else if (role === 'manager') {
        permissions = {
          leads: { view: 'all', create: true, edit: 'all', delete: 'assigned', export: true },
          pipelines: { view: true, edit: true },
          tasks: { view: 'all', create: true, edit: 'all', delete: 'assigned' },
          users: { view: true, create: false, edit: false, delete: false },
          analytics: { view: true },
          settings: { view: true, edit: false },
          communications: { send: true, view: 'all' }
        };
      } else {
        permissions = {
          leads: { view: 'assigned', create: true, edit: 'assigned', delete: 'none', export: false },
          pipelines: { view: true, edit: false },
          tasks: { view: 'assigned', create: true, edit: 'assigned', delete: 'none' },
          users: { view: false, create: false, edit: false, delete: false },
          analytics: { view: false },
          settings: { view: false, edit: false },
          communications: { send: true, view: 'own' }
        };
      }
      
      updates.permissions = permissions;
      needsUpdate = true;
      console.log(`  - Setting permissions for role: ${role}`);
      
      // Ensure apiKey exists
      if (!user.apiKey) {
        const crypto = require('crypto');
        updates.apiKey = crypto.randomBytes(32).toString('hex');
        needsUpdate = true;
        console.log(`  - Generated new API key`);
      }
      
      // Ensure isActive is set
      if (user.isActive === undefined || user.isActive === null) {
        updates.isActive = true;
        needsUpdate = true;
        console.log(`  - Set isActive to true`);
      }
      
      if (needsUpdate) {
        await User.updateOne({ _id: user._id }, { $set: updates }, { runValidators: false });
        console.log(`  ✓ User migrated successfully`);
      } else {
        console.log(`  - No updates needed`);
      }
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log(`Total users migrated: ${users.length}`);
    
    mongoose.connection.close();
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrateUsers();

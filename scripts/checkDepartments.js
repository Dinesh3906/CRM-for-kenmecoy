const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm-system')
  .then(async () => {
    const User = require('../models/User');
    const Lead = require('../models/Lead');
    
    console.log('=== ALL USERS ===');
    const users = await User.find({}).select('email role department managerId');
    users.forEach(u => {
      console.log(`Email: ${u.email}, Role: ${u.role}, Department: ${u.department || 'NONE'}, ManagerId: ${u.managerId || 'NONE'}`);
    });
    
    console.log('\n=== SAMPLE LEADS ===');
    const leads = await Lead.find({})
      .populate('user', 'email role department')
      .populate('assignedTo', 'email role department')
      .limit(10);
    
    leads.forEach(l => {
      console.log(`Lead: ${l.name}, Creator: ${l.user?.email} (Dept: ${l.user?.department || 'NONE'}, Role: ${l.user?.role}), AssignedTo: ${l.assignedTo?.email} (Dept: ${l.assignedTo?.department || 'NONE'}, Role: ${l.assignedTo?.role})`);
    });
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

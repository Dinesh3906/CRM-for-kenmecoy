const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true, trim: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, trim: true },
  phone: { type: String, trim: true },
  department: { type: String, trim: true },
  role: { 
    type: String, 
    enum: ['superadmin', 'admin', 'manager', 'staff'], 
    default: 'staff' 
  },
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  teamMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  permissions: {
    leads: {
      view: { type: String, enum: ['all', 'department', 'team', 'assigned', 'none'], default: 'assigned' },
      create: { type: Boolean, default: true },
      edit: { type: String, enum: ['all', 'department', 'team', 'assigned', 'none'], default: 'assigned' },
      delete: { type: String, enum: ['all', 'department', 'team', 'assigned', 'none'], default: 'none' },
      export: { type: Boolean, default: false },
      assign: { type: Boolean, default: false }
    },
    pipelines: {
      view: { type: Boolean, default: true },
      edit: { type: Boolean, default: false }
    },
    tasks: {
      view: { type: String, enum: ['all', 'department', 'team', 'assigned', 'none'], default: 'assigned' },
      create: { type: Boolean, default: true },
      edit: { type: String, enum: ['all', 'department', 'team', 'assigned', 'none'], default: 'assigned' },
      delete: { type: String, enum: ['all', 'department', 'team', 'assigned', 'none'], default: 'none' }
    },
    users: {
      view: { type: String, enum: ['all', 'department', 'team', 'none'], default: 'none' },
      create: { type: String, enum: ['admin', 'manager', 'staff', 'none'], default: 'none' },
      edit: { type: String, enum: ['all', 'department', 'team', 'none'], default: 'none' },
      delete: { type: String, enum: ['all', 'department', 'team', 'none'], default: 'none' }
    },
    analytics: {
      view: { type: String, enum: ['all', 'department', 'team', 'own', 'none'], default: 'own' }
    },
    settings: {
      view: { type: Boolean, default: false },
      edit: { type: Boolean, default: false }
    },
    communications: {
      send: { type: Boolean, default: true },
      view: { type: String, enum: ['all', 'department', 'team', 'own', 'none'], default: 'own' }
    }
  },
  isActive: { type: Boolean, default: true },
  apiKey: { type: String, required: true, unique: true },
  emailConfig: {
    outlookEmail: { type: String, trim: true },
    outlookPassword: { type: String },
    isConfigured: { type: Boolean, default: false },
    lastVerified: { type: Date }
  },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
  updatedAt: { type: Date, default: Date.now }
});

// Set default permissions based on role
UserSchema.pre('save', function(next) {
  // Normalize role to lowercase
  if (this.role) {
    this.role = this.role.toLowerCase();
  }
  
  // Always set permissions based on role (not just when modified)
  // This ensures old documents with invalid permission structures get corrected
  if (this.role) {
    if (this.role === 'superadmin') {
      // Super Admin - Full access to everything, can create Admins (NO lead delete)
      this.permissions = {
        leads: { view: 'all', create: true, edit: 'all', delete: 'none', export: true, assign: true },
        pipelines: { view: true, edit: true },
        tasks: { view: 'all', create: true, edit: 'all', delete: 'all' },
        users: { view: 'all', create: 'admin', edit: 'all', delete: 'all' },
        analytics: { view: 'all' },
        settings: { view: true, edit: true },
        communications: { send: true, view: 'all' }
      };
    } else if (this.role === 'admin') {
      // Admin - Department-level access, can create Managers, NO delete permission for leads
      this.permissions = {
        leads: { view: 'department', create: true, edit: 'department', delete: 'none', export: true, assign: true },
        pipelines: { view: true, edit: true },
        tasks: { view: 'department', create: true, edit: 'department', delete: 'department' },
        users: { view: 'department', create: 'manager', edit: 'department', delete: 'department' },
        analytics: { view: 'department' },
        settings: { view: true, edit: true },
        communications: { send: true, view: 'department' }
      };
    } else if (this.role === 'manager') {
      // Manager - Team-level access, NO user management
      this.permissions = {
        leads: { view: 'team', create: true, edit: 'team', delete: 'none', export: true, assign: true },
        pipelines: { view: true, edit: false },
        tasks: { view: 'team', create: true, edit: 'team', delete: 'team' },
        users: { view: 'team', create: 'none', edit: 'none', delete: 'none' },
        analytics: { view: 'team' },
        settings: { view: false, edit: false },
        communications: { send: true, view: 'team' }
      };
    } else {
      // Staff - Can only see and update assigned leads (status & remarks only)
      this.permissions = {
        leads: { view: 'assigned', create: false, edit: 'assigned', delete: 'none', export: false, assign: false },
        pipelines: { view: true, edit: false },
        tasks: { view: 'assigned', create: true, edit: 'assigned', delete: 'none' },
        users: { view: 'none', create: 'none', edit: 'none', delete: 'none' },
        analytics: { view: 'own' },
        settings: { view: false, edit: false },
        communications: { send: true, view: 'own' }
      };
    }
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('User', UserSchema); 
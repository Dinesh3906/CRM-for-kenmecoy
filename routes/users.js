const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const auth = require('../middleware/auth');
const { requireAdmin, checkPermission } = require('../middleware/permissions');
const crypto = require('crypto');

// Helper to generate API key
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// All routes require authentication
router.use(auth);

// Get all users (based on role hierarchy)
router.get('/', async (req, res) => {
    try {
        let query = {};
        
        // SuperAdmin sees all users
        if (req.user.role === 'superadmin') {
            query = {};
        }
        // Admin sees users in their department (including those without department but created by them or their hierarchy)
        else if (req.user.role === 'admin') {
            // Find users created by this admin
            const usersCreatedByAdmin = await User.find({ createdBy: req.user._id }).select('_id');
            const createdUserIds = usersCreatedByAdmin.map(u => u._id);
            
            query = {
                $or: [
                    { department: req.user.department },
                    { _id: { $in: createdUserIds } },
                    { _id: req.user._id }
                ]
            };
        }
        // Manager sees their team members
        else if (req.user.role === 'manager') {
            query = {
                $or: [
                    { managerId: req.user._id },
                    { _id: req.user._id }
                ]
            };
        }
        // Staff can see themselves, their manager, and superiors
        else {
            query = {
                $or: [
                    { _id: req.user._id },
                    { _id: req.user.managerId },
                    { role: 'superadmin' },
                    { role: 'admin' }
                ]
            };
        }
        
        const users = await User.find(query)
            .select('-password -resetPasswordToken -resetPasswordExpires')
            .populate('createdBy', 'username email fullName')
            .populate('managerId', 'fullName email')
            .sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
});

// Get users for task assignment (all authenticated users can access)
router.get('/for-assignment', async (req, res) => {
    try {
        // Anyone can assign a task to anybody active
        const query = { isActive: true };
        
        const users = await User.find(query)
            .select('_id fullName email isActive')
            .sort({ fullName: 1 });
        res.json(users);
    } catch (error) {
        console.error('Error fetching users for assignment:', error);
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
});

// Get single user
router.get('/:id', async (req, res) => {
    try {
        // Users can view their own profile, or if they have permission
        const canView = req.user.permissions.users.view || req.user._id.toString() === req.params.id;
        if (!canView && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const user = await User.findById(req.params.id)
            .select('-password -resetPasswordToken -resetPasswordExpires')
            .populate('createdBy', 'username email fullName')
            .populate('managerId', 'fullName email');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        res.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
});

// Create new user (based on role hierarchy)
// SuperAdmin creates Admins, Admin creates Managers, Manager creates Staff
router.post('/', async (req, res) => {
    try {
        console.log('POST /api/users - Request body:', req.body);
        console.log('User creating:', req.user.email, 'Role:', req.user.role);
        
        const { username, email, password, fullName, role, isActive, phone, department, managerId } = req.body;
        
        if (!email || !password) {
            console.log('Validation failed: Email or password missing');
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Role hierarchy validation
        // SuperAdmin can create: admin, manager, staff
        // Admin can create: manager, staff (in their department)
        // Manager can create: staff (in their team)
        // Staff cannot create users
        
        let allowedRoles = [];
        let actualDepartment = department;
        let actualManagerId = managerId;
        
        if (req.user.role === 'superadmin') {
            allowedRoles = ['admin', 'manager', 'staff'];
            // SuperAdmin must provide department for all roles
            if (['admin', 'manager', 'staff'].includes(role) && !department) {
                return res.status(400).json({ message: 'Department is required for this role' });
            }
        } else if (req.user.role === 'admin') {
            allowedRoles = ['manager', 'staff'];
            // Admin can only create users in their department - always use admin's department
            actualDepartment = req.user.department;
        } else {
            // Manager and Staff cannot create users
            return res.status(403).json({ message: 'You do not have permission to create users.' });
        }
        
        const actualRole = role || 'staff';
        
        if (!allowedRoles.includes(actualRole)) {
            return res.status(403).json({ 
                message: `You can only create users with roles: ${allowedRoles.join(', ')}` 
            });
        }

        // Check if user already exists
        const existing = await User.findOne({ $or: [{ email }, { username: username || null }] });
        if (existing) {
            console.log('User already exists:', email);
            return res.status(400).json({ message: 'User with this email or username already exists' });
        }

        const apiKey = generateApiKey();
        
        const user = new User({
            username,
            email,
            password, // In production, you should hash this
            fullName,
            phone,
            department: actualDepartment,
            role: actualRole,
            isActive: isActive !== undefined ? isActive : true,
            apiKey,
            createdBy: req.user._id,
            managerId: actualManagerId
        });

        console.log('Saving user:', user.email, 'with role:', user.role, 'department:', user.department);
        await user.save();
        console.log('User saved successfully:', user._id);

        // If managerId is set, add this user to manager's team
        if (actualManagerId) {
            await User.findByIdAndUpdate(actualManagerId, {
                $addToSet: { teamMembers: user._id }
            });
        }

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'user_created',
            module: 'users',
            targetId: user._id,
            targetModel: 'User',
            description: `Created new user: ${user.email}`,
            metadata: { role: user.role, email: user.email, department: user.department }
        }).save();

        res.status(201).json({
            message: 'User created successfully',
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                department: user.department,
                permissions: user.permissions,
                isActive: user.isActive,
                apiKey: user.apiKey,
                managerId: user.managerId
            }
        });
    } catch (error) {
        console.error('Error creating user:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ message: 'Error creating user', error: error.message });
    }
});

// Update user (based on role hierarchy)
router.put('/:id', async (req, res) => {
    try {
        const isSelf = req.user._id.toString() === req.params.id;
        const isSuperAdmin = req.user.role === 'superadmin';
        const isAdmin = req.user.role === 'admin';
        const isManager = req.user.role === 'manager';

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check edit permissions based on role hierarchy
        let canEdit = false;
        
        if (isSelf) {
            canEdit = true; // Everyone can edit their own profile (limited fields)
        } else if (isSuperAdmin) {
            canEdit = true; // SuperAdmin can edit anyone
        } else if (isAdmin && user.department === req.user.department) {
            canEdit = true; // Admin can edit users in their department
        } else if (isManager) {
            // Manager can edit their team members
            const isTeamMember = user.managerId?.toString() === req.user._id.toString();
            canEdit = isTeamMember;
        }

        if (!canEdit) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        // If updating self (and not admin), only allow certain fields
        if (isSelf && !isSuperAdmin && !isAdmin) {
            const { fullName, password, phone } = req.body;
            if (fullName) user.fullName = fullName;
            if (password) user.password = password; // Hash in production
            if (phone) user.phone = phone;
        } else {
            // Admins can update more fields
            const { username, email, fullName, role, isActive, phone, department, password, managerId } = req.body;
            console.log('Updating user - password provided:', !!password);
            if (username) user.username = username;
            if (email) user.email = email;
            if (fullName) user.fullName = fullName;
            if (phone) user.phone = phone;
            if (password) {
                console.log('Updating password for user:', user.email);
                user.password = password;
            }
            if (isActive !== undefined) user.isActive = isActive;
            
            // Role changes require proper hierarchy
            if (role && role !== user.role) {
                if (isSuperAdmin) {
                    user.role = role; // SuperAdmin can change any role
                } else if (isAdmin && ['manager', 'staff'].includes(role)) {
                    user.role = role; // Admin can assign manager or staff
                } else if (isManager && role === 'staff') {
                    user.role = role; // Manager can only assign staff
                }
            }
            
            // Department can be changed by SuperAdmin or Admin (for their department)
            if (department !== undefined) {
                if (isSuperAdmin) {
                    user.department = department;
                } else if (isAdmin && department === req.user.department) {
                    user.department = department;
                }
            }
            
            // ManagerId can be updated
            if (managerId !== undefined) {
                user.managerId = managerId || null;
                
                // Update team member relationships
                if (managerId) {
                    await User.findByIdAndUpdate(managerId, {
                        $addToSet: { teamMembers: user._id }
                    });
                }
            }
        }

        // Force permission reconstruction to fix any invalid values
        user.markModified('permissions');

        await user.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'user_updated',
            module: 'users',
            targetId: user._id,
            targetModel: 'User',
            description: `Updated user: ${user.email}`,
            metadata: { role: user.role, isActive: user.isActive }
        }).save();

        res.json({
            message: 'User updated successfully',
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                permissions: user.permissions,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Error updating user', error: error.message });
    }
});

// Activate/Deactivate user (Admin only)
router.patch('/:id/status', requireAdmin, async (req, res) => {
    try {
        const { isActive } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.isActive = isActive;
        await user.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: isActive ? 'user_activated' : 'user_deactivated',
            module: 'users',
            targetId: user._id,
            targetModel: 'User',
            description: `${isActive ? 'Activated' : 'Deactivated'} user: ${user.email}`
        }).save();

        res.json({
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
            user: {
                _id: user._id,
                email: user.email,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ message: 'Error updating user status', error: error.message });
    }
});

// Assign role to user (based on role hierarchy)
router.patch('/:id/role', requireAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        
        // Validate role against schema enum values
        if (!['superadmin', 'admin', 'manager', 'staff'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role. Must be: superadmin, admin, manager, or staff' });
        }
        
        // Role hierarchy validation
        // SuperAdmin can assign any role
        // Admin can assign: manager, staff
        // Manager can assign: staff
        
        let allowedRoles = [];
        
        if (req.user.role === 'superadmin') {
            allowedRoles = ['superadmin', 'admin', 'manager', 'staff'];
        } else if (req.user.role === 'admin') {
            allowedRoles = ['manager', 'staff'];
        } else {
            return res.status(403).json({ message: 'You do not have permission to assign roles' });
        }
        
        if (!allowedRoles.includes(role)) {
            return res.status(403).json({ message: `You can only assign roles: ${allowedRoles.join(', ')}` });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.role = role;
        await user.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'role_assigned',
            module: 'users',
            targetId: user._id,
            targetModel: 'User',
            description: `Assigned role ${role} to user: ${user.email}`,
            metadata: { role }
        }).save();

        res.json({
            message: 'Role assigned successfully',
            user: {
                _id: user._id,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Error assigning role:', error);
        res.status(500).json({ message: 'Error assigning role', error: error.message });
    }
});

// Update user permissions (Admin only)
router.patch('/:id/permissions', requireAdmin, async (req, res) => {
    try {
        const { permissions } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.permissions = permissions;
        await user.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'permission_updated',
            module: 'users',
            targetId: user._id,
            targetModel: 'User',
            description: `Updated permissions for user: ${user.email}`,
            metadata: { permissions }
        }).save();

        res.json({
            message: 'Permissions updated successfully',
            user: {
                _id: user._id,
                email: user.email,
                permissions: user.permissions
            }
        });
    } catch (error) {
        console.error('Error updating permissions:', error);
        res.status(500).json({ message: 'Error updating permissions', error: error.message });
    }
});

// Reset user password (Admin only)
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password || password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.password = password; // Hash in production
        await user.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'password_reset',
            module: 'users',
            targetId: user._id,
            targetModel: 'User',
            description: `Reset password for user: ${user.email}`
        }).save();

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ message: 'Error resetting password', error: error.message });
    }
});

// Delete user (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent deleting self
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        await User.findByIdAndDelete(req.params.id);

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'user_deleted',
            module: 'users',
            targetId: user._id,
            targetModel: 'User',
            description: `Deleted user: ${user.email}`,
            metadata: { email: user.email, role: user.role }
        }).save();

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
});

// Get users by role (Admin and Manager)
router.get('/role/:role', checkPermission('users', 'view'), async (req, res) => {
    try {

        const users = await User.find({ role: req.params.role, isActive: true })
            .select('username email fullName role')
            .sort({ fullName: 1 });
        
        res.json(users);
    } catch (error) {
        console.error('Error fetching users by role:', error);
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
});

module.exports = router;

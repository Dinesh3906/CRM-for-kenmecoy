const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/permissions');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');

// All routes require authentication
router.use(auth);

// Get comprehensive admin statistics
router.get('/admin-overview', requireAdmin, async (req, res) => {
    try {
        // Get all users
        const users = await User.find()
            .select('-password -resetPasswordToken -resetPasswordExpires')
            .sort({ createdAt: -1 });
        
        // Get leads based on role permissions (same filtering as /api/leads)
        let leadsQuery = {};
        
        if (req.user.role === 'superadmin') {
            leadsQuery = {};
        } else if (req.user.role === 'admin') {
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id);
            
            const managersUnderAdmin = await User.find({ 
                role: 'manager',
                createdBy: req.user._id 
            }).select('_id');
            const managerIds = managersUnderAdmin.map(m => m._id);
            
            const staffUnderManagers = await User.find({
                role: 'staff',
                managerId: { $in: managerIds }
            }).select('_id');
            const staffIds = staffUnderManagers.map(s => s._id);
            
            const allDeptUserIds = [...new Set([...deptUserIds, ...managerIds, ...staffIds])];
            
            leadsQuery = {
                $or: [
                    { user: { $in: allDeptUserIds } },
                    { assignedTo: { $in: allDeptUserIds } }
                ]
            };
        } else if (req.user.role === 'manager') {
            const teamMemberIds = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id, ...teamMemberIds.map(member => member._id)];
            leadsQuery = {
                $or: [
                    { user: { $in: teamIds } },
                    { assignedTo: { $in: teamIds } }
                ]
            };
        } else {
            leadsQuery = { assignedTo: req.user._id };
        }
        
        const leads = await Lead.find(leadsQuery)
            .populate('user', 'fullName email')
            .populate('assignedTo', 'fullName email');
        
        // Get all tasks
        const tasks = await Task.find();
        
        // Get recent activity
        const recentActivity = await ActivityLog.find()
            .populate('user', 'fullName email')
            .sort({ timestamp: -1 })
            .limit(20);
        
        // Calculate statistics
        const stats = {
            users: {
                total: users.length,
                active: users.filter(u => u.isActive).length,
                superadmins: users.filter(u => u.role === 'superadmin').length,
                admins: users.filter(u => u.role === 'admin').length,
                managers: users.filter(u => u.role === 'manager').length,
                staff: users.filter(u => u.role === 'staff').length
            },
            leads: {
                total: leads.length,
                byStatus: {
                    qualification: leads.filter(l => l.status === 'qualification').length,
                    'contact-made': leads.filter(l => l.status === 'contact-made').length,
                    'meeting-scheduled': leads.filter(l => l.status === 'meeting-scheduled').length,
                    'proposal-sent': leads.filter(l => l.status === 'proposal-sent').length,
                    negotiation: leads.filter(l => l.status === 'negotiation').length,
                    won: leads.filter(l => l.status === 'won').length,
                    lost: leads.filter(l => l.status === 'lost').length
                },
                byPriority: {
                    high: leads.filter(l => l.priority === 'high').length,
                    medium: leads.filter(l => l.priority === 'medium').length,
                    low: leads.filter(l => l.priority === 'low').length
                },
                totalValue: leads.reduce((sum, l) => sum + (parseFloat(l.value) || 0), 0),
                closedValue: leads
                    .filter(l => l.status === 'won')
                    .reduce((sum, l) => sum + (parseFloat(l.value) || 0), 0)
            },
            tasks: {
                total: tasks.length,
                pending: tasks.filter(t => t.status === 'pending').length,
                inProgress: tasks.filter(t => t.status === 'in-progress').length,
                completed: tasks.filter(t => t.status === 'completed').length,
                overdue: tasks.filter(t => 
                    t.status !== 'completed' && 
                    new Date(t.dueDate) < new Date()
                ).length
            }
        };
        
        // Group leads by sales agent
        const leadsBySalesAgent = {};
        leads.forEach(lead => {
            const agentId = lead.user?._id?.toString() || 'unassigned';
            const agentName = lead.user?.fullName || lead.user?.email || 'Unassigned';
            
            if (!leadsBySalesAgent[agentId]) {
                leadsBySalesAgent[agentId] = {
                    agent: agentName,
                    agentId: agentId,
                    total: 0,
                    closed: 0,
                    value: 0,
                    closedValue: 0,
                    leads: []
                };
            }
            
            leadsBySalesAgent[agentId].total++;
            leadsBySalesAgent[agentId].value += parseFloat(lead.value) || 0;
            
            if (lead.status === 'won') {
                leadsBySalesAgent[agentId].closed++;
                leadsBySalesAgent[agentId].closedValue += parseFloat(lead.value) || 0;
            }
            
            leadsBySalesAgent[agentId].leads.push({
                _id: lead._id,
                name: lead.name,
                company: lead.company,
                status: lead.status,
                priority: lead.priority,
                value: lead.value,
                assignedTo: lead.assignedTo?.fullName || 'Unassigned'
            });
        });
        
        res.json({
            stats,
            leadsBySalesAgent: Object.values(leadsBySalesAgent),
            recentActivity: recentActivity.slice(0, 10),
            topUsers: users.slice(0, 10)
        });
    } catch (error) {
        console.error('Error fetching admin overview:', error);
        res.status(500).json({ message: 'Error fetching admin overview', error: error.message });
    }
});

// Get dashboard overview (for all roles including Managers and Staff)
router.get('/dashboard-overview', async (req, res) => {
    try {
        // Get leads based on role permissions (same filtering as /api/leads)
        let leadsQuery = {};
        
        if (req.user.role === 'superadmin') {
            leadsQuery = {};
        } else if (req.user.role === 'admin') {
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id);
            
            const managersUnderAdmin = await User.find({ 
                role: 'manager',
                createdBy: req.user._id 
            }).select('_id');
            const managerIds = managersUnderAdmin.map(m => m._id);
            
            const staffUnderManagers = await User.find({
                role: 'staff',
                managerId: { $in: managerIds }
            }).select('_id');
            const staffIds = staffUnderManagers.map(s => s._id);
            
            const allDeptUserIds = [...new Set([...deptUserIds, ...managerIds, ...staffIds])];
            
            leadsQuery = {
                $or: [
                    { user: { $in: allDeptUserIds } },
                    { assignedTo: { $in: allDeptUserIds } }
                ]
            };
        } else if (req.user.role === 'manager') {
            const teamMemberIds = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id, ...teamMemberIds.map(member => member._id)];
            leadsQuery = {
                $or: [
                    { user: { $in: teamIds } },
                    { assignedTo: { $in: teamIds } }
                ]
            };
        } else {
            // Staff sees only assigned leads
            leadsQuery = { assignedTo: req.user._id };
        }
        
        const leads = await Lead.find(leadsQuery)
            .populate('user', 'fullName email')
            .populate('assignedTo', 'fullName email');
        
        // Get tasks based on role permissions (same filtering as /api/tasks)
        let tasksQuery = {};
        
        if (req.user.role === 'superadmin') {
            // SuperAdmin sees all tasks
            tasksQuery = {};
        } else if (req.user.role === 'admin') {
            // Admin sees tasks in their department
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id);
            tasksQuery = {
                $or: [
                    { user: { $in: deptUserIds } },
                    { assignedTo: { $in: deptUserIds } }
                ]
            };
        } else if (req.user.role === 'manager') {
            // Manager sees their team's tasks
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id, ...teamMembers.map(m => m._id)];
            tasksQuery = {
                $or: [
                    { user: { $in: teamIds } },
                    { assignedTo: { $in: teamIds } }
                ]
            };
        } else {
            // Staff sees only assigned tasks
            tasksQuery = { assignedTo: req.user._id };
        }
        
        const tasks = await Task.find(tasksQuery);
        
        // Calculate statistics
        const stats = {
            leads: {
                total: leads.length,
                byStatus: {
                    qualification: leads.filter(l => l.status === 'qualification').length,
                    'contact-made': leads.filter(l => l.status === 'contact-made').length,
                    'meeting-scheduled': leads.filter(l => l.status === 'meeting-scheduled').length,
                    'proposal-sent': leads.filter(l => l.status === 'proposal-sent').length,
                    negotiation: leads.filter(l => l.status === 'negotiation').length,
                    won: leads.filter(l => l.status === 'won').length,
                    lost: leads.filter(l => l.status === 'lost').length
                },
                byPriority: {
                    high: leads.filter(l => l.priority === 'high').length,
                    medium: leads.filter(l => l.priority === 'medium').length,
                    low: leads.filter(l => l.priority === 'low').length
                },
                totalValue: leads.reduce((sum, l) => sum + (parseFloat(l.value) || 0), 0),
                closedValue: leads
                    .filter(l => l.status === 'won')
                    .reduce((sum, l) => sum + (parseFloat(l.value) || 0), 0)
            },
            tasks: {
                total: tasks.length,
                pending: tasks.filter(t => t.status === 'pending').length,
                inProgress: tasks.filter(t => t.status === 'in-progress').length,
                completed: tasks.filter(t => t.status === 'completed').length,
                overdue: tasks.filter(t => 
                    t.status !== 'completed' && 
                    new Date(t.dueDate) < new Date()
                ).length
            }
        };
        
        res.json({
            stats,
            leads: leads.slice(0, 5)
        });
    } catch (error) {
        console.error('Error fetching dashboard overview:', error);
        res.status(500).json({ message: 'Error fetching dashboard overview', error: error.message });
    }
});

// Get statistics for a specific user (Admin can see any user, others see only their own)
router.get('/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Check permission
        if (req.user.role !== 'admin' && req.user._id.toString() !== userId) {
            return res.status(403).json({ message: 'Access denied' });
        }
        
        const leads = await Lead.find({ user: userId });
        const tasks = await Task.find({ assignedToUser: userId });
        
        const stats = {
            leads: {
                total: leads.length,
                closed: leads.filter(l => l.status === 'won').length,
                value: leads.reduce((sum, l) => sum + (parseFloat(l.value) || 0), 0),
                closedValue: leads
                    .filter(l => l.status === 'won')
                    .reduce((sum, l) => sum + (parseFloat(l.value) || 0), 0)
            },
            tasks: {
                total: tasks.length,
                completed: tasks.filter(t => t.status === 'completed').length,
                pending: tasks.filter(t => t.status === 'pending').length
            }
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Error fetching user statistics:', error);
        res.status(500).json({ message: 'Error fetching user statistics', error: error.message });
    }
});

module.exports = router;

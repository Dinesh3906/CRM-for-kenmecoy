const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const User = require('../models/User');
const Task = require('../models/Task');
const Communication = require('../models/Communication');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Dashboard overview
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.user._id;
        const userRole = req.user.role;

        let leadQuery = { user: userId };
        let taskQuery = { user: userId };

        // Role-based data access
        // SuperAdmin: sees all data
        // Admin: sees department data
        // Manager: sees team data
        // Staff: sees only assigned data
        
        if (userRole === 'superadmin') {
            leadQuery = {};
            taskQuery = {};
        } else if (userRole === 'admin') {
            // Admin sees department data
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id);
            leadQuery = {
                $or: [
                    { user: { $in: deptUserIds } },
                    { assignedTo: { $in: deptUserIds } }
                ]
            };
            taskQuery = {
                $or: [
                    { user: { $in: deptUserIds } },
                    { assignedTo: { $in: deptUserIds } }
                ]
            };
        } else if (userRole === 'manager') {
            // Manager sees their team's data
            const teamMembers = await User.find({ managerId: userId }).select('_id');
            const teamIds = [userId, ...teamMembers.map(m => m._id)];
            leadQuery = {
                $or: [
                    { user: { $in: teamIds } },
                    { assignedTo: { $in: teamIds } }
                ]
            };
            taskQuery = {
                $or: [
                    { user: { $in: teamIds } },
                    { assignedTo: { $in: teamIds } }
                ]
            };
        } else {
            // Staff sees only their assigned data
            leadQuery = { assignedTo: userId };
            taskQuery = { assignedTo: userId };
        }

        // Total leads
        const totalLeads = await Lead.countDocuments(leadQuery);

        // Leads by status
        const leadsByStatus = await Lead.aggregate([
            { $match: leadQuery },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Tasks summary
        const totalTasks = await Task.countDocuments({ user: userId });
        const completedTasks = await Task.countDocuments({ user: userId, status: 'completed' });
        const pendingTasks = await Task.countDocuments({ user: userId, status: 'pending' });
        const overdueTasks = await Task.countDocuments({
            user: userId,
            status: { $in: ['pending', 'in-progress'] },
            dueDate: { $lt: new Date() }
        });

        // Recent communications
        const recentCommunications = await Communication.countDocuments({
            user: userId,
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        });

        res.json({
            leads: {
                total: totalLeads,
                byStatus: leadsByStatus
            },
            tasks: {
                total: totalTasks,
                completed: completedTasks,
                pending: pendingTasks,
                overdue: overdueTasks
            },
            communications: {
                lastWeek: recentCommunications
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ message: 'Error fetching dashboard data', error: error.message });
    }
});

// Lead statistics
router.get('/leads', async (req, res) => {
    try {
        const { startDate, endDate, groupBy } = req.query;
        
        // Build lead query based on role permissions (same as /api/leads)
        let matchQuery = {};
        const User = require('../models/User');
        
        if (req.user.role === 'superadmin') {
            matchQuery = {};
        } else if (req.user.role === 'admin') {
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id);
            matchQuery = {
                $or: [
                    { user: { $in: deptUserIds } },
                    { assignedTo: { $in: deptUserIds } }
                ]
            };
        } else if (req.user.role === 'manager') {
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id, ...teamMembers.map(m => m._id)];
            matchQuery = {
                $or: [
                    { user: { $in: teamIds } },
                    { assignedTo: { $in: teamIds } }
                ]
            };
        } else {
            // Staff sees only assigned leads
            matchQuery = { assignedTo: req.user._id };
        }
        
        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
            if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
        }

        // Total leads
        const totalLeads = await Lead.countDocuments(matchQuery);

        // Leads by status
        const byStatus = await Lead.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Leads by priority
        const byPriority = await Lead.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$priority',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Leads by source
        const bySource = await Lead.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$source',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Leads by assigned user
        const byAssignedTo = await Lead.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$assignedTo',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Conversion rate (won / total)
        const closedWon = await Lead.countDocuments({ ...matchQuery, status: 'won' });
        const conversionRate = totalLeads > 0 ? ((closedWon / totalLeads) * 100).toFixed(2) : 0;

        // Leads over time
        let timeGrouping = {};
        if (groupBy === 'day') {
            timeGrouping = {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
                day: { $dayOfMonth: '$createdAt' }
            };
        } else if (groupBy === 'week') {
            timeGrouping = {
                year: { $year: '$createdAt' },
                week: { $week: '$createdAt' }
            };
        } else {
            timeGrouping = {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' }
            };
        }

        const leadsOverTime = await Lead.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: timeGrouping,
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
        ]);

        res.json({
            total: totalLeads,
            byStatus,
            byPriority,
            bySource,
            byAssignedTo,
            conversionRate: parseFloat(conversionRate),
            leadsOverTime
        });
    } catch (error) {
        console.error('Error fetching lead analytics:', error);
        res.status(500).json({ message: 'Error fetching lead analytics', error: error.message });
    }
});

// Team performance
router.get('/team-performance', async (req, res) => {
    try {
        // Only Admin and Manager can access
        if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { startDate, endDate } = req.query;
        
        let matchQuery = { user: req.user._id };
        
        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
            if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
        }

        // Get all team members
        const teamMembers = await User.find({ user: req.user._id, isActive: true })
            .select('username email fullName');

        // Performance by user
        const performance = [];

        for (const member of teamMembers) {
            const leadsCount = await Lead.countDocuments({
                ...matchQuery,
                assignedTo: member.username
            });

            const closedLeads = await Lead.countDocuments({
                ...matchQuery,
                assignedTo: member.username,
                status: 'won'
            });

            const totalValue = await Lead.aggregate([
                {
                    $match: {
                        ...matchQuery,
                        assignedTo: member.username,
                        status: 'won'
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 }
                    }
                }
            ]);

            const tasksCompleted = await Task.countDocuments({
                user: member._id,
                status: 'completed',
                completedAt: matchQuery.createdAt
            });

            const communicationCount = await Communication.countDocuments({
                sentBy: member._id,
                createdAt: matchQuery.createdAt
            });

            performance.push({
                user: {
                    id: member._id,
                    username: member.username,
                    email: member.email,
                    fullName: member.fullName
                },
                metrics: {
                    totalLeads: leadsCount,
                    closedLeads,
                    conversionRate: leadsCount > 0 ? ((closedLeads / leadsCount) * 100).toFixed(2) : 0,
                    tasksCompleted,
                    communications: communicationCount
                }
            });
        }

        // Sort by closed leads
        performance.sort((a, b) => b.metrics.closedLeads - a.metrics.closedLeads);

        res.json(performance);
    } catch (error) {
        console.error('Error fetching team performance:', error);
        res.status(500).json({ message: 'Error fetching team performance', error: error.message });
    }
});

// Pipeline analytics
router.get('/pipeline', async (req, res) => {
    try {
        // Build lead query based on role permissions
        let matchQuery = {};
        const User = require('../models/User');
        
        if (req.user.role === 'superadmin') {
            matchQuery = {};
        } else if (req.user.role === 'admin') {
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id);
            matchQuery = {
                $or: [
                    { user: { $in: deptUserIds } },
                    { assignedTo: { $in: deptUserIds } }
                ]
            };
        } else if (req.user.role === 'manager') {
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id, ...teamMembers.map(m => m._id)];
            matchQuery = {
                $or: [
                    { user: { $in: teamIds } },
                    { assignedTo: { $in: teamIds } }
                ]
            };
        } else {
            // Staff sees only assigned leads
            matchQuery = { assignedTo: req.user._id };
        }

        // Get all stages with lead counts and value
        const pipelineData = await Lead.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalValue: { $sum: { $toDouble: '$value' } }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Calculate stage conversion rates
        const stages = ['new', 'work-in-progress', 'won', 'lost'];
        const conversions = [];

        for (let i = 0; i < stages.length - 1; i++) {
            const currentStage = stages[i];
            const nextStage = stages[i + 1];

            const currentCount = await Lead.countDocuments({ ...matchQuery, status: currentStage });
            const nextCount = await Lead.countDocuments({ ...matchQuery, status: nextStage });

            conversions.push({
                from: currentStage,
                to: nextStage,
                rate: currentCount > 0 ? ((nextCount / currentCount) * 100).toFixed(2) : 0
            });
        }

        res.json({
            stages: pipelineData,
            conversions
        });
    } catch (error) {
        console.error('Error fetching pipeline analytics:', error);
        res.status(500).json({ message: 'Error fetching pipeline analytics', error: error.message });
    }
});

// Revenue analytics
router.get('/revenue', async (req, res) => {
    try {
        const { startDate, endDate, groupBy } = req.query;
        
        let matchQuery = {
            user: req.user._id,
            status: 'won'
        };
        
        if (startDate || endDate) {
            matchQuery.updatedAt = {};
            if (startDate) matchQuery.updatedAt.$gte = new Date(startDate);
            if (endDate) matchQuery.updatedAt.$lte = new Date(endDate);
        }

        // Total revenue
        const totalRevenue = await Lead.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 }
                }
            }
        ]);

        // Count by status (won leads)
        // Removed - source field doesn't exist in new Lead model

        // Revenue over time
        let timeGrouping = {
            year: { $year: '$updatedAt' },
            month: { $month: '$updatedAt' }
        };

        const leadsOverTime = await Lead.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: timeGrouping,
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        res.json({
            totalWonLeads: totalRevenue[0]?.total || 0,
            leadsOverTime
        });
    } catch (error) {
        console.error('Error fetching revenue analytics:', error);
        res.status(500).json({ message: 'Error fetching revenue analytics', error: error.message });
    }
});

// Export report data
router.get('/export', async (req, res) => {
    try {
        const { type, format, startDate, endDate } = req.query;

        let data = {};

        if (type === 'leads') {
            let query = { user: req.user._id };
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) query.createdAt.$gte = new Date(startDate);
                if (endDate) query.createdAt.$lte = new Date(endDate);
            }
            data = await Lead.find(query).lean();
        } else if (type === 'tasks') {
            let query = { user: req.user._id };
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) query.createdAt.$gte = new Date(startDate);
                if (endDate) query.createdAt.$lte = new Date(endDate);
            }
            data = await Task.find(query).populate('lead', 'name company').lean();
        }

        // In production, convert to CSV or Excel format
        res.json({
            type,
            format: format || 'json',
            count: Array.isArray(data) ? data.length : Object.keys(data).length,
            data
        });
    } catch (error) {
        console.error('Error exporting report:', error);
        res.status(500).json({ message: 'Error exporting report', error: error.message });
    }
});

module.exports = router;

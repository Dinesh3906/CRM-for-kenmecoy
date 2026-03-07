const express = require('express');
const router = express.Router();
const ActivityLog = require('../models/ActivityLog');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Get activity logs
router.get('/', async (req, res) => {
    try {
        const { module, action, startDate, endDate, targetId, page = 1, limit = 50 } = req.query;
        const User = require('../models/User');
        
        let query = {};
        
        // Role-based access to activity logs
        // SuperAdmin: all logs
        // Admin: department logs
        // Manager: team logs
        // Staff: own logs
        
        if (req.user.role === 'superadmin') {
            // SuperAdmin can see all logs
            if (req.query.userId) {
                query.user = req.query.userId;
            }
        } else if (req.user.role === 'admin') {
            // Admin can see department logs
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id);
            query.user = { $in: deptUserIds };
        } else if (req.user.role === 'manager') {
            // Manager can see team logs
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id, ...teamMembers.map(m => m._id)];
            query.user = { $in: teamIds };
        } else {
            // Staff can only see their own logs
            query.user = req.user._id;
        }
        
        if (module) query.module = module;
        if (action) query.action = action;
        if (targetId) query.targetId = targetId;
        
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const logs = await ActivityLog.find(query)
            .populate('user', 'username email fullName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await ActivityLog.countDocuments(query);
        
        res.json({
            logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching activity logs:', error);
        res.status(500).json({ message: 'Error fetching activity logs', error: error.message });
    }
});

// Get activity logs for a specific target (e.g., all logs for a lead)
router.get('/target/:targetId', async (req, res) => {
    try {
        const logs = await ActivityLog.find({ targetId: req.params.targetId })
            .populate('user', 'username email fullName')
            .sort({ createdAt: -1 });
        
        res.json(logs);
    } catch (error) {
        console.error('Error fetching target activity logs:', error);
        res.status(500).json({ message: 'Error fetching activity logs', error: error.message });
    }
});

// Get activity log statistics
router.get('/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let matchQuery = {};
        
        if (req.user.role !== 'Admin') {
            matchQuery.user = req.user._id;
        }
        
        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
            if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
        }

        // Activity by module
        const byModule = await ActivityLog.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$module',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Activity by action
        const byAction = await ActivityLog.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$action',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Activity by user (SuperAdmin and Admin only)
        let byUser = [];
        if (req.user.role === 'superadmin' || req.user.role === 'admin') {
            byUser = await ActivityLog.aggregate([
                { $match: matchQuery },
                {
                    $group: {
                        _id: '$user',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]);

            // Populate user details
            await ActivityLog.populate(byUser, { path: '_id', select: 'username email fullName' });
        }

        // Activity over time (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const overTime = await ActivityLog.aggregate([
            { $match: { ...matchQuery, createdAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
        ]);

        res.json({
            byModule,
            byAction,
            byUser,
            overTime
        });
    } catch (error) {
        console.error('Error fetching activity stats:', error);
        res.status(500).json({ message: 'Error fetching activity stats', error: error.message });
    }
});

// Get recent activity (last 24 hours)
router.get('/recent', async (req, res) => {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        let query = { createdAt: { $gte: twentyFourHoursAgo } };
        
        if (req.user.role !== 'Admin') {
            query.user = req.user._id;
        }

        const logs = await ActivityLog.find(query)
            .populate('user', 'username email fullName')
            .sort({ createdAt: -1 })
            .limit(20);
        
        res.json(logs);
    } catch (error) {
        console.error('Error fetching recent activity:', error);
        res.status(500).json({ message: 'Error fetching recent activity', error: error.message });
    }
});

// Export activity logs
router.get('/export', async (req, res) => {
    try {
        const { module, startDate, endDate } = req.query;
        
        let query = {};
        
        if (req.user.role !== 'Admin') {
            query.user = req.user._id;
        }
        
        if (module) query.module = module;
        
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const logs = await ActivityLog.find(query)
            .populate('user', 'username email fullName')
            .sort({ createdAt: -1 })
            .lean();
        
        res.json({
            count: logs.length,
            exportDate: new Date(),
            data: logs
        });
    } catch (error) {
        console.error('Error exporting activity logs:', error);
        res.status(500).json({ message: 'Error exporting activity logs', error: error.message });
    }
});

// Delete old logs (Admin only, for maintenance)
router.delete('/cleanup', async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admin only.' });
        }

        const { olderThan } = req.query; // Number of days
        const days = parseInt(olderThan) || 90; // Default 90 days
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const result = await ActivityLog.deleteMany({ createdAt: { $lt: cutoffDate } });
        
        res.json({
            message: `Cleaned up activity logs older than ${days} days`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Error cleaning up logs:', error);
        res.status(500).json({ message: 'Error cleaning up logs', error: error.message });
    }
});

module.exports = router;

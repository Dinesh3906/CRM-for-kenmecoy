const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Lead = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Get all tasks with hierarchical permission-based filtering
router.get('/', async (req, res) => {
    try {
        const { status, priority, assignedTo, dueDate } = req.query;
        const User = require('../models/User');

        console.log('GET /tasks - User:', req.user.email, 'Role:', req.user.role, 'Department:', req.user.department);

        let query = {};

        // Apply hierarchical filtering
        // SuperAdmin: sees all tasks
        // Admin: sees tasks in their department
        // Manager: sees their team's tasks
        // Staff: sees only assigned tasks

        if (req.user.role === 'superadmin') {
            // SuperAdmin sees ALL tasks
            query = {};
            console.log('SuperAdmin: showing all tasks');
        } else if (req.user.role === 'admin') {
            // Admin sees tasks in their department
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id);
            query = {
                $or: [
                    { user: { $in: deptUserIds } },
                    { assignedTo: { $in: deptUserIds } }
                ]
            };
            console.log('Admin: showing department tasks');
        } else if (req.user.role === 'manager') {
            // Manager sees their team's tasks
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id, ...teamMembers.map(m => m._id)];
            query = {
                $or: [
                    { user: { $in: teamIds } },
                    { assignedTo: { $in: teamIds } }
                ]
            };
            console.log('Manager: showing team tasks');
        } else {
            // Staff sees: tasks assigned TO them
            query = {
                assignedTo: req.user._id
            };
            console.log('Staff: showing assigned tasks only');
        }

        // Apply additional filters
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (assignedTo) query.assignedTo = assignedTo;
        if (dueDate) {
            const date = new Date(dueDate);
            query.dueDate = {
                $gte: new Date(date.setHours(0, 0, 0, 0)),
                $lte: new Date(date.setHours(23, 59, 59, 999))
            };
        }

        const tasks = await Task.find(query)
            .populate('lead', 'companyName contactPerson')
            .populate('assignedTo', 'username email fullName role department')
            .populate('user', 'username email fullName')
            .sort({ dueDate: 1 });

        console.log('Found tasks:', tasks.length);
        res.json(tasks);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ message: 'Error fetching tasks', error: error.message });
    }
});

// Get upcoming tasks (with reminders)
router.get('/upcoming', async (req, res) => {
    try {
        const now = new Date();
        const upcomingDate = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // Next 7 days

        const tasks = await Task.find({
            user: req.user._id,
            status: { $in: ['pending', 'in-progress'] },
            dueDate: { $gte: now, $lte: upcomingDate }
        })
            .populate('lead', 'name company')
            .sort({ dueDate: 1 });

        res.json(tasks);
    } catch (error) {
        console.error('Error fetching upcoming tasks:', error);
        res.status(500).json({ message: 'Error fetching upcoming tasks', error: error.message });
    }
});

// Get overdue tasks
router.get('/overdue', async (req, res) => {
    try {
        const now = new Date();

        const tasks = await Task.find({
            assignedTo: req.user._id,
            status: { $in: ['pending', 'in-progress'] },
            dueDate: { $lt: now }
        })
            .populate('lead', 'name company')
            .sort({ dueDate: 1 });

        res.json(tasks);
    } catch (error) {
        console.error('Error fetching overdue tasks:', error);
        res.status(500).json({ message: 'Error fetching overdue tasks', error: error.message });
    }
});

// Get single task
router.get('/:id', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate('lead', 'companyName contactPerson email mobile')
            .populate('assignedTo', 'username email fullName');

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Check if user has access to this task
        const User = require('../models/User');
        let hasAccess = false;

        if (req.user.role === 'superadmin') {
            hasAccess = true;
        } else if (req.user.role === 'admin') {
            // Admin can access tasks in their department
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id.toString());
            hasAccess =
                deptUserIds.includes(task.user?.toString()) ||
                deptUserIds.includes(task.assignedTo?._id?.toString() || task.assignedTo?.toString());
        } else if (req.user.role === 'manager') {
            // Manager can access their team's tasks
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id.toString(), ...teamMembers.map(m => m._id.toString())];
            hasAccess =
                teamIds.includes(task.user?.toString()) ||
                teamIds.includes(task.assignedTo?._id?.toString() || task.assignedTo?.toString());
        } else {
            // Staff can only access tasks assigned to them
            hasAccess = task.assignedTo?.toString() === req.user._id.toString() ||
                task.assignedTo?._id?.toString() === req.user._id.toString() ||
                task.user?.toString() === req.user._id.toString();
        }

        if (!hasAccess) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        res.json(task);
    } catch (error) {
        console.error('Error fetching task:', error);
        res.status(500).json({ message: 'Error fetching task', error: error.message });
    }
});

// Create new task - Based on role hierarchy
router.post('/', async (req, res) => {
    try {
        const { lead, assignedTo, dueDate, action, status, remarks } = req.body;
        const User = require('../models/User');

        if (!assignedTo || !dueDate || !action) {
            return res.status(400).json({ message: 'Assigned To, Due Date, and Action are required' });
        }

        // Validate assignedTo user
        if (assignedTo) {
            const targetUser = await User.findById(assignedTo);
            if (!targetUser) {
                return res.status(404).json({ message: 'Assigned user not found' });
            }
        }

        // If lead is provided, verify access
        if (lead) {
            const leadExists = await Lead.findById(lead);
            if (!leadExists) {
                return res.status(404).json({ message: 'Lead not found' });
            }
        }

        const task = new Task({
            lead,
            assignedTo,
            dueDate,
            action,
            status: status || 'pending',
            remarks,
            user: req.user._id
        });

        if (req.body.statusDetails && req.body.statusDetails.trim() !== '') {
            task.statusUpdates.push({
                text: req.body.statusDetails.trim(),
                authorName: req.user.fullName || req.user.email || 'Unknown',
                timestamp: new Date()
            });
        }

        await task.save();

        // Notify hierarchy about new task
        const { notifyTaskHierarchy } = require('../utils/notifications');
        await notifyTaskHierarchy(
            task,
            'task_created',
            `New task created: ${action} - Due ${new Date(dueDate).toLocaleDateString()}`,
            req.user._id
        );

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'task_created',
            module: 'tasks',
            targetId: task._id,
            targetModel: 'Task',
            description: `Created task: ${action}`,
            metadata: { action, assignedTo, dueDate }
        }).save();

        const populatedTask = await Task.findById(task._id)
            .populate('lead', 'companyName contactPerson')
            .populate('assignedTo', 'username email fullName');

        res.status(201).json(populatedTask);
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ message: 'Error creating task', error: error.message });
    }
});

// Update task
router.put('/:id', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate('assignedTo', 'role department managerId');

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Permission checks based on role hierarchy
        const User = require('../models/User');
        let hasPermission = false;

        const oldStatus = task.status;

        if (req.user.role === 'superadmin') {
            hasPermission = true;
        } else if (req.user.role === 'admin') {
            // Admin can update tasks in their department
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id.toString());
            hasPermission =
                deptUserIds.includes(task.user?.toString()) ||
                deptUserIds.includes(task.assignedTo?._id?.toString());
        } else if (req.user.role === 'manager') {
            // Manager can update their team's tasks
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id.toString(), ...teamMembers.map(m => m._id.toString())];
            hasPermission =
                teamIds.includes(task.user?.toString()) ||
                teamIds.includes(task.assignedTo?._id?.toString());
        } else {
            // Staff can update tasks assigned to them OR tasks they created
            hasPermission =
                task.assignedTo?._id?.toString() === req.user._id.toString() ||
                task.user?.toString() === req.user._id.toString();
        }

        if (!hasPermission) {
            return res.status(403).json({ message: 'Access denied. You cannot update this task.' });
        }

        const { assignedTo, dueDate, action, status, remarks, notes, newStatusUpdate } = req.body;

        if (assignedTo) task.assignedTo = assignedTo;
        if (dueDate) task.dueDate = dueDate;
        if (action) task.action = action;
        if (status) task.status = status;
        if (remarks !== undefined) task.remarks = remarks;
        if (notes !== undefined) task.notes = notes;

        if (newStatusUpdate && newStatusUpdate.trim() !== '') {
            task.statusUpdates.push({
                text: newStatusUpdate.trim(),
                authorName: req.user.fullName || req.user.email || 'Unknown',
                timestamp: new Date()
            });

            // Notify the other party about the comment
            const Notification = require('../models/Notification');
            const updaterId = req.user._id.toString();
            const creatorId = task.user ? task.user.toString() : null;
            const assigneeId = task.assignedTo ? task.assignedTo.toString() : null;

            let notifyUserId = null;
            if (updaterId === creatorId && assigneeId && assigneeId !== creatorId) {
                notifyUserId = assigneeId;
            } else if (updaterId === assigneeId && creatorId && creatorId !== assigneeId) {
                notifyUserId = creatorId;
            }

            if (notifyUserId) {
                await Notification.create({
                    recipient: notifyUserId,
                    sender: req.user._id,
                    task: task._id,
                    type: 'comment',
                    message: `New message on task "${task.action || 'Task'}"`
                });
            }
        }

        await task.save();

        // Notify on status change
        if (status && status !== oldStatus) {
            const { notifyTaskHierarchy } = require('../utils/notifications');
            await notifyTaskHierarchy(
                task,
                status === 'completed' ? 'task_completed' : 'status_change',
                `Task ${task.action || 'updated'}: Status changed to ${status}`,
                req.user._id
            );
        }

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'task_updated',
            module: 'tasks',
            targetId: task._id,
            targetModel: 'Task',
            description: `Updated task: ${task.action}`,
            metadata: { status: task.status, action: task.action }
        }).save();

        const updatedTask = await Task.findById(task._id)
            .populate('lead', 'companyName contactPerson')
            .populate('assignedTo', 'username email fullName');

        res.json(updatedTask);
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ message: 'Error updating task', error: error.message });
    }
});

// Mark task as complete
router.patch('/:id/complete', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Check if user has permission based on role hierarchy
        const User = require('../models/User');
        let hasPermission = false;

        if (req.user.role === 'superadmin') {
            hasPermission = true;
        } else if (req.user.role === 'admin') {
            // Admin can complete tasks in their department
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id.toString());
            hasPermission =
                deptUserIds.includes(task.user?.toString()) ||
                deptUserIds.includes(task.assignedTo?.toString());
        } else if (req.user.role === 'manager') {
            // Manager can complete their team's tasks
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id.toString(), ...teamMembers.map(m => m._id.toString())];
            hasPermission =
                teamIds.includes(task.user?.toString()) ||
                teamIds.includes(task.assignedTo?.toString());
        } else {
            // Staff can complete tasks assigned to them or created by them
            hasPermission = task.assignedTo?.toString() === req.user._id.toString() ||
                task.user?.toString() === req.user._id.toString();
        }

        if (!hasPermission) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        task.status = 'completed';
        task.completedAt = new Date();
        await task.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'task_completed',
            module: 'tasks',
            targetId: task._id,
            targetModel: 'Task',
            description: `Completed task: ${task.action}`
        }).save();

        // Notify hierarchy about task completion
        const { notifyTaskHierarchy } = require('../utils/notifications');
        await notifyTaskHierarchy(
            task,
            'task_completed',
            `Task completed: ${task.action}`,
            req.user._id
        );

        const updatedTask = await Task.findById(task._id)
            .populate('lead', 'companyName contactPerson')
            .populate('assignedTo', 'username email fullName');

        res.json(updatedTask);
    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).json({ message: 'Error completing task', error: error.message });
    }
});

// Delete task
router.delete('/:id', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Permission checks for deletion based on role hierarchy:
        // - SuperAdmin can delete any task
        // - Admin can delete tasks in their department
        // - Manager can delete their team's tasks
        // - Staff can delete tasks they created

        const User = require('../models/User');
        let hasPermission = false;

        if (req.user.role === 'superadmin') {
            hasPermission = true;
        } else if (req.user.role === 'admin') {
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id.toString());
            hasPermission =
                deptUserIds.includes(task.user?.toString()) ||
                deptUserIds.includes(task.assignedTo?.toString());
        } else if (req.user.role === 'manager') {
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id.toString(), ...teamMembers.map(m => m._id.toString())];
            hasPermission =
                teamIds.includes(task.user?.toString()) ||
                teamIds.includes(task.assignedTo?.toString());
        } else {
            // Staff can only delete tasks they created
            hasPermission = task.user?.toString() === req.user._id.toString();
        }

        if (!hasPermission) {
            return res.status(403).json({ message: 'Access denied. You cannot delete this task.' });
        }

        await Task.findByIdAndDelete(req.params.id);

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'task_deleted',
            module: 'tasks',
            targetId: task._id,
            targetModel: 'Task',
            description: `Deleted task: ${task.action}`
        }).save();

        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ message: 'Error deleting task', error: error.message });
    }
});

module.exports = router;

const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Notify hierarchy (1-level and 2-levels up) about a lead update
 * @param {Object} lead - The lead object
 * @param {String} type - Notification type (status_change, comment, assignment, etc.)
 * @param {String} message - Notification message
 * @param {String} senderId - User ID of the person making the change
 */
async function notifyLeadHierarchy(lead, type, message, senderId) {
    try {
        const recipients = [];
        
        // Always notify admins and superadmins
        const admins = await User.find({ 
            role: { $in: ['superadmin', 'admin'] },
            _id: { $ne: senderId } // Don't notify the person who made the change
        }).select('_id');
        
        admins.forEach(admin => {
            recipients.push({
                recipient: admin._id,
                sender: senderId,
                lead: lead._id,
                type,
                message
            });
        });
        
        // Notify hierarchy if user has a manager
        if (lead.assignedTo) {
            const assignedUser = await User.findById(lead.assignedTo).select('managerId role department');
            if (assignedUser && assignedUser.managerId) {
                // 1-level up: Direct manager (Manager)
                const manager = await User.findById(assignedUser.managerId).select('_id managerId');
                if (manager) {
                    recipients.push({
                        recipient: manager._id,
                        sender: senderId,
                        lead: lead._id,
                        type,
                        message
                    });
                    
                    // 2-levels up: Manager's manager (if exists, likely superadmin)
                    if (manager.managerId) {
                        const seniorManager = await User.findById(manager.managerId).select('_id');
                        if (seniorManager) {
                            recipients.push({
                                recipient: seniorManager._id,
                                sender: senderId,
                                lead: lead._id,
                                type,
                                message
                            });
                        }
                    }
                }
            }
        }
        
        // Create all notifications (avoiding duplicates)
        if (recipients.length > 0) {
            // Filter out duplicates based on recipient ID
            const uniqueRecipients = Array.from(new Map(recipients.map(item => [item.recipient.toString(), item])).values());
            await Notification.insertMany(uniqueRecipients);
        }
    } catch (error) {
        console.error('Error creating lead hierarchy notifications:', error);
        // Don't throw - notification failure shouldn't break the main operation
    }
}

/**
 * Notify hierarchy about a task update
 * @param {Object} task - The task object
 * @param {String} type - Notification type
 * @param {String} message - Notification message
 * @param {String} senderId - User ID of the person making the change
 */
async function notifyTaskHierarchy(task, type, message, senderId) {
    try {
        const recipients = [];
        
        // Always notify admins and superadmins
        const admins = await User.find({ 
            role: { $in: ['superadmin', 'admin'] },
            _id: { $ne: senderId } // Don't notify the person who made the change
        }).select('_id');
        
        admins.forEach(admin => {
            recipients.push({
                recipient: admin._id,
                sender: senderId,
                task: task._id,
                type,
                message
            });
        });
        
        // Notify hierarchy if user has a manager
        if (task.assignedTo) {
            const assignedUser = await User.findById(task.assignedTo).select('managerId role department');
            if (assignedUser && assignedUser.managerId) {
                // 1-level up
                const manager = await User.findById(assignedUser.managerId).select('_id managerId');
                if (manager) {
                    recipients.push({
                        recipient: manager._id,
                        sender: senderId,
                        task: task._id,
                        type,
                        message
                    });
                    
                    // 2-levels up
                    if (manager.managerId) {
                        const seniorManager = await User.findById(manager.managerId).select('_id');
                        if (seniorManager) {
                            recipients.push({
                                recipient: seniorManager._id,
                                sender: senderId,
                                task: task._id,
                                type,
                                message
                            });
                        }
                    }
                }
            }
        }
        
        // Create all notifications (avoiding duplicates)
        if (recipients.length > 0) {
            // Filter out duplicates based on recipient ID
            const uniqueRecipients = Array.from(new Map(recipients.map(item => [item.recipient.toString(), item])).values());
            await Notification.insertMany(uniqueRecipients);
        }
    } catch (error) {
        console.error('Error creating task hierarchy notifications:', error);
    }
}

/**
 * Notify specific user about an assignment
 * @param {String} recipientId - User ID to notify
 * @param {String} senderId - User ID of the person making the assignment
 * @param {Object} lead - Lead object (optional)
 * @param {Object} task - Task object (optional)
 * @param {String} message - Notification message
 */
async function notifyAssignment(recipientId, senderId, lead, task, message) {
    try {
        const notification = {
            recipient: recipientId,
            sender: senderId,
            type: 'assignment',
            message
        };
        
        if (lead) notification.lead = lead._id;
        if (task) notification.task = task._id;
        
        await Notification.create(notification);
    } catch (error) {
        console.error('Error creating assignment notification:', error);
    }
}

module.exports = {
    notifyLeadHierarchy,
    notifyTaskHierarchy,
    notifyAssignment
};

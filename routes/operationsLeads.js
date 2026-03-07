const express = require('express');
const router = express.Router();
const OperationsLead = require('../models/OperationsLead');
const auth = require('../middleware/auth');
const ActivityLog = require('../models/ActivityLog');

// All routes require authentication
router.use(auth);

// Helper to get team member IDs for a manager
async function getTeamMemberIds(managerId) {
    const User = require('../models/User');
    const teamMembers = await User.find({ managerId: managerId }).select('_id');
    return teamMembers.map(member => member._id);
}

// Get all operations leads with permission-based filtering
router.get('/', async (req, res) => {
    try {
        let query = {};
        
        console.log('GET /operations-leads - User:', req.user.email, 'Role:', req.user.role, 'Department:', req.user.department);
        
        // Check department access (superadmin can access any department)
        if (req.user.role !== 'superadmin' && req.user.department !== 'operations') {
            return res.status(403).json({ message: 'Access denied. Operations department only.' });
        }
        
        // Apply role-based filtering
        if (req.user.role === 'superadmin') {
            // Super admin sees all operations across all departments
            query = {};
            console.log('SuperAdmin: showing all operations leads');
        } else if (req.user.role === 'admin') {
            // Admin sees all in operations department only
            query = {};
            console.log('Admin: showing all operations leads in department');
        } else if (req.user.role === 'manager') {
            // Manager sees only their team's leads (created by them or their team members)
            const teamMemberIds = await getTeamMemberIds(req.user._id);
            query = {
                $or: [
                    { user: req.user._id }, // Created by manager
                    { user: { $in: teamMemberIds } }, // Created by team members
                    { manager: req.user._id } // Assigned to manager
                ]
            };
            console.log('Manager: showing team leads');
        } else {
            // Staff sees only leads they created or assigned to them
            query = {
                $or: [
                    { user: req.user._id },
                    { assignedTo: req.user._id }
                ]
            };
            console.log('Staff: showing own and assigned leads');
        }
        
        console.log('Query:', JSON.stringify(query));
        const leads = await OperationsLead.find(query)
            .populate('user', 'fullName email username')
            .populate('assignedTo', 'fullName email')
            .populate('manager', 'fullName email')
            .sort({ createdAt: -1 });
        
        console.log('Found operations leads:', leads.length);
        res.json(leads);
    } catch (error) {
        console.error('Error fetching operations leads:', error);
        res.status(500).json({ message: 'Error fetching operations leads', error: error.message });
    }
});

// Create new operations lead (Admin and Manager only)
router.post('/', async (req, res) => {
    try {
        // Staff cannot create tickets
        if (req.user.role === 'staff') {
            return res.status(403).json({ message: 'Staff cannot create tickets. Tickets must be assigned by your manager or admin.' });
        }
        
        const { clientName, company, emails, phones, description, priority, category, assignedTo, source } = req.body;
        
        if (!clientName || !company) {
            return res.status(400).json({ message: 'Client name and company are required' });
        }
        
        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({ message: 'At least one email is required' });
        }
        
        const lead = new OperationsLead({
            clientName,
            company,
            emails,
            phones: phones || [],
            description,
            priority: priority || 'medium',
            category: category || 'support',
            assignedTo,
            source,
            user: req.user._id,
            manager: req.user.role === 'manager' ? req.user._id : req.user.managerId
        });
        
        const savedLead = await lead.save();
        
        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'operations_lead_created',
            module: 'operations',
            targetId: savedLead._id,
            targetModel: 'OperationsLead',
            description: `Created operations ticket: ${savedLead.ticketNumber}`,
            metadata: { ticketNumber: savedLead.ticketNumber, category: savedLead.category }
        }).save();
        
        res.status(201).json(savedLead);
    } catch (error) {
        console.error('Error creating operations lead:', error);
        res.status(500).json({ message: 'Error creating operations lead', error: error.message });
    }
});

// Get single operations lead
router.get('/:id', async (req, res) => {
    try {
        const lead = await OperationsLead.findById(req.params.id)
            .populate('user', 'fullName email username')
            .populate('assignedTo', 'fullName email')
            .populate('manager', 'fullName email');
        
        if (!lead) {
            return res.status(404).json({ message: 'Operations lead not found' });
        }
        
        // Check access permission
        const hasAccess = req.user.role === 'superadmin' || 
                         req.user.role === 'admin' ||
                         lead.user.toString() === req.user._id.toString() ||
                         lead.assignedTo?.toString() === req.user._id.toString() ||
                         lead.manager?.toString() === req.user._id.toString();
        
        if (!hasAccess) {
            return res.status(403).json({ message: 'Access denied' });
        }
        
        res.json(lead);
    } catch (error) {
        console.error('Error fetching operations lead:', error);
        res.status(500).json({ message: 'Error fetching operations lead', error: error.message });
    }
});

// Update operations lead status
router.patch('/:id/status', async (req, res) => {
    try {
        console.log(`PATCH /operations-leads/${req.params.id}/status - New status:`, req.body.status);
        
        const lead = await OperationsLead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ message: 'Operations lead not found' });
        }
        
        const oldStatus = lead.status;
        lead.status = req.body.status;
        lead.updatedAt = Date.now();
        
        if (req.body.status === 'closed' || req.body.status === 'completed') {
            lead.closedAt = Date.now();
        }
        
        lead.timeline.push({
            action: 'status_changed',
            description: `Status changed from ${oldStatus} to ${req.body.status}`,
            performedBy: req.user._id,
            metadata: { oldStatus, newStatus: req.body.status }
        });
        
        const updatedLead = await lead.save();
        
        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'operations_status_changed',
            module: 'operations',
            targetId: lead._id,
            targetModel: 'OperationsLead',
            description: `Operations ticket ${lead.ticketNumber} status changed`,
            metadata: { oldStatus, newStatus: req.body.status }
        }).save();
        
        res.json(updatedLead);
    } catch (error) {
        console.error('Error updating operations lead status:', error);
        res.status(500).json({ message: 'Error updating operations lead status', error: error.message });
    }
});

// Update operations lead (Staff can only update status and actualTime)
router.put('/:id', async (req, res) => {
    try {
        const lead = await OperationsLead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ message: 'Operations lead not found' });
        }
        
        // Staff can only update status and actualTime
        if (req.user.role === 'staff') {
            const allowedFields = ['status', 'actualTime'];
            const updateFields = Object.keys(req.body);
            const hasUnauthorizedFields = updateFields.some(field => !allowedFields.includes(field));
            
            if (hasUnauthorizedFields) {
                return res.status(403).json({ message: 'Staff can only update status and actual time. Contact your manager to modify other fields.' });
            }
            
            // Check if ticket is assigned to this staff
            if (lead.assignedTo?.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'You can only update tickets assigned to you' });
            }
        }
        
        // Update fields
        Object.keys(req.body).forEach(key => {
            if (key !== '_id' && key !== 'ticketNumber' && key !== 'createdAt') {
                lead[key] = req.body[key];
            }
        });
        
        lead.updatedAt = Date.now();
        const updatedLead = await lead.save();
        
        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'operations_lead_updated',
            module: 'operations',
            targetId: lead._id,
            targetModel: 'OperationsLead',
            description: `Updated operations ticket: ${lead.ticketNumber}`
        }).save();
        
        res.json(updatedLead);
    } catch (error) {
        console.error('Error updating operations lead:', error);
        res.status(500).json({ message: 'Error updating operations lead', error: error.message });
    }
});

// Delete operations lead (Admin and Manager only)
router.delete('/:id', async (req, res) => {
    try {
        console.log(`[DELETE OPERATION] ID: ${req.params.id}, User: ${req.user.email} (${req.user.role})`);
        
        // Staff cannot delete tickets
        if (req.user.role === 'staff') {
            console.log('[DELETE OPERATION] Access denied: Role is staff');
            return res.status(403).json({ message: 'Staff cannot delete tickets. Contact your manager or admin.' });
        }
        
        const lead = await OperationsLead.findById(req.params.id);
        if (!lead) {
            console.log('[DELETE OPERATION] Error: Lead not found');
            return res.status(404).json({ message: 'Operations lead not found' });
        }
        
        await OperationsLead.findByIdAndDelete(req.params.id);
        console.log('[DELETE OPERATION] Lead deleted from DB');
        
        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'operations_lead_deleted',
            module: 'operations',
            targetId: lead._id,
            targetModel: 'OperationsLead',
            description: `Deleted operations ticket: ${lead.ticketNumber}`
        }).save();
        console.log('[DELETE OPERATION] Activity logged');
        
        res.json({ message: 'Operations lead deleted successfully' });
    } catch (error) {
        console.error('[DELETE OPERATION] Error:', error);
        res.status(500).json({ message: 'Error deleting operations lead', error: error.message });
    }
});

module.exports = router;

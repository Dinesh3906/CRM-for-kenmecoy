const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');
const auth = require('../middleware/auth');

// Webhook endpoint to create a lead in Qualification
router.post('/webhook', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        if (!apiKey) {
            return res.status(401).json({ message: 'API key required.' });
        }
        const User = require('../models/User');
        const user = await User.findOne({ apiKey });
        if (!user) {
            return res.status(401).json({ message: 'Invalid API key.' });
        }
        const Lead = require('../models/Lead');
        const body = req.body.data || req.body;
        const { name, company, emails, phones, value, description, assignedTo, priority, source } = body;
        if (!name || !company) {
            return res.status(400).json({ message: 'Name and company are required' });
        }
        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({ message: 'At least one email is required' });
        }
        for (const emailData of emails) {
            if (!emailData.email || !emailData.type) {
                return res.status(400).json({ message: 'Each email must have both email and type fields' });
            }
        }
        if (phones && Array.isArray(phones)) {
            for (const phoneData of phones) {
                if (phoneData.phone && !phoneData.type) {
                    return res.status(400).json({ message: 'Each phone must have a type field' });
                }
            }
        }
        const lead = new Lead({
            name,
            company,
            emails: emails || [],
            phones: phones || [],
            value: value || 0,
            description,
            assignedTo,
            priority: priority || 'medium',
            source,
            status: 'qualification',
            user: user._id
        });
        const savedLead = await lead.save();
        res.status(201).json(savedLead);
    } catch (error) {
        console.error('Error creating lead via webhook:', error);
        res.status(500).json({ message: 'Error creating lead via webhook', error: error.message });
    }
});

// All routes below require authentication
router.use(auth);

// Get all leads with permission-based filtering
router.get('/', async (req, res) => {
    try {
        let query = {};
        const mongoose = require('mongoose');
        const User = require('../models/User');

        console.log(`[DEBUG] GET /leads - Triggered by ${req.user.email} (${req.user.role})`);

        // Apply role-based filtering with hierarchy
        if (req.user.role === 'superadmin') {
            query = {};
            console.log('[DEBUG] superadmin: viewing all leads');
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

            const allDeptUserIds = [...new Set([...deptUserIds, ...managerIds, ...staffIds])].map(id => new mongoose.Types.ObjectId(id));

            query = {
                $or: [
                    { user: { $in: allDeptUserIds } },
                    { assignedTo: { $in: allDeptUserIds } }
                ]
            };
            console.log(`[DEBUG] admin: department access for ${allDeptUserIds.length} users`);
        } else if (req.user.role === 'manager') {
            const teamMemberIds = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id, ...teamMemberIds.map(member => member._id)].map(id => new mongoose.Types.ObjectId(id));
            
            query = {
                $or: [
                    { user: { $in: teamIds } },
                    { assignedTo: { $in: teamIds } }
                ]
            };
            console.log(`[DEBUG] manager: team access for ${teamIds.length} users`);
        } else {
            // Staff Role
            const staffId = new mongoose.Types.ObjectId(req.user._id);
            query = {
                $or: [
                    { assignedTo: staffId },
                    { user: staffId }
                ]
            };
            console.log(`[DEBUG] staff: access for self (${req.user.email})`);
        }

        console.log('[DEBUG] Executing Query:', JSON.stringify(query));
        
        const leads = await Lead.find(query)
            .populate('user', 'fullName email username')
            .populate('assignedTo', 'fullName email')
            .sort({ createdAt: -1 });

        console.log(`[DEBUG] Successfully fetched ${leads.length} leads`);
        res.json(leads);
    } catch (error) {
        console.error('[CRITICAL] Error fetching leads:', error);
        res.status(500).json({ 
            message: 'Error fetching leads', 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        });
    }
});

// Get leads by status for the logged-in user
router.get('/status/:status', async (req, res) => {
    try {
        const leads = await Lead.find({ user: req.user._id, status: req.params.status }).sort({ createdAt: -1 });
        res.json(leads);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Bulk import leads (CSV/Excel data)
router.post('/import', async (req, res) => {
    try {
        const { leads } = req.body; // Array of lead objects

        if (!Array.isArray(leads) || leads.length === 0) {
            return res.status(400).json({ message: 'Invalid leads data' });
        }

        const user = req.user;
        const imported = [];
        const failed = [];

        for (const leadData of leads) {
            try {
                const lead = new Lead({
                    ...leadData,
                    user: user._id,
                    timeline: [{
                        action: 'created',
                        description: 'Lead imported',
                        performedBy: req.user._id
                    }]
                });
                await lead.save();
                imported.push(lead);
            } catch (error) {
                failed.push({ data: leadData, error: error.message });
            }
        }

        // Log activity
        const ActivityLog = require('../models/ActivityLog');
        await new ActivityLog({
            user: req.user._id,
            action: 'import_data',
            module: 'data',
            description: `Imported ${imported.length} leads`,
            metadata: { imported: imported.length, failed: failed.length }
        }).save();

        res.json({
            message: 'Import completed',
            imported: imported.length,
            failed: failed.length,
            failedRecords: failed
        });
    } catch (error) {
        console.error('Error importing leads:', error);
        res.status(500).json({ message: 'Error importing leads', error: error.message });
    }
});

// Export leads
router.get('/export', async (req, res) => {
    try {
        const { status, startDate, endDate } = req.query;

        let query = { user: req.user._id };

        if (status) query.status = status;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const leads = await Lead.find(query).lean();

        // Log activity
        const ActivityLog = require('../models/ActivityLog');
        await new ActivityLog({
            user: req.user._id,
            action: 'export_data',
            module: 'data',
            description: `Exported ${leads.length} leads`,
            metadata: { count: leads.length, filters: { status, startDate, endDate } }
        }).save();

        // In production, convert to CSV or Excel
        res.json({
            message: 'Export ready',
            count: leads.length,
            data: leads
        });
    } catch (error) {
        console.error('Error exporting leads:', error);
        res.status(500).json({ message: 'Error exporting leads', error: error.message });
    }
});

// Get a single lead (permission-based access)
router.get('/:id', async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id)
            .populate('user', 'fullName email username department')
            .populate('assignedTo', 'fullName email department')
            .populate('notes.createdBy', 'fullName email');

        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Check access permission based on role hierarchy
        const User = require('../models/User');
        let hasAccess = false;

        if (req.user.role === 'superadmin') {
            hasAccess = true;
        } else if (req.user.role === 'admin') {
            // Admin can access leads in their department
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id.toString());
            hasAccess =
                deptUserIds.includes(lead.user?._id?.toString() || lead.user?.toString()) ||
                deptUserIds.includes(lead.assignedTo?._id?.toString() || lead.assignedTo?.toString());
        } else if (req.user.role === 'manager') {
            // Manager can access their team's leads
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id.toString(), ...teamMembers.map(m => m._id.toString())];
            hasAccess =
                teamIds.includes(lead.user?._id?.toString() || lead.user?.toString()) ||
                teamIds.includes(lead.assignedTo?._id?.toString() || lead.assignedTo?.toString());
        } else {
            // Staff can only access leads assigned to them
            hasAccess = lead.assignedTo?._id?.toString() === req.user._id.toString() ||
                lead.assignedTo?.toString() === req.user._id.toString();
        }

        if (!hasAccess) {
            return res.status(403).json({ message: 'Access denied. You can only view leads assigned to you.' });
        }

        res.json(lead);
    } catch (error) {
        console.error('Error fetching lead:', error);
        res.status(500).json({ message: 'Error fetching lead', error: error.message });
    }
});

// Create a new lead (SuperAdmin, Admin, Manager can create)
router.post('/', async (req, res) => {
    try {
        // Staff cannot create leads
        if (req.user.role === 'staff') {
            return res.status(403).json({ message: 'Staff cannot create leads. Leads must be assigned by your Manager or Admin.' });
        }

        const { companyName, customerCode, gstNo, category, contactPerson, designation, email, mobile, contacts, address, status, statusDetails, remarks, assignedTo } = req.body;

        // Validate required fields
        if (!companyName || !assignedTo) {
            return res.status(400).json({ message: 'Company Name and Assigned To are required' });
        }

        const user = req.user;
        
        let initialUpdates = [];
        if (statusDetails && statusDetails.trim() !== '') {
            initialUpdates.push({
                text: statusDetails.trim(),
                authorName: user.fullName || user.email || 'Unknown',
                timestamp: new Date()
            });
        }

        const lead = new Lead({
            companyName,
            customerCode,
            gstNo,
            category,
            contactPerson,
            designation,
            email,
            mobile,
            contacts: contacts || [],
            address,
            status: status || 'new',
            statusUpdates: initialUpdates,
            remarks,
            assignedTo,
            user: user._id
        });

        const savedLead = await lead.save();

        // Notify hierarchy about new lead assignment
        const { notifyLeadHierarchy, notifyAssignment } = require('../utils/notifications');
        if (assignedTo && assignedTo !== user._id.toString()) {
            // Notify the assigned person
            await notifyAssignment(
                assignedTo,
                user._id,
                savedLead,
                null,
                `You have been assigned a new lead: "${savedLead.companyName}"`
            );

            // Notify hierarchy
            await notifyLeadHierarchy(
                savedLead,
                'assignment',
                `New lead "${savedLead.companyName}" created and assigned`,
                user._id
            );
        }

        res.status(201).json(savedLead);
    } catch (error) {
        console.error('Error creating lead:', error);
        res.status(500).json({ message: 'Error creating lead', error: error.message });
    }
});

// Update a lead
router.put('/:id', async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const { notifyLeadHierarchy } = require('../utils/notifications');
        const User = require('../models/User');
        const oldStatus = lead.status;
        const oldAssignedTo = lead.assignedTo ? lead.assignedTo.toString() : null;
        const oldRemarks = lead.remarks;

        // Staff can only update status and remarks of leads assigned to them
        if (req.user.role === 'staff') {
            const allowedFields = ['status', 'remarks'];
            const updateFields = Object.keys(req.body);
            const hasUnauthorizedFields = updateFields.some(field => !allowedFields.includes(field));

            if (hasUnauthorizedFields) {
                return res.status(403).json({ message: 'Staff can only update lead status and remarks. Contact your Manager to modify other fields.' });
            }

            // Check if lead is assigned to this staff
            if (lead.assignedTo.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'You can only update leads assigned to you' });
            }
        }

        // Check access for manager - can only edit team leads
        if (req.user.role === 'manager') {
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id.toString(), ...teamMembers.map(m => m._id.toString())];
            const hasAccess = teamIds.includes(lead.assignedTo?.toString()) || teamIds.includes(lead.user?.toString());
            if (!hasAccess) {
                return res.status(403).json({ message: 'You can only edit leads assigned to your team' });
            }
        }

        // Check access for admin - can only edit department leads
        if (req.user.role === 'admin') {
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id.toString());
            const hasAccess = deptUserIds.includes(lead.assignedTo?.toString()) || deptUserIds.includes(lead.user?.toString());
            if (!hasAccess) {
                return res.status(403).json({ message: 'You can only edit leads in your department' });
            }
        }

        const { companyName, customerCode, gstNo, category, contactPerson, designation, email, mobile, address, status, remarks, assignedTo, newStatusUpdate } = req.body;
        const resolvedAssignedTo = assignedTo || (lead.assignedTo ? lead.assignedTo.toString() : '');

        // Validate required fields (skip for staff who can only update status/remarks)
        if (req.user.role !== 'staff') {
            if (!companyName || !resolvedAssignedTo) {
                return res.status(400).json({ message: 'Company Name and Assigned To are required' });
            }
        }

        // Build update object based on role
        let updateData = {};
        if (req.user.role === 'staff') {
            // Staff can only update status and remarks
            if (status !== undefined) updateData.status = status;
            if (remarks !== undefined) updateData.remarks = remarks;
        } else {
            // Other roles can update all fields
            updateData.companyName = companyName;
            if (customerCode !== undefined) updateData.customerCode = customerCode;
            if (gstNo !== undefined) updateData.gstNo = gstNo;
            if (category !== undefined) updateData.category = category;
            updateData.contactPerson = contactPerson;
            if (designation !== undefined) updateData.designation = designation;
            updateData.email = email;
            updateData.mobile = mobile;
            updateData.address = address;
            updateData.status = status;
            updateData.remarks = remarks;
            updateData.assignedTo = resolvedAssignedTo;
        }
        updateData.updatedAt = Date.now();

        let updatedLead = await Lead.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).populate('assignedTo', 'fullName email');

        if (!updatedLead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        if (newStatusUpdate && newStatusUpdate.trim() !== '') {
            updatedLead.statusUpdates.push({
                text: newStatusUpdate.trim(),
                authorName: req.user.fullName || req.user.email || 'Unknown',
                timestamp: new Date()
            });
            await updatedLead.save();

            // Notify the other party about the comment
            const Notification = require('../models/Notification');
            const updaterId = req.user._id.toString();
            const creatorId = updatedLead.user ? updatedLead.user.toString() : null;
            const assigneeId = updatedLead.assignedTo ? updatedLead.assignedTo.toString() : null;

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
                    lead: updatedLead._id,
                    type: 'comment',
                    message: `New message on lead "${updatedLead.companyName || 'Lead'}"`
                });
            }
        }

        // Send notifications for changes
        if (status && status !== oldStatus) {
            await notifyLeadHierarchy(
                updatedLead,
                'status_change',
                `Lead "${updatedLead.companyName}" status changed from ${oldStatus} to ${status}`,
                req.user._id
            );
        }

        if (resolvedAssignedTo && resolvedAssignedTo !== oldAssignedTo) {
            await notifyLeadHierarchy(
                updatedLead,
                oldAssignedTo ? 'reassignment' : 'assignment',
                `Lead "${updatedLead.companyName}" ${oldAssignedTo ? 'reassigned' : 'assigned'}`,
                req.user._id
            );
        }

        if (remarks && remarks !== oldRemarks) {
            await notifyLeadHierarchy(
                updatedLead,
                'comment',
                `New comment on lead "${updatedLead.companyName}"`,
                req.user._id
            );
        }

        res.json(updatedLead);
    } catch (error) {
        console.error('Error updating lead:', error);
        res.status(500).json({ message: 'Error updating lead', error: error.message });
    }
});

// Delete a lead (SuperAdmin and Admin only, Manager for their team)
router.delete('/:id', async (req, res) => {
    try {
        console.log(`[DELETE LEAD] ID: ${req.params.id}, User: ${req.user.email} (${req.user.role})`);
        
        // Staff cannot delete leads
        if (req.user.role === 'staff') {
            console.log('[DELETE LEAD] Access denied: Role is staff');
            return res.status(403).json({ message: 'Staff cannot delete leads. Contact your Manager or Admin.' });
        }

        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            console.log('[DELETE LEAD] Error: Lead not found');
            return res.status(404).json({ message: 'Lead not found' });
        }

        const User = require('../models/User');

        // Check delete permission based on role hierarchy
        let hasAccess = false;
        if (req.user.role === 'superadmin') {
            hasAccess = true;
        } else if (req.user.role === 'manager') {
            // Manager can only delete leads assigned to their team
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id.toString(), ...teamMembers.map(m => m._id.toString())];
            hasAccess = teamIds.includes(lead.assignedTo?.toString()) || teamIds.includes(lead.user?.toString());
            console.log(`[DELETE LEAD] Manager access: ${hasAccess}`);
        } else if (req.user.role === 'admin') {
            // Admin can only delete leads in their department
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id.toString());
            hasAccess = deptUserIds.includes(lead.assignedTo?.toString()) || deptUserIds.includes(lead.user?.toString());
            console.log(`[DELETE LEAD] Admin access: ${hasAccess}`);
        }

        if (!hasAccess) {
            console.log('[DELETE LEAD] Access denied: Role-based hierarchy check failed');
            return res.status(403).json({ message: 'Access denied. You do not have permission to delete this lead.' });
        }

        await Lead.findByIdAndDelete(req.params.id);
        console.log('[DELETE LEAD] Lead deleted from DB');

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'lead_deleted',
            module: 'leads',
            targetId: req.params.id,
            description: `Deleted lead: ${lead.companyName || lead.name || 'Unknown'}`,
            metadata: { companyName: lead.companyName }
        }).save();
        console.log('[DELETE LEAD] Activity logged');

        res.json({ message: 'Lead deleted successfully' });
    } catch (error) {
        console.error('[DELETE LEAD] Error:', error);
        res.status(500).json({ message: 'Error deleting lead', error: error.message });
    }
});

// Add note to lead
router.post('/:id/notes', async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Add note with createdBy field
        lead.notes.push({
            content: req.body.content,
            createdBy: req.user._id
        });
        const updatedLead = await lead.save();
        res.json(updatedLead);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete note from lead
router.delete('/:id/notes/:noteId', async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const note = lead.notes.id(req.params.noteId);
        if (!note) {
            return res.status(404).json({ message: 'Note not found' });
        }

        // Check permission: only note creator, admin, or superadmin can delete
        const isCreator = note.createdBy?.toString() === req.user._id.toString();
        const isAdmin = ['admin', 'superadmin'].includes(req.user.role);

        if (!isCreator && !isAdmin) {
            return res.status(403).json({ message: 'You can only delete your own notes' });
        }

        // Remove the note
        lead.notes.id(req.params.noteId).deleteOne();
        const updatedLead = await lead.save();
        res.json(updatedLead);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update note in lead
router.patch('/:id/notes/:noteId', async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const note = lead.notes.id(req.params.noteId);
        if (!note) {
            return res.status(404).json({ message: 'Note not found' });
        }

        // Check permission: only note creator, admin, or superadmin can edit
        const isCreator = note.createdBy?.toString() === req.user._id.toString();
        const isAdmin = ['admin', 'superadmin'].includes(req.user.role);

        if (!isCreator && !isAdmin) {
            return res.status(403).json({ message: 'You can only edit your own notes' });
        }

        // Update the note
        note.content = req.body.content;
        const updatedLead = await lead.save();
        res.json(updatedLead);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update lead status (for drag and drop)
router.patch('/:id/status', async (req, res) => {
    try {
        console.log(`PATCH /leads/${req.params.id}/status - New status:`, req.body.status);

        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            console.log('Lead not found:', req.params.id);
            return res.status(404).json({ message: 'Lead not found' });
        }

        console.log('Lead found:', lead.name, 'Current status:', lead.status, 'Value:', lead.value);

        const oldStatus = lead.status;
        lead.status = req.body.status;
        lead.updatedAt = Date.now();

        console.log('Updating status from', oldStatus, 'to', req.body.status);

        // Add to timeline
        lead.timeline.push({
            action: 'status_changed',
            description: `Status changed from ${oldStatus} to ${req.body.status}`,
            performedBy: req.user._id,
            metadata: { oldStatus, newStatus: req.body.status }
        });

        const updatedLead = await lead.save();
        console.log('Lead updated successfully. New status:', updatedLead.status);

        // Log activity
        const ActivityLog = require('../models/ActivityLog');
        await new ActivityLog({
            user: req.user._id,
            action: 'lead_status_changed',
            module: 'leads',
            targetId: lead._id,
            targetModel: 'Lead',
            description: `Lead status changed: ${lead.name}`,
            metadata: { oldStatus, newStatus: req.body.status }
        }).save();

        res.json(updatedLead);
    } catch (error) {
        console.error('Error updating lead status:', error);
        res.status(500).json({ message: 'Error updating lead status', error: error.message });
    }
});

// Add attachment to lead
router.post('/:id/attachments', async (req, res) => {
    try {
        const { filename, originalName, path, mimetype, size } = req.body;

        // Find lead - check if user created it OR is assigned to it
        const lead = await Lead.findOne({
            _id: req.params.id,
            $or: [
                { user: req.user._id },
                { assignedTo: req.user._id }
            ]
        });
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found or you do not have access' });
        }

        lead.attachments.push({
            filename,
            originalName,
            path,
            mimetype,
            size,
            uploadedBy: req.user._id
        });

        lead.timeline.push({
            action: 'file_attached',
            description: `File attached: ${originalName}`,
            performedBy: req.user._id,
            metadata: { filename, originalName, size }
        });

        await lead.save();

        // Log activity
        const ActivityLog = require('../models/ActivityLog');
        await new ActivityLog({
            user: req.user._id,
            action: 'file_uploaded',
            module: 'leads',
            targetId: lead._id,
            targetModel: 'Lead',
            description: `File attached to lead: ${lead.name}`,
            metadata: { filename, originalName }
        }).save();

        res.json({ message: 'Attachment added successfully', lead });
    } catch (error) {
        console.error('Error adding attachment:', error);
        res.status(500).json({ message: 'Error adding attachment', error: error.message });
    }
});

// Delete attachment from lead
router.delete('/:id/attachments/:attachmentId', async (req, res) => {
    try {
        const lead = await Lead.findOne({ _id: req.params.id, user: req.user._id });
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const attachment = lead.attachments.id(req.params.attachmentId);
        if (!attachment) {
            return res.status(404).json({ message: 'Attachment not found' });
        }

        lead.attachments.pull(req.params.attachmentId);
        await lead.save();

        // Log activity
        const ActivityLog = require('../models/ActivityLog');
        await new ActivityLog({
            user: req.user._id,
            action: 'file_deleted',
            module: 'leads',
            targetId: lead._id,
            targetModel: 'Lead',
            description: `File deleted from lead: ${lead.name}`,
            metadata: { filename: attachment.originalName }
        }).save();

        res.json({ message: 'Attachment deleted successfully' });
    } catch (error) {
        console.error('Error deleting attachment:', error);
        res.status(500).json({ message: 'Error deleting attachment', error: error.message });
    }
});

// Get lead timeline
router.get('/:id/timeline', async (req, res) => {
    try {
        const lead = await Lead.findOne({ _id: req.params.id, user: req.user._id })
            .populate('timeline.performedBy', 'username email fullName')
            .select('timeline');

        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        res.json(lead.timeline);
    } catch (error) {
        console.error('Error fetching timeline:', error);
        res.status(500).json({ message: 'Error fetching timeline', error: error.message });
    }
});

// Update custom fields for a lead
router.patch('/:id/custom-fields', async (req, res) => {
    try {
        const { customFields } = req.body;

        const lead = await Lead.findOne({ _id: req.params.id, user: req.user._id });
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        lead.customFields = { ...lead.customFields, ...customFields };
        lead.markModified('customFields');
        await lead.save();

        res.json({ message: 'Custom fields updated successfully', lead });
    } catch (error) {
        console.error('Error updating custom fields:', error);
        res.status(500).json({ message: 'Error updating custom fields', error: error.message });
    }
});

// Assign lead to user
router.patch('/:id/assign', async (req, res) => {
    try {
        const { assignedTo } = req.body;

        const lead = await Lead.findOne({ _id: req.params.id, user: req.user._id });
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const oldAssignee = lead.assignedTo;
        lead.assignedTo = assignedTo;

        lead.timeline.push({
            action: 'assigned',
            description: `Lead assigned to ${assignedTo}`,
            performedBy: req.user._id,
            metadata: { oldAssignee, newAssignee: assignedTo }
        });

        await lead.save();

        // Log activity
        const ActivityLog = require('../models/ActivityLog');
        await new ActivityLog({
            user: req.user._id,
            action: 'lead_assigned',
            module: 'leads',
            targetId: lead._id,
            targetModel: 'Lead',
            description: `Lead assigned: ${lead.name} to ${assignedTo}`,
            metadata: { assignedTo }
        }).save();

        res.json({ message: 'Lead assigned successfully', lead });
    } catch (error) {
        console.error('Error assigning lead:', error);
        res.status(500).json({ message: 'Error assigning lead', error: error.message });
    }
});

// Add tags to lead
router.patch('/:id/tags', async (req, res) => {
    try {
        const { tags } = req.body;

        const lead = await Lead.findOne({ _id: req.params.id, user: req.user._id });
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        lead.tags = tags;
        await lead.save();

        res.json({ message: 'Tags updated successfully', lead });
    } catch (error) {
        console.error('Error updating tags:', error);
        res.status(500).json({ message: 'Error updating tags', error: error.message });
    }
});


module.exports = router; 
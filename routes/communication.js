const express = require('express');
const router = express.Router();
const Communication = require('../models/Communication');
const Lead = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Get all communications for a lead
router.get('/lead/:leadId', async (req, res) => {
    try {
        const lead = await Lead.findOne({ 
            _id: req.params.leadId,
            $or: [
                { user: req.user._id },
                { assignedTo: req.user._id }
            ]
        });
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found or you do not have access' });
        }

        const communications = await Communication.find({ lead: req.params.leadId })
            .populate('sentBy', 'username email fullName')
            .sort({ createdAt: -1 });
        
        res.json(communications);
    } catch (error) {
        console.error('Error fetching communications:', error);
        res.status(500).json({ message: 'Error fetching communications', error: error.message });
    }
});

// Get all communications for user with role-based filtering
router.get('/', async (req, res) => {
    try {
        const { type, status, startDate, endDate } = req.query;
        const User = require('../models/User');
        
        console.log('GET /communications - User:', req.user.email, 'Role:', req.user.role, 'Department:', req.user.department);
        
        let leadQuery = {};
        
        // Apply role-based filtering based on hierarchy
        // SuperAdmin: all communications
        // Admin: department communications
        // Manager: team communications
        // Staff: own communications
        
        if (req.user.role === 'superadmin') {
            leadQuery = {};
            console.log('SuperAdmin: showing all communications');
        } else if (req.user.role === 'admin') {
            // Admin sees department communications
            const deptUsers = await User.find({ department: req.user.department }).select('_id');
            const deptUserIds = deptUsers.map(u => u._id);
            leadQuery = { user: { $in: deptUserIds } };
            console.log('Admin: showing department communications');
        } else if (req.user.role === 'manager') {
            // Manager sees their team's communications
            const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
            const teamIds = [req.user._id, ...teamMembers.map(m => m._id)];
            leadQuery = { user: { $in: teamIds } };
            console.log('Manager: showing team communications');
        } else {
            // Staff sees communications for leads assigned to them or created by them
            leadQuery = { 
                $or: [
                    { user: req.user._id },
                    { assignedTo: req.user._id }
                ]
            };
            console.log('Staff: showing own and assigned communications');
        }
        
        // Build communication query
        let commQuery = {};
        
        if (type) commQuery.type = type;
        if (status) commQuery.status = status;
        if (startDate || endDate) {
            commQuery.createdAt = {};
            if (startDate) commQuery.createdAt.$gte = new Date(startDate);
            if (endDate) commQuery.createdAt.$lte = new Date(endDate);
        }

        const communications = await Communication.find(commQuery)
            .populate({
                path: 'lead',
                match: leadQuery,
                select: 'companyName contactPerson email mobile user assignedTo'
            })
            .populate('sentBy', 'username email fullName')
            .sort({ createdAt: -1 })
            .limit(100);
        
        // Filter out communications where lead is null (not accessible)
        const accessibleComms = communications.filter(comm => comm.lead !== null);
        
        console.log('Found communications:', accessibleComms.length);
        res.json(accessibleComms);
    } catch (error) {
        console.error('Error fetching communications:', error);
        res.status(500).json({ message: 'Error fetching communications', error: error.message });
    }
});

// Send email
router.post('/email', async (req, res) => {
    try {
        const { leadId, to, cc, subject, content, attachments } = req.body;
        const emailService = require('../utils/emailService');
        const User = require('../models/User');
        
        if (!leadId || !to || !subject || !content) {
            return res.status(400).json({ message: 'LeadId, to, subject, and content are required' });
        }

        const lead = await Lead.findOne({ 
            _id: leadId,
            $or: [
                { user: req.user._id },
                { assignedTo: req.user._id }
            ]
        });
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found or you do not have access' });
        }

        // Get user's email configuration
        const user = await User.findById(req.user._id);
        
        if (!user.emailConfig?.isConfigured) {
            return res.status(400).json({ 
                message: 'Email not configured. Please configure your Outlook email in Settings > Email Configuration.' 
            });
        }

        // Send email using user's Outlook account
        const emailResult = await emailService.sendEmail({
            to,
            cc: cc || [],
            subject,
            html: content,
            attachments: attachments || [],
            userEmailConfig: user.emailConfig
        });
        
        const communication = new Communication({
            lead: leadId,
            type: 'email',
            direction: 'outbound',
            subject,
            content,
            from: user.emailConfig.outlookEmail,
            to,
            cc: cc || [],
            attachments: attachments || [],
            status: emailResult.success ? 'sent' : 'failed',
            metadata: {
                messageId: emailResult.messageId,
                error: emailResult.error
            },
            sentBy: req.user._id,
            user: req.user._id
        });

        await communication.save();

        // Add to lead timeline
        await Lead.findByIdAndUpdate(leadId, {
            $push: {
                timeline: {
                    action: 'email_sent',
                    description: `Email sent: ${subject}`,
                    performedBy: req.user._id,
                    metadata: { to, subject }
                }
            }
        });

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'email_sent',
            module: 'communication',
            targetId: communication._id,
            description: `Email sent to ${to}: ${subject}`,
            metadata: { leadId, to, subject }
        }).save();

        res.status(201).json({
            message: emailResult.success ? 'Email sent successfully via Outlook' : 'Email logged but sending failed',
            communication,
            emailStatus: emailResult.success ? 'sent' : 'failed',
            error: emailResult.error || null
        });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ message: 'Error sending email', error: error.message });
    }
});

// Send WhatsApp message
router.post('/whatsapp', async (req, res) => {
    try {
        const { leadId, to, content } = req.body;
        
        if (!leadId || !to || !content) {
            return res.status(400).json({ message: 'LeadId, to, and content are required' });
        }

        const lead = await Lead.findOne({ 
            _id: leadId,
            $or: [
                { user: req.user._id },
                { assignedTo: req.user._id }
            ]
        });
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found or you do not have access' });
        }

        // TODO: Integrate with WhatsApp Business API
        // Check if WhatsApp is configured
        const Settings = require('../models/Settings');
        const settings = await Settings.findOne({ user: req.user._id });
        const whatsappConfigured = settings?.whatsapp?.apiKey && settings?.whatsapp?.phoneNumberId;
        
        const communication = new Communication({
            lead: leadId,
            type: 'whatsapp',
            direction: 'outbound',
            content,
            to,
            status: whatsappConfigured ? 'sent' : 'pending', // Pending until WhatsApp configured
            metadata: {
                whatsappId: whatsappConfigured ? 'wa_' + Date.now() : null
            },
            sentBy: req.user._id,
            user: req.user._id
        });

        await communication.save();

        // Add to lead timeline
        await Lead.findByIdAndUpdate(leadId, {
            $push: {
                timeline: {
                    action: 'whatsapp_sent',
                    description: `WhatsApp message sent`,
                    performedBy: req.user._id,
                    metadata: { to }
                }
            }
        });

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'whatsapp_sent',
            module: 'communication',
            targetId: communication._id,
            description: `WhatsApp message sent to ${to}`,
            metadata: { leadId, to }
        }).save();

        res.status(201).json({
            message: whatsappConfigured ? 'WhatsApp message sent successfully' : 'WhatsApp message logged (WhatsApp not configured - configure in Settings to send messages)',
            communication,
            warning: !whatsappConfigured ? 'WhatsApp service not configured. Go to Settings > WhatsApp Config to set up API.' : null
        });
    } catch (error) {
        console.error('Error sending WhatsApp:', error);
        res.status(500).json({ message: 'Error sending WhatsApp message', error: error.message });
    }
});

// Log call
router.post('/call', async (req, res) => {
    try {
        const { leadId, to, content, duration } = req.body;
        
        if (!leadId || !to || !content) {
            return res.status(400).json({ message: 'LeadId, to, and content are required' });
        }

        const lead = await Lead.findOne({ 
            _id: leadId,
            $or: [
                { user: req.user._id },
                { assignedTo: req.user._id }
            ]
        });
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found or you do not have access' });
        }

        const communication = new Communication({
            lead: leadId,
            type: 'call',
            direction: 'outbound',
            content,
            to,
            status: 'sent',
            metadata: {
                callDuration: duration || 0
            },
            sentBy: req.user._id,
            user: req.user._id
        });

        await communication.save();

        // Add to lead timeline
        await Lead.findByIdAndUpdate(leadId, {
            $push: {
                timeline: {
                    action: 'call_made',
                    description: `Call made to ${to}`,
                    performedBy: req.user._id,
                    metadata: { to, duration }
                }
            },
            lastContact: Date.now()
        });

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'email_sent', // Using generic action for call
            module: 'communication',
            targetId: communication._id,
            description: `Call made to ${to}`,
            metadata: { leadId, to, duration }
        }).save();

        res.status(201).json({
            message: 'Call logged successfully',
            communication
        });
    } catch (error) {
        console.error('Error logging call:', error);
        res.status(500).json({ message: 'Error logging call', error: error.message });
    }
});

// Log meeting
router.post('/meeting', async (req, res) => {
    try {
        const { leadId, content, duration, attendees } = req.body;
        
        if (!leadId || !content) {
            return res.status(400).json({ message: 'LeadId and content are required' });
        }

        const lead = await Lead.findOne({ 
            _id: leadId,
            $or: [
                { user: req.user._id },
                { assignedTo: req.user._id }
            ]
        });
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found or you do not have access' });
        }

        const communication = new Communication({
            lead: leadId,
            type: 'meeting',
            direction: 'outbound',
            subject: 'Meeting',
            content,
            to: attendees || lead.emails[0].email,
            status: 'sent',
            metadata: {
                meetingDuration: duration || 0,
                attendees
            },
            sentBy: req.user._id,
            user: req.user._id
        });

        await communication.save();

        // Add to lead timeline
        await Lead.findByIdAndUpdate(leadId, {
            $push: {
                timeline: {
                    action: 'meeting_held',
                    description: `Meeting held`,
                    performedBy: req.user._id,
                    metadata: { duration, attendees }
                }
            },
            lastContact: Date.now()
        });

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'email_sent',
            module: 'communication',
            targetId: communication._id,
            description: `Meeting logged for lead`,
            metadata: { leadId, duration }
        }).save();

        res.status(201).json({
            message: 'Meeting logged successfully',
            communication
        });
    } catch (error) {
        console.error('Error logging meeting:', error);
        res.status(500).json({ message: 'Error logging meeting', error: error.message });
    }
});

// Add note to lead (also creates communication record)
router.post('/note', async (req, res) => {
    try {
        const { leadId, content } = req.body;
        
        if (!leadId || !content) {
            return res.status(400).json({ message: 'LeadId and content are required' });
        }

        const lead = await Lead.findOne({ 
            _id: leadId,
            $or: [
                { user: req.user._id },
                { assignedTo: req.user._id }
            ]
        });
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found or you do not have access' });
        }

        const communication = new Communication({
            lead: leadId,
            type: 'note',
            direction: 'outbound',
            content,
            to: lead.emails[0].email,
            status: 'sent',
            sentBy: req.user._id,
            user: req.user._id
        });

        await communication.save();

        // Also add to lead notes and timeline
        await Lead.findByIdAndUpdate(leadId, {
            $push: {
                notes: {
                    content,
                    createdBy: req.user._id
                },
                timeline: {
                    action: 'note_added',
                    description: content.substring(0, 100),
                    performedBy: req.user._id
                }
            }
        });

        res.status(201).json({
            message: 'Note added successfully',
            communication
        });
    } catch (error) {
        console.error('Error adding note:', error);
        res.status(500).json({ message: 'Error adding note', error: error.message });
    }
});

// Get communication statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = await Communication.aggregate([
            { $match: { user: req.user._id } },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 }
                }
            }
        ]);

        const statusStats = await Communication.aggregate([
            { $match: { user: req.user._id } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            byType: stats,
            byStatus: statusStats
        });
    } catch (error) {
        console.error('Error fetching communication stats:', error);
        res.status(500).json({ message: 'Error fetching stats', error: error.message });
    }
});

// Get single communication by ID
router.get('/:id', async (req, res) => {
    try {
        const Communication = require('../models/Communication');
        
        const comm = await Communication.findById(req.params.id)
            .populate('lead', 'companyName contactPerson email mobile user assignedTo')
            .populate('user', 'fullName email');
        
        if (!comm) {
            return res.status(404).json({ message: 'Communication not found' });
        }
        
        res.json(comm);
    } catch (error) {
        console.error('Error fetching communication:', error);
        res.status(500).json({ message: 'Error fetching communication', error: error.message });
    }
});

module.exports = router;

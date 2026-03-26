const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const ActivityLog = require('../models/ActivityLog');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Get user settings
router.get('/', async (req, res) => {
    try {
        let settings = await Settings.findOne({ user: req.user._id });
        
        if (!settings) {
            // Create default settings
            settings = new Settings({
                user: req.user._id,
                company: {},
                email: {},
                whatsapp: { enabled: false },
                pipeline: {
                    defaultStages: ['qualification', 'meeting', 'proposal', 'negotiation', 'closed', 'lost']
                },
                notifications: {
                    emailNotifications: true,
                    taskReminders: true,
                    leadAssignments: true,
                    dailyDigest: false
                },
                backup: {
                    autoBackup: true,
                    backupFrequency: 'daily'
                }
            });
            await settings.save();
        }
        
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ message: 'Error fetching settings', error: error.message });
    }
});

// Update company settings
router.put('/company', async (req, res) => {
    try {
        const { name, logo, website, address, phone, email } = req.body;
        
        let settings = await Settings.findOne({ user: req.user._id });
        
        if (!settings) {
            settings = new Settings({ user: req.user._id });
        }
        
        settings.company = {
            name,
            logo,
            website,
            address,
            phone,
            email
        };
        
        await settings.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'settings_updated',
            module: 'settings',
            description: 'Updated company settings',
            metadata: { section: 'company' }
        }).save();
        
        res.json({ message: 'Company settings updated successfully', settings });
    } catch (error) {
        console.error('Error updating company settings:', error);
        res.status(500).json({ message: 'Error updating company settings', error: error.message });
    }
});

// Update email settings
router.put('/email', async (req, res) => {
    try {
        const { senderName, senderEmail, smtpHost, smtpPort, smtpUser, smtpPassword, smtpSecure } = req.body;
        
        let settings = await Settings.findOne({ user: req.user._id });
        
        if (!settings) {
            settings = new Settings({ user: req.user._id });
        }
        
        settings.email = {
            senderName,
            senderEmail,
            smtpHost,
            smtpPort,
            smtpUser,
            smtpPassword,
            smtpSecure
        };
        
        await settings.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'settings_updated',
            module: 'settings',
            description: 'Updated email settings',
            metadata: { section: 'email' }
        }).save();
        
        res.json({ message: 'Email settings updated successfully', settings });
    } catch (error) {
        console.error('Error updating email settings:', error);
        res.status(500).json({ message: 'Error updating email settings', error: error.message });
    }
});

// Update WhatsApp settings
router.put('/whatsapp', async (req, res) => {
    try {
        const { apiKey, phoneNumberId, businessAccountId, enabled } = req.body;
        
        let settings = await Settings.findOne({ user: req.user._id });
        
        if (!settings) {
            settings = new Settings({ user: req.user._id });
        }
        
        settings.whatsapp = {
            apiKey,
            phoneNumberId,
            businessAccountId,
            enabled
        };
        
        await settings.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'settings_updated',
            module: 'settings',
            description: 'Updated WhatsApp settings',
            metadata: { section: 'whatsapp', enabled }
        }).save();
        
        res.json({ message: 'WhatsApp settings updated successfully', settings });
    } catch (error) {
        console.error('Error updating WhatsApp settings:', error);
        res.status(500).json({ message: 'Error updating WhatsApp settings', error: error.message });
    }
});

// Update pipeline settings
router.put('/pipeline', async (req, res) => {
    try {
        const { defaultStages, customStages } = req.body;
        
        let settings = await Settings.findOne({ user: req.user._id });
        
        if (!settings) {
            settings = new Settings({ user: req.user._id });
        }
        
        if (defaultStages) settings.pipeline.defaultStages = defaultStages;
        if (customStages) settings.pipeline.customStages = customStages;
        
        await settings.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'settings_updated',
            module: 'settings',
            description: 'Updated pipeline settings',
            metadata: { section: 'pipeline' }
        }).save();
        
        res.json({ message: 'Pipeline settings updated successfully', settings });
    } catch (error) {
        console.error('Error updating pipeline settings:', error);
        res.status(500).json({ message: 'Error updating pipeline settings', error: error.message });
    }
});

// Update notification settings
router.put('/notifications', async (req, res) => {
    try {
        const { emailNotifications, taskReminders, leadAssignments, dailyDigest } = req.body;
        
        let settings = await Settings.findOne({ user: req.user._id });
        
        if (!settings) {
            settings = new Settings({ user: req.user._id });
        }
        
        settings.notifications = {
            emailNotifications,
            taskReminders,
            leadAssignments,
            dailyDigest
        };
        
        await settings.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'settings_updated',
            module: 'settings',
            description: 'Updated notification settings',
            metadata: { section: 'notifications' }
        }).save();
        
        res.json({ message: 'Notification settings updated successfully', settings });
    } catch (error) {
        console.error('Error updating notification settings:', error);
        res.status(500).json({ message: 'Error updating notification settings', error: error.message });
    }
});

// Update custom fields
router.put('/custom-fields', async (req, res) => {
    try {
        const { leads } = req.body;
        
        let settings = await Settings.findOne({ user: req.user._id });
        
        if (!settings) {
            settings = new Settings({ user: req.user._id });
        }
        
        settings.customFields = { leads };
        
        await settings.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'settings_updated',
            module: 'settings',
            description: 'Updated custom fields settings',
            metadata: { section: 'custom-fields' }
        }).save();
        
        res.json({ message: 'Custom fields updated successfully', settings });
    } catch (error) {
        console.error('Error updating custom fields:', error);
        res.status(500).json({ message: 'Error updating custom fields', error: error.message });
    }
});

// Update backup settings
router.put('/backup', async (req, res) => {
    try {
        const { autoBackup, backupFrequency } = req.body;
        
        let settings = await Settings.findOne({ user: req.user._id });
        
        if (!settings) {
            settings = new Settings({ user: req.user._id });
        }
        
        if (autoBackup !== undefined) settings.backup.autoBackup = autoBackup;
        if (backupFrequency) settings.backup.backupFrequency = backupFrequency;
        
        await settings.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'settings_updated',
            module: 'settings',
            description: 'Updated backup settings',
            metadata: { section: 'backup', autoBackup, backupFrequency }
        }).save();
        
        res.json({ message: 'Backup settings updated successfully', settings });
    } catch (error) {
        console.error('Error updating backup settings:', error);
        res.status(500).json({ message: 'Error updating backup settings', error: error.message });
    }
});

// Trigger manual backup
// Update invoice defaults (superadmin only)
router.put('/invoice-defaults', async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Super Admin access required.' });
    }
    try {
        const { defaultSignatoryName, defaultSealUrl, defaultTemplate } = req.body;
        let settings = await Settings.findOne({ user: req.user._id });
        if (!settings) settings = new Settings({ user: req.user._id });
        const normalizedTemplate = ['image1', 'image2'].includes(defaultTemplate) ? defaultTemplate : 'image1';
        settings.invoiceDefaults = { defaultSignatoryName, defaultSealUrl, defaultTemplate: normalizedTemplate };
        await settings.save();
        res.json({ message: 'Invoice defaults saved.', invoiceDefaults: settings.invoiceDefaults });
    } catch (error) {
        res.status(500).json({ message: 'Error saving invoice defaults', error: error.message });
    }
});

router.post('/backup/trigger', async (req, res) => {
    try {
        let settings = await Settings.findOne({ user: req.user._id });
        
        if (!settings) {
            settings = new Settings({ user: req.user._id });
        }
        
        settings.backup.lastBackup = new Date();
        await settings.save();

        // Log activity
        await new ActivityLog({
            user: req.user._id,
            action: 'settings_updated',
            module: 'settings',
            description: 'Manual backup triggered',
            metadata: { section: 'backup' }
        }).save();

        // In production, implement actual backup logic here
        
        res.json({ message: 'Backup triggered successfully', lastBackup: settings.backup.lastBackup });
    } catch (error) {
        console.error('Error triggering backup:', error);
        res.status(500).json({ message: 'Error triggering backup', error: error.message });
    }
});

module.exports = router;

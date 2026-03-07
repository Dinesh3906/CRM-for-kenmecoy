const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const { verifyEmailConfig } = require('../utils/emailService');

// All routes require authentication
router.use(auth);

// Get current user's email configuration
router.get('/config', async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('emailConfig');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Return config without password
        res.json({
            outlookEmail: user.emailConfig?.outlookEmail || '',
            isConfigured: user.emailConfig?.isConfigured || false,
            lastVerified: user.emailConfig?.lastVerified || null
        });
    } catch (error) {
        console.error('Error fetching email config:', error);
        res.status(500).json({ message: 'Error fetching email configuration' });
    }
});

// Save/Update user's email configuration
router.post('/config', async (req, res) => {
    try {
        const { outlookEmail, outlookPassword } = req.body;
        
        if (!outlookEmail || !outlookPassword) {
            return res.status(400).json({ message: 'Outlook email and password are required' });
        }
        
        // Verify the email credentials
        const verification = await verifyEmailConfig(outlookEmail, outlookPassword);
        
        if (!verification.success) {
            return res.status(400).json({ 
                message: 'Email verification failed. Please check your credentials.',
                error: verification.message 
            });
        }
        
        // Update user's email configuration
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        user.emailConfig = {
            outlookEmail,
            outlookPassword, // In production, encrypt this!
            isConfigured: true,
            lastVerified: new Date()
        };
        
        await user.save();
        
        res.json({ 
            message: 'Email configuration saved and verified successfully',
            outlookEmail,
            isConfigured: true,
            lastVerified: user.emailConfig.lastVerified
        });
    } catch (error) {
        console.error('Error saving email config:', error);
        res.status(500).json({ message: 'Error saving email configuration' });
    }
});

// Test email configuration
router.post('/test', async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        if (!user || !user.emailConfig?.isConfigured) {
            return res.status(400).json({ message: 'Email not configured. Please configure your Outlook email first.' });
        }
        
        const emailService = require('../utils/emailService');
        
        const result = await emailService.sendEmail({
            to: user.emailConfig.outlookEmail,
            subject: 'CRM Email Test',
            html: '<h2>Email Configuration Test</h2><p>Your email is configured correctly!</p>',
            userEmailConfig: user.emailConfig
        });
        
        if (result.success) {
            res.json({ message: 'Test email sent successfully! Check your inbox.' });
        } else {
            res.status(500).json({ message: 'Failed to send test email', error: result.error });
        }
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({ message: 'Error sending test email' });
    }
});

// Remove email configuration
router.delete('/config', async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        user.emailConfig = {
            outlookEmail: '',
            outlookPassword: '',
            isConfigured: false,
            lastVerified: null
        };
        
        await user.save();
        
        res.json({ message: 'Email configuration removed successfully' });
    } catch (error) {
        console.error('Error removing email config:', error);
        res.status(500).json({ message: 'Error removing email configuration' });
    }
});

module.exports = router;

const nodemailer = require('nodemailer');

// Create Outlook/Office 365 transporter for a specific user
function createTransporter(userEmailConfig = null) {
    const emailConfig = {
        host: 'smtp-mail.outlook.com',
        port: 587,
        secure: false, // Use STARTTLS
        auth: {
            user: userEmailConfig?.outlookEmail || process.env.EMAIL_USER,
            pass: userEmailConfig?.outlookPassword || process.env.EMAIL_PASSWORD
        },
        tls: {
            ciphers: 'SSLv3',
            rejectUnauthorized: false
        }
    };
    
    if (!emailConfig.auth.user || !emailConfig.auth.pass) {
        console.warn('Email credentials not configured. Email sending disabled.');
        return null;
    }
    
    const transporter = nodemailer.createTransport(emailConfig);
    
    return transporter;
}

// Verify email configuration for a user
async function verifyEmailConfig(outlookEmail, outlookPassword) {
    try {
        const testTransporter = createTransporter({ outlookEmail, outlookPassword });
        
        if (!testTransporter) {
            return { success: false, message: 'Email credentials missing' };
        }
        
        await testTransporter.verify();
        return { success: true, message: 'Email configuration verified' };
    } catch (error) {
        console.error('Email verification failed:', error.message);
        return { success: false, message: error.message };
    }
}

async function sendEmail({ to, subject, html, text, cc = [], attachments = [], userEmailConfig = null }) {
    try {
        const emailTransporter = createTransporter(userEmailConfig);
        
        if (!emailTransporter) {
            console.log('Email service not configured, email not sent');
            return { success: false, message: 'Email service not configured' };
        }
        
        const fromEmail = userEmailConfig?.outlookEmail || process.env.EMAIL_USER;
        const mailOptions = {
            from: fromEmail,
            to: Array.isArray(to) ? to.join(', ') : to,
            cc: Array.isArray(cc) ? cc.join(', ') : cc,
            subject,
            text: text || '',
            html: html || text || ''
        };
        
        if (attachments && attachments.length > 0) {
            mailOptions.attachments = attachments;
        }
        
        const info = await emailTransporter.sendMail(mailOptions);
        
        console.log('Email sent successfully from:', fromEmail, 'MessageID:', info.messageId);
        return { 
            success: true, 
            messageId: info.messageId,
            response: info.response 
        };
    } catch (error) {
        console.error('Error sending email:', error);
        return { 
            success: false, 
            error: error.message 
        };
    }
}

async function sendWelcomeEmail(userEmail, userName, temporaryPassword) {
    const subject = 'Welcome to CRM System';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">Welcome to CRM System!</h2>
            <p>Hi ${userName},</p>
            <p>Your account has been created successfully. Here are your login credentials:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Email:</strong> ${userEmail}</p>
                <p><strong>Temporary Password:</strong> ${temporaryPassword}</p>
            </div>
            <p>Please login and change your password as soon as possible.</p>
            <p style="margin-top: 30px;">
                <a href="${process.env.CORS_ORIGIN || 'http://localhost:3000'}" 
                   style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Login to CRM
                </a>
            </p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
                If you didn't expect this email, please contact your administrator.
            </p>
        </div>
    `;
    
    return await sendEmail({ to: userEmail, subject, html });
}

async function sendTaskAssignmentEmail(userEmail, userName, taskTitle, taskDescription, dueDate) {
    const subject = `New Task Assigned: ${taskTitle}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">New Task Assigned</h2>
            <p>Hi ${userName},</p>
            <p>A new task has been assigned to you:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0;">${taskTitle}</h3>
                <p>${taskDescription || 'No description provided'}</p>
                <p><strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString()}</p>
            </div>
            <p>
                <a href="${process.env.CORS_ORIGIN || 'http://localhost:3000'}" 
                   style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    View Task
                </a>
            </p>
        </div>
    `;
    
    return await sendEmail({ to: userEmail, subject, html });
}

async function sendLeadAssignmentEmail(userEmail, userName, leadName, leadCompany) {
    const subject = `New Lead Assigned: ${leadName}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">New Lead Assigned</h2>
            <p>Hi ${userName},</p>
            <p>A new lead has been assigned to you:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0;">${leadName}</h3>
                <p><strong>Company:</strong> ${leadCompany}</p>
            </div>
            <p>
                <a href="${process.env.CORS_ORIGIN || 'http://localhost:3000'}" 
                   style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    View Lead
                </a>
            </p>
        </div>
    `;
    
    return await sendEmail({ to: userEmail, subject, html });
}

async function sendPasswordResetEmail(userEmail, resetToken) {
    const resetUrl = `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    const subject = 'Password Reset Request';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">Password Reset Request</h2>
            <p>You requested to reset your password.</p>
            <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
            <p style="margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Reset Password
                </a>
            </p>
            <p style="color: #666; font-size: 12px;">
                If you didn't request this, please ignore this email.
            </p>
            <p style="color: #666; font-size: 12px;">
                Or copy and paste this URL into your browser:<br>
                ${resetUrl}
            </p>
        </div>
    `;
    
    return await sendEmail({ to: userEmail, subject, html });
}

module.exports = {
    sendEmail,
    sendWelcomeEmail,
    sendTaskAssignmentEmail,
    sendLeadAssignmentEmail,
    sendPasswordResetEmail,
    verifyEmailConfig,
    createTransporter
};

const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        required: true,
        enum: [
            'lead_created', 'lead_updated', 'lead_deleted', 'lead_assigned', 'lead_status_changed',
            'operations_created', 'operations_updated', 'operations_deleted', 'operations_assigned', 'operations_status_changed',
            'operations_lead_created', 'operations_lead_updated', 'operations_lead_deleted',
            'user_created', 'user_updated', 'user_deleted', 'user_activated', 'user_deactivated',
            'task_created', 'task_updated', 'task_completed', 'task_deleted',
            'pipeline_created', 'pipeline_updated', 'pipeline_deleted',
            'role_assigned', 'permission_updated',
            'email_sent', 'whatsapp_sent', 'call_made', 'meeting_held',
            'file_uploaded', 'file_deleted', 'file_attached',
            'settings_updated', 'login', 'logout', 'password_reset',
            'export_data', 'import_data', 'note_added', 'status_changed', 'created', 'assigned'
        ]
    },
    module: {
        type: String,
        required: true,
        enum: ['leads', 'operations', 'users', 'tasks', 'pipeline', 'settings', 'communication', 'auth', 'data']
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId
    },
    targetModel: {
        type: String,
        enum: ['Lead', 'OperationsLead', 'User', 'Task', 'Pipeline', 'Settings']
    },
    description: {
        type: String,
        required: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for faster queries
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ module: 1, createdAt: -1 });
activityLogSchema.index({ targetId: 1, targetModel: 1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);

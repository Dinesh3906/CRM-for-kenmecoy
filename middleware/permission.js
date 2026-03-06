const User = require('../models/User');

// Check if user has specific permission
const hasPermission = (module, action) => {
    return async (req, res, next) => {
        try {
            const user = req.user;

            // SuperAdmin has all permissions
            if (user.role === 'superadmin') {
                return next();
            }

            // Check permissions from user object
            const modulePerms = user.permissions[module];
            if (!modulePerms) {
                return res.status(403).json({ 
                    message: `Access denied. You don't have permission to ${action} ${module}.` 
                });
            }

            const permValue = modulePerms[action];
            
            // Boolean permission
            if (typeof permValue === 'boolean') {
                if (permValue) return next();
                return res.status(403).json({ 
                    message: `Access denied. You don't have permission to ${action} ${module}.` 
                });
            }
            
            // String permission (all, department, team, assigned, none)
            if (permValue === 'none') {
                return res.status(403).json({ 
                    message: `Access denied. You don't have permission to ${action} ${module}.` 
                });
            }
            
            // Store permission level for route handlers
            req.permissionLevel = permValue;
            next();
        } catch (error) {
            console.error('Permission check error:', error);
            res.status(500).json({ message: 'Error checking permissions' });
        }
    };
};

// Check if user has any of the specified roles
const hasRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // SuperAdmin bypasses role check
        if (req.user.role === 'superadmin' || roles.includes(req.user.role)) {
            return next();
        }

        res.status(403).json({ 
            message: `Access denied. Required role: ${roles.join(' or ')}` 
        });
    };
};

// Check if user account is active
const isActive = (req, res, next) => {
    if (!req.user.isActive) {
        return res.status(403).json({ 
            message: 'Your account has been deactivated. Please contact administrator.' 
        });
    }
    next();
};

// Check subscription status (skip for superadmin and admin)
const hasActiveSubscription = (req, res, next) => {
    const user = req.user;

    // Skip check for superadmin and admin
    if (user.role === 'superadmin' || user.role === 'admin') {
        return next();
    }

    // Check if subscription exists and is active
    if (user.subscription) {
        if (user.subscription.status === 'pending') {
            return res.status(403).json({ 
                message: 'Your subscription is pending approval. Please wait for admin to activate it.' 
            });
        }

        if (user.subscription.status === 'expired' || 
            (user.subscription.expiry && new Date(user.subscription.expiry) < new Date())) {
            return res.status(403).json({ 
                message: 'Your subscription has expired. Please renew to continue.' 
            });
        }
    }

    next();
};

// Combined middleware for common use case
const canAccessModule = (module) => {
    return [isActive, hasPermission(module, 'view')];
};

module.exports = {
    hasPermission,
    hasRole,
    isActive,
    hasActiveSubscription,
    canAccessModule
};

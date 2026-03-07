const checkPermission = (module, action) => {
    return (req, res, next) => {
        const user = req.user;
        
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // SuperAdmin has all permissions
        if (user.role === 'superadmin') {
            return next();
        }

        const permissions = user.permissions[module];
        
        if (!permissions) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Check boolean permissions
        if (typeof permissions[action] === 'boolean') {
            if (permissions[action]) {
                return next();
            }
            return res.status(403).json({ message: 'Access denied' });
        }

        // For view/edit/delete permissions that have 'all', 'department', 'team', 'assigned', 'none'
        if (permissions[action] === 'none') {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Pass permission level to request for further filtering
        req.permissionLevel = permissions[action];
        next();
    };
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const userRole = req.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        // SuperAdmin bypasses all role checks
        if (userRole === 'superadmin') {
            return next();
        }

        if (allowedRoles.includes(userRole)) {
            return next();
        }

        res.status(403).json({ message: 'Access denied. Insufficient privileges.' });
    };
};

const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // SuperAdmin and Admin have admin access
    if (req.user.role === 'superadmin' || req.user.role === 'admin') {
        return next();
    }

    res.status(403).json({ message: 'Admin access required' });
};

// Require SuperAdmin only
const requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (req.user.role === 'superadmin') {
        return next();
    }

    res.status(403).json({ message: 'SuperAdmin access required' });
};

module.exports = {
    checkPermission,
    requireRole,
    requireAdmin,
    requireSuperAdmin
};

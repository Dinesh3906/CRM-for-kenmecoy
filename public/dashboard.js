// Global Variables
let authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
let currentUser = null;
let currentSection = 'dashboard';
let currentViewOperationId = null;

// API Base URLs
const API_BASE = '/api';

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard loaded, authToken:', authToken);

    // Setup drag and drop event delegation
    setupDragAndDropDelegation();

    // Setup role selection event listener
    const userRoleSelect = document.getElementById('userRole');
    if (userRoleSelect) {
        userRoleSelect.addEventListener('change', (e) => {
            const managerSelectGroup = document.getElementById('managerSelectGroup');
            const departmentSelectGroup = document.getElementById('departmentSelectGroup');
            const userDepartment = document.getElementById('userDepartment');
            const selectedRole = e.target.value;

            if (managerSelectGroup) {
                // Show manager dropdown only for staff role
                managerSelectGroup.style.display = selectedRole === 'staff' ? 'block' : 'none';
            }

            if (departmentSelectGroup) {
                // Show department dropdown for admin, manager, and staff roles (when superadmin is creating)
                const showDepartment = ['admin', 'manager', 'staff'].includes(selectedRole) && currentUser?.role === 'superadmin';
                departmentSelectGroup.style.display = showDepartment ? 'block' : 'none';

                // Set required attribute based on visibility
                if (userDepartment) {
                    if (showDepartment) {
                        userDepartment.required = true;
                    } else {
                        userDepartment.required = false;
                    }
                }

                // Auto-select sales department when admin role is selected
                if (selectedRole === 'admin' && userDepartment) {
                    userDepartment.value = 'sales';
                    userDepartment.required = true;
                } else if (['manager', 'staff'].includes(selectedRole) && userDepartment && showDepartment) {
                    userDepartment.required = true;
                } else if (userDepartment) {
                    userDepartment.required = false;
                }
            }
        });
    }

    if (!authToken || authToken === 'null' || authToken === 'undefined') {
        showLoginModal();
    } else {
        initializeDashboard();
    }
});

// Setup drag and drop with event delegation
function setupDragAndDropDelegation() {
    document.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('kanban-card')) {
            handleDragStart(e);
        }
    });

    document.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('kanban-card')) {
            handleDragEnd(e);
        }
    });

    document.addEventListener('dragover', (e) => {
        if (e.target.classList.contains('kanban-body') || e.target.closest('.kanban-body')) {
            handleDragOver(e);
        }
    });

    document.addEventListener('drop', (e) => {
        const dropTarget = e.target.classList.contains('kanban-body') ? e.target : e.target.closest('.kanban-body');
        if (dropTarget) {
            handleDrop(e);
        }
    });

    document.addEventListener('dragenter', (e) => {
        const target = e.target.classList.contains('kanban-body') ? e.target : e.target.closest('.kanban-body');
        if (target) {
            handleDragEnter(e);
        }
    });

    document.addEventListener('dragleave', (e) => {
        if (e.target.classList.contains('kanban-body')) {
            handleDragLeave(e);
        }
    });
}

// Authentication Functions
async function login(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        console.log('Login response:', response.ok, data);
        if (response.ok && data.token) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);

            // Store user info with permissions
            if (data.user) {
                localStorage.setItem('currentUser', JSON.stringify(data.user));
            }

            const loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.style.display = 'none';
                loginModal.classList.remove('active');
            }
            await initializeDashboard();
        } else {
            showNotification(data.message || 'Login failed', 'error');
        }
    } catch (error) {
        showNotification('Login error: ' + error.message, 'error');
    }
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    authToken = null;
    currentUser = null;
    window.location.reload();
}

function showLoginModal() {
    document.getElementById('loginModal').classList.add('active');
}

function showLogin() {
    document.getElementById('registerModal').classList.remove('active');
    document.getElementById('loginModal').classList.add('active');
}

// Initialize Dashboard
async function initializeDashboard() {
    try {
        console.log('Initializing dashboard with token:', authToken);

        // Try to get user from localStorage first
        const storedUser = localStorage.getItem('currentUser');
        let oldDepartment = null;
        if (storedUser) {
            const parsed = JSON.parse(storedUser);
            oldDepartment = parsed.department;
            currentUser = parsed;
        }

        // Fetch current user profile to ensure up-to-date info
        const response = await fetch(`${API_BASE}/profile`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        console.log('Profile response:', response.ok, response.status);

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('authToken');
                localStorage.removeItem('currentUser');
                localStorage.removeItem('token');
                authToken = null;
                showLoginModal();
                return;
            }
            throw new Error('Failed to fetch profile');
        }

        currentUser = await response.json();

        // Check if department changed - force reload if it did
        if (oldDepartment && oldDepartment !== currentUser.department) {
            console.log(`Department changed from ${oldDepartment} to ${currentUser.department} - clearing cache and reloading`);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            showNotification(`Your department has been changed to ${currentUser.department}. Refreshing...`, 'info');
            setTimeout(() => window.location.reload(), 1500);
            return;
        }

        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        console.log('Current user:', currentUser);

        document.getElementById('currentUserName').textContent = currentUser.fullName || currentUser.email;
        const roleText = capitalizeRole(currentUser.role) || 'User';
        const deptText = currentUser.department ? ` - ${capitalizeRole(currentUser.department)}` : '';
        document.getElementById('currentUserRole').textContent = roleText + deptText;

        // Apply role-based UI visibility
        applyRoleBasedUI();

        // Load dashboard data and set initial section
        currentSection = 'dashboard';
        await loadDashboardData();

        // Also preload leads for pipeline
        const leadsResponse = await fetch(`${API_BASE}/leads`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (leadsResponse.ok) {
            allLeads = await leadsResponse.json();
        }

        // Start notification polling
        startNotificationPolling();
    } catch (error) {
        console.error('Init error:', error);
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        authToken = null;
        showLoginModal();
    }
}

// Helper function to capitalize role
function capitalizeRole(role) {
    if (!role) return '';
    // Handle role names
    if (role === 'superadmin') return 'Super Admin';
    if (role === 'admin') return 'Admin';
    if (role === 'manager') return 'Manager';
    if (role === 'staff') return 'Staff';
    return role.charAt(0).toUpperCase() + role.slice(1);
}

// Apply role-based UI visibility and permissions
function applyRoleBasedUI() {
    if (!currentUser || !currentUser.permissions) return;

    const role = currentUser.role;
    const permissions = currentUser.permissions;

    console.log('Applying role-based UI - Role:', role);

    // Hide/show navigation items based on permissions
    // Note: Users section is controlled by admin-manager-only class, but we also check permissions
    if (!permissions.users || !permissions.users.view) {
        const usersNav = document.querySelector('[onclick="showSection(\'users\')"]');
        if (usersNav) usersNav.style.display = 'none';
    } else {
        // Ensure users nav is visible for users with permission
        const usersNav = document.querySelector('[onclick="showSection(\'users\')"]');
        if (usersNav) usersNav.style.display = '';
    }

    if (!permissions.analytics || !permissions.analytics.view) {
        const analyticsNav = document.querySelector('[onclick="showSection(\'analytics\')"]');
        if (analyticsNav) analyticsNav.style.display = 'none';
    }

    // Show/hide superadmin-only elements
    if (role !== 'superadmin') {
        const superadminOnly = document.querySelectorAll('.superadmin-only');
        superadminOnly.forEach(item => item.style.display = 'none');
    }

    if (!permissions.settings || !permissions.settings.view) {
        const settingsNav = document.querySelector('[onclick="showSection(\'settings\')"]');
        if (settingsNav) settingsNav.style.display = 'none';
    }

    // Hide superadmin-only sections for non-superadmins
    if (role !== 'superadmin') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    } else {
        // Show superadmin-only columns for superadmin
        document.querySelectorAll('.admin-only-column').forEach(el => el.style.display = '');
    }

    // Hide admin/manager sections for staff (superadmin, admin, and manager can see)
    if (role !== 'manager' && role !== 'admin' && role !== 'superadmin') {
        document.querySelectorAll('.admin-manager-only').forEach(el => el.style.display = 'none');
    }

    // Hide superadmin-admin-only sections from manager and staff
    if (role !== 'admin' && role !== 'superadmin') {
        document.querySelectorAll('.superadmin-admin-only').forEach(el => el.style.display = 'none');
    }

    // Hide/show action buttons based on permissions
    updateActionButtonsVisibility();
}

// Update action buttons visibility based on permissions
function updateActionButtonsVisibility() {
    if (!currentUser || !currentUser.permissions) return;

    const permissions = currentUser.permissions;
    const role = currentUser.role;

    // Staff cannot create leads/operations
    if (role === 'staff') {
        const createLeadBtn = document.querySelector('[onclick="openAddLeadModal()"]');
        if (createLeadBtn) createLeadBtn.style.display = 'none';

        const createOperationBtn = document.querySelector('[onclick="openAddOperationModal()"]');
        if (createOperationBtn) createOperationBtn.style.display = 'none';
    }

    // Lead creation button
    const createLeadBtn = document.querySelector('[onclick="openAddLeadModal()"]');
    if (createLeadBtn && !permissions.leads.create) {
        createLeadBtn.style.display = 'none';
    }

    // Task creation button
    const createTaskBtn = document.querySelector('[onclick="openAddTaskModal()"]');
    if (createTaskBtn && !permissions.tasks.create) {
        createTaskBtn.style.display = 'none';
    }

    // Export button
    const exportBtn = document.querySelector('[onclick="exportLeads()"]');
    if (exportBtn && !permissions.leads.export) {
        exportBtn.style.display = 'none';
    }

    // User creation button (admin and manager only)
    const createUserBtn = document.querySelector('[onclick="openCreateUserModal()"]');
    if (createUserBtn && (!permissions.users || !permissions.users.create)) {
        createUserBtn.style.display = 'none';
    }
}

// Check if user has permission
function hasPermission(module, action) {
    if (!currentUser || !currentUser.permissions) return false;
    if (['superadmin', 'admin', 'manager'].includes(currentUser.role)) return true; // Admins and managers have all permissions

    const modulePerms = currentUser.permissions[module];
    if (!modulePerms) return false;

    const permission = modulePerms[action];
    if (typeof permission === 'boolean') return permission;
    if (permission === 'all' || permission === 'assigned' || permission === 'own') return true;
    return false;
}

// Check permission level (for data filtering)
function getPermissionLevel(module, action) {
    if (!currentUser || !currentUser.permissions) return 'none';
    if (currentUser.role === 'superadmin') return 'all';

    const modulePerms = currentUser.permissions[module];
    if (!modulePerms) return 'none';

    return modulePerms[action] || 'none';
}

// Navigation
function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Remove active from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Show selected section
    const section = document.getElementById(`${sectionName}-section`);
    if (section) {
        section.classList.add('active');
        currentSection = sectionName;

        // Update page title
        const titles = {
            'dashboard': 'Dashboard',
            'leads': 'Sales Leads',
            'operations': 'Operations',
            'pipeline': 'Sales Pipeline',
            'operations-pipeline': 'Operations Pipeline',
            'tasks': 'Tasks & Reminders',
            'communication': 'Communications',
            'analytics': 'Analytics',
            'users': 'User Management',
            'settings': 'Settings',
            'activity-logs': 'Activity Logs',
            'import-export': 'Import/Export',
            'invoices': 'Invoices'
        };
        document.getElementById('pageTitle').textContent = titles[sectionName] || sectionName;

        // Activate nav item
        document.querySelector(`.nav-item[data-section="${sectionName}"]`)?.classList.add('active');

        // Load section data
        loadSectionData(sectionName);
    }
}

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
}

// Dashboard Data
async function loadDashboardData() {
    console.log('Loading dashboard data...');

    // Load dashboard overview for all authenticated users
    if (['superadmin', 'admin', 'manager', 'staff'].includes(currentUser?.role)) {
        await loadDashboardOverview();
    } else {
        // Use fallback method for any other roles
        await loadDashboardDataFallback();
    }

    // Load recent activity and tasks
    await loadRecentActivity();
    await loadUpcomingTasks();
}

async function loadDashboardOverview() {
    try {
        const response = await fetch(`${API_BASE}/statistics/dashboard-overview`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('Dashboard overview data:', data);

            // Update dashboard stats safely
            const totalLeadsEl = document.getElementById('totalLeads');
            const closedDealsEl = document.getElementById('closedDeals');
            const pendingTasksEl = document.getElementById('pendingTasks');

            if (totalLeadsEl) totalLeadsEl.textContent = data.stats.leads.total;
            if (closedDealsEl) closedDealsEl.textContent = data.stats.leads.byStatus.won || 0;
            if (pendingTasksEl) pendingTasksEl.textContent = (data.stats.tasks.pending || 0) + (data.stats.tasks.inProgress || 0);

            console.log('Dashboard stats updated:', {
                totalLeads: data.stats.leads.total,
                closedDeals: data.stats.leads.byStatus.won,
                pendingTasks: (data.stats.tasks.pending || 0) + (data.stats.tasks.inProgress || 0)
            });

            return data;
        } else {
            console.error('Failed to load dashboard overview:', response.status);
            await loadDashboardDataFallback();
        }
    } catch (error) {
        console.error('Error loading dashboard overview:', error);
        await loadDashboardDataFallback();
    }
}

async function loadDashboardDataFallback() {
    try {
        console.log('Loading dashboard data fallback...');

        let totalLeads = 0;
        let closedLeads = 0;
        let pendingTasks = 0;
        let totalUsers = 0;
        let activeUsers = 0;

        // Fetch leads
        try {
            const leadsResponse = await fetch(`${API_BASE}/leads`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            if (leadsResponse.ok) {
                const leads = await leadsResponse.json();
                console.log('Loaded leads:', leads.length);

                totalLeads = leads.length;

                // Get the pipeline to find which status represents "won"
                let wonStatusIds = ['won'];

                // If pipeline is loaded, find columns that indicate won deals
                if (currentPipeline && currentPipeline.columns) {
                    const wonColumns = currentPipeline.columns.filter(col =>
                        col.name.toLowerCase().includes('won') ||
                        col.id === 'won'
                    );
                    if (wonColumns.length > 0) {
                        wonStatusIds = wonColumns.map(col => col.id);
                        console.log('Won status IDs from pipeline:', wonStatusIds);
                    }
                }

                const closedLeadsData = leads.filter(l => wonStatusIds.includes(l.status));
                closedLeads = closedLeadsData.length;

                console.log('Closed leads:', closedLeadsData.length);
                console.log('Closed leads data:', closedLeadsData.map(l => ({
                    name: l.name,
                    status: l.status,
                    value: l.value
                })));
                console.log('Total revenue calculated:', totalRevenue);
            } else {
                console.error('Leads response not OK:', leadsResponse.status);
            }
        } catch (err) {
            console.error('Error fetching leads:', err);
        }

        // Fetch tasks
        try {
            const tasksResponse = await fetch(`${API_BASE}/tasks`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            if (tasksResponse.ok) {
                const tasks = await tasksResponse.json();
                console.log('Loaded tasks:', tasks.length);
                pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in-progress').length;
            } else {
                console.log('Tasks endpoint not available:', tasksResponse.status);
            }
        } catch (err) {
            console.error('Error fetching tasks:', err);
        }

        // Fetch users (superadmin, admin and manager only)
        if (currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'manager') {
            try {
                const usersResponse = await fetch(`${API_BASE}/users`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });

                if (usersResponse.ok) {
                    const users = await usersResponse.json();
                    console.log('Loaded users:', users.length);
                    totalUsers = users.length;
                    activeUsers = users.filter(u => u.isActive).length;
                }
            } catch (err) {
                console.error('Error fetching users:', err);
            }
        }

        console.log('Calculated stats:', { totalLeads, closedLeads, totalRevenue, pendingTasks, totalUsers, activeUsers });

        // Update UI with retry
        setTimeout(() => {
            const totalLeadsEl = document.getElementById('totalLeads');
            const closedDealsEl = document.getElementById('closedDeals');
            const pendingTasksEl = document.getElementById('pendingTasks');

            console.log('Updating elements:', {
                totalLeadsEl: !!totalLeadsEl,
                closedDealsEl: !!closedDealsEl,
                pendingTasksEl: !!pendingTasksEl
            });

            if (totalLeadsEl) {
                totalLeadsEl.textContent = totalLeads;
                console.log('Set totalLeads to:', totalLeads);
            }
            if (closedDealsEl) {
                closedDealsEl.textContent = closedLeads;
                console.log('Set closedDeals to:', closedLeads);
            }
            if (pendingTasksEl) {
                pendingTasksEl.textContent = pendingTasks;
                console.log('Set pendingTasks to:', pendingTasks);
            }
        }, 100);

        console.log('Dashboard data updated successfully');
    } catch (error) {
        console.error('Dashboard fallback error:', error);
    }
}

async function loadRecentActivity() {
    try {
        const response = await fetch(`${API_BASE}/activity-logs/recent`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const container = document.getElementById('recentActivity');

        if (!response.ok) {
            container.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
            return;
        }

        const activities = await response.json();

        if (!activities || activities.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
            return;
        }

        container.innerHTML = activities.slice(0, 5).map(activity => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas fa-circle"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-text">${activity.description || activity.action || 'Activity'}</div>
                    <div class="activity-time">${formatDate(activity.createdAt)}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Activity error:', error);
        const container = document.getElementById('recentActivity');
        if (container) {
            container.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
        }
    }
}

async function loadUpcomingTasks() {
    try {
        // Try upcoming endpoint first
        let response = await fetch(`${API_BASE}/tasks/upcoming`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const container = document.getElementById('upcomingTasks');

        // If upcoming endpoint doesn't exist, try regular tasks endpoint
        if (!response.ok) {
            response = await fetch(`${API_BASE}/tasks`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
        }

        if (!response.ok) {
            container.innerHTML = '<div class="empty-state"><p>No upcoming tasks</p></div>';
            return;
        }

        let tasks = await response.json();

        // Filter for upcoming/pending tasks and sort by due date
        tasks = tasks
            .filter(t => t.status !== 'completed')
            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

        if (!tasks || tasks.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No upcoming tasks</p></div>';
            return;
        }

        container.innerHTML = tasks.slice(0, 5).map(task => {
            const actionLabel = task.action ? task.action.charAt(0).toUpperCase() + task.action.slice(1).replace('-', ' ') : 'Task';
            return `
            <div class="task-item" onclick="viewTask('${task._id}')">
                <div class="task-title">${actionLabel}</div>
                <div class="task-meta">
                    <span><i class="fas fa-calendar"></i> ${formatDate(task.dueDate)}</span>
                    <span class="badge badge-${task.status === 'completed' ? 'success' : task.status === 'in-progress' ? 'warning' : 'info'}">${task.status}</span>
                </div>
            </div>
        `}).join('');
    } catch (error) {
        console.error('Tasks error:', error);
        const container = document.getElementById('upcomingTasks');
        if (container) {
            container.innerHTML = '<div class="empty-state"><p>No upcoming tasks</p></div>';
        }
    }
}

// Leads Management
async function loadLeads() {
    try {
        const response = await fetch(`${API_BASE}/leads`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const leads = await response.json();
        const tbody = document.getElementById('leadsTableBody');

        if (leads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No leads found</td></tr>';
            return;
        }

        const isStaff = currentUser?.role === 'staff';

        tbody.innerHTML = leads.map(lead => {
            const assignedUser = lead.assignedTo?.fullName || lead.assignedTo?.email || 'Unassigned';

            return `
                <tr>
                    <td>${lead.companyName || 'N/A'}</td>
                    <td>${lead.contactPerson || 'N/A'}</td>
                    <td>${lead.email ? `<a href="mailto:${lead.email}" style="color:var(--primary-color);text-decoration:none;">${lead.email}</a>` : 'N/A'}</td>
                    <td>${lead.mobile || 'N/A'}</td>
                    <td>${assignedUser}</td>
                    <td><span class="badge badge-info">${lead.status}</span></td>
                    <td>
                        <button class="btn btn-sm" onclick="viewLead('${lead._id}')"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-sm" onclick="editLead('${lead._id}')"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Leads error:', error);
    }
}

// Tasks Management
async function loadTasks() {
    try {
        const response = await fetch(`${API_BASE}/tasks`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const tasks = await response.json();
        allTasks = tasks; // Store for filtering
        const tbody = document.getElementById('tasksTableBody');

        if (tasks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No tasks found</td></tr>';
            return;
        }

        tbody.innerHTML = tasks.map(task => {
            const actionLabel = task.action ? task.action.charAt(0).toUpperCase() + task.action.slice(1).replace('-', ' ') : 'N/A';
            const assignedUser = task.assignedTo?.fullName || task.assignedTo?.email || 'Unassigned';
            const leadName = task.lead?.companyName || task.lead?.contactPerson || 'N/A';

            return `
            <tr>
                <td>${actionLabel}</td>
                <td>${leadName}</td>
                <td>${assignedUser}</td>
                <td>${formatDate(task.dueDate)}</td>
                <td><span class="badge badge-${task.status === 'completed' ? 'success' : task.status === 'in-progress' ? 'warning' : 'info'}">${task.status}</span></td>
                <td>
                    <button class="btn btn-sm" onclick="viewTask('${task._id}')"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm" onclick="editTask('${task._id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-success" onclick="completeTask('${task._id}')" ${task.status === 'completed' ? 'disabled' : ''}><i class="fas fa-check"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTask('${task._id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `}).join('');
    } catch (error) {
        console.error('Tasks error:', error);
    }
}

// Communication Management
async function loadCommunications() {
    try {
        // Populate lead selector
        populateLeadSelector();

        const response = await fetch(`${API_BASE}/communication`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const comms = await response.json();
        const tbody = document.getElementById('communicationTableBody');

        if (comms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No communications found</td></tr>';
            return;
        }

        tbody.innerHTML = comms.map(comm => `
            <tr>
                <td><i class="fas fa-${comm.type === 'email' ? 'envelope' : comm.type === 'whatsapp' ? 'whatsapp' : comm.type === 'call' ? 'phone' : 'handshake'}"></i> ${comm.type}</td>
                <td>${comm.lead?.companyName || comm.lead?.contactPerson || 'N/A'}</td>
                <td>${comm.subject || comm.content?.substring(0, 50) || 'N/A'}</td>
                <td>${comm.direction}</td>
                <td><span class="badge badge-${comm.status === 'sent' ? 'success' : comm.status === 'failed' ? 'danger' : comm.status === 'pending' ? 'warning' : 'info'}" title="${comm.status === 'pending' ? 'Service not configured' : ''}">${comm.status}${comm.status === 'pending' ? ' ⚠️' : ''}</span></td>
                <td>${formatDate(comm.createdAt)}</td>
                <td>
                    <button class="btn btn-sm" onclick="viewCommunication('${comm._id}')"><i class="fas fa-eye"></i></button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Communication error:', error);
    }
}

function populateLeadSelector() {
    const select = document.getElementById('commLeadSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Select Lead...</option>' +
        allLeads.map(lead => `
            <option value="${lead._id}">${lead.companyName} - ${lead.contactPerson}</option>
        `).join('');
}

// Wrapper functions for communication modals with lead select
function openSendEmailModalWithLeadSelect() {
    const leadId = document.getElementById('commLeadSelect')?.value;
    if (!leadId) {
        showNotification('Please select a lead first', 'warning');
        return;
    }
    openSendEmailModal(leadId);
}

function openSendWhatsAppModalWithLeadSelect() {
    const leadId = document.getElementById('commLeadSelect')?.value;
    if (!leadId) {
        showNotification('Please select a lead first', 'warning');
        return;
    }
    openSendWhatsAppModal(leadId);
}

function openLogCallModalWithLeadSelect() {
    const leadId = document.getElementById('commLeadSelect')?.value;
    if (!leadId) {
        showNotification('Please select a lead first', 'warning');
        return;
    }
    openLogCallModal(leadId);
}

function openLogMeetingModalWithLeadSelect() {
    const leadId = document.getElementById('commLeadSelect')?.value;
    if (!leadId) {
        showNotification('Please select a lead first', 'warning');
        return;
    }
    openLogMeetingModal(leadId);
}

// Activity Logs
async function loadActivityLogs() {
    try {
        const response = await fetch(`${API_BASE}/activity-logs`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const logs = await response.json();
        const tbody = document.getElementById('activityLogsTableBody');

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No activity logs found</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${log.user?.fullName || log.user?.email || 'System'}</td>
                <td>${log.action}</td>
                <td><span class="badge badge-info">${log.module}</span></td>
                <td>${log.description}</td>
                <td>${log.ipAddress || 'N/A'}</td>
                <td>${formatDate(log.createdAt)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Activity logs error:', error);
    }
}

// Section Data Loader
function loadSectionData(sectionName) {
    switch (sectionName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'leads':
            loadLeads();
            break;
        case 'pipeline':
            loadPipeline();
            break;
        case 'tasks':
            loadTasks();
            break;
        case 'communication':
            loadCommunications();
            break;
        case 'activity-logs':
            loadActivityLogs();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'users':
            loadUsers();
            break;
        case 'settings':
            loadSettings();
            break;
        case 'invoices':
            loadInvoiceStats();
            loadInvoices();
            loadInvoiceCustomerDropdown();
            break;
    }
}

// Analytics Management
async function loadAnalytics() {
    try {
        // Load leads analytics
        const leadsResponse = await fetch(`${API_BASE}/analytics/leads`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const leadsData = await leadsResponse.json();

        // Load pipeline analytics
        const pipelineResponse = await fetch(`${API_BASE}/analytics/pipeline`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const pipelineData = await pipelineResponse.json();

        // Load team performance (if superadmin/admin/manager)
        let teamData = null;
        if (currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'manager') {
            const teamResponse = await fetch(`${API_BASE}/analytics/team-performance`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (teamResponse.ok) {
                teamData = await teamResponse.json();
            } else {
                console.warn('Failed to load team performance:', teamResponse.status);
            }
        }

        // Render analytics
        renderConversionChart(leadsData);
        renderPipelineChart(pipelineData);
        renderTeamChart(teamData);

    } catch (error) {
        console.error('Error loading analytics:', error);
        showNotification('Error loading analytics', 'error');
    }
}

function renderConversionChart(data) {
    const chart = document.getElementById('conversionChart');
    const rate = data.conversionRate || 0;

    chart.innerHTML = `
        <div class="chart-value">${rate}%</div>
        <div class="chart-label">Conversion Rate</div>
        <div style="font-size: 14px; color: #666; margin-top: 10px;">
            ${data.total || 0} Total Leads
        </div>
        <div style="font-size: 12px; color: #888; margin-top: 5px;">
            ${data.byStatus?.find(s => s._id === 'closed')?.count || 0} Closed Deals
        </div>
    `;
}

function renderPipelineChart(data) {
    const chart = document.getElementById('pipelineChart');

    if (!data.stages || data.stages.length === 0) {
        chart.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No pipeline data</div>';
        return;
    }

    const total = data.stages.reduce((sum, stage) => sum + stage.count, 0);

    chart.innerHTML = `
        <div style="padding: 10px;">
            ${data.stages.map(stage => {
        const percentage = total > 0 ? ((stage.count / total) * 100).toFixed(1) : 0;
        return `
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px;">
                            <span style="text-transform: capitalize; font-weight: 500;">${stage._id || 'Unknown'}</span>
                            <span style="color: #666;">${stage.count} (${percentage}%)</span>
                        </div>
                        <div style="background: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden;">
                            <div style="background: #4F46E5; height: 100%; width: ${percentage}%;"></div>
                        </div>
                        <div style="font-size: 11px; color: #888; margin-top: 2px;">
                            Value: $${(stage.totalValue || 0).toLocaleString()}
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;
}

function renderTeamChart(data) {
    const chart = document.getElementById('teamChart');

    // Check if data is valid and is an array
    if (!data || !Array.isArray(data) || data.length === 0) {
        chart.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No team data available</div>';
        return;
    }

    chart.innerHTML = `
        <div style="padding: 10px; max-height: 300px; overflow-y: auto;">
            ${data.slice(0, 5).map((member, index) => `
                <div style="margin-bottom: 12px; padding: 8px; background: ${index === 0 ? '#FEF3C7' : '#f9fafb'}; border-radius: 6px;">
                    <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">
                        ${index === 0 ? '🏆 ' : ''}${member.user.fullName || member.user.username}
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; color: #666;">
                        <div>Leads: ${member.metrics.totalLeads}</div>
                        <div>Closed: ${member.metrics.closedLeads}</div>
                        <div>Conv: ${member.metrics.conversionRate}%</div>
                        <div>Revenue: $${(member.metrics.totalRevenue || 0).toLocaleString()}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Settings Management
function showSettingsTab(tabName) {
    document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(`${tabName}-tab`).classList.add('active');
    event.target.classList.add('active');
}

async function loadSettings() {
    try {
        // Load profile
        if (currentUser) {
            document.getElementById('profileName').value = currentUser.fullName || '';
            document.getElementById('profileUsername').value = currentUser.username || '';
            document.getElementById('profileEmail').value = currentUser.email || '';
        }

        // Load API key
        const apiResponse = await fetch(`${API_BASE}/api-key`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const apiData = await apiResponse.json();
        document.getElementById('apiKeyDisplay').value = apiData.apiKey || '';

        // Load other settings
        const settingsResponse = await fetch(`${API_BASE}/settings`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const settings = await settingsResponse.json();

        // Populate company info
        if (settings.company) {
            document.getElementById('companyName').value = settings.company.name || '';
            document.getElementById('companyWebsite').value = settings.company.website || '';
            document.getElementById('companyPhone').value = settings.company.phone || '';
            document.getElementById('companyEmail').value = settings.company.email || '';
            document.getElementById('companyAddress').value = settings.company.address || '';
        }

        // Load user's email configuration
        await loadEmailConfig();

        // Populate WhatsApp config
        if (settings.whatsapp) {
            document.getElementById('whatsappApiUrl').value = settings.whatsapp.businessAccountId || '';
            document.getElementById('whatsappApiKey').value = settings.whatsapp.apiKey || '';
            document.getElementById('whatsappPhone').value = settings.whatsapp.phoneNumberId || '';
        }

        // Populate notifications
        if (settings.notifications) {
            document.getElementById('emailNotif').checked = settings.notifications.emailNotifications || false;
            document.getElementById('taskNotif').checked = settings.notifications.taskReminders || false;
            document.getElementById('leadNotif').checked = settings.notifications.leadAssignments || false;
        }

        // Last backup
        if (settings.backup?.lastBackup) {
            document.getElementById('lastBackupDate').textContent = formatDate(settings.backup.lastBackup);
        }
        const autoBackupCheckbox = document.getElementById('autoBackup');
        autoBackupCheckbox.checked = settings.backup?.autoBackup || false;

        // Add event listener for auto-backup toggle
        autoBackupCheckbox.onchange = async (e) => {
            try {
                await fetch(`${API_BASE}/settings/backup`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({
                        autoBackup: e.target.checked,
                        backupFrequency: 'daily'
                    })
                });
                showNotification(`Auto backup ${e.target.checked ? 'enabled' : 'disabled'}`, 'success');
            } catch (error) {
                showNotification('Error updating backup settings', 'error');
                e.target.checked = !e.target.checked;
            }
        };

    } catch (error) {
        console.error('Settings load error:', error);
    }
}

// Update Functions
async function updateProfile(e) {
    e.preventDefault();
    try {
        const response = await fetch(`${API_BASE}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                fullName: document.getElementById('profileName').value,
                username: document.getElementById('profileUsername').value
            })
        });

        if (response.ok) {
            const result = await response.json();
            currentUser = result.user;
            showNotification('Profile updated successfully', 'success');
        } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to update profile');
        }
    } catch (error) {
        showNotification('Error updating profile: ' + error.message, 'error');
    }
}

async function changePassword(e) {
    e.preventDefault();
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmPassword').value;

    if (newPass !== confirmPass) {
        showNotification('Passwords do not match', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                currentPassword: document.getElementById('currentPassword').value,
                newPassword: newPass
            })
        });

        if (response.ok) {
            showNotification('Password changed successfully', 'success');
            document.getElementById('passwordForm').reset();
        } else {
            const data = await response.json();
            throw new Error(data.message || 'Failed to change password');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

async function updateCompanySettings(e) {
    e.preventDefault();
    try {
        const response = await fetch(`${API_BASE}/settings/company`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name: document.getElementById('companyName').value,
                website: document.getElementById('companyWebsite').value,
                phone: document.getElementById('companyPhone').value,
                email: document.getElementById('companyEmail').value,
                address: document.getElementById('companyAddress').value
            })
        });

        if (response.ok) {
            showNotification('Company settings updated', 'success');
        } else {
            throw new Error('Failed to update company settings');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

// Export Functions
async function exportLeads() {
    try {
        const response = await fetch(`${API_BASE}/leads/export`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const result = await response.json();

            // Convert to CSV format
            if (result.data && result.data.length > 0) {
                const headers = ['Name', 'Company', 'Email', 'Phone', 'Status', 'Priority', 'Value', 'Source', 'Created'];
                const csvRows = [headers.join(',')];

                result.data.forEach(lead => {
                    const row = [
                        `"${lead.name || ''}"`,
                        `"${lead.company || ''}"`,
                        `"${lead.emails?.[0]?.email || ''}"`,
                        `"${lead.phones?.[0]?.phone || ''}"`,
                        lead.status || '',
                        lead.priority || '',
                        lead.value || 0,
                        `"${lead.source || ''}"`,
                        new Date(lead.createdAt).toLocaleDateString()
                    ];
                    csvRows.push(row.join(','));
                });

                const csvContent = csvRows.join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);

                showNotification(`Exported ${result.count} leads successfully`, 'success');
            } else {
                showNotification('No leads to export', 'info');
            }
        } else {
            throw new Error('Export failed');
        }
    } catch (error) {
        showNotification('Export error: ' + error.message, 'error');
    }
}

async function importLeads(e) {
    e.preventDefault();
    const file = document.getElementById('importFile').files[0];
    if (!file) {
        showNotification('Please select a CSV file', 'warning');
        return;
    }

    try {
        // Read and parse CSV file
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
            showNotification('CSV file is empty or invalid', 'error');
            return;
        }

        // Skip header row
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const leads = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));

            if (values.length < 2) continue; // Skip empty lines

            const lead = {
                name: values[0] || 'Unnamed',
                company: values[1] || 'Unknown',
                emails: values[2] ? [{ email: values[2], type: 'primary' }] : [],
                phones: values[3] ? [{ phone: values[3], type: 'mobile' }] : [],
                status: values[4] || 'qualification',
                priority: values[5] || 'medium',
                value: parseFloat(values[6]) || 0,
                source: values[7] || 'import',
                description: values[8] || ''
            };

            leads.push(lead);
        }

        if (leads.length === 0) {
            showNotification('No valid leads found in CSV', 'warning');
            return;
        }

        // Send to backend
        const response = await fetch(`${API_BASE}/leads/import`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ leads })
        });

        const result = await response.json();

        if (response.ok) {
            showNotification(`Successfully imported ${result.imported} leads!`, 'success');
            if (result.failed > 0) {
                showNotification(`${result.failed} leads failed to import`, 'warning');
            }
            document.getElementById('importForm').reset();
            if (currentSection === 'leads') loadLeads();
        } else {
            throw new Error(result.message || 'Import failed');
        }
    } catch (error) {
        console.error('Import error:', error);
        showNotification('Import error: ' + error.message, 'error');
    }
}

// Utility Functions
function formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function copyApiKey() {
    const input = document.getElementById('apiKeyDisplay');
    input.select();
    document.execCommand('copy');
    showNotification('API key copied to clipboard', 'success');
}

async function regenerateApiKey() {
    if (!confirm('Regenerate API key? This will invalidate the current key.')) return;

    try {
        const response = await fetch(`${API_BASE}/api-key/regenerate`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();
        document.getElementById('apiKeyDisplay').value = data.apiKey;
        showNotification('API key regenerated', 'success');
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

// Refresh Dashboard
function refreshDashboard() {
    loadSectionData(currentSection);
    showNotification('Data refreshed', 'success');
}

// Pipeline Management Variables
let currentPipeline = null;
let draggedElement = null;
let allLeads = [];

// Load Pipeline with Drag-and-Drop
async function loadPipeline() {
    try {
        const pipelineResponse = await fetch(`/api/pipeline/default`);
        currentPipeline = await pipelineResponse.json();

        // Always use default columns for now (override any database columns)
        currentPipeline.columns = [
            { id: 'new', name: 'New', icon: 'fas fa-star', color: '#667eea', order: 1 },
            { id: 'work-in-progress', name: 'Work-in-Progress', icon: 'fas fa-spinner', color: '#f39c12', order: 2 },
            { id: 'test-assignment', name: 'Test Assignment', icon: 'fas fa-flask', color: '#9b59b6', order: 3 },
            { id: 'won', name: 'Won', icon: 'fas fa-trophy', color: '#2ecc71', order: 4 },
            { id: 'lost', name: 'Lost', icon: 'fas fa-times-circle', color: '#e74c3c', order: 5 }
        ];

        const leadsResponse = await fetch(`${API_BASE}/leads`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        allLeads = await leadsResponse.json();

        renderPipeline();
    } catch (error) {
        console.error('Pipeline error:', error);
    }
}

function renderPipeline() {
    const container = document.getElementById('pipelineKanban');
    if (!container || !currentPipeline) return;

    const sortedColumns = currentPipeline.columns.sort((a, b) => a.order - b.order);

    container.innerHTML = sortedColumns.map(column => {
        const columnLeads = allLeads.filter(lead => lead.status === column.id);
        const leadsHTML = columnLeads.map(lead => {
            const assignedUser = lead.assignedTo?.fullName || lead.assignedTo?.email || 'Unassigned';
            return `
                <div class="kanban-card" draggable="true" data-lead-id="${lead._id}">
                    <div class="kanban-card-header">
                        <h4>${lead.companyName || 'N/A'}</h4>
                        <span class="badge badge-info">${lead.contactPerson || 'N/A'}</span>
                    </div>
                    <div class="kanban-details">
                        <small><i class="fas fa-envelope"></i> ${lead.email ? `<a href="mailto:${lead.email}" style="color:inherit;text-decoration:none;">${lead.email}</a>` : 'N/A'}</small>
                        <small><i class="fas fa-phone"></i> ${lead.mobile || 'N/A'}</small>
                        <small><i class="fas fa-user"></i> ${assignedUser}</small>
                    </div>
                    <div class="kanban-footer">
                        <div class="kanban-actions">
                            <button onclick="viewLead('${lead._id}')" class="btn-icon"><i class="fas fa-eye"></i></button>
                            <button onclick="editLead('${lead._id}')" class="btn-icon"><i class="fas fa-edit"></i></button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="kanban-column" data-status="${column.id}">
                <div class="kanban-header" style="border-left: 4px solid ${column.color}">
                    <div>
                        <i class="${column.icon}" style="color: ${column.color}"></i>
                        <h3>${column.name}</h3>
                    </div>
                    <span class="badge">${columnLeads.length}</span>
                </div>
                <div class="kanban-body" data-status="${column.id}">
                    ${leadsHTML || '<p class="kanban-empty">No leads</p>'}
                </div>
            </div>
        `;
    }).join('');

    setupDragAndDrop();
}

function setupDragAndDrop() {
    // Just mark cards as draggable
    document.querySelectorAll('.kanban-card').forEach(card => {
        card.setAttribute('draggable', 'true');
    });
}

function handleDragStart(e) {
    draggedElement = e.target;
    e.target.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.style.opacity = '1';
    draggedElement = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    const target = e.target.classList.contains('kanban-body') ? e.target : e.target.closest('.kanban-body');
    if (target) {
        target.style.backgroundColor = '#f0f0f0';
    }
}

function handleDragLeave(e) {
    if (e.target.classList.contains('kanban-body')) {
        e.target.style.backgroundColor = '';
    }
}

async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    // Reset background color
    document.querySelectorAll('.kanban-body').forEach(body => {
        body.style.backgroundColor = '';
    });

    if (!draggedElement) return;

    const itemId = draggedElement.getAttribute('data-id') || draggedElement.getAttribute('data-lead-id');
    const isOperation = draggedElement.closest('#operationsPipelineKanban') !== null;

    // Get drop target - handle both kanban-body and children
    let dropTarget = e.target;
    if (!dropTarget.classList.contains('kanban-body')) {
        dropTarget = dropTarget.closest('.kanban-body');
    }

    if (!dropTarget) {
        console.error('Drop target not found');
        return;
    }

    const newStatus = dropTarget.getAttribute('data-status');

    if (!newStatus) {
        console.error('New status not found');
        return;
    }

    try {
        let apiEndpoint, itemType;

        if (isOperation) {
            apiEndpoint = `${API_BASE}/operations-leads/${itemId}/status`;
            itemType = 'operation';
        } else {
            apiEndpoint = `${API_BASE}/leads/${itemId}/status`;
            itemType = 'lead';

            // Check if status actually changed for leads
            const leadIndex = allLeads.findIndex(l => l._id === itemId);
            if (leadIndex !== -1 && allLeads[leadIndex].status === newStatus) {
                return; // No change needed
            }
        }

        const response = await fetch(apiEndpoint, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to update ${itemType} status`);
        }

        // Update local data for leads
        if (!isOperation) {
            const leadIndex = allLeads.findIndex(l => l._id === itemId);
            if (leadIndex !== -1) {
                allLeads[leadIndex].status = newStatus;
            }
            renderPipeline();
        } else {
            // Re-render operations pipeline
            loadOperationsPipeline();
        }

        // Refresh dashboard stats if on dashboard section
        if (currentSection === 'dashboard') {
            await loadDashboardData();
        }

        showNotification(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} moved successfully`, 'success');
    } catch (error) {
        console.error('Drop error:', error);
        showNotification(error.message || `Error moving ${isOperation ? 'operation' : 'lead'}`, 'error');
        // Reload to show correct state
        if (isOperation) {
            loadOperationsPipeline();
        } else {
            loadPipeline();
        }
    }
}

// Modal Functions - Add Lead
function openAddLeadModal() {
    // Ensure currentUser is loaded before opening modal
    if (!currentUser) {
        console.error('currentUser not loaded yet');
        showNotification('Please wait, loading user data...', 'info');
        setTimeout(() => openAddLeadModal(), 500);
        return;
    }

    document.getElementById('addLeadModal').classList.add('active');
    document.getElementById('addLeadForm').reset();
    loadSalesTeamMembers();
}

function closeAddLeadModal() {
    document.getElementById('addLeadModal').classList.remove('active');
}

async function handleAddLead(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const leadData = {
        companyName: formData.get('companyName'),
        contactPerson: formData.get('contactPerson'),
        email: formData.get('email'),
        mobile: formData.get('mobile'),
        address: formData.get('address'),
        status: formData.get('status') || 'new',
        remarks: formData.get('remarks'),
        assignedTo: formData.get('assignedTo')
    };

    try {
        const response = await fetch(`${API_BASE}/leads`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(leadData)
        });

        if (!response.ok) throw new Error('Failed to create lead');

        showNotification('Lead created successfully', 'success');
        closeAddLeadModal();

        if (currentSection === 'pipeline') loadPipeline();
        else if (currentSection === 'leads') loadLeads();
        else if (currentSection === 'dashboard') loadDashboardData();
    } catch (error) {
        showNotification('Error creating lead: ' + error.message, 'error');
    }
}

// Modal Functions - View Lead
let currentViewLeadId = null;
let currentLeadTab = 'details';

async function viewLead(id) {
    try {
        currentViewLeadId = id;

        // Fetch lead details
        const leadResponse = await fetch(`${API_BASE}/leads/${id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const lead = await leadResponse.json();

        // Fetch communications for this lead
        const commResponse = await fetch(`${API_BASE}/communication/lead/${id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const communications = commResponse.ok ? await commResponse.json() : [];

        const content = document.getElementById('viewLeadContent');
        content.innerHTML = `
            <div class="lead-view-tabs">
                <button class="tab-btn active" onclick="switchLeadTab('details')">Details</button>
                <button class="tab-btn" onclick="switchLeadTab('notes')">Notes (${lead.notes?.length || 0})</button>
                <button class="tab-btn" onclick="switchLeadTab('files')">Files (${lead.attachments?.length || 0})</button>
                <button class="tab-btn" onclick="switchLeadTab('communications')">Communications (${communications.length})</button>
                <button class="tab-btn" onclick="switchLeadTab('timeline')">Timeline (${lead.timeline?.length || 0})</button>
            </div>
            
            <div class="lead-tab-content">
                ${renderLeadDetailsTab(lead)}
            </div>
            
            <div class="lead-quick-actions" style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
                ${lead.email ? `
                <a href="mailto:${lead.email}" class="btn btn-sm btn-primary" style="text-decoration: none;">
                    <i class="fas fa-envelope"></i> Send Email
                </a>` : `
                <button class="btn btn-sm btn-primary" disabled>
                    <i class="fas fa-envelope"></i> No Email
                </button>`}
                <button class="btn btn-sm btn-success" onclick="openSendWhatsAppModal('${id}')">
                    <i class="fab fa-whatsapp"></i> WhatsApp
                </button>
                <button class="btn btn-sm btn-info" onclick="openLogCallModal('${id}')">
                    <i class="fas fa-phone"></i> Log Call
                </button>
                <button class="btn btn-sm btn-warning" onclick="openLogMeetingModal('${id}')">
                    <i class="fas fa-calendar-check"></i> Log Meeting
                </button>
                <button class="btn btn-sm btn-secondary" onclick="openUploadFileModal('${id}')">
                    <i class="fas fa-upload"></i> Upload File
                </button>
            </div>
        `;

        // Store lead data for tab switching
        window.currentLeadData = { lead, communications };

        document.getElementById('viewLeadModal').classList.add('active');
    } catch (error) {
        console.error('Error loading lead details:', error);
        showNotification('Error loading lead details', 'error');
    }
}

function renderLeadDetailsTab(lead) {
    const assignedUser = lead.assignedTo?.fullName || lead.assignedTo?.email || 'Unassigned';

    return `
        <div class="detail-grid">
            <div class="detail-item"><strong>Company Name:</strong> ${lead.companyName || 'N/A'}</div>
            <div class="detail-item"><strong>Contact Person:</strong> ${lead.contactPerson || 'N/A'}</div>
            <div class="detail-item"><strong>Email:</strong> ${lead.email ? `<a href="mailto:${lead.email}" style="color:var(--primary-color);text-decoration:none;">${lead.email}</a>` : 'N/A'}</div>
            <div class="detail-item"><strong>Mobile:</strong> ${lead.mobile || 'N/A'}</div>
            <div class="detail-item"><strong>Status:</strong> <span class="badge badge-info">${lead.status}</span></div>
            <div class="detail-item"><strong>Assigned To:</strong> ${assignedUser}</div>
            <div class="detail-item full-width"><strong>Address:</strong> ${lead.address || 'N/A'}</div>
            <div class="detail-item full-width"><strong>Remarks:</strong> ${lead.remarks || 'No remarks'}</div>
            <div class="detail-item"><strong>Created:</strong> ${formatDate(lead.createdAt)}</div>
            <div class="detail-item"><strong>Updated:</strong> ${formatDate(lead.updatedAt)}</div>
        </div>
    `;
}

function renderLeadNotesTab(lead) {
    if (!lead.notes || lead.notes.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-sticky-note" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>No notes yet</p>
                <button class="btn btn-primary" onclick="openAddNoteModal('${lead._id}')">
                    <i class="fas fa-plus"></i> Add Note
                </button>
            </div>
        `;
    }

    return `
        <div style="margin-bottom: 16px;">
            <button class="btn btn-primary btn-sm" onclick="openAddNoteModal('${lead._id}')">
                <i class="fas fa-plus"></i> Add Note
            </button>
        </div>
        <div class="notes-list">
            ${lead.notes.map(note => `
                <div class="note-item" style="padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                        <div>
                            <div style="font-size: 12px; color: #666;">
                                By: ${note.createdBy?.fullName || note.createdBy?.email || 'Unknown'}
                            </div>
                            <div style="font-size: 12px; color: #999;">
                                ${formatDate(note.createdAt)}
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            ${note.createdBy?._id === currentUser?._id || ['admin', 'superadmin'].includes(currentUser?.role) ? `
                                <button class="btn btn-sm btn-info" onclick="editNote('${lead._id}', '${note._id}', \`${note.content.replace(/`/g, '\\`')}\`)">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteNote('${lead._id}', '${note._id}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div style="color: #374151; margin-top: 8px;">${note.content}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderLeadFilesTab(lead) {
    if (!lead.attachments || lead.attachments.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-folder-open" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>No files uploaded yet</p>
                <button class="btn btn-primary" onclick="openUploadFileModal('${lead._id}')">
                    <i class="fas fa-upload"></i> Upload First File
                </button>
            </div>
        `;
    }

    return `
        <div style="margin-bottom: 16px;">
            <button class="btn btn-primary btn-sm" onclick="openUploadFileModal('${lead._id}')">
                <i class="fas fa-plus"></i> Upload New File
            </button>
        </div>
        <div class="files-list">
            ${lead.attachments.map(file => `
                <div class="file-item" style="display: flex; align-items: center; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 8px;">
                    <i class="fas fa-file" style="font-size: 24px; margin-right: 12px; color: #4F46E5;"></i>
                    <div style="flex: 1;">
                        <div style="font-weight: 500;">${file.originalName}</div>
                        <div style="font-size: 12px; color: #666;">
                            ${(file.size / 1024).toFixed(2)} KB • Uploaded ${formatDate(file.uploadedAt)}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-info" onclick="downloadFile('${file.path}', '${file.originalName}')">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteFile('${lead._id}', '${file._id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderLeadCommunicationsTab(communications) {
    if (!communications || communications.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-comments" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>No communications yet</p>
            </div>
        `;
    }

    return `
        <div class="communications-list">
            ${communications.map(comm => `
                <div class="communication-item" style="padding: 16px; border-left: 4px solid ${comm.type === 'email' ? '#4F46E5' :
            comm.type === 'whatsapp' ? '#25D366' :
                comm.type === 'call' ? '#F59E0B' :
                    comm.type === 'meeting' ? '#8B5CF6' : '#6B7280'
        }; background: #f9fafb; margin-bottom: 12px; border-radius: 4px;">
                    <div style="display: flex; align-items: center; margin-bottom: 8px;">
                        <i class="fas fa-${comm.type === 'email' ? 'envelope' :
            comm.type === 'whatsapp' ? 'whatsapp' :
                comm.type === 'call' ? 'phone' :
                    comm.type === 'meeting' ? 'calendar-check' : 'comment'
        }" style="margin-right: 8px;"></i>
                        <strong>${comm.type.toUpperCase()}</strong>
                        <span style="margin-left: auto; font-size: 12px; color: #666;">
                            ${formatDate(comm.createdAt)}
                        </span>
                    </div>
                    ${comm.subject ? `<div style="font-weight: 500; margin-bottom: 4px;">${comm.subject}</div>` : ''}
                    <div style="color: #374151;">${comm.content}</div>
                    ${comm.to ? `<div style="font-size: 12px; color: #666; margin-top: 4px;">To: ${comm.to}</div>` : ''}
                    ${comm.metadata?.callDuration ? `<div style="font-size: 12px; color: #666;">Duration: ${comm.metadata.callDuration} minutes</div>` : ''}
                    ${comm.metadata?.meetingDuration ? `<div style="font-size: 12px; color: #666;">Duration: ${comm.metadata.meetingDuration} minutes</div>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

function renderLeadTimelineTab(lead) {
    if (!lead.timeline || lead.timeline.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-clock" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>No timeline events yet</p>
            </div>
        `;
    }

    const sortedTimeline = [...lead.timeline].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

    return `
        <div class="timeline-list">
            ${sortedTimeline.map(event => `
                <div class="timeline-item" style="padding: 12px; border-left: 3px solid #4F46E5; margin-left: 12px; margin-bottom: 16px; position: relative;">
                    <div style="position: absolute; left: -9px; top: 12px; width: 14px; height: 14px; border-radius: 50%; background: #4F46E5; border: 3px solid white;"></div>
                    <div style="font-weight: 500; color: #4F46E5; text-transform: uppercase; font-size: 12px;">
                        ${event.action.replace(/_/g, ' ')}
                    </div>
                    <div style="color: #374151; margin: 4px 0;">${event.description}</div>
                    <div style="font-size: 12px; color: #666;">${formatDate(event.timestamp)}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function switchLeadTab(tab) {
    currentLeadTab = tab;

    // Update tab buttons
    const tabBtns = document.querySelectorAll('.lead-view-tabs .tab-btn');
    tabBtns.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Render tab content
    const tabContent = document.querySelector('.lead-tab-content');
    const { lead, communications } = window.currentLeadData || {};

    if (!lead) return;

    switch (tab) {
        case 'details':
            tabContent.innerHTML = renderLeadDetailsTab(lead);
            break;
        case 'notes':
            tabContent.innerHTML = renderLeadNotesTab(lead);
            break;
        case 'files':
            tabContent.innerHTML = renderLeadFilesTab(lead);
            break;
        case 'communications':
            tabContent.innerHTML = renderLeadCommunicationsTab(communications);
            break;
        case 'timeline':
            tabContent.innerHTML = renderLeadTimelineTab(lead);
            break;
    }
}

function closeViewLeadModal() {
    document.getElementById('viewLeadModal').classList.remove('active');
}

// Modal Functions - Edit Lead
async function editLead(id) {
    try {
        const response = await fetch(`${API_BASE}/leads/${id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const lead = await response.json();

        // Load team members first
        await loadSalesTeamMembers();

        document.getElementById('editLeadId').value = lead._id;
        document.getElementById('editLeadCompanyName').value = lead.companyName || '';
        document.getElementById('editLeadContactPerson').value = lead.contactPerson || '';
        document.getElementById('editLeadEmail').value = lead.email || '';
        document.getElementById('editLeadMobile').value = lead.mobile || '';
        document.getElementById('editLeadAddress').value = lead.address || '';
        document.getElementById('editLeadStatus').value = lead.status;
        document.getElementById('editLeadRemarks').value = lead.remarks || '';
        document.getElementById('editLeadAssignedTo').value = lead.assignedTo?._id || lead.assignedTo || '';

        // For staff role, disable fields they cannot edit
        const isStaff = currentUser?.role === 'staff';
        document.getElementById('editLeadCompanyName').disabled = isStaff;
        document.getElementById('editLeadContactPerson').disabled = isStaff;
        document.getElementById('editLeadEmail').disabled = isStaff;
        document.getElementById('editLeadMobile').disabled = isStaff;
        document.getElementById('editLeadAddress').disabled = isStaff;
        document.getElementById('editLeadAssignedTo').disabled = isStaff;

        document.getElementById('editLeadModal').classList.add('active');
    } catch (error) {
        showNotification('Error loading lead', 'error');
    }
}

function closeEditLeadModal() {
    document.getElementById('editLeadModal').classList.remove('active');
}

async function handleEditLead(e) {
    e.preventDefault();
    const leadId = document.getElementById('editLeadId').value;
    const formData = new FormData(e.target);

    const isStaff = currentUser?.role === 'staff';
    const leadData = {};

    if (isStaff) {
        // Staff can only update status and remarks
        leadData.status = formData.get('status');
        leadData.remarks = formData.get('remarks');
    } else {
        // Other roles can update all fields
        leadData.companyName = formData.get('companyName');
        leadData.contactPerson = formData.get('contactPerson');
        leadData.email = formData.get('email');
        leadData.mobile = formData.get('mobile');
        leadData.address = formData.get('address');
        leadData.status = formData.get('status');
        leadData.remarks = formData.get('remarks');
        leadData.assignedTo = formData.get('assignedTo');
    }

    try {
        const response = await fetch(`${API_BASE}/leads/${leadId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(leadData)
        });

        if (!response.ok) throw new Error('Failed to update lead');

        showNotification('Lead updated successfully', 'success');
        closeEditLeadModal();

        if (currentSection === 'pipeline') loadPipeline();
        else if (currentSection === 'leads') loadLeads();
    } catch (error) {
        showNotification('Error updating lead: ' + error.message, 'error');
    }
}

// Modal Functions - Add Task
function openAddTaskModal() {
    document.getElementById('addTaskModal').classList.add('active');
    document.getElementById('addTaskForm').reset();
    loadTaskTeamMembers();
    loadTaskLeads();
}

function closeAddTaskModal() {
    document.getElementById('addTaskModal').classList.remove('active');
}

function closeViewTaskModal() {
    document.getElementById('viewTaskModal').classList.remove('active');
}

function closeEditTaskModal() {
    document.getElementById('editTaskModal').classList.remove('active');
    document.getElementById('editTaskForm').reset();
}

async function handleAddTask(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const assignedToValue = formData.get('assignedTo');
    const leadValue = formData.get('lead');

    if (!assignedToValue) {
        showNotification('Please select a user to assign the task', 'error');
        return;
    }

    if (!leadValue) {
        showNotification('Please select a lead for the task', 'error');
        return;
    }

    const taskData = {
        action: formData.get('action'),
        remarks: formData.get('remarks'),
        dueDate: formData.get('dueDate'),
        priority: formData.get('priority'),
        assignedTo: assignedToValue,
        lead: leadValue,
        status: 'pending'
    };

    try {
        const response = await fetch(`${API_BASE}/tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(taskData)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to create task');

        showNotification('Task created successfully', 'success');
        closeAddTaskModal();

        if (currentSection === 'tasks') loadTasks();
        else if (currentSection === 'dashboard') loadDashboardData();
    } catch (error) {
        showNotification('Error creating task: ' + error.message, 'error');
    }
}

// Pipeline Settings
function openPipelineSettings() {
    loadPipelineStagesList();
    document.getElementById('pipelineSettingsModal').classList.add('active');
}

function closePipelineSettings() {
    document.getElementById('pipelineSettingsModal').classList.remove('active');
}

function loadPipelineStagesList() {
    if (!currentPipeline || !currentPipeline.columns) return;

    const container = document.getElementById('pipelineStagesList');
    const sortedColumns = currentPipeline.columns.sort((a, b) => a.order - b.order);

    container.innerHTML = sortedColumns.map((col, index) => `
        <div class="pipeline-stage-item" data-index="${index}">
            <div class="stage-color" style="background-color: ${col.color}"></div>
            <div class="stage-info">
                <h4>${col.name}</h4>
                <small>ID: ${col.id} | Order: ${col.order}</small>
            </div>
            <div class="stage-actions">
                <button class="btn-icon" onclick="movePipelineStage(${index}, -1)" ${index === 0 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-up"></i>
                </button>
                <button class="btn-icon" onclick="movePipelineStage(${index}, 1)" ${index === sortedColumns.length - 1 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-down"></i>
                </button>
                <button class="btn-icon" onclick="editPipelineStage(${index})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-danger" onclick="deletePipelineStage(${index})" ${currentPipeline.columns.length <= 2 ? 'disabled' : ''}>
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function addPipelineStage() {
    const name = prompt('Enter stage name:');
    if (!name) return;

    const newStage = {
        id: 'stage-' + Date.now(),
        name: name,
        icon: 'fas fa-circle',
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        order: currentPipeline.columns.length + 1
    };

    currentPipeline.columns.push(newStage);
    loadPipelineStagesList();
}

function movePipelineStage(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= currentPipeline.columns.length) return;

    const temp = currentPipeline.columns[index];
    currentPipeline.columns[index] = currentPipeline.columns[newIndex];
    currentPipeline.columns[newIndex] = temp;

    currentPipeline.columns.forEach((col, idx) => col.order = idx + 1);
    loadPipelineStagesList();
}

function editPipelineStage(index) {
    const stage = currentPipeline.columns[index];
    const newName = prompt('Enter new name:', stage.name);
    if (newName) {
        stage.name = newName;
        loadPipelineStagesList();
    }
}

function deletePipelineStage(index) {
    if (currentPipeline.columns.length <= 2) {
        showNotification('Cannot delete - minimum 2 stages required', 'error');
        return;
    }

    if (confirm('Delete this stage? Leads will be moved to the first stage.')) {
        currentPipeline.columns.splice(index, 1);
        currentPipeline.columns.forEach((col, idx) => col.order = idx + 1);
        loadPipelineStagesList();
    }
}

async function savePipelineSettings() {
    try {
        const response = await fetch(`/api/pipeline/${currentPipeline._id || 'default'}`, {
            method: currentPipeline._id ? 'PATCH' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(currentPipeline)
        });

        if (!response.ok) throw new Error('Failed to save pipeline');

        showNotification('Pipeline settings saved', 'success');
        closePipelineSettings();
        loadPipeline();
    } catch (error) {
        showNotification('Error saving pipeline: ' + error.message, 'error');
    }
}

// Communication Functions
let currentCommunicationLeadId = null;

function openSendEmailModal(leadId = null) {
    if (leadId) {
        currentCommunicationLeadId = leadId;
        document.getElementById('emailLeadId').value = leadId;
        // Pre-fill email if lead is in allLeads
        const lead = allLeads.find(l => l._id === leadId);
        if (lead && lead.emails && lead.emails.length > 0) {
            document.getElementById('emailTo').value = lead.emails[0].email;
        }
    }
    document.getElementById('sendEmailModal').classList.add('active');
}

function closeSendEmailModal() {
    document.getElementById('sendEmailModal').classList.remove('active');
    document.getElementById('sendEmailForm').reset();
}

async function handleSendEmail(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const leadId = document.getElementById('emailLeadId').value;

    const emailData = {
        leadId: leadId,
        to: formData.get('to'),
        cc: formData.get('cc') ? formData.get('cc').split(',').map(e => e.trim()) : [],
        subject: formData.get('subject'),
        content: formData.get('content')
    };

    try {
        const response = await fetch(`${API_BASE}/communication/email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(emailData)
        });

        if (response.ok) {
            const result = await response.json();
            if (result.warning) {
                showNotification(result.message, 'warning');
            } else {
                showNotification(result.message, 'success');
            }
            closeSendEmailModal();
            if (currentSection === 'communication') loadCommunications();
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to send email', 'error');
        }
    } catch (error) {
        console.error('Error sending email:', error);
        showNotification('Error sending email', 'error');
    }
}

function openSendWhatsAppModal(leadId = null) {
    if (leadId) {
        currentCommunicationLeadId = leadId;
        document.getElementById('whatsappLeadId').value = leadId;
        // Pre-fill phone if lead is in allLeads
        const lead = allLeads.find(l => l._id === leadId);
        if (lead && lead.phones && lead.phones.length > 0) {
            document.getElementById('whatsappTo').value = lead.phones[0].phone;
        }
    }
    document.getElementById('sendWhatsAppModal').classList.add('active');
}

function closeSendWhatsAppModal() {
    document.getElementById('sendWhatsAppModal').classList.remove('active');
    document.getElementById('sendWhatsAppForm').reset();
}

async function handleSendWhatsApp(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const leadId = document.getElementById('whatsappLeadId').value;

    const whatsappData = {
        leadId: leadId,
        to: formData.get('to'),
        content: formData.get('content')
    };

    try {
        const response = await fetch(`${API_BASE}/communication/whatsapp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(whatsappData)
        });

        if (response.ok) {
            const result = await response.json();
            if (result.warning) {
                showNotification(result.message, 'warning');
            } else {
                showNotification(result.message, 'success');
            }
            closeSendWhatsAppModal();
            if (currentSection === 'communication') loadCommunications();
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to send WhatsApp message', 'error');
        }
    } catch (error) {
        console.error('Error sending WhatsApp:', error);
        showNotification('Error sending WhatsApp message', 'error');
    }
}

function openLogCallModal(leadId = null) {
    if (leadId) {
        currentCommunicationLeadId = leadId;
        document.getElementById('callLeadId').value = leadId;
        // Pre-fill phone if lead is in allLeads
        const lead = allLeads.find(l => l._id === leadId);
        if (lead && lead.phones && lead.phones.length > 0) {
            document.getElementById('callTo').value = lead.phones[0].phone;
        }
    }
    document.getElementById('logCallModal').classList.add('active');
}

function closeLogCallModal() {
    document.getElementById('logCallModal').classList.remove('active');
    document.getElementById('logCallForm').reset();
}

async function handleLogCall(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const leadId = document.getElementById('callLeadId').value;

    const callData = {
        leadId: leadId,
        to: formData.get('to'),
        content: formData.get('content'),
        duration: parseInt(formData.get('duration')) || 0
    };

    try {
        const response = await fetch(`${API_BASE}/communication/call`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(callData)
        });

        if (response.ok) {
            showNotification('Call logged successfully!', 'success');
            closeLogCallModal();
            if (currentSection === 'communication') loadCommunications();
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to log call', 'error');
        }
    } catch (error) {
        console.error('Error logging call:', error);
        showNotification('Error logging call', 'error');
    }
}

function openLogMeetingModal(leadId = null) {
    if (leadId) {
        currentCommunicationLeadId = leadId;
        document.getElementById('meetingLeadId').value = leadId;
    }
    document.getElementById('logMeetingModal').classList.add('active');
}

function closeLogMeetingModal() {
    document.getElementById('logMeetingModal').classList.remove('active');
    document.getElementById('logMeetingForm').reset();
}

async function handleLogMeeting(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const leadId = document.getElementById('meetingLeadId').value;

    const meetingData = {
        leadId: leadId,
        content: formData.get('content'),
        duration: parseInt(formData.get('duration')) || 0,
        attendees: formData.get('attendees')
    };

    try {
        const response = await fetch(`${API_BASE}/communication/meeting`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(meetingData)
        });

        if (response.ok) {
            showNotification('Meeting logged successfully!', 'success');
            closeLogMeetingModal();
            if (currentSection === 'communication') loadCommunications();
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to log meeting', 'error');
        }
    } catch (error) {
        console.error('Error logging meeting:', error);
        showNotification('Error logging meeting', 'error');
    }
}

// File Upload Functions
let currentUploadLeadId = null;

function openUploadFileModal(leadId = null) {
    if (leadId) {
        currentUploadLeadId = leadId;
        document.getElementById('uploadLeadId').value = leadId;
    }
    document.getElementById('uploadFileModal').classList.add('active');
}

function closeUploadFileModal() {
    document.getElementById('uploadFileModal').classList.remove('active');
    document.getElementById('uploadFileForm').reset();
}

async function handleUploadFile(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const leadId = document.getElementById('uploadLeadId').value;

    formData.append('leadId', leadId);

    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            showNotification('File uploaded successfully!', 'success');
            closeUploadFileModal();
            // Reload lead details if viewing
            if (document.getElementById('viewLeadModal').classList.contains('active')) {
                viewLead(leadId);
            }
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to upload file', 'error');
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        showNotification('Error uploading file', 'error');
    }
}

async function deleteFile(leadId, attachmentId) {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
        const response = await fetch(`${API_BASE}/leads/${leadId}/attachments/${attachmentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            showNotification('File deleted successfully', 'success');
            // Reload lead details
            viewLead(leadId);
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to delete file', 'error');
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        showNotification('Error deleting file', 'error');
    }
}

function downloadFile(filePath, originalName) {
    const link = document.createElement('a');
    link.href = filePath;
    link.download = originalName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Note management functions
async function openAddNoteModal(leadId) {
    const content = prompt('Enter your note:');
    if (content) {
        await addNote(leadId, content);
    }
}

async function addNote(leadId, content) {
    try {
        const response = await fetch(`${API_BASE}/leads/${leadId}/notes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ content })
        });

        if (response.ok) {
            showNotification('Note added successfully', 'success');
            viewLead(leadId);
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to add note', 'error');
        }
    } catch (error) {
        console.error('Error adding note:', error);
        showNotification('Error adding note', 'error');
    }
}

async function editNote(leadId, noteId, currentContent) {
    const newContent = prompt('Edit your note:', currentContent);
    if (newContent && newContent !== currentContent) {
        try {
            const response = await fetch(`${API_BASE}/leads/${leadId}/notes/${noteId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ content: newContent })
            });

            if (response.ok) {
                showNotification('Note updated successfully', 'success');
                viewLead(leadId);
            } else {
                const error = await response.json();
                showNotification(error.message || 'Failed to update note', 'error');
            }
        } catch (error) {
            console.error('Error updating note:', error);
            showNotification('Error updating note', 'error');
        }
    }
}

async function deleteNote(leadId, noteId) {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
        const response = await fetch(`${API_BASE}/leads/${leadId}/notes/${noteId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            showNotification('Note deleted successfully', 'success');
            viewLead(leadId);
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to delete note', 'error');
        }
    } catch (error) {
        console.error('Error deleting note:', error);
        showNotification('Error deleting note', 'error');
    }
}

// ============= USER MANAGEMENT FUNCTIONS =============

let currentEditUserId = null;

async function loadUsers() {
    if (!hasPermission('users', 'view')) {
        document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center">You do not have permission to view users</td></tr>';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load users');
        }

        const users = await response.json();
        const tbody = document.getElementById('usersTableBody');

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.fullName || 'N/A'}</td>
                <td>${user.email}</td>
                <td><span class="badge badge-${user.role === 'superadmin' ? 'danger' : user.role === 'admin' ? 'primary' : user.role === 'manager' ? 'warning' : 'info'}">${capitalizeRole(user.role)}</span></td>
                <td><span class="badge badge-${user.isActive ? 'success' : 'secondary'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</td>
                <td class="actions">
                    <button class="btn-icon" onclick="viewUser('${user._id}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${hasPermission('users', 'edit') ? `
                    <button class="btn-icon" onclick="editUser('${user._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="toggleUserStatus('${user._id}', ${user.isActive})" title="${user.isActive ? 'Deactivate' : 'Activate'}">
                        <i class="fas fa-${user.isActive ? 'ban' : 'check-circle'}"></i>
                    </button>
                    <button class="btn-icon" onclick="resetUserPassword('${user._id}')" title="Reset Password">
                        <i class="fas fa-key"></i>
                    </button>
                    ` : ''}
                    ${hasPermission('users', 'delete') && user._id !== currentUser._id ? `
                    <button class="btn-icon btn-icon-danger" onclick="deleteUser('${user._id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Error loading users', 'error');
    }
}

function openAddUserModal() {
    console.log('openAddUserModal called');
    console.log('currentUser:', currentUser);
    console.log('currentUser.role:', currentUser?.role);
    console.log('currentUser.permissions:', currentUser?.permissions);

    const hasCreatePermission = hasPermission('users', 'create');
    console.log('Has create permission:', hasCreatePermission);

    if (!hasCreatePermission) {
        console.log('Permission denied - showing notification');
        showNotification('You do not have permission to create users', 'error');
        return;
    }

    console.log('Permission granted - opening modal');
    currentEditUserId = null;

    const modalTitle = document.getElementById('userModalTitle');
    const editUserId = document.getElementById('editUserId');
    const addUserForm = document.getElementById('addUserForm');
    const userPassword = document.getElementById('userPassword');
    const passwordHint = document.getElementById('passwordHint');
    const addUserModal = document.getElementById('addUserModal');
    const userRole = document.getElementById('userRole');

    console.log('Modal elements found:', {
        modalTitle: !!modalTitle,
        editUserId: !!editUserId,
        addUserForm: !!addUserForm,
        userPassword: !!userPassword,
        passwordHint: !!passwordHint,
        addUserModal: !!addUserModal
    });

    if (modalTitle) modalTitle.textContent = 'Add New User';
    if (editUserId) editUserId.value = '';
    if (addUserForm) addUserForm.reset();
    if (userPassword) userPassword.required = true;
    if (passwordHint) passwordHint.style.display = 'none';

    // Hide conditional fields initially
    const departmentSelectGroup = document.getElementById('departmentSelectGroup');
    const managerSelectGroup = document.getElementById('managerSelectGroup');
    const userDepartment = document.getElementById('userDepartment');

    if (departmentSelectGroup) departmentSelectGroup.style.display = 'none';
    if (managerSelectGroup) managerSelectGroup.style.display = 'none';

    // Remove required attribute from hidden fields
    if (userDepartment) {
        userDepartment.required = false;
    }

    // Filter role options based on current user's role hierarchy
    // SuperAdmin can create: admin, manager, staff
    // Admin can create: manager, staff
    // Manager can create: staff only
    if (userRole) {
        userRole.disabled = false;
        Array.from(userRole.options).forEach(option => {
            const optionValue = option.value;
            if (optionValue === '') {
                // Always show "Select Role" option
                option.style.display = '';
            } else if (currentUser?.role === 'superadmin') {
                // SuperAdmin can create admin, manager, staff (but not another superadmin)
                option.style.display = optionValue !== 'superadmin' ? '' : 'none';
            } else if (currentUser?.role === 'admin') {
                // Admin can only create manager and staff
                option.style.display = (optionValue === 'manager' || optionValue === 'staff') ? '' : 'none';
            } else {
                // Manager and Staff cannot create users
                option.style.display = 'none';
            }
        });
    }

    // Show manager selection for role assignment
    loadManagersForDropdown();

    if (addUserModal) {
        addUserModal.style.display = 'flex';
        console.log('Modal display set to flex');
    } else {
        console.error('addUserModal element not found!');
    }
}

async function loadManagersForDropdown() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const users = await response.json();
            const managers = users.filter(u => u.role === 'manager');
            const managerSelect = document.getElementById('userManagerId');

            if (managerSelect) {
                managerSelect.innerHTML = '<option value="">No Manager</option>' +
                    managers.map(m => `<option value="${m._id}">${m.fullName || m.email} (${m.department})</option>`).join('');
            }
        }
    } catch (error) {
        console.error('Error loading managers:', error);
    }
}

function closeAddUserModal() {
    document.getElementById('addUserModal').style.display = 'none';
    document.getElementById('addUserForm').reset();
    currentEditUserId = null;
}

async function handleAddUser(e) {
    e.preventDefault();

    console.log('Form submitted');

    const formData = new FormData(e.target);
    const userData = {
        fullName: formData.get('fullName'),
        email: formData.get('email'),
        username: formData.get('username'),
        phone: formData.get('phone'),
        role: formData.get('role'),
        managerId: formData.get('managerId') || null
    };

    // Only include department if SuperAdmin (Admin will have it set automatically)
    if (currentUser?.role === 'superadmin') {
        userData.department = formData.get('department');
    }

    // Only include password if it's provided (not empty/whitespace)
    const password = formData.get('password');
    if (password && password.trim()) {
        userData.password = password.trim();
    }

    console.log('User data to send:', userData);
    console.log('Password included:', !!userData.password);
    console.log('Auth token:', authToken ? 'exists' : 'missing');

    // Validate required fields - department is optional for admin/manager (backend sets it)
    if (!userData.email || !userData.role) {
        showNotification('Email and role are required', 'error');
        return;
    }

    // SuperAdmin must provide department when CREATING (not editing) admin, manager, or staff
    if (!currentEditUserId && currentUser?.role === 'superadmin' && ['admin', 'manager', 'staff'].includes(userData.role) && !userData.department) {
        showNotification('Department is required when creating users', 'error');
        return;
    }

    if (!currentEditUserId && !userData.password) {
        showNotification('Password is required for new users', 'error');
        return;
    }

    try {
        const url = currentEditUserId
            ? `${API_BASE}/users/${currentEditUserId}`
            : `${API_BASE}/users`;
        const method = currentEditUserId ? 'PUT' : 'POST';

        console.log(`Sending ${method} request to ${url}`);

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(userData)
        });

        console.log('Response status:', response.status);

        const data = await response.json();
        console.log('Response data:', data);

        if (response.ok) {
            showNotification(currentEditUserId ? 'User updated successfully' : 'User created successfully', 'success');
            closeAddUserModal();
            await loadUsers();
        } else {
            showNotification(data.message || 'Error saving user', 'error');
            console.error('Server error:', data);
        }
    } catch (error) {
        console.error('Error saving user:', error);
        showNotification('Error saving user: ' + error.message, 'error');
    }
}

async function viewUser(userId) {
    try {
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load user');
        }

        const user = await response.json();
        const content = document.getElementById('viewUserContent');

        content.innerHTML = `
            <div class="detail-grid">
                <div class="detail-item"><strong>Full Name:</strong> ${user.fullName || 'N/A'}</div>
                <div class="detail-item"><strong>Email:</strong> ${user.email}</div>
                <div class="detail-item"><strong>Username:</strong> ${user.username || 'N/A'}</div>
                <div class="detail-item"><strong>Phone:</strong> ${user.phone || 'N/A'}</div>
                <div class="detail-item"><strong>Department:</strong> ${user.department || 'N/A'}</div>
                <div class="detail-item"><strong>Role:</strong> <span class="badge badge-${user.role === 'superadmin' ? 'danger' : user.role === 'admin' ? 'primary' : user.role === 'manager' ? 'warning' : 'info'}">${capitalizeRole(user.role)}</span></div>
                ${user.managerId ? `<div class="detail-item"><strong>Manager:</strong> ${user.managerId.fullName || user.managerId.email || 'N/A'}</div>` : ''}
                <div class="detail-item"><strong>Status:</strong> <span class="badge badge-${user.isActive ? 'success' : 'secondary'}">${user.isActive ? 'Active' : 'Inactive'}</span></div>
                <div class="detail-item"><strong>Last Login:</strong> ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</div>
                <div class="detail-item"><strong>Created:</strong> ${new Date(user.createdAt).toLocaleString()}</div>
                <div class="detail-item"><strong>Created By:</strong> ${user.createdBy ? (user.createdBy.fullName || user.createdBy.email) : 'System'}</div>
            </div>
            
            <h3>Permissions</h3>
            <div class="permissions-grid">
                <div><strong>Leads:</strong> View: ${user.permissions.leads.view}, Create: ${user.permissions.leads.create}, Edit: ${user.permissions.leads.edit}, Delete: ${user.permissions.leads.delete}, Export: ${user.permissions.leads.export}</div>
                <div><strong>Tasks:</strong> View: ${user.permissions.tasks.view}, Create: ${user.permissions.tasks.create}, Edit: ${user.permissions.tasks.edit}, Delete: ${user.permissions.tasks.delete}</div>
                <div><strong>Users:</strong> View: ${user.permissions.users.view}, Create: ${user.permissions.users.create}, Edit: ${user.permissions.users.edit}, Delete: ${user.permissions.users.delete}</div>
                <div><strong>Analytics:</strong> View: ${user.permissions.analytics.view}</div>
                <div><strong>Settings:</strong> View: ${user.permissions.settings.view}, Edit: ${user.permissions.settings.edit}</div>
                <div><strong>Communications:</strong> Send: ${user.permissions.communications.send}, View: ${user.permissions.communications.view}</div>
            </div>
        `;

        currentEditUserId = userId;
        document.getElementById('viewUserModal').style.display = 'flex';
    } catch (error) {
        console.error('Error viewing user:', error);
        showNotification('Error loading user details', 'error');
    }
}

function closeViewUserModal() {
    document.getElementById('viewUserModal').style.display = 'none';
    currentEditUserId = null;
}

function editUserFromView() {
    closeViewUserModal();
    if (currentEditUserId) {
        editUser(currentEditUserId);
    }
}

async function editUser(userId) {
    if (!hasPermission('users', 'edit')) {
        showNotification('You do not have permission to edit users', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load user');
        }

        const user = await response.json();

        currentEditUserId = userId;
        document.getElementById('userModalTitle').textContent = 'Edit User';
        document.getElementById('editUserId').value = userId;
        document.getElementById('userFullName').value = user.fullName || '';
        document.getElementById('userEmail').value = user.email;
        document.getElementById('userUsername').value = user.username || '';
        document.getElementById('userPhone').value = user.phone || '';
        document.getElementById('userRole').value = user.role;
        document.getElementById('userPassword').value = '';
        document.getElementById('userPassword').required = false;
        document.getElementById('passwordHint').style.display = 'block';

        document.getElementById('addUserModal').style.display = 'flex';
    } catch (error) {
        console.error('Error loading user:', error);
        showNotification('Error loading user', 'error');
    }
}

async function toggleUserStatus(userId, currentStatus) {
    if (!hasPermission('users', 'edit')) {
        showNotification('You do not have permission to change user status', 'error');
        return;
    }

    const action = currentStatus ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this user?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/${userId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ isActive: !currentStatus })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(data.message || 'User status updated', 'success');
            await loadUsers();
        } else {
            showNotification(data.message || 'Error updating user status', 'error');
        }
    } catch (error) {
        console.error('Error toggling user status:', error);
        showNotification('Error updating user status', 'error');
    }
}

async function resetUserPassword(userId) {
    if (!hasPermission('users', 'edit')) {
        showNotification('You do not have permission to reset passwords', 'error');
        return;
    }

    const newPassword = prompt('Enter new password for user (minimum 6 characters):');
    if (!newPassword) {
        return;
    }

    if (newPassword.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/${userId}/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ newPassword })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('Password reset successfully', 'success');
        } else {
            showNotification(data.message || 'Error resetting password', 'error');
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        showNotification('Error resetting password', 'error');
    }
}

async function deleteUser(userId) {
    if (!hasPermission('users', 'delete')) {
        showNotification('You do not have permission to delete users', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('User deleted successfully', 'success');
            await loadUsers();
        } else {
            showNotification(data.message || 'Error deleting user', 'error');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showNotification('Error deleting user', 'error');
    }
}

function openLeadFilters() {
    // Filter functionality - can be implemented later
    showNotification('Lead filters available in search bar', 'info');
}
async function deleteLead(id) {
    // Check delete permission
    const deletePermission = getPermissionLevel('leads', 'delete');
    if (deletePermission === 'none') {
        showNotification('You do not have permission to delete leads', 'error');
        return;
    }

    // If permission is 'assigned', check if lead is assigned to current user
    if (deletePermission === 'assigned') {
        const lead = allLeads.find(l => l._id === id);
        if (lead && lead.assignedTo !== currentUser._id.toString()) {
            showNotification('You can only delete leads assigned to you', 'error');
            return;
        }
    }

    if (!confirm('Delete lead?')) return;
    try {
        const response = await fetch(`${API_BASE}/leads/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Failed to delete lead');
        }

        allLeads = allLeads.filter(l => l._id !== id);
        if (currentSection === 'pipeline') renderPipeline();
        else if (currentSection === 'leads') loadLeads();
        showNotification('Lead deleted', 'success');
    } catch (error) {
        showNotification('Error deleting lead', 'error');
    }
}
// Task Management Functions
let currentTaskFilter = 'all';
let allTasks = [];

async function viewTask(id) {
    try {
        const response = await fetch(`${API_BASE}/tasks/${id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const task = await response.json();

        const assignedUser = task.assignedTo?.fullName || task.assignedTo?.email || 'Unassigned';
        const leadName = task.lead?.companyName || task.lead?.contactPerson || 'N/A';
        const actionLabel = task.action ? task.action.charAt(0).toUpperCase() + task.action.slice(1).replace('-', ' ') : 'N/A';

        const content = document.getElementById('viewTaskContent');
        content.innerHTML = `
            <div class="detail-grid">
                <div class="detail-item"><strong>Action:</strong> ${actionLabel}</div>
                <div class="detail-item"><strong>Status:</strong> <span class="badge badge-${task.status === 'completed' ? 'success' : task.status === 'in-progress' ? 'warning' : 'info'}">${task.status}</span></div>
                <div class="detail-item"><strong>Lead:</strong> ${leadName}</div>
                <div class="detail-item"><strong>Assigned To:</strong> ${assignedUser}</div>
                <div class="detail-item"><strong>Due Date:</strong> ${formatDate(task.dueDate)}</div>
                <div class="detail-item"><strong>Created By:</strong> ${task.user?.fullName || task.user?.email || 'N/A'}</div>
                ${task.remarks ? `<div class="detail-item full-width"><strong>Remarks:</strong> ${task.remarks}</div>` : ''}
                ${task.notes ? `<div class="detail-item full-width"><strong>Notes:</strong> ${task.notes}</div>` : ''}
            </div>
        `;
        document.getElementById('viewTaskModal').classList.add('active');
    } catch (error) {
        showNotification('Error loading task details', 'error');
    }
}

function closeViewTaskModal() {
    document.getElementById('viewTaskModal').classList.remove('active');
}

async function editTask(id) {
    try {
        const response = await fetch(`${API_BASE}/tasks/${id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const task = await response.json();

        // Load team members first
        await loadTaskTeamMembers();

        document.getElementById('editTaskId').value = task._id;
        document.getElementById('editTaskAction').value = task.action || '';
        document.getElementById('editTaskRemarks').value = task.remarks || '';
        document.getElementById('editTaskDueDate').value = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '';
        document.getElementById('editTaskStatus').value = task.status;
        document.getElementById('editTaskAssignedTo').value = task.assignedTo?._id || task.assignedTo || '';
        document.getElementById('editTaskNotes').value = task.notes || '';

        // Check if current user is the task creator
        const isCreator = task.user?._id === currentUser._id || task.user === currentUser._id;
        const isAssigned = task.assignedTo?._id === currentUser._id || task.assignedTo === currentUser._id;

        // If not creator (but maybe assigned), disable date and assigned fields
        if (!isCreator && isAssigned) {
            document.getElementById('editTaskDueDate').disabled = true;
            document.getElementById('editTaskAssignedTo').disabled = true;
            document.getElementById('editTaskAction').disabled = true;
            document.getElementById('editTaskRemarks').disabled = true;
            document.getElementById('editTaskStatus').disabled = true;

            // Only allow editing notes
            document.getElementById('editTaskNotes').disabled = false;

            // Show a message
            showNotification('You can only add notes. Contact task creator to edit date/time', 'info');
        } else if (isCreator) {
            // Creator can edit everything
            document.getElementById('editTaskDueDate').disabled = false;
            document.getElementById('editTaskAssignedTo').disabled = false;
            document.getElementById('editTaskAction').disabled = false;
            document.getElementById('editTaskRemarks').disabled = false;
            document.getElementById('editTaskStatus').disabled = false;
            document.getElementById('editTaskNotes').disabled = false;
        } else {
            // Not creator and not assigned - read-only
            document.getElementById('editTaskDueDate').disabled = true;
            document.getElementById('editTaskAssignedTo').disabled = true;
            document.getElementById('editTaskAction').disabled = true;
            document.getElementById('editTaskRemarks').disabled = true;
            document.getElementById('editTaskStatus').disabled = true;
            document.getElementById('editTaskNotes').disabled = true;
        }

        document.getElementById('editTaskModal').classList.add('active');
    } catch (error) {
        showNotification('Error loading task', 'error');
    }
}

function closeEditTaskModal() {
    document.getElementById('editTaskModal').classList.remove('active');
}

async function handleEditTask(e) {
    e.preventDefault();
    const taskId = document.getElementById('editTaskId').value;
    const formData = new FormData(e.target);

    // Fetch the original task to check creator
    const taskResponse = await fetch(`${API_BASE}/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const originalTask = await taskResponse.json();

    const isCreator = originalTask.user?._id === currentUser._id || originalTask.user === currentUser._id;
    const isAssigned = originalTask.assignedTo?._id === currentUser._id || originalTask.assignedTo === currentUser._id;

    // If user is assigned but not creator, only allow notes update
    if (!isCreator && isAssigned) {
        const taskData = {
            notes: formData.get('notes')
        };

        try {
            const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(taskData)
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to update task notes');

            showNotification('Notes updated successfully', 'success');
            closeEditTaskModal();

            if (currentSection === 'tasks') loadTasks();
            else if (currentSection === 'dashboard') loadDashboardData();
        } catch (error) {
            showNotification('Error updating notes: ' + error.message, 'error');
        }
        return;
    }

    // If creator, allow full update
    if (isCreator) {
        const assignedToValue = formData.get('assignedTo');

        if (!assignedToValue) {
            showNotification('Please select a user to assign the task', 'error');
            return;
        }

        const taskData = {
            action: formData.get('action'),
            remarks: formData.get('remarks'),
            dueDate: formData.get('dueDate'),
            status: formData.get('status'),
            assignedTo: assignedToValue,
            notes: formData.get('notes')
        };

        try {
            const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(taskData)
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to update task');

            showNotification('Task updated successfully', 'success');
            closeEditTaskModal();

            if (currentSection === 'tasks') loadTasks();
            else if (currentSection === 'dashboard') loadDashboardData();
        } catch (error) {
            showNotification('Error updating task: ' + error.message, 'error');
        }
    } else {
        showNotification('You do not have permission to edit this task', 'error');
    }
}

async function completeTask(id) {
    if (!confirm('Mark this task as completed?')) return;

    try {
        const response = await fetch(`${API_BASE}/tasks/${id}/complete`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) throw new Error('Failed to complete task');

        showNotification('Task marked as completed', 'success');

        if (currentSection === 'tasks') loadTasks();
        else if (currentSection === 'dashboard') loadDashboardData();
    } catch (error) {
        showNotification('Error completing task: ' + error.message, 'error');
    }
}

async function deleteTask(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
        const response = await fetch(`${API_BASE}/tasks/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) throw new Error('Failed to delete task');

        showNotification('Task deleted successfully', 'success');

        if (currentSection === 'tasks') loadTasks();
        else if (currentSection === 'dashboard') loadDashboardData();
    } catch (error) {
        showNotification('Error deleting task: ' + error.message, 'error');
    }
}

async function filterTasks(filter) {
    currentTaskFilter = filter;

    // Update active button
    document.querySelectorAll('.task-filters .filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Filter and display tasks
    const tbody = document.getElementById('tasksTableBody');

    let filteredTasks = [...allTasks];

    if (filter === 'pending') {
        filteredTasks = allTasks.filter(t => t.status === 'pending');
    } else if (filter === 'in-progress') {
        filteredTasks = allTasks.filter(t => t.status === 'in-progress');
    } else if (filter === 'completed') {
        filteredTasks = allTasks.filter(t => t.status === 'completed');
    } else if (filter === 'overdue') {
        const now = new Date();
        filteredTasks = allTasks.filter(t => t.status !== 'completed' && new Date(t.dueDate) < now);
    }

    if (filteredTasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No tasks found</td></tr>';
        return;
    }

    tbody.innerHTML = filteredTasks.map(task => {
        const actionLabel = task.action ? task.action.charAt(0).toUpperCase() + task.action.slice(1).replace('-', ' ') : 'N/A';
        const assignedUser = task.assignedTo?.fullName || task.assignedTo?.email || 'Unassigned';
        const leadName = task.lead?.companyName || task.lead?.contactPerson || 'N/A';

        return `
            <tr>
                <td>${actionLabel}</td>
                <td>${leadName}</td>
                <td>${assignedUser}</td>
                <td>${formatDate(task.dueDate)}</td>
                <td><span class="badge badge-${task.status === 'completed' ? 'success' : task.status === 'in-progress' ? 'warning' : 'info'}">${task.status}</span></td>
                <td>
                    <button class="btn btn-sm" onclick="viewTask('${task._id}')"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm" onclick="editTask('${task._id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-success" onclick="completeTask('${task._id}')" ${task.status === 'completed' ? 'disabled' : ''}><i class="fas fa-check"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTask('${task._id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

async function viewCommunication(id) {
    try {
        const response = await fetch(`${API_BASE}/communication/${id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const comm = await response.json();

            const typeIcon = comm.type === 'email' ? 'envelope' :
                comm.type === 'whatsapp' ? 'whatsapp' :
                    comm.type === 'call' ? 'phone' :
                        comm.type === 'meeting' ? 'calendar' : 'comment';

            const content = document.getElementById('viewCommunicationContent');
            let leadDisplay = 'N/A';
            if (comm.lead) {
                leadDisplay = comm.lead.companyName || comm.lead.contactPerson || comm.lead._id || 'N/A';
            }
            content.innerHTML = `
                <div class="detail-grid">
                    <div class="detail-item"><strong>Type:</strong> <i class="fas fa-${typeIcon}"></i> ${comm.type.charAt(0).toUpperCase() + comm.type.slice(1)}</div>
                    <div class="detail-item"><strong>Status:</strong> <span class="badge badge-${comm.status === 'sent' ? 'success' : comm.status === 'failed' ? 'danger' : 'warning'}">${comm.status}</span></div>
                    <div class="detail-item"><strong>Lead:</strong> ${leadDisplay}</div>
                    <div class="detail-item"><strong>Direction:</strong> ${comm.direction}</div>
                    ${comm.subject ? `<div class="detail-item full-width"><strong>Subject:</strong> ${comm.subject}</div>` : ''}
                    <div class="detail-item full-width"><strong>Content:</strong><br>${comm.content.replace(/\n/g, '<br>')}</div>
                    ${comm.from ? `<div class="detail-item"><strong>From:</strong> ${comm.from}</div>` : ''}
                    ${comm.to ? `<div class="detail-item"><strong>To:</strong> ${comm.to}</div>` : ''}
                    ${comm.cc && comm.cc.length > 0 ? `<div class="detail-item full-width"><strong>CC:</strong> ${comm.cc.join(', ')}</div>` : ''}
                    <div class="detail-item"><strong>Date:</strong> ${formatDate(comm.createdAt)}</div>
                </div>
            `;
            document.getElementById('viewCommunicationModal').classList.add('active');
        } else {
            showNotification('Communication not found', 'error');
        }
    } catch (error) {
        showNotification('Error loading communication', 'error');
        console.error('Error:', error);
    }
}

function closeViewCommunicationModal() {
    document.getElementById('viewCommunicationModal').classList.remove('active');
}

async function filterActivityLogs() {
    const module = document.getElementById('activityModuleFilter')?.value;
    const date = document.getElementById('activityDateFilter')?.value;

    try {
        let url = `${API_BASE}/activity-logs?limit=100`;
        if (module) url += `&module=${module}`;
        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            url += `&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();
        const logs = data.logs || data;
        const tbody = document.getElementById('activityLogsTableBody');

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No activity logs found</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${log.user?.fullName || log.user?.email || 'System'}</td>
                <td>${log.action}</td>
                <td><span class="badge badge-info">${log.module}</span></td>
                <td>${log.description}</td>
                <td>${log.ipAddress || 'N/A'}</td>
                <td>${formatDate(log.createdAt)}</td>
            </tr>
        `).join('');

        showNotification(`Showing ${logs.length} activity logs`, 'info');
    } catch (error) {
        console.error('Filter error:', error);
        showNotification('Error filtering logs', 'error');
    }
}
async function exportAnalytics() {
    try {
        const type = 'leads'; // Default export type
        const response = await fetch(`${API_BASE}/analytics/export?type=${type}&format=json`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();

            // Convert to JSON and download
            const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `analytics-${type}-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            showNotification(`Exported ${data.count} records`, 'success');
        } else {
            showNotification('Failed to export analytics', 'error');
        }
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting analytics', 'error');
    }
}

function exportAnalyticsData() {
    exportAnalytics();
}
async function updateEmailSettings(e) {
    e.preventDefault();
    try {
        const response = await fetch(`${API_BASE}/settings/email`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                smtpHost: document.getElementById('smtpHost').value,
                smtpPort: document.getElementById('smtpPort').value,
                smtpUser: document.getElementById('smtpUsername').value,
                smtpPassword: document.getElementById('smtpPassword').value,
                senderEmail: document.getElementById('smtpFrom').value,
                smtpSecure: true
            })
        });

        if (response.ok) {
            showNotification('Email settings saved successfully', 'success');
        } else {
            throw new Error('Failed to save email settings');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

async function updateWhatsAppSettings(e) {
    e.preventDefault();
    try {
        const response = await fetch(`${API_BASE}/settings/whatsapp`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                apiKey: document.getElementById('whatsappApiKey').value,
                phoneNumberId: document.getElementById('whatsappPhone').value,
                businessAccountId: document.getElementById('whatsappApiUrl').value,
                enabled: true
            })
        });

        if (response.ok) {
            showNotification('WhatsApp settings saved successfully', 'success');
        } else {
            throw new Error('Failed to save WhatsApp settings');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

async function updateNotificationSettings(e) {
    e.preventDefault();
    try {
        const response = await fetch(`${API_BASE}/settings/notifications`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                emailNotifications: document.getElementById('emailNotif').checked,
                taskReminders: document.getElementById('taskNotif').checked,
                leadAssignments: document.getElementById('leadNotif').checked,
                dailyDigest: false
            })
        });

        if (response.ok) {
            showNotification('Notification settings saved successfully', 'success');
        } else {
            throw new Error('Failed to save notification settings');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

async function triggerBackup() {
    try {
        const response = await fetch(`${API_BASE}/settings/backup/trigger`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            document.getElementById('lastBackupDate').textContent = formatDate(result.lastBackup);
            showNotification('Backup completed successfully', 'success');
        } else {
            throw new Error('Backup failed');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

async function regenerateApiKey() {
    if (!confirm('Regenerate API key? This will invalidate your current key.')) return;

    try {
        const response = await fetch(`${API_BASE}/api-key/regenerate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            document.getElementById('apiKeyDisplay').value = result.apiKey;
            showNotification('API key regenerated successfully', 'success');
        } else {
            throw new Error('Failed to regenerate API key');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

function addCustomField() {
    const fieldName = prompt('Enter custom field name:');
    if (!fieldName) return;

    const fieldType = prompt('Enter field type (text/number/date/select):');
    if (!fieldType) return;

    // In production, save to database
    showNotification(`Custom field "${fieldName}" added (type: ${fieldType})`, 'info');
}

async function exportActivityLogs() {
    try {
        const response = await fetch(`${API_BASE}/activity-logs/export`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            showNotification('Activity logs exported', 'success');
        }
    } catch (error) {
        showNotification('Export error: ' + error.message, 'error');
    }
}

// ============================================
// NOTIFICATIONS
// ============================================

let notificationsPanel = null;
let notificationsPollingInterval = null;

function showNotifications() {
    if (!notificationsPanel) {
        notificationsPanel = document.getElementById('notificationsPanel');
    }

    const isVisible = notificationsPanel.style.display === 'block';

    if (isVisible) {
        notificationsPanel.style.display = 'none';
    } else {
        loadNotifications();
        notificationsPanel.style.display = 'block';
    }
}

async function loadNotifications() {
    try {
        const response = await fetch(`${API_BASE}/notifications?limit=20`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            console.error('Failed to load notifications');
            return;
        }

        const notifications = await response.json();
        renderNotifications(notifications);
        updateNotificationBadge();
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function renderNotifications(notifications) {
    const list = document.getElementById('notificationsList');

    if (notifications.length === 0) {
        list.innerHTML = `
            <div class="notification-empty">
                <i class="fas fa-bell-slash"></i>
                <p>No notifications</p>
            </div>
        `;
        return;
    }

    list.innerHTML = notifications.map(notif => {
        const icon = getNotificationIcon(notif.type);
        const timeAgo = formatTimeAgo(new Date(notif.createdAt));

        return `
            <div class="notification-item ${!notif.read ? 'unread' : ''}" onclick="markNotificationRead('${notif._id}')">
                <div class="notification-content">
                    <div class="notification-icon ${notif.type}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="notification-body">
                        <div class="notification-message">${notif.message}</div>
                        <div class="notification-time">${timeAgo}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getNotificationIcon(type) {
    const icons = {
        'status_change': 'fa-exchange-alt',
        'assignment': 'fa-user-plus',
        'reassignment': 'fa-user-edit',
        'comment': 'fa-comment',
        'task_created': 'fa-tasks',
        'task_completed': 'fa-check-circle'
    };
    return icons[type] || 'fa-bell';
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return date.toLocaleDateString();
}

async function markNotificationRead(notificationId) {
    try {
        await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        loadNotifications();
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

async function markAllNotificationsRead() {
    try {
        await fetch(`${API_BASE}/notifications/read-all`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        loadNotifications();
        showNotification('All notifications marked as read', 'success');
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
    }
}

async function updateNotificationBadge() {
    try {
        const response = await fetch(`${API_BASE}/notifications/count`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const { count } = await response.json();
            const badge = document.getElementById('notificationBadge');

            if (badge) {
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.style.display = 'block';
                } else {
                    badge.style.display = 'none';
                }
            }
        }
    } catch (error) {
        console.error('Error updating notification badge:', error);
    }
}

function startNotificationPolling() {
    // Poll for new notifications every 30 seconds
    if (notificationsPollingInterval) {
        clearInterval(notificationsPollingInterval);
    }

    updateNotificationBadge(); // Initial load

    notificationsPollingInterval = setInterval(() => {
        updateNotificationBadge();
    }, 30000); // 30 seconds
}

// Close notifications panel when clicking outside
document.addEventListener('click', function (event) {
    if (notificationsPanel && notificationsPanel.style.display === 'block') {
        const isClickInside = notificationsPanel.contains(event.target) ||
            event.target.closest('.header-btn');

        if (!isClickInside) {
            notificationsPanel.style.display = 'none';
        }
    }
});

function downloadCSVTemplate() {
    const template = `Name,Company,Email,Phone,Status,Priority,Value,Source,Description
John Doe,ABC Corp,john@example.com,+1234567890,qualification,medium,5000,website,Sample lead
Jane Smith,XYZ Inc,jane@example.com,+0987654321,meeting,high,10000,referral,Another sample`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads-import-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showNotification('CSV template downloaded', 'success');
}

// ============================================
// OPERATIONS MANAGEMENT
// ============================================

let allOperations = [];
let currentOperationsFilter = 'all';

async function loadOperations() {
    try {
        const response = await fetch(`${API_BASE}/operations-leads`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Failed to load operations');

        allOperations = await response.json();

        // Update stats
        updateOperationsStats(allOperations);

        // Render table
        renderOperationsTable(allOperations);
    } catch (error) {
        console.error('Error loading operations:', error);
        showNotification('Failed to load operations', 'error');
    }
}

function updateOperationsStats(operations) {
    const total = operations.length;
    const active = operations.filter(op => op.status === 'in-progress' || op.status === 'new-request').length;
    const completed = operations.filter(op => op.status === 'completed').length;

    document.getElementById('totalOperations').textContent = total;
    document.getElementById('activeOperations').textContent = active;
    document.getElementById('completedOperations').textContent = completed;

    // Calculate average response time (placeholder)
    document.getElementById('avgResponseTime').textContent = '2.5h';
}

function renderOperationsTable(operations) {
    const tbody = document.getElementById('operationsTableBody');

    if (operations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="no-data">No operations tickets found</td></tr>';
        return;
    }

    const isStaff = currentUser?.role === 'staff';

    tbody.innerHTML = operations.map(op => `
            <tr>
                <td><strong>${op.ticketNumber || 'N/A'}</strong></td>
                <td>${op.clientName || 'N/A'}</td>
                <td>${op.company || 'N/A'}</td>
                <td>${op.emails && op.emails.length > 0 ? `<a href="mailto:${op.emails[0].email}" style="color:var(--primary-color);text-decoration:none;">${op.emails[0].email}</a>` : 'N/A'}</td>
                <td><span class="badge badge-${op.category}">${op.category || 'N/A'}</span></td>
                <td><span class="status-badge status-${op.status}">${op.status || 'new-request'}</span></td>
                <td><span class="priority-badge priority-${op.priority}">${op.priority || 'medium'}</span></td>
                <td>${op.assignedTo ? (op.assignedTo.fullName || op.assignedTo.email) : 'Unassigned'}</td>
                <td>${new Date(op.createdAt).toLocaleDateString()}</td>
                <td>
                    <button class="btn-icon" onclick="viewOperation('${op._id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${!isStaff ? `<button class="btn-icon" onclick="editOperation('${op._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>` : ''}
                    ${!isStaff ? `<button class="btn-icon" onclick="deleteOperation('${op._id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </td>
            </tr>
        `).join('');
}

function filterOperations(status) {
    currentOperationsFilter = status;

    // Update active filter button
    document.querySelectorAll('.operation-filters .filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('.filter-btn').classList.add('active');

    // Filter operations
    let filtered = allOperations;
    if (status !== 'all') {
        filtered = allOperations.filter(op => op.status === status);
    }

    renderOperationsTable(filtered);
}

async function loadOperationsPipeline() {
    try {
        const response = await fetch(`${API_BASE}/operations-leads`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Failed to load operations for pipeline');

        const operations = await response.json();

        // Use customizable operations pipeline stages
        const stages = currentOperationsPipeline.columns.sort((a, b) => a.order - b.order);

        const kanban = document.getElementById('operationsPipelineKanban');
        kanban.innerHTML = stages.map(stage => {
            const stageOps = operations.filter(op => op.status === stage.id);
            return `
                <div class="kanban-column">
                    <div class="kanban-header" style="background: ${stage.color};">
                        <h3>${stage.name}</h3>
                        <span class="kanban-count">${stageOps.length}</span>
                    </div>
                    <div class="kanban-body" data-status="${stage.id}">
                        ${stageOps.map(op => `
                            <div class="kanban-card" draggable="true" data-id="${op._id}">
                                <div class="kanban-card-header">
                                    <strong>${op.ticketNumber}</strong>
                                    <span class="priority-badge priority-${op.priority}">${op.priority}</span>
                                </div>
                                <div class="kanban-card-content">
                                    <p><strong>${op.clientName}</strong></p>
                                    <p class="text-muted">${op.company}</p>
                                    <p class="text-muted">${op.category}</p>
                                </div>
                                <div class="kanban-card-footer">
                                    <span><i class="fas fa-user"></i> ${op.assignedTo ? op.assignedTo.fullName : 'Unassigned'}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading operations pipeline:', error);
        showNotification('Failed to load operations pipeline', 'error');
    }
}

async function openAddOperationModal() {
    document.getElementById('addOperationModal').classList.add('active');
    document.getElementById('addOperationForm').reset();

    // Load team members for assignment
    await loadOperationsTeamMembers();
}

function closeAddOperationModal() {
    document.getElementById('addOperationModal').classList.remove('active');
}

async function loadOperationsTeamMembers() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const users = await response.json();
            const operationsUsers = users.filter(u => u.department === 'operations' && u.isActive);

            const assignSelects = ['operationAssignedTo', 'editOperationAssignedTo'];
            assignSelects.forEach(selectId => {
                const select = document.getElementById(selectId);
                if (select) {
                    select.innerHTML = '<option value="">Unassigned</option>' +
                        operationsUsers.map(u => `<option value="${u._id}">${u.fullName || u.email}</option>`).join('');
                }
            });
        }
    } catch (error) {
        console.error('Error loading team members:', error);
    }
}

async function loadSalesTeamMembers() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const users = await response.json();
            let salesUsers = [];

            // Filter based on current user's role and department
            if (currentUser.role === 'superadmin') {
                salesUsers = users.filter(u => u.isActive);
            } else if (currentUser.role === 'admin') {
                // Admin can assign to users in their department
                salesUsers = users.filter(u =>
                    u.isActive && u.department === currentUser.department
                );
            } else if (currentUser.role === 'manager') {
                // Manager can assign to their team members (staff with this manager) and themselves
                salesUsers = users.filter(u => {
                    if (!u.isActive) return false;
                    // Include self
                    if (u._id === currentUser._id) return true;
                    // Include staff members who have this manager as their managerId
                    const userManagerId = u.managerId?._id || u.managerId;
                    if (userManagerId && userManagerId.toString() === currentUser._id.toString()) return true;
                    return false;
                });
            } else {
                // Staff can only see themselves and their manager
                salesUsers = users.filter(u =>
                    u.isActive &&
                    (u._id === currentUser._id || u._id === currentUser.managerId)
                );
            }

            const assignSelects = ['leadAssignedTo', 'editLeadAssignedTo'];
            assignSelects.forEach(selectId => {
                const select = document.getElementById(selectId);
                if (select) {
                    select.innerHTML = '<option value="">Unassigned</option>' +
                        salesUsers.map(u => `<option value="${u._id}">${u.fullName || u.email}</option>`).join('');
                }
            });
        }
    } catch (error) {
        console.error('Error loading sales team members:', error);
    }
}

async function loadTaskTeamMembers() {
    try {
        const response = await fetch(`${API_BASE}/users/for-assignment`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const users = await response.json();
        console.log('Loaded users for task assignment:', users, 'Current user:', currentUser);
        let taskUsers = [];

        // Filter based on current user's role
        if (currentUser.role === 'superadmin') {
            // SuperAdmin can assign to all active users
            taskUsers = users.filter(u => u.isActive);
        } else if (currentUser.role === 'admin') {
            // Admin can assign to department users and superadmins
            taskUsers = users.filter(u =>
                u.isActive && (u.department === currentUser.department || u.role === 'superadmin')
            );
        } else if (currentUser.role === 'manager') {
            // Manager can assign to:
            // 1. Their team members (staff with managerId === manager's _id)
            // 2. Themselves
            // 3. Other staff from same department
            // 4. Admins and superadmins in their department
            const managerId = currentUser._id.toString();
            taskUsers = users.filter(u => {
                if (!u.isActive) return false;

                // Self
                if (u._id === currentUser._id || u._id.toString() === managerId) return true;

                // Team members (staff with managerId === this manager)
                if (u.managerId && (u.managerId === currentUser._id || u.managerId.toString() === managerId)) return true;

                // Other staff from same department
                if (u.role === 'staff' && u.department === currentUser.department) return true;

                // Admins and superadmins
                if (u.role === 'superadmin' || u.role === 'admin') return true;

                return false;
            });
        } else {
            // Staff can assign to themselves, their manager, or superiors
            const staffId = currentUser._id.toString();
            const managerId = currentUser.managerId ? currentUser.managerId.toString() : null;

            taskUsers = users.filter(u => {
                if (!u.isActive) return false;
                const userId = u._id.toString();

                // Self - check both ways
                if (userId === staffId) return true;

                // Their manager
                if (managerId && userId === managerId) return true;

                // Superiors (admin, superadmin)
                if (u.role === 'superadmin' || u.role === 'admin') return true;

                return false;
            });
        }

        console.log('Filtered task users:', taskUsers);

        const assignSelects = ['taskAssignedTo', 'editTaskAssignedTo'];
        assignSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                if (taskUsers.length > 0) {
                    select.innerHTML = '<option value="">Unassigned</option>' +
                        taskUsers.map(u => `<option value="${u._id}">${u.fullName || u.email}</option>`).join('');
                } else {
                    select.innerHTML = '<option value="">No users available</option>';
                }
            }
        });
    } catch (error) {
        console.error('Error loading task team members:', error);
        const assignSelects = ['taskAssignedTo', 'editTaskAssignedTo'];
        assignSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">Error loading users</option>';
            }
        });
    }
}

async function loadTaskLeads() {
    try {
        const response = await fetch(`${API_BASE}/leads`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const leads = await response.json();
        console.log('Loaded leads for task:', leads);
        const leadSelect = document.getElementById('taskLead');
        if (leadSelect) {
            if (leads.length > 0) {
                leadSelect.innerHTML = '<option value="">Select Lead</option>' +
                    leads.map(l => {
                        const assignedToId = l.assignedTo ? (typeof l.assignedTo === 'object' ? l.assignedTo._id : l.assignedTo) : '';
                        return `<option value="${l._id}" data-assigned-to="${assignedToId}">${l.companyName} - ${l.contactPerson}</option>`;
                    }).join('');
            } else {
                leadSelect.innerHTML = '<option value="">No leads available</option>';
            }

            // Add change listener to auto-select the lead's assigned user
            leadSelect.addEventListener('change', async function () {
                const selectedOption = this.options[this.selectedIndex];
                if (selectedOption.dataset.assignedTo) {
                    const assignedToField = document.getElementById('taskAssignedTo');
                    if (assignedToField) {
                        assignedToField.value = selectedOption.dataset.assignedTo;
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error loading task leads:', error);
        const leadSelect = document.getElementById('taskLead');
        if (leadSelect) {
            leadSelect.innerHTML = '<option value="">Error loading leads</option>';
        }
    }
}

async function loadOperationsManagers() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const users = await response.json();
            const operationsManagers = users.filter(u =>
                u.department === 'operations' &&
                (u.role === 'manager' || u.role === 'admin' || u.role === 'superadmin') &&
                u.isActive
            );

            const select = document.getElementById('editLeadOperationsManager');
            if (select) {
                select.innerHTML = '<option value="">Select Operations Manager</option>' +
                    operationsManagers.map(u => `<option value="${u._id}">${u.fullName || u.email}</option>`).join('');
            }
        }
    } catch (error) {
        console.error('Error loading operations managers:', error);
    }
}

async function handleAddOperation(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const operationData = {
        clientName: formData.get('clientName'),
        company: formData.get('company'),
        emails: [{ email: formData.get('email'), type: 'primary' }],
        phones: formData.get('phone') ? [{ phone: formData.get('phone'), type: 'mobile' }] : [],
        category: formData.get('category'),
        priority: formData.get('priority'),
        status: formData.get('status') || 'new-request',
        source: formData.get('source') || 'phone',
        description: formData.get('description'),
        estimatedTime: parseFloat(formData.get('estimatedTime')) || 0,
        assignedTo: formData.get('assignedTo') || null
    };

    try {
        const response = await fetch(`${API_BASE}/operations-leads`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(operationData)
        });

        if (response.ok) {
            showNotification('Operation ticket created successfully', 'success');
            closeAddOperationModal();
            loadOperations();
            if (currentSection === 'operations-pipeline') {
                loadOperationsPipeline();
            }
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to create ticket', 'error');
        }
    } catch (error) {
        console.error('Error creating operation:', error);
        showNotification('Error creating ticket: ' + error.message, 'error');
    }
}

async function viewOperation(id) {
    try {
        const response = await fetch(`${API_BASE}/operations-leads/${id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Failed to load operation');

        const op = await response.json();
        const content = document.getElementById('viewOperationContent');

        content.innerHTML = `
            <div class="detail-grid">
                <div class="detail-item">
                    <label>Ticket Number:</label>
                    <span class="badge badge-info">${op.ticketNumber}</span>
                </div>
                <div class="detail-item">
                    <label>Status:</label>
                    <span class="status-badge status-${op.status}">${op.status}</span>
                </div>
                <div class="detail-item">
                    <label>Priority:</label>
                    <span class="priority-badge priority-${op.priority}">${op.priority}</span>
                </div>
                <div class="detail-item">
                    <label>Category:</label>
                    <span class="badge badge-${op.category}">${op.category}</span>
                </div>
                <div class="detail-item">
                    <label>Client Name:</label>
                    <span>${op.clientName}</span>
                </div>
                <div class="detail-item">
                    <label>Company:</label>
                    <span>${op.company}</span>
                </div>
                <div class="detail-item">
                    <label>Email:</label>
                    <span>${op.emails && op.emails.length > 0 ? `<a href="mailto:${op.emails[0].email}" style="color:var(--primary-color);text-decoration:none;">${op.emails[0].email}</a>` : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <label>Phone:</label>
                    <span>${op.phones && op.phones.length > 0 ? op.phones[0].phone : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <label>Source:</label>
                    <span>${op.source || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <label>Assigned To:</label>
                    <span>${op.assignedTo ? (op.assignedTo.fullName || op.assignedTo.email) : 'Unassigned'}</span>
                </div>
                <div class="detail-item">
                    <label>Estimated Time:</label>
                    <span>${op.estimatedTime || 0} hours</span>
                </div>
                <div class="detail-item">
                    <label>Actual Time:</label>
                    <span>${op.actualTime || 0} hours</span>
                </div>
                <div class="detail-item full-width">
                    <label>Description:</label>
                    <p>${op.description || 'No description'}</p>
                </div>
                <div class="detail-item full-width">
                    <label>Resolution:</label>
                    <p>${op.resolution || 'Not yet resolved'}</p>
                </div>
                <div class="detail-item">
                    <label>Created:</label>
                    <span>${new Date(op.createdAt).toLocaleString()}</span>
                </div>
                <div class="detail-item">
                    <label>Updated:</label>
                    <span>${new Date(op.updatedAt).toLocaleString()}</span>
                </div>
                ${op.closedAt ? `
                <div class="detail-item">
                    <label>Closed:</label>
                    <span>${new Date(op.closedAt).toLocaleString()}</span>
                </div>
                ` : ''}
            </div>
        `;

        currentViewOperationId = id;
        document.getElementById('viewOperationModal').classList.add('active');
    } catch (error) {
        console.error('Error loading operation:', error);
        showNotification('Failed to load operation details', 'error');
    }
}

function closeViewOperationModal() {
    document.getElementById('viewOperationModal').classList.remove('active');
    currentViewOperationId = null;
}

function editOperationFromView() {
    if (currentViewOperationId) {
        closeViewOperationModal();
        editOperation(currentViewOperationId);
    }
}

async function editOperation(id) {
    try {
        const response = await fetch(`${API_BASE}/operations-leads/${id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Failed to load operation');

        const op = await response.json();

        // Load team members first
        await loadOperationsTeamMembers();

        // Fill form
        document.getElementById('editOperationId').value = op._id;
        document.getElementById('editOperationTicket').value = op.ticketNumber;
        document.getElementById('editOperationClientName').value = op.clientName;
        document.getElementById('editOperationCompany').value = op.company;
        document.getElementById('editOperationEmail').value = op.emails && op.emails.length > 0 ? op.emails[0].email : '';
        document.getElementById('editOperationPhone').value = op.phones && op.phones.length > 0 ? op.phones[0].phone : '';
        document.getElementById('editOperationCategory').value = op.category;
        document.getElementById('editOperationPriority').value = op.priority;
        document.getElementById('editOperationStatus').value = op.status;
        document.getElementById('editOperationEstimatedTime').value = op.estimatedTime || 0;
        document.getElementById('editOperationActualTime').value = op.actualTime || 0;
        document.getElementById('editOperationDescription').value = op.description || '';
        document.getElementById('editOperationResolution').value = op.resolution || '';
        document.getElementById('editOperationAssignedTo').value = op.assignedTo ? op.assignedTo._id : '';

        document.getElementById('editOperationModal').classList.add('active');
    } catch (error) {
        console.error('Error loading operation for edit:', error);
        showNotification('Failed to load operation', 'error');
    }
}

function closeEditOperationModal() {
    document.getElementById('editOperationModal').classList.remove('active');
}

async function handleEditOperation(e) {
    e.preventDefault();

    const id = document.getElementById('editOperationId').value;
    const formData = new FormData(e.target);

    const operationData = {
        clientName: formData.get('clientName'),
        company: formData.get('company'),
        emails: [{ email: formData.get('email'), type: 'primary' }],
        phones: formData.get('phone') ? [{ phone: formData.get('phone'), type: 'mobile' }] : [],
        category: formData.get('category'),
        priority: formData.get('priority'),
        status: formData.get('status'),
        description: formData.get('description'),
        resolution: formData.get('resolution'),
        estimatedTime: parseFloat(formData.get('estimatedTime')) || 0,
        actualTime: parseFloat(formData.get('actualTime')) || 0,
        assignedTo: formData.get('assignedTo') || null
    };

    try {
        const response = await fetch(`${API_BASE}/operations-leads/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(operationData)
        });

        if (response.ok) {
            showNotification('Operation ticket updated successfully', 'success');
            closeEditOperationModal();
            loadOperations();
            if (currentSection === 'operations-pipeline') {
                loadOperationsPipeline();
            }
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to update ticket', 'error');
        }
    } catch (error) {
        console.error('Error updating operation:', error);
        showNotification('Error updating ticket: ' + error.message, 'error');
    }
}

function openOperationsFilters() {
    showNotification('Operations filters - Coming soon', 'info');
}

// Operations Pipeline Settings
let currentOperationsPipeline = (function () {
    // Try to load saved configuration from localStorage
    const saved = localStorage.getItem('operationsPipelineConfig');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('Error loading saved pipeline config:', e);
        }
    }
    // Return default configuration
    return {
        columns: [
            { id: 'new-request', name: 'New Request', color: '#667eea', order: 1 },
            { id: 'in-progress', name: 'In Progress', color: '#f59e0b', order: 2 },
            { id: 'pending-parts', name: 'Pending Parts', color: '#ef4444', order: 3 },
            { id: 'completed', name: 'Completed', color: '#10b981', order: 4 },
            { id: 'closed', name: 'Closed', color: '#6b7280', order: 5 }
        ]
    };
})();

function openOperationsPipelineSettings() {
    loadOperationsPipelineStagesList();
    document.getElementById('operationsPipelineSettingsModal').classList.add('active');
}

function closeOperationsPipelineSettings() {
    document.getElementById('operationsPipelineSettingsModal').classList.remove('active');
}

function loadOperationsPipelineStagesList() {
    const container = document.getElementById('operationsPipelineStagesList');
    const sortedColumns = currentOperationsPipeline.columns.sort((a, b) => a.order - b.order);

    container.innerHTML = sortedColumns.map((col, index) => `
        <div class="pipeline-stage-item" data-index="${index}">
            <div class="stage-color" style="background-color: ${col.color}"></div>
            <div class="stage-info">
                <h4>${col.name}</h4>
                <small>ID: ${col.id} | Order: ${col.order}</small>
            </div>
            <div class="stage-actions">
                <button class="btn-icon" onclick="moveOperationsStage(${index}, -1)" ${index === 0 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-up"></i>
                </button>
                <button class="btn-icon" onclick="moveOperationsStage(${index}, 1)" ${index === sortedColumns.length - 1 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-down"></i>
                </button>
                <button class="btn-icon" onclick="editOperationsStage(${index})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-danger" onclick="deleteOperationsStage(${index})" ${currentOperationsPipeline.columns.length <= 2 ? 'disabled' : ''}>
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function addOperationsStage() {
    const name = prompt('Enter stage name:');
    if (!name) return;

    const id = name.toLowerCase().replace(/\s+/g, '-');
    const newStage = {
        id: id,
        name: name,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        order: currentOperationsPipeline.columns.length + 1
    };

    currentOperationsPipeline.columns.push(newStage);
    loadOperationsPipelineStagesList();
}

function moveOperationsStage(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= currentOperationsPipeline.columns.length) return;

    const temp = currentOperationsPipeline.columns[index];
    currentOperationsPipeline.columns[index] = currentOperationsPipeline.columns[newIndex];
    currentOperationsPipeline.columns[newIndex] = temp;

    currentOperationsPipeline.columns.forEach((col, idx) => col.order = idx + 1);
    loadOperationsPipelineStagesList();
}

function editOperationsStage(index) {
    const stage = currentOperationsPipeline.columns[index];
    const newName = prompt('Enter new name:', stage.name);
    if (newName && newName !== stage.name) {
        stage.name = newName;
        loadOperationsPipelineStagesList();
    }
}

function deleteOperationsStage(index) {
    if (currentOperationsPipeline.columns.length <= 2) {
        showNotification('Cannot delete - minimum 2 stages required', 'error');
        return;
    }

    if (confirm('Delete this stage? Operations tickets in this stage will be moved to the first stage.')) {
        currentOperationsPipeline.columns.splice(index, 1);
        currentOperationsPipeline.columns.forEach((col, idx) => col.order = idx + 1);
        loadOperationsPipelineStagesList();
    }
}

async function saveOperationsPipelineSettings() {
    try {
        // Save to localStorage for persistence
        localStorage.setItem('operationsPipelineConfig', JSON.stringify(currentOperationsPipeline));

        showNotification('Operations pipeline settings saved successfully!', 'success');
        closeOperationsPipelineSettings();

        // Reload the pipeline with updated stages
        await loadOperationsPipeline();
    } catch (error) {
        console.error('Error saving operations pipeline settings:', error);
        showNotification('Error saving pipeline settings', 'error');
    }
}

async function deleteOperation(id) {
    if (!confirm('Are you sure you want to delete this operation ticket?')) return;

    try {
        const response = await fetch(`${API_BASE}/operations-leads/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            showNotification('Operation ticket deleted successfully', 'success');
            loadOperations();
            if (currentSection === 'operations-pipeline') {
                loadOperationsPipeline();
            }
        } else {
            throw new Error('Failed to delete operation');
        }
    } catch (error) {
        showNotification('Error deleting operation: ' + error.message, 'error');
    }
}

// Email Configuration Functions
async function loadEmailConfig() {
    try {
        const response = await fetch(`${API_BASE}/email/config`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const config = await response.json();
            document.getElementById('outlookEmail').value = config.outlookEmail || '';

            if (config.isConfigured) {
                const statusDiv = document.getElementById('emailConfigStatus');
                const statusText = document.getElementById('emailStatusText');
                statusDiv.style.display = 'block';
                statusDiv.className = 'alert alert-success';
                statusText.innerHTML = `Email configured: <strong>${config.outlookEmail}</strong> 
                    <br><small>Last verified: ${new Date(config.lastVerified).toLocaleString()}</small>`;
            }
        }
    } catch (error) {
        console.error('Error loading email config:', error);
    }
}

async function saveEmailConfig(event) {
    event.preventDefault();

    const outlookEmail = document.getElementById('outlookEmail').value;
    const outlookPassword = document.getElementById('outlookPassword').value;

    if (!outlookEmail || !outlookPassword) {
        showNotification('Please enter both email and password', 'error');
        return;
    }

    try {
        showNotification('Verifying email configuration...', 'info');

        const response = await fetch(`${API_BASE}/email/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ outlookEmail, outlookPassword })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('Email configuration saved and verified successfully!', 'success');

            // Update status display
            const statusDiv = document.getElementById('emailConfigStatus');
            const statusText = document.getElementById('emailStatusText');
            statusDiv.style.display = 'block';
            statusDiv.className = 'alert alert-success';
            statusText.innerHTML = `Email configured: <strong>${data.outlookEmail}</strong> 
                <br><small>Last verified: ${new Date(data.lastVerified).toLocaleString()}</small>`;

            // Clear password field for security
            document.getElementById('outlookPassword').value = '';
        } else {
            showNotification('Email verification failed: ' + data.message, 'error');
        }
    } catch (error) {
        showNotification('Error saving email config: ' + error.message, 'error');
    }
}

async function testEmailConfig() {
    try {
        showNotification('Sending test email...', 'info');

        const response = await fetch(`${API_BASE}/email/test`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('Test email sent! Check your inbox.', 'success');
        } else {
            showNotification('Failed to send test email: ' + data.message, 'error');
        }
    } catch (error) {
        showNotification('Error sending test email: ' + error.message, 'error');
    }
}

async function removeEmailConfig() {
    if (!confirm('Are you sure you want to remove your email configuration? You will not be able to send emails until you configure it again.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/email/config`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            showNotification('Email configuration removed', 'success');

            // Clear form
            document.getElementById('outlookEmail').value = '';
            document.getElementById('outlookPassword').value = '';

            // Hide status
            document.getElementById('emailConfigStatus').style.display = 'none';
        } else {
            showNotification('Failed to remove email configuration', 'error');
        }
    } catch (error) {
        showNotification('Error removing email config: ' + error.message, 'error');
    }
}

// ════════════════════════════════════════════════════════════
//  INVOICE MODULE
// ════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────
function fmtINR(n) {
    if (n == null || isNaN(n)) return '₹0.00';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtD(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function statusBadge(s) {
    const colors = { paid: '#2e7d32', unpaid: '#ef6c00', overdue: '#c62828', partial: '#1565c0' };
    const bg = { paid: '#e6f4ea', unpaid: '#fff3e0', overdue: '#fce8e8', partial: '#e3f2fd' };
    return `<span style="background:${bg[s]||'#eee'};color:${colors[s]||'#333'};padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;text-transform:capitalize;">${s}</span>`;
}

// ── Tab switching ─────────────────────────────────────────────
function showInvoiceTab(tab) {
    const isList = tab === 'list';
    const isCustomers = tab === 'customers';
    const isCompanies = tab === 'companies';
    document.getElementById('invoiceListTab').style.display = isList ? '' : 'none';
    document.getElementById('invoiceCustomersTab').style.display = isCustomers ? '' : 'none';
    document.getElementById('invoiceCompaniesTab').style.display = isCompanies ? '' : 'none';

    const btnList = document.getElementById('invTabBtnInvoices');
    const btnCust = document.getElementById('invTabBtnCustomers');
    const btnComp = document.getElementById('invTabBtnCompanies');
    const activeStyle = 'padding:8px 20px;border:none;background:none;font-weight:bold;color:#003087;border-bottom:3px solid #003087;cursor:pointer;';
    const inactiveStyle = 'padding:8px 20px;border:none;background:none;color:#666;cursor:pointer;';
    if (btnList) btnList.style.cssText = isList ? activeStyle : inactiveStyle;
    if (btnCust) btnCust.style.cssText = isCustomers ? activeStyle : inactiveStyle;
    if (btnComp) btnComp.style.cssText = isCompanies ? activeStyle : inactiveStyle;

    if (isCustomers) loadInvoiceCustomers();
    if (isCompanies) loadBillingCompanies();
}

// ── Stats ─────────────────────────────────────────────────────
async function loadInvoiceStats() {
    try {
        const res = await fetch(`${API_BASE}/invoices/stats`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) return;
        const d = await res.json();
        const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        el('invStatTotal', d.total);
        el('invStatPaid', d.paid);
        el('invStatUnpaid', d.unpaid);
        el('invStatOverdue', d.overdue);
        el('invStatValue', fmtINR(d.totalValue));
    } catch (e) { console.error(e); }
}

// ── Load Invoices ─────────────────────────────────────────────
async function loadInvoices() {
    const tbody = document.getElementById('invoiceTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;">Loading...</td></tr>';

    try {
        const search = document.getElementById('invSearch')?.value || '';
        const status = document.getElementById('invFilterStatus')?.value || '';
        const from = document.getElementById('invFilterFrom')?.value || '';
        const to = document.getElementById('invFilterTo')?.value || '';

        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (status) params.set('status', status);
        if (from) params.set('from', from);
        if (to) params.set('to', to);

        const res = await fetch(`${API_BASE}/invoices?${params}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error('Failed to load invoices');
        const invoices = await res.json();

        if (invoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:#999;">No invoices found. Click <strong>New Invoice</strong> to create one.</td></tr>';
            return;
        }

        tbody.innerHTML = invoices.map(inv => {
            const custName = inv.customerSnapshot?.name || inv.customer?.name || '—';
            const candCount = (inv.candidates || []).length;
            return `
            <tr>
                <td><strong>${inv.invoiceNumber}</strong></td>
                <td>${fmtD(inv.invoiceDate)}</td>
                <td>${custName}</td>
                <td>${candCount ? candCount + ' candidate' + (candCount > 1 ? 's' : '') : '—'}</td>
                <td style="text-align:right;">${fmtINR(inv.chargeableAmount)}</td>
                <td style="text-align:right;font-weight:600;">${fmtINR(inv.netPayable)}</td>
                <td>${fmtD(inv.dueDate)}</td>
                <td>${statusBadge(inv.paymentStatus)}</td>
                <td style="white-space:nowrap;">
                    <button class="btn btn-sm btn-secondary" onclick="viewInvoice('${inv._id}')" title="View"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-primary" onclick="openEditInvoiceModal('${inv._id}')" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-success" onclick="downloadInvoicePDF('${inv._id}', '${inv.invoiceNumber}')" title="PDF"><i class="fas fa-file-pdf"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteInvoice('${inv._id}')" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:red;">${e.message}</td></tr>`;
    }
}

function clearInvoiceFilters() {
    ['invSearch', 'invFilterStatus', 'invFilterFrom', 'invFilterTo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    loadInvoices();
}

// ── Customer dropdown (for form) ──────────────────────────────
async function loadInvoiceCustomerDropdown() {
    try {
        const res = await fetch(`${API_BASE}/invoices/customers`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) return;
        const customers = await res.json();
        const sel = document.getElementById('invCustomer');
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">Select Customer</option>' +
            customers.map(c => `<option value="${c._id}">${c.customerId} – ${c.name}</option>`).join('');
        if (cur) sel.value = cur;
    } catch (e) { /* ignore */ }
}

// ── Create/Edit Invoice Modal ─────────────────────────────────
function openCreateInvoiceModal() {
    const modal = document.getElementById('invoiceModal');
    const titleEl = document.getElementById('invoiceModalTitle');
    if (!modal || !titleEl) {
        showNotification('Invoice modal not found. Please refresh the page.', 'error');
        return;
    }
    titleEl.textContent = 'New Invoice';
    document.getElementById('invoiceEditId').value = '';
    document.getElementById('invoiceForm').reset();
    document.getElementById('invDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('candidateRowsContainer').innerHTML = '';
    document.getElementById('invCalcPreview').style.display = 'none';
    loadInvoiceCustomerDropdown();
    loadBillingCompanyDropdown();
    modal.style.display = 'flex';
}

async function openEditInvoiceModal(id) {
    // Open modal immediately with a loading state
    const modal = document.getElementById('invoiceModal');
    const titleEl = document.getElementById('invoiceModalTitle');
    if (!modal || !titleEl) {
        showNotification('Invoice modal not found. Please refresh the page.', 'error');
        return;
    }

    titleEl.textContent = 'Edit Invoice';
    document.getElementById('invoiceEditId').value = '';
    document.getElementById('invoiceForm').reset();
    document.getElementById('candidateRowsContainer').innerHTML =
        '<div style="text-align:center;padding:16px;color:#999;font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Loading invoice data...</div>';
    document.getElementById('invCalcPreview').style.display = 'none';
    modal.style.display = 'flex';

    try {
        const res = await fetch(`${API_BASE}/invoices/${id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error('Failed to load invoice');
        const inv = await res.json();

        const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ''; };

        setVal('invoiceEditId', inv._id);
        setVal('invNo', inv.invoiceNumber);
        setVal('invDate', inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split('T')[0] : '');
        setVal('invDeptCode', inv.deptCode || 'NA');
        setVal('invPoId', inv.poId);
        setVal('invServiceType', inv.serviceType || 'sourcing');
        setVal('invSalary', inv.chargeableSalary);
        setVal('invRate', inv.rate);
        setVal('invPayStatus', inv.paymentStatus || 'unpaid');
        setVal('invReceivable', inv.receivableAmount);
        setVal('invTds', inv.tdsAmount);
        setVal('invReceivedDate', inv.receivedDate ? new Date(inv.receivedDate).toISOString().split('T')[0] : '');
        setVal('invNotes', inv.notes);

        await loadInvoiceCustomerDropdown();
        await loadBillingCompanyDropdown(inv.billingCompany?._id || inv.billingCompany);
        if (inv.customer) {
            const customerId = inv.customer._id || inv.customer;
            setVal('invCustomer', customerId);
        }

        // Populate candidates
        const container = document.getElementById('candidateRowsContainer');
        container.innerHTML = '';
        (inv.candidates || []).forEach(c => addCandidateRow(c));
        if ((inv.candidates || []).length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:12px;color:#aaa;font-size:13px;">No candidates added yet.</div>';
        }

        recalcInvoice();
    } catch (e) {
        showNotification('Error loading invoice: ' + e.message, 'error');
        modal.style.display = 'none';
    }
}

function closeInvoiceModal() {
    document.getElementById('invoiceModal').style.display = 'none';
}

async function handleSaveInvoice(e) {
    e.preventDefault();
    const id = document.getElementById('invoiceEditId').value;

    // Collect candidates
    const candRows = document.querySelectorAll('#candidateRowsContainer .candidate-row');
    const candidates = Array.from(candRows).map(row => ({
        name: row.querySelector('.cand-name').value,
        designation: row.querySelector('.cand-desig').value,
        level: row.querySelector('.cand-level').value,
        dateOfJoining: row.querySelector('.cand-doj').value || null
    }));

    const payload = {
        invoiceNumber: document.getElementById('invNo').value.trim(),
        invoiceDate: document.getElementById('invDate').value,
        billingCompanyId: document.getElementById('invBillingCompany').value,
        customerId: document.getElementById('invCustomer').value,
        deptCode: document.getElementById('invDeptCode').value,
        poId: document.getElementById('invPoId').value,
        serviceType: document.getElementById('invServiceType').value,
        chargeableSalary: parseFloat(document.getElementById('invSalary').value),
        rate: parseFloat(document.getElementById('invRate').value),
        candidates,
        paymentStatus: document.getElementById('invPayStatus').value,
        receivableAmount: parseFloat(document.getElementById('invReceivable').value) || 0,
        tdsAmount: parseFloat(document.getElementById('invTds').value) || 0,
        receivedDate: document.getElementById('invReceivedDate').value || null,
        notes: document.getElementById('invNotes').value
    };

    const url = id ? `${API_BASE}/invoices/${id}` : `${API_BASE}/invoices`;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to save');
        showNotification(id ? 'Invoice updated!' : 'Invoice created!', 'success');
        closeInvoiceModal();
        loadInvoices();
        loadInvoiceStats();
    } catch (e) {
        showNotification('Error: ' + e.message, 'error');
    }
}

async function deleteInvoice(id) {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    try {
        const res = await fetch(`${API_BASE}/invoices/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        showNotification('Invoice deleted.', 'success');
        loadInvoices();
        loadInvoiceStats();
    } catch (e) {
        showNotification('Error: ' + e.message, 'error');
    }
}

// ── View Invoice ──────────────────────────────────────────────
async function viewInvoice(id) {
    try {
        const res = await fetch(`${API_BASE}/invoices/${id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error('Failed to load invoice');
        const inv = await res.json();
        const snap = inv.customerSnapshot || {};
        const isMH = (snap.gstNo || '').startsWith('27');

        document.getElementById('viewInvoiceContent').innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:12px 0;">
                <div>
                    <h4 style="color:#003087;border-bottom:2px solid #003087;padding-bottom:4px;">Customer</h4>
                    <p><strong>${snap.name || '—'}</strong></p>
                    <p style="color:#666;font-size:13px;">${snap.address || ''}</p>
                    <p>Tel: ${snap.contactNo || '—'} | Email: ${snap.email || '—'}</p>
                    <p>GSTN: ${snap.gstNo || '—'} | Vendor: ${snap.vendorCode || 'NA'}</p>
                </div>
                <div>
                    <h4 style="color:#003087;border-bottom:2px solid #003087;padding-bottom:4px;">Invoice Details</h4>
                    <p><strong>Invoice No:</strong> ${inv.invoiceNumber}</p>
                    <p><strong>Date:</strong> ${fmtD(inv.invoiceDate)}</p>
                    <p><strong>Due Date:</strong> ${fmtD(inv.dueDate)}</p>
                    <p><strong>Dept Code:</strong> ${inv.deptCode || 'NA'} | <strong>PO ID:</strong> ${inv.poId || '—'}</p>
                    <p><strong>Status:</strong> ${statusBadge(inv.paymentStatus)}</p>
                </div>
            </div>
            ${(inv.candidates || []).length ? `
            <h4 style="color:#003087;">Candidates</h4>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
                <thead><tr style="background:#003087;color:white;">
                    <th style="padding:6px;">#</th><th style="padding:6px;">Name</th>
                    <th style="padding:6px;">Designation</th><th style="padding:6px;">Level</th>
                    <th style="padding:6px;">Date of Joining</th>
                </tr></thead>
                <tbody>${inv.candidates.map((c, i) => `
                    <tr style="background:${i % 2 ? '#f9f9f9' : 'white'};">
                        <td style="padding:5px;text-align:center;">${i + 1}</td>
                        <td style="padding:5px;">${c.name || '—'}</td>
                        <td style="padding:5px;">${c.designation || '—'}</td>
                        <td style="padding:5px;">${c.level || '—'}</td>
                        <td style="padding:5px;">${fmtD(c.dateOfJoining)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>` : ''}
            <div style="display:flex;justify-content:flex-end;">
                <table style="font-size:13px;border-collapse:collapse;min-width:280px;">
                    <tr><td style="padding:4px 12px;color:#666;">Chargeable Salary</td><td style="padding:4px 12px;text-align:right;">${fmtINR(inv.chargeableSalary)}</td></tr>
                    <tr><td style="padding:4px 12px;color:#666;">Rate (${inv.rate}%)</td><td style="padding:4px 12px;text-align:right;">${fmtINR(inv.chargeableAmount)}</td></tr>
                    ${isMH ? `<tr><td style="padding:4px 12px;color:#666;">CGST @9%</td><td style="padding:4px 12px;text-align:right;">${fmtINR(inv.cgst)}</td></tr>
                    <tr><td style="padding:4px 12px;color:#666;">SGST @9%</td><td style="padding:4px 12px;text-align:right;">${fmtINR(inv.sgst)}</td></tr>`
                    : `<tr><td style="padding:4px 12px;color:#666;">IGST @18%</td><td style="padding:4px 12px;text-align:right;">${fmtINR(inv.igst)}</td></tr>`}
                    <tr style="background:#e8f0fe;"><td style="padding:6px 12px;font-weight:bold;color:#003087;">Net Payable</td><td style="padding:6px 12px;text-align:right;font-weight:bold;color:#003087;">${fmtINR(inv.netPayable)}</td></tr>
                </table>
            </div>
            ${inv.notes ? `<p style="margin-top:10px;color:#666;font-size:13px;"><em>Notes: ${inv.notes}</em></p>` : ''}`;

        document.getElementById('viewInvPdfBtn').onclick = () => downloadInvoicePDF(id, inv.invoiceNumber);
        document.getElementById('viewInvoiceModal').style.display = 'flex';
    } catch (e) {
        showNotification('Error: ' + e.message, 'error');
    }
}

function closeViewInvoiceModal() {
    document.getElementById('viewInvoiceModal').style.display = 'none';
}

// ── PDF Download ──────────────────────────────────────────────
function downloadInvoicePDF(id, invoiceNumber) {
    const link = document.createElement('a');
    link.href = `${API_BASE}/invoices/${id}/pdf`;
    link.setAttribute('download', `Invoice-${invoiceNumber || id}.pdf`);
    // Need to fetch with auth header
    fetch(`${API_BASE}/invoices/${id}/pdf`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
        .then(res => {
            if (!res.ok) throw new Error('PDF generation failed');
            return res.blob();
        })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Invoice-${invoiceNumber || id}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        })
        .catch(e => showNotification('PDF Error: ' + e.message, 'error'));
}

// ── Candidate Rows ────────────────────────────────────────────
function addCandidateRow(data = {}) {
    const container = document.getElementById('candidateRowsContainer');
    const idx = container.children.length + 1;
    const div = document.createElement('div');
    div.className = 'candidate-row';
    div.style.cssText = `
        background:#f8faff;
        border:1px solid #d0d9f0;
        border-left:4px solid #003087;
        border-radius:8px;
        padding:12px 14px;
        margin-bottom:10px;
        position:relative;
    `;
    div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:12px;font-weight:700;color:#003087;letter-spacing:0.5px;">CANDIDATE #${idx}</span>
            <button type="button" onclick="this.closest('.candidate-row').remove();_renumberCandidates();"
                style="background:none;border:1px solid #e74c3c;border-radius:6px;color:#e74c3c;padding:2px 8px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;transition:all 0.2s;"
                onmouseover="this.style.background='#e74c3c';this.style.color='white';"
                onmouseout="this.style.background='none';this.style.color='#e74c3c';">
                <i class="fas fa-trash-alt"></i> Remove
            </button>
        </div>
        <div style="display:grid;grid-template-columns:2fr 1.5fr 0.8fr 1.2fr;gap:10px;">
            <div>
                <label style="font-size:11px;color:#666;font-weight:600;display:block;margin-bottom:3px;">Full Name *</label>
                <input type="text" class="form-control cand-name" placeholder="e.g. Ravi Sharma" value="${data.name || ''}" style="font-size:13px;">
            </div>
            <div>
                <label style="font-size:11px;color:#666;font-weight:600;display:block;margin-bottom:3px;">Designation</label>
                <input type="text" class="form-control cand-desig" placeholder="e.g. Sr. Engineer" value="${data.designation || ''}" style="font-size:13px;">
            </div>
            <div>
                <label style="font-size:11px;color:#666;font-weight:600;display:block;margin-bottom:3px;">Level</label>
                <input type="text" class="form-control cand-level" placeholder="e.g. L3" value="${data.level || ''}" style="font-size:13px;">
            </div>
            <div>
                <label style="font-size:11px;color:#666;font-weight:600;display:block;margin-bottom:3px;">Date of Joining</label>
                <input type="date" class="form-control cand-doj" value="${data.dateOfJoining ? new Date(data.dateOfJoining).toISOString().split('T')[0] : ''}" style="font-size:13px;">
            </div>
        </div>`;
    container.appendChild(div);
}

function _renumberCandidates() {
    const rows = document.querySelectorAll('#candidateRowsContainer .candidate-row');
    rows.forEach((row, i) => {
        const label = row.querySelector('span');
        if (label) label.textContent = `CANDIDATE #${i + 1}`;
    });
}

// ── Live Recalculation ────────────────────────────────────────
function recalcInvoice() {
    const salary = parseFloat(document.getElementById('invSalary')?.value) || 0;
    const rate = parseFloat(document.getElementById('invRate')?.value) || 0;
    const gstNo = window._invoiceSelectedCustomerGST || '';
    const preview = document.getElementById('invCalcPreview');

    if (!salary || !rate) {
        if (preview) preview.style.display = 'none';
        return;
    }

    const chgAmt = Math.round(salary * (rate / 100) * 100) / 100;
    const isMH = gstNo.startsWith('27');
    const cgst = isMH ? Math.round(chgAmt * 0.09 * 100) / 100 : 0;
    const sgst = isMH ? Math.round(chgAmt * 0.09 * 100) / 100 : 0;
    const igst = !isMH ? Math.round(chgAmt * 0.18 * 100) / 100 : 0;
    const totalGst = cgst + sgst + igst;
    const net = Math.round(chgAmt + totalGst);

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('prevChargeAmt', fmtINR(chgAmt));
    setTxt('prevTaxLabel', `Tax (${isMH ? 'MH' : 'IGST'}): `);
    setTxt('prevTax', fmtINR(totalGst));
    setTxt('prevTotal', fmtINR(chgAmt + totalGst));
    setTxt('prevNet', fmtINR(net));
    if (preview) preview.style.display = '';
}

function onInvoiceCustomerChange() {
    // Store selected customer's GST for recalc
    const sel = document.getElementById('invCustomer');
    const selectedText = sel.options[sel.selectedIndex]?.text || '';
    // We need to fetch it — for now use a data attribute approach
    // The GSTN is not in the dropdown text, so we'll let the server handle it
    // But for live preview we can use a cached list
    if (window._invoiceCustomersCache) {
        const cust = window._invoiceCustomersCache.find(c => c._id === sel.value);
        window._invoiceSelectedCustomerGST = cust ? (cust.gstNo || '') : '';
    }
    recalcInvoice();
}

// ── Customers CRUD ────────────────────────────────────────────
async function loadInvoiceCustomers() {
    const tbody = document.getElementById('invoiceCustomersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Loading...</td></tr>';
    try {
        const res = await fetch(`${API_BASE}/invoices/customers`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error('Failed to load customers');
        const customers = await res.json();
        window._invoiceCustomersCache = customers;

        if (customers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#999;">No customers yet. Click <strong>Add Customer</strong>.</td></tr>';
            return;
        }
        tbody.innerHTML = customers.map(c => `
            <tr>
                <td><strong>${c.customerId}</strong></td>
                <td>${c.name}</td>
                <td style="font-size:12px;">${c.gstNo || '—'}</td>
                <td>${c.contactNo || '—'}</td>
                <td>${c.email || '—'}</td>
                <td>${c.vendorCode || 'NA'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="openEditCustomerModal('${c._id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCustomer('${c._id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:red;">${e.message}</td></tr>`;
    }
}

function openCreateCustomerModal() {
    document.getElementById('custModalTitle').textContent = 'Add Customer';
    document.getElementById('custEditId').value = '';
    document.getElementById('invoiceCustomerForm').reset();
    document.getElementById('custVendor').value = 'NA';
    document.getElementById('invoiceCustomerModal').style.display = 'flex';
}

function openEditCustomerModal(id) {
    const cust = (window._invoiceCustomersCache || []).find(c => c._id === id);
    if (!cust) { showNotification('Customer data not loaded', 'error'); return; }
    document.getElementById('custModalTitle').textContent = 'Edit Customer';
    document.getElementById('custEditId').value = cust._id;
    document.getElementById('custId').value = cust.customerId;
    document.getElementById('custName').value = cust.name;
    document.getElementById('custAddress').value = cust.address || '';
    document.getElementById('custContact').value = cust.contactNo || '';
    document.getElementById('custEmail').value = cust.email || '';
    document.getElementById('custGst').value = cust.gstNo || '';
    document.getElementById('custVendor').value = cust.vendorCode || 'NA';
    document.getElementById('invoiceCustomerModal').style.display = 'flex';
}

function closeCustomerModal() {
    document.getElementById('invoiceCustomerModal').style.display = 'none';
}

async function handleSaveCustomer(e) {
    e.preventDefault();
    const id = document.getElementById('custEditId').value;
    const payload = {
        customerId: document.getElementById('custId').value.trim().toUpperCase(),
        name: document.getElementById('custName').value.trim(),
        address: document.getElementById('custAddress').value.trim(),
        contactNo: document.getElementById('custContact').value.trim(),
        email: document.getElementById('custEmail').value.trim(),
        gstNo: document.getElementById('custGst').value.trim().toUpperCase(),
        vendorCode: document.getElementById('custVendor').value.trim() || 'NA'
    };
    const url = id ? `${API_BASE}/invoices/customers/${id}` : `${API_BASE}/invoices/customers`;
    const method = id ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to save');
        showNotification(id ? 'Customer updated!' : 'Customer added!', 'success');
        closeCustomerModal();
        loadInvoiceCustomers();
        loadInvoiceCustomerDropdown();
    } catch (e) {
        showNotification('Error: ' + e.message, 'error');
    }
}

async function deleteCustomer(id) {
    if (!confirm('Delete this customer? Only possible if no invoices exist for them.')) return;
    try {
        const res = await fetch(`${API_BASE}/invoices/customers/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        showNotification('Customer deleted.', 'success');
        loadInvoiceCustomers();
    } catch (e) {
        showNotification('Error: ' + e.message, 'error');
    }
}

// ════════════════════════════════════════════════════════════
//   BILLING COMPANIES (My Companies)
// ════════════════════════════════════════════════════════════

async function loadBillingCompanyDropdown(selectedId = null) {
    try {
        const res = await fetch(`${API_BASE}/invoices/billing-companies`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) return;
        const companies = await res.json();
        window._billingCompaniesCache = companies;
        const sel = document.getElementById('invBillingCompany');
        if (!sel) return;
        sel.innerHTML = '<option value="">Select Company</option>' +
            companies.map(c => `<option value="${c._id}"${c.isPrimary ? ' data-primary="1"' : ''}>${c.name}${c.isPrimary ? ' ★' : ''}</option>`).join('');
        // Select by ID if provided, else pick primary, else first
        if (selectedId) {
            sel.value = selectedId;
        } else {
            const primary = companies.find(c => c.isPrimary);
            if (primary) sel.value = primary._id;
            else if (companies.length) sel.value = companies[0]._id;
        }
    } catch (e) { /* ignore */ }
}

async function loadBillingCompanies() {
    const tbody = document.getElementById('invoiceCompaniesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Loading...</td></tr>';
    try {
        const res = await fetch(`${API_BASE}/invoices/billing-companies`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error('Failed to load companies');
        const companies = await res.json();
        window._billingCompaniesCache = companies;

        if (companies.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#999;">No companies yet. Click <strong>Add Company</strong>.</td></tr>';
            return;
        }
        tbody.innerHTML = companies.map(c => `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td style="font-size:12px;">${c.tagline || '—'}<br><span style="color:#999;">SAC: ${c.sacCode || '—'}</span></td>
                <td style="font-size:12px;">${c.panNumber || '—'}</td>
                <td style="font-size:12px;">${c.gstn || '—'}</td>
                <td style="font-size:12px;">${[c.bankName, c.branchName].filter(Boolean).join(', ') || '—'}</td>
                <td style="text-align:center;">${c.isPrimary ? '<span style="background:#003087;color:white;padding:2px 8px;border-radius:10px;font-size:11px;">Primary</span>' : ''}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="openEditBillingCompanyModal('${c._id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBillingCompany('${c._id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:red;">${e.message}</td></tr>`;
    }
}

function openCreateBillingCompanyModal() {
    document.getElementById('bcoModalTitle').textContent = 'Add Company';
    document.getElementById('bcoEditId').value = '';
    document.getElementById('billingCompanyForm').reset();
    document.getElementById('bcoTagline').value = 'Sourcing · Recruiting · Onboarding';
    document.getElementById('bcoSacCode').value = '998516';
    document.getElementById('billingCompanyModal').style.display = 'flex';
}

function openEditBillingCompanyModal(id) {
    const co = (window._billingCompaniesCache || []).find(c => c._id === id);
    if (!co) { showNotification('Company data not loaded', 'error'); return; }
    document.getElementById('bcoModalTitle').textContent = 'Edit Company';
    document.getElementById('bcoEditId').value = co._id;
    document.getElementById('bcoName').value = co.name || '';
    document.getElementById('bcoTagline').value = co.tagline || '';
    document.getElementById('bcoSacCode').value = co.sacCode || '';
    document.getElementById('bcoPan').value = co.panNumber || '';
    document.getElementById('bcoAccountName').value = co.accountName || '';
    document.getElementById('bcoBankName').value = co.bankName || '';
    document.getElementById('bcoBranchName').value = co.branchName || '';
    document.getElementById('bcoCaNumber').value = co.caNumber || '';
    document.getElementById('bcoGstn').value = co.gstn || '';
    document.getElementById('bcoIsPrimary').checked = !!co.isPrimary;
    document.getElementById('billingCompanyModal').style.display = 'flex';
}

function closeBillingCompanyModal() {
    document.getElementById('billingCompanyModal').style.display = 'none';
}

async function handleSaveBillingCompany(e) {
    e.preventDefault();
    const id = document.getElementById('bcoEditId').value;
    const payload = {
        name: document.getElementById('bcoName').value.trim(),
        tagline: document.getElementById('bcoTagline').value.trim(),
        sacCode: document.getElementById('bcoSacCode').value.trim(),
        panNumber: document.getElementById('bcoPan').value.trim().toUpperCase(),
        accountName: document.getElementById('bcoAccountName').value.trim(),
        bankName: document.getElementById('bcoBankName').value.trim(),
        branchName: document.getElementById('bcoBranchName').value.trim(),
        caNumber: document.getElementById('bcoCaNumber').value.trim(),
        gstn: document.getElementById('bcoGstn').value.trim().toUpperCase(),
        isPrimary: document.getElementById('bcoIsPrimary').checked
    };
    const url = id ? `${API_BASE}/invoices/billing-companies/${id}` : `${API_BASE}/invoices/billing-companies`;
    const method = id ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to save');
        showNotification(id ? 'Company updated!' : 'Company added!', 'success');
        closeBillingCompanyModal();
        loadBillingCompanies();
    } catch (e) {
        showNotification('Error: ' + e.message, 'error');
    }
}

async function deleteBillingCompany(id) {
    if (!confirm('Delete this company? Only possible if no invoices were billed from it.')) return;
    try {
        const res = await fetch(`${API_BASE}/invoices/billing-companies/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        showNotification('Company deleted.', 'success');
        loadBillingCompanies();
    } catch (e) {
        showNotification('Error: ' + e.message, 'error');
    }
}

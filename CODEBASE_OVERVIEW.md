# 📋 KenmccoyCRM – Codebase Overview

> A full-stack CRM (Customer Relationship Management) system with drag-and-drop sales pipeline management, multi-role access control, task management, communication logging, and analytics.

---echo "# crm" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/suptocoder/crm.git
git push -u origin main

## 🗂️ Project Info

| Property | Value |
|---|---|
| **Name** | `crm-sales-pipeline` |
| **Version** | `1.0.0` |
| **Entry Point** | `server.js` |
| **Runtime** | Node.js |
| **Framework** | Express.js |
| **Database** | MongoDB (via Mongoose) |
| **Templating** | EJS |
| **Default Port** | `3000` |
| **License** | MIT |

---

## 🏗️ Folder Structure

```
kenmccoyCRMv1-main/
├── server.js               # Main Express server entry point
├── package.json            # NPM dependencies and scripts
│
├── models/                 # Mongoose data models (10 files)
│   ├── User.js
│   ├── Lead.js
│   ├── OperationsLead.js
│   ├── Task.js
│   ├── Pipeline.js
│   ├── Communication.js
│   ├── Settings.js
│   ├── ActivityLog.js
│   ├── Notification.js
│   └── Subscription.js
│
├── routes/                 # Express API route handlers (14 files)
│   ├── auth.js
│   ├── leads.js
│   ├── users.js
│   ├── tasks.js
│   ├── pipeline.js
│   ├── communication.js
│   ├── emailConfig.js
│   ├── analytics.js
│   ├── settings.js
│   ├── activityLogs.js
│   ├── statistics.js
│   ├── notifications.js
│   ├── operationsLeads.js
│   └── subscription.js
│
├── middleware/             # Express middleware (3 files)
│   ├── auth.js             # JWT authentication guard
│   ├── permissions.js      # Role-based permission helpers
│   └── permission.js       # Additional permission middleware
│
├── utils/                  # Utility/helper modules (3 files)
│   ├── emailService.js     # Nodemailer / Outlook email sender
│   ├── notifications.js    # Notification creation helpers
│   └── upload.js           # Multer upload config helper
│
├── views/                  # EJS server-side templates
│   ├── dashboard.ejs       # Main dashboard view (~70 KB)
│   ├── admin-login.ejs     # Admin login page
│   └── admin-pending.ejs   # Pending approval page
│
├── public/                 # Static frontend assets
│   ├── dashboard.html      # Standalone HTML dashboard
│   ├── dashboard.css       # Dashboard styles (~35 KB)
│   ├── dashboard.js        # Frontend JS logic (~192 KB!)
│   ├── payment-qr.png      # QR code image asset
│   ├── index.html.old      # Legacy HTML (archived)
│   ├── script.js.old       # Legacy JS (archived)
│   └── styles.css.old      # Legacy CSS (archived)
│
├── scripts/                # Utility/seeding scripts (12 files)
│   ├── createAdmin.js      # Creates the initial admin user
│   ├── createTestUsers.js  # Seeds test users
│   ├── migrateUsers.js     # User migration script
│   ├── migrateToDepartments.js
│   ├── fixAdminDepartment.js
│   ├── fixUserPermissions.js
│   ├── fixTestPasswords.js
│   ├── resetTestPassword.js
│   ├── changeUserDepartment.js
│   ├── checkDepartments.js
│   ├── checkPipeline.js
│   └── updatePipeline.js
│
└── uploads/                # Uploaded files directory (runtime)
```

---

## ⚙️ Setup & Running

### Prerequisites
- **Node.js** (v16+ recommended)
- **MongoDB** running locally (default: `mongodb://localhost:27017/crm_sales`) or a remote URI

### Installation Steps

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables (create a .env file in root)
# See the Environment Variables section below

# 3. Create the initial admin user
node scripts/createAdmin.js

# 4. Start in development mode
npm run dev

# OR start in production mode
npm start
```

### npm Scripts

| Script | Command | Purpose |
|---|---|---|
| `start` | `node server.js` | Production start |
| `dev` | `nodemon server.js` | Dev mode with auto-restart |

### Environment Variables (`.env`)

Create a `.env` file in the project root:

```env
# MongoDB connection URI
MONGODB_URI=mongodb://localhost:27017/crm_sales

# JWT secret (change this in production!)
JWT_SECRET=your_strong_secret_here

# Email credentials (for Outlook-based email sending)
EMAIL_USER=your_email@outlook.com
EMAIL_PASSWORD=your_email_password

# CORS / Frontend origin
CORS_ORIGIN=http://localhost:3000

# Server port (optional, defaults to 3000)
PORT=3000
```

### Default Admin Credentials (after running `createAdmin.js`)

```
Email:    admin@crm.com
Password: admin123
⚠️  Change this immediately after first login!
```

---

## 🧩 Dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP server/routing framework |
| `mongoose` | MongoDB ORM/ODM |
| `bcryptjs` | Password hashing |
| `jsonwebtoken` | JWT auth token generation & validation |
| `express-session` | Session management |
| `connect-mongo` | MongoDB session store |
| `nodemailer` | Email sending (Outlook/SMTP) |
| `multer` | File upload handling |
| `cors` | Cross-Origin Resource Sharing |
| `body-parser` | Request body parsing |
| `ejs` | Server-side templating engine |
| `dotenv` | Environment variable loader |
| `csv-parser` | CSV file parsing for lead import |
| `json2csv` | CSV export for leads |
| `axios` | HTTP client (for external API calls like WhatsApp) |
| `qrcode` | QR code generation |
| `cron` | Scheduled job runner (e.g., task reminders) |
| `react-datepicker` | (Listed as dep, mainly used on frontend) |

**Dev Dependencies:**
| Package | Purpose |
|---|---|
| `nodemon` | Auto-restart server on file changes |

---

## 🗄️ Data Models

### 1. `User`
The central identity model. Supports a 4-tier role hierarchy.

| Field | Type | Notes |
|---|---|---|
| `email` | String (unique) | Required |
| `password` | String | Stored as-is (⚠️ should be hashed) |
| `fullName` | String | Display name |
| `username` | String (unique, sparse) | Optional login alias |
| `phone` | String | Contact number |
| `department` | String | Organizational department |
| `role` | Enum | `superadmin` / `admin` / `manager` / `staff` |
| `managerId` | ObjectId → User | Manager reference (for staff) |
| `teamMembers` | [ObjectId] → User | Team members list (for managers) |
| `permissions` | Object | Granular RBAC permissions (auto-set by pre-save hook) |
| `isActive` | Boolean | Account active status |
| `apiKey` | String (unique) | For webhook authentication |
| `emailConfig` | Object | Outlook email config per user |
| `resetPasswordToken` / `resetPasswordExpires` | String / Date | Password reset flow |
| `lastLogin` | Date | Tracks last login timestamp |

**Permission Levels per Role:**
| Role | Leads | Tasks | Users | Analytics | Settings |
|---|---|---|---|---|---|
| **SuperAdmin** | All (no delete) | All | All | All | Full |
| **Admin** | Department | Department | Department | Department | Full |
| **Manager** | Team | Team | View team only | Team | None |
| **Staff** | Assigned only | Assigned only | None | Own only | None |

---

### 2. `Lead`
Core sales CRM lead entity.

| Field | Type | Notes |
|---|---|---|
| `companyName` | String | Required |
| `contactPerson` | String | Required |
| `email` | String | Required |
| `mobile` | String | Required |
| `address` | String | Optional |
| `status` | Enum | `new` / `work-in-progress` / `test-assignment` / `won` / `lost` |
| `remarks` | String | Free text notes |
| `assignedTo` | ObjectId → User | Required; salesperson handling this lead |
| `user` | ObjectId → User | Creator/owner |
| `notes` | [Object] | Array of notes with `content`, `createdBy`, `createdAt` |
| `timeline` | [Object] | Audit trail: each entry has `action`, `description`, `performedBy`, `metadata`, `timestamp` |
| `attachments` | [Object] | Uploaded files linked to lead |
| `customFields` | Mixed | Dynamic extra data |
| `tags` | [String] | Labels/categories |
| `lastContact` | Date | Last interaction date |

**Timeline Actions:** `created`, `updated`, `status_changed`, `assigned`, `note_added`, `email_sent`, `whatsapp_sent`, `call_made`, `meeting_held`, `file_attached`, `task_created`

---

### 3. `OperationsLead`
Service/support ticket model, distinct from sales leads.

| Field | Type | Notes |
|---|---|---|
| `ticketNumber` | String (unique) | Auto-generated (`OPS-000001` format) |
| `clientName` | String | Required |
| `company` | String | Required |
| `emails` | [Object] | Array with `email` + `type` (primary/work/personal) |
| `phones` | [Object] | Array with `phone` + `type` (mobile/work/home) |
| `status` | String | Defaults to `new-request` |
| `priority` | Enum | `low` / `medium` / `high` / `urgent` |
| `category` | Enum | `support` / `maintenance` / `installation` / `complaint` / `query` / `other` |
| `description` | String | Issue description |
| `resolution` | String | Resolution notes |
| `assignedTo` | ObjectId → User | Assigned staff |
| `manager` | ObjectId → User | Responsible manager |
| `estimatedTime` / `actualTime` | Number (hours) | Time tracking |
| `attachments` | [Object] | Attached files |
| `timeline` | [Object] | Audit trail |
| `sla` | Object | SLA with `responseTime`, `resolutionTime`, `status` (met/at-risk/breached) |
| `source` | Enum | `phone` / `email` / `website` / `chat` / `referral` / `walk-in` / `other` |
| `closedAt` | Date | When ticket was closed |

---

### 4. `Task`
Action item linked to a lead and/or a user.

| Field | Type | Notes |
|---|---|---|
| `lead` | ObjectId → Lead | Optional linked lead |
| `assignedTo` | ObjectId → User | Required |
| `dueDate` | Date | Required |
| `action` | Enum | `call` / `email` / `meeting` / `follow-up` / `demo` / `site-visit` / `other` |
| `status` | Enum | `pending` / `in-progress` / `completed` / `cancelled` |
| `remarks` | String | Notes |
| `reminder` | Object | `enabled`, `time`, `sent` |
| `completedAt` | Date | Auto-set on completion |
| `user` | ObjectId → User | Creator |

---

### 5. `Pipeline`
Configurable kanban-style pipeline board.

| Field | Type | Notes |
|---|---|---|
| `name` | String | Pipeline name |
| `columns` | [Object] | Each column: `id`, `name`, `icon`, `color`, `order`, `statusMapping` |
| `isDefault` | Boolean | Default pipeline flag |

**Status Mapping:** pipeline columns map to lead statuses (`new`, `work-in-progress`, `test-assignment`, `won`, `lost`).

---

### 6. `Communication`
Log of all outbound/inbound communications against a lead.

| Field | Type | Notes |
|---|---|---|
| `lead` | ObjectId → Lead | Required |
| `type` | Enum | `email` / `whatsapp` / `call` / `meeting` / `note` |
| `direction` | Enum | `inbound` / `outbound` (default: `outbound`) |
| `subject` | String | Email subject |
| `content` | String | Required; message body |
| `from` / `to` | String | Sender/recipient |
| `cc` | [String] | CC list |
| `status` | Enum | `sent` / `delivered` / `read` / `failed` / `pending` |
| `metadata` | Object | `messageId`, `whatsappId`, `callDuration`, `meetingDuration` |
| `sentBy` / `user` | ObjectId → User | Sender/owner |

---

### 7. `Settings`
Per-user/admin configuration preferences.

| Section | Fields |
|---|---|
| **Company** | `name`, `logo`, `website`, `address`, `phone`, `email` |
| **Email (SMTP)** | `senderName`, `senderEmail`, `smtpHost`, `smtpPort`, `smtpUser`, `smtpPassword`, `smtpSecure` |
| **WhatsApp** | `apiKey`, `phoneNumberId`, `businessAccountId`, `enabled` |
| **Pipeline** | `defaultStages`, `customStages` |
| **Notifications** | `emailNotifications`, `taskReminders`, `leadAssignments`, `dailyDigest` |
| **Custom Fields** | Custom lead field definitions (name, type, options, required, order) |
| **Backup** | `autoBackup`, `backupFrequency` (daily/weekly/monthly), `lastBackup` |

---

### 8. `ActivityLog`
System-wide audit trail for all significant user actions.

| Field | Notes |
|---|---|
| `user` | Who performed the action |
| `action` | One of ~25 predefined action types |
| `module` | `leads` / `operations` / `users` / `tasks` / `pipeline` / `settings` / `communication` / `auth` / `data` |
| `targetId` / `targetModel` | The document affected |
| `description` | Human-readable description |
| `metadata` | Extra context (JSON) |
| `ipAddress` / `userAgent` | Request metadata |

---

### 9. `Notification`
In-app notifications for users.

| Field | Notes |
|---|---|
| `recipient` / `sender` | User references |
| `lead` / `task` | Optional linked entities |
| `type` | `status_change` / `comment` / `assignment` / `reassignment` / `task_created` / `task_completed` |
| `message` | Notification text |
| `read` / `readAt` | Read state tracking |

---

## 🛣️ API Routes

All API routes are prefixed with `/api` and protected by JWT auth (except `/api/register`, `/api/login`, `/api/leads/webhook`).

### Auth – `/api`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/register` | Register new user |
| POST | `/login` | Login, returns JWT token |
| GET | `/api-key` | Get current user's API key |
| POST | `/api-key/regenerate` | Regenerate API key |
| POST | `/forgot-password` | Initiate password reset |
| POST | `/reset-password` | Reset password with token |
| POST | `/change-password` | Change password (authenticated) |
| GET | `/profile` | Get own profile |
| PUT | `/profile` | Update own profile |

### Leads – `/api/leads`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/webhook` | Create lead via webhook (uses API key) |
| GET | `/` | Get all leads (role-filtered) |
| GET | `/status/:status` | Get leads by status |
| POST | `/import` | Bulk import leads (JSON/CSV data) |
| GET | `/export` | Export leads as CSV |
| GET | `/:id` | Get single lead |
| POST | `/` | Create new lead |
| PUT | `/:id` | Update lead |
| DELETE | `/:id` | Delete lead |
| POST | `/:id/notes` | Add note to lead |
| PUT | `/:id/assign` | Reassign lead to user |

### Users – `/api/users`
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Get all users (role-filtered) |
| GET | `/for-assignment` | Get assignable users |
| GET | `/:id` | Get single user |
| POST | `/` | Create user (role hierarchy enforced) |
| PUT | `/:id` | Update user |
| DELETE | `/:id` | Delete/deactivate user |
| PUT | `/:id/activate` | Activate user |
| PUT | `/:id/deactivate` | Deactivate user |

### Tasks – `/api/tasks`
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List tasks (role-filtered) |
| GET | `/upcoming` | Tasks due in next 7 days |
| GET | `/:id` | Get single task |
| POST | `/` | Create task |
| PUT | `/:id` | Update task |
| DELETE | `/:id` | Delete task |

### Pipeline – `/api/pipeline`
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Get all pipelines |
| POST | `/` | Create pipeline |
| PUT | `/:id` | Update pipeline |
| DELETE | `/:id` | Delete pipeline |

### Communication – `/api/communication`
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List communications (role-filtered) |
| GET | `/:leadId` | Get comms for a lead |
| POST | `/email` | Send email to lead |
| POST | `/whatsapp` | Send WhatsApp message |
| POST | `/call` | Log a call |
| POST | `/meeting` | Log a meeting |
| POST | `/note` | Add a note |

### Analytics – `/api/analytics`
| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard` | Overview stats (role-filtered) |
| GET | `/leads` | Lead statistics & charts data |
| GET | `/team-performance` | Team performance metrics |
| GET | `/tasks` | Task statistics |
| GET | `/communications` | Communication statistics |

### Settings – `/api/settings`
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Get user settings |
| PUT | `/company` | Update company info |
| PUT | `/email` | Update SMTP/email settings |
| PUT | `/whatsapp` | Update WhatsApp API config |
| PUT | `/pipeline` | Update pipeline stages |
| PUT | `/notifications` | Update notification preferences |
| PUT | `/custom-fields` | Update custom field definitions |
| PUT | `/backup` | Update backup config |
| POST | `/backup/trigger` | Manually trigger backup |

### Other Routes
| Prefix | Description |
|---|---|
| `/api/activity-logs` | Get/filter activity logs |
| `/api/statistics` | Extended statistics for reports |
| `/api/notifications` | List, mark-read, clear notifications |
| `/api/email` | Email config (Outlook verification) |
| `/api/upload` | File upload endpoint (attached to leads) |

### Page Routes (EJS Rendered)
| Route | View |
|---|---|
| `GET /` | `dashboard.ejs` |
| `GET /dashboard` | `dashboard.ejs` |
| `GET /pipeline` | `index.ejs` (legacy) |

---

## 🔐 Authentication & Authorization

### Authentication
- Uses **JWT (JSON Web Tokens)** with `jsonwebtoken`.
- Tokens expire after **7 days**.
- The `auth.js` middleware extracts the `Bearer` token from `Authorization` header, verifies it, loads the user from MongoDB, and attaches it to `req.user`.
- Session (`express-session`) is also initialized but JWT is the primary auth mechanism.
- **JWT_SECRET** defaults to `'raghav098'` if not set via env – ⚠️ change this in production.

### Role-Based Access Control (RBAC)
4-tier role hierarchy:
```
SuperAdmin > Admin > Manager > Staff
```

Permission enforcement happens at two levels:
1. **Middleware** (`permissions.js`): `checkPermission(module, action)`, `requireAdmin`, `requireSuperAdmin`, `requireRole` helpers.
2. **Route-level query filtering**: Each route re-applies role checks to constrain the database queries (e.g., `Admin` only sees leads in their department).

Permission scope values: `all` | `department` | `team` | `assigned` | `own` | `none`

---

## 📧 Email Service (`utils/emailService.js`)

- Uses **Nodemailer** with **Outlook/Office365 SMTP** (`smtp-mail.outlook.com:587`).
- Each user can have their own Outlook credentials stored in `User.emailConfig`.
- Falls back to system-level `EMAIL_USER` / `EMAIL_PASSWORD` env vars.

**Exported functions:**
| Function | Purpose |
|---|---|
| `sendEmail(opts)` | Generic email send |
| `sendWelcomeEmail(...)` | Onboarding email for new users |
| `sendTaskAssignmentEmail(...)` | New task notification |
| `sendLeadAssignmentEmail(...)` | New lead notification |
| `sendPasswordResetEmail(...)` | Password reset link |
| `verifyEmailConfig(...)` | Test SMTP credentials |

---

## 📁 File Uploads

- Handled by **Multer** configured directly in `server.js`.
- Upload directory: `./uploads/` (auto-created on startup).
- File size limit: **10 MB**.
- Allowed types: `pdf`, `doc`, `docx`, `xls`, `xlsx`, `png`, `jpg`, `jpeg`, `gif`, `txt`, `csv`.
- Files are stored with a unique timestamp-based filename.
- Files are associated with a `Lead` via the `/api/upload` endpoint (requires `leadId` in the request body).
- Uploaded files are served publicly at `/uploads/<filename>`.

---

## 🎨 Frontend

The frontend is a **Single-Page Application (SPA)** served as static files from the `public/` directory.

| File | Size | Purpose |
|---|---|---|
| `dashboard.html` | ~31 KB | Main SPA HTML shell |
| `dashboard.css` | ~35 KB | All dashboard styles |
| `dashboard.js` | **~192 KB** | Entire frontend logic (vanilla JS) |

The frontend communicates with the backend exclusively via the REST API (JWT token stored in `localStorage`).

The server also renders **EJS templates** for:
- `dashboard.ejs` (~70 KB) – server-rendered dashboard variant.
- `admin-login.ejs` – admin login page.
- `admin-pending.ejs` – pending approval page.

---

## 🛠️ Utility Scripts (`scripts/`)

These are one-off Node.js scripts run manually via `node scripts/<file>.js`:

| Script | Purpose |
|---|---|
| `createAdmin.js` | Creates initial admin user (`admin@crm.com` / `admin123`) |
| `createTestUsers.js` | Seeds test users for all roles |
| `migrateUsers.js` | Migrates users to a newer schema |
| `migrateToDepartments.js` | Adds department field to existing users |
| `fixAdminDepartment.js` | Fixes admin dept assignments |
| `fixUserPermissions.js` | Resets all user permissions to role defaults |
| `fixTestPasswords.js` | Fixes hashed passwords for test users |
| `resetTestPassword.js` | Resets a specific test user's password |
| `changeUserDepartment.js` | Reassigns a user's department |
| `checkDepartments.js` | Lists all departments in DB |
| `checkPipeline.js` | Inspects pipeline configuration |
| `updatePipeline.js` | Updates pipeline stages/config |

---

## ⚠️ Known Issues / Security Notes

1. **Passwords not hashed on user creation** – The `users.js` route stores `password` directly. The `bcryptjs` package is available; hashing should be added.
2. **Hardcoded secrets** – `JWT_SECRET` defaults to `'raghav098'`; session secret is hardcoded as `'crm_admin_secret'`. These **must** be set via `.env` in production.
3. **Default admin password** – `admin123` is shown in `createAdmin.js`. Change immediately after setup.
4. **`dashboard.js` is very large** – At ~192 KB, the frontend JS would benefit from being split into ES modules or bundled with a build tool.
5. **Archived files** – `index.html.old`, `script.js.old`, `styles.css.old` in `public/` are legacy artifacts and can be safely deleted.

---

## 🔄 System Architecture Diagram

```
Browser (Client)
      │
      │  HTTP / REST JSON API
      ▼
┌─────────────────────────────────────┐
│           Express Server            │
│           (server.js)               │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  Middleware Stack            │   │
│  │  · CORS                      │   │
│  │  · Body Parser               │   │
│  │  · Static Files (public/)    │   │
│  │  · Session                   │   │
│  │  · JWT Auth (auth.js)       │   │
│  │  · Permissions (RBAC)       │   │
│  └──────────────────────────────┘   │
│                                     │
│  ┌─────────── Routes ───────────┐   │
│  │ /api/leads    /api/tasks     │   │
│  │ /api/users    /api/pipeline  │   │
│  │ /api/comm     /api/analytics │   │
│  │ /api/settings /api/notifs   │   │
│  │ /api/upload   /api/auth     │   │
│  └──────────────────────────────┘   │
│                                     │
│  ┌──────────── Utils ───────────┐   │
│  │ emailService  notifications  │   │
│  │ upload        cron jobs      │   │
│  └──────────────────────────────┘   │
└──────────────┬──────────────────────┘
               │  Mongoose ODM
               ▼
      ┌─────────────────┐
      │    MongoDB       │
      │  crm_sales DB    │
      │                  │
      │  Collections:    │
      │  · users         │
      │  · leads         │
      │  · operationsleads│
      │  · tasks         │
      │  · pipelines     │
      │  · communications│
      │  · settings      │
      │  · activitylogs  │
      │  · notifications │
      │  · subscriptions │
      └─────────────────┘
```

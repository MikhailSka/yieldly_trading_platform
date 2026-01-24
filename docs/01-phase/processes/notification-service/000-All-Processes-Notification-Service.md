# Notification Service Processes - Consolidated

This document contains all process documentation for the Notification Service.

**Total Documents:** 4  
**Last Generated:** 2025-11-30T23:58:38.365Z  
**Source Directory:** `processes/notification-service`


---

## Table of Contents

1. [PROC-NOTIFY-001](#proc-notify-001)
2. [PROC-NOTIFY-002](#proc-notify-002)
3. [PROC-NOTIFY-003](#proc-notify-003)
4. [PROC-NOTIFY-004](#proc-notify-004)

---

## PROC-NOTIFY-001: Send In-App Notification

**Source File:** `PROC-NOTIFY-001.md`  
**Path:** `processes\notification-service\PROC-NOTIFY-001.md`

### PROC-NOTIFY-001: Send In-App Notification

**Service Owner:** Notification Service
**Related FR:** FR-NOTIFY-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-023, ADR-032

#### Trigger
Event published to Azure Service Bus

#### Actor
System (Event Publisher)

#### Preconditions
- User has notification preferences configured

#### Inputs
**Service Bus Message (ADR-032 format):**
```json
{
  "messageId": "uuid",
  "eventType": "backtest.execution.completed",
  "timestamp": "2024-12-01T12:00:00Z",
  "version": "1.0",
  "source": {
    "service": "backtesting-service",
    "instance": "instance-id"
  },
  "payload": {
    "userId": "uuid",
    "title": "Backtest Completed",
    "message": "Your backtest for 'My Strategy' has completed successfully.",
    "data": {
      "backtestId": "uuid",
      "strategyName": "My Strategy"
    },
    "priority": "medium"
  },
  "metadata": {
    "correlationId": "uuid",
    "causationId": "uuid",
    "userId": "uuid"
  }
}
```

#### Process Steps

1. **Service Bus delivers message to Notification Service**
2. **Job Consumer receives message**
3. **Job Consumer checks user preferences**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/notification_db_schema.dbml
   SELECT in_app_enabled, email_enabled, notification_types
   FROM notification_preferences
   WHERE user_id = $1
   ```
   - If `in_app_enabled = false` → Skip in-app notification
   - Check if event type is in `notification_types` array
4. **Notification Repository saves notification**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/notification_db_schema.dbml
   INSERT INTO notifications (
     user_id, type, title, message,
     data, priority, is_read, created_at
   ) VALUES (
     $1, $2, $3, $4,
     $5, $6, false, NOW()
   ) RETURNING notification_id
   ```
5. **Notification Service pushes to WebSocket** (if user online)
   - Real-time notification to active browser sessions
6. **Return (async, no direct response)**

#### Outputs
- Notification record in database
- Real-time push to user's browser (if online)

#### Success Criteria
- Notification saved to database
- User sees notification in UI

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Processing time: < 100ms per notification
- WebSocket push is real-time (< 10ms latency)

#### Dependencies
**Database:**
- `notification_db` (PostgreSQL) - Tables: `notifications`, `notification_preferences`
- Verify schema: docs/01-phase/database-schemas/notification_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Subscribes to all notification events

**WebSocket:**
- For real-time push to connected clients

---


---

## PROC-NOTIFY-002: Send Email Notification

**Source File:** `PROC-NOTIFY-002.md`  
**Path:** `processes\notification-service\PROC-NOTIFY-002.md`

### PROC-NOTIFY-002: Send Email Notification

**Service Owner:** Notification Service
**Related FR:** FR-NOTIFY-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-023, ADR-032

#### Trigger
Event published to Azure Service Bus requiring email

#### Actor
System (Event Publisher)

#### Preconditions
- User has verified email address
- User has email notifications enabled

#### Inputs
**Service Bus Message (ADR-032 format):**
```json
{
  "messageId": "uuid",
  "eventType": "backtest.execution.completed",
  "timestamp": "2024-12-01T12:00:00Z",
  "version": "1.0",
  "source": {
    "service": "backtesting-service",
    "instance": "instance-id"
  },
  "payload": {
    "userId": "uuid",
    "template": "backtest_completed",
    "data": {
      "userName": "John",
      "strategyName": "My SMA Strategy",
      "backtestId": "uuid",
      "summary": {
        "totalReturn": 25.5,
        "winRate": 65.2
      }
    }
  },
  "metadata": {
    "correlationId": "uuid",
    "causationId": "uuid",
    "userId": "uuid"
  }
}
```

#### Process Steps

1. **Service Bus delivers message**
2. **Job Consumer receives message**
3. **Job Consumer checks email preferences**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/notification_db_schema.dbml
   SELECT email_enabled, email_types
   FROM notification_preferences
   WHERE user_id = $1
   ```
   - If `email_enabled = false` → Skip
4. **Job Consumer retrieves user email**
   - Call User Service: `GET /api/v1/users/{userId}/email`
5. **Job Consumer loads email template**
   - Templates stored in database or file system
   - Example: `templates/backtest_completed.html`
6. **Job Consumer renders template with data**
   ```html
   Hi {{userName}},

   Your backtest for "{{strategyName}}" has completed!

   Results Summary:
   - Total Return: {{summary.totalReturn}}%
   - Win Rate: {{summary.winRate}}%

   View full results: https://app.yieldly.com/backtests/{{backtestId}}
   ```
7. **Job Consumer sends via SendGrid**
   ```go
   message := mail.NewSingleEmail(
     from,
     subject,
     to,
     plainTextContent,
     htmlContent,
   )
   response, err := sendGridClient.Send(message)
   ```
8. **Notification Repository logs email sent**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/notification_db_schema.dbml
   INSERT INTO notification_log (
     user_id, type, channel, status,
     sent_at, external_id
   ) VALUES (
     $1, $2, 'email', 'sent',
     NOW(), $3
   )
   ```

#### Outputs
- Email delivered to user's inbox
- Email log record created

#### Success Criteria
- Email sent successfully
- Delivery logged

#### Error Scenarios

| Error | Handling |
|-------|----------|
| SendGrid API error | Retry 3 times with exponential backoff |
| Invalid email address | Mark as failed, log error |
| Template rendering error | Log error, skip email |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Email delivery: < 5 seconds
- Retry strategy: 3 attempts with exponential backoff

#### Dependencies
**Database:**
- `notification_db` (PostgreSQL) - Tables: `notification_log`, `notification_preferences`
- Verify schema: docs/01-phase/database-schemas/notification_db_schema.dbml

**External Services:**
- SendGrid API (email delivery)
- User Service: `GET /api/v1/users/{userId}/email`

**Message Queue:**
- Azure Service Bus - Subscribes to email notification events

---


---

## PROC-NOTIFY-003: Admin - Manage Notification Templates

**Source File:** `PROC-NOTIFY-003.md`  
**Path:** `processes\notification-service\PROC-NOTIFY-003.md`

### PROC-NOTIFY-003: Admin - Manage Notification Templates

**Service Owner:** Notification Service
**Related FR:** FR-NOTIFY-003
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-023

#### Trigger
Admin user accesses template management UI

#### Actor
Admin User

#### Preconditions
- User has admin role
- Notification types are configured in `notification_types_config`

---

## 3.1 List Notification Templates

#### Inputs

**API Endpoint:** `GET /api/v1/admin/notifications/templates`

**Query Parameters:**
- `category` (string, optional): Filter by category (portfolio, backtest, system, account)
- `is_active` (boolean, optional): Filter by active status
- `page` (int, optional): Page number (default: 1)
- `limit` (int, optional): Items per page (default: 20, max: 50)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/templates` (GET)
2. **API Gateway validates JWT** → Extracts user_id, verifies admin role
3. **Admin Controller queries templates with type config**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/notification_db_schema.dbml
   SELECT
     t.id,
     t.type,
     t.version,
     t.is_active,
     t.email_subject_template,
     t.title_template,
     t.default_priority,
     t.updated_at,
     tc.display_name,
     tc.description,
     tc.category,
     tc.icon,
     tc.color,
     tc.is_enabled,
     tc.is_user_configurable
   FROM notification_templates t
   JOIN notification_types_config tc ON t.type = tc.type
   WHERE ($1::varchar IS NULL OR tc.category = $1)
     AND ($2::boolean IS NULL OR t.is_active = $2)
   ORDER BY tc.category, tc.display_name
   LIMIT $3 OFFSET $4;
   ```
4. **Return template list**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "uuid",
        "type": "backtest_complete",
        "version": 2,
        "isActive": true,
        "displayName": "Backtest Complete",
        "description": "Sent when a backtest finishes successfully",
        "category": "backtest",
        "icon": "check-circle",
        "color": "#22C55E",
        "emailSubjectTemplate": "Backtest Complete: {{strategy_name}}",
        "titleTemplate": "Backtest Complete",
        "defaultPriority": "normal",
        "isEnabled": true,
        "isUserConfigurable": true,
        "updatedAt": "2024-12-01T12:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 12,
      "totalPages": 1
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 3.2 Get Template Details

#### Inputs

**API Endpoint:** `GET /api/v1/admin/notifications/templates/{type}`

**Path Parameters:**
- `type` (string, required): Notification type enum value

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/templates/{type}` (GET)
2. **API Gateway validates JWT** → Verifies admin role
3. **Admin Controller queries full template details**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/notification_db_schema.dbml
   SELECT
     t.*,
     tc.display_name,
     tc.description,
     tc.category,
     tc.icon,
     tc.color,
     tc.template_variables,
     tc.is_enabled,
     tc.is_user_configurable
   FROM notification_templates t
   JOIN notification_types_config tc ON t.type = tc.type
   WHERE t.type = $1;
   ```
4. **Query template history**
   ```sql
   SELECT id, version, changed_by, change_reason, created_at
   FROM notification_template_history
   WHERE template_id = $1
   ORDER BY version DESC
   LIMIT 10;
   ```
5. **Return template with history**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "template": {
      "id": "uuid",
      "type": "backtest_complete",
      "version": 2,
      "isActive": true,
      "displayName": "Backtest Complete",
      "description": "Sent when a backtest finishes successfully",
      "category": "backtest",
      "icon": "check-circle",
      "color": "#22C55E",
      "emailSubjectTemplate": "Backtest Complete: {{strategy_name}}",
      "emailBodyTemplate": "<h1>Hello {{user_name}},</h1><p>Your backtest...</p>",
      "sendgridTemplateId": null,
      "titleTemplate": "Backtest Complete",
      "messageTemplate": "Your backtest for '{{strategy_name}}' has completed.",
      "defaultActionLabel": "View Results",
      "actionUrlTemplate": "/backtests/{{backtest_id}}",
      "defaultPriority": "normal",
      "templateVariables": {
        "variables": [
          {"name": "user_name", "type": "string", "description": "User's display name"},
          {"name": "strategy_name", "type": "string", "description": "Name of the strategy"},
          {"name": "backtest_id", "type": "uuid", "description": "Backtest ID"},
          {"name": "total_return", "type": "number", "description": "Total return percentage"},
          {"name": "sharpe_ratio", "type": "number", "description": "Sharpe ratio"}
        ]
      },
      "previewData": {
        "user_name": "John Doe",
        "strategy_name": "SMA Crossover",
        "backtest_id": "abc-123",
        "total_return": 15.5,
        "sharpe_ratio": 1.2
      },
      "isEnabled": true,
      "isUserConfigurable": true,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-12-01T12:00:00Z"
    },
    "history": [
      {
        "id": "uuid",
        "version": 1,
        "changedBy": "admin-user-id",
        "changeReason": "Initial template",
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "TEMPLATE_NOT_FOUND",
    "message": "Notification template not found"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 3.3 Update Template

#### Inputs

**API Endpoint:** `PUT /api/v1/admin/notifications/templates/{type}`

**Path Parameters:**
- `type` (string, required): Notification type enum value

**Request Body:**
```json
{
  "emailSubjectTemplate": "Backtest Complete: {{strategy_name}}",
  "emailBodyTemplate": "<h1>Hello {{user_name}},</h1><p>Your backtest for '{{strategy_name}}' has completed with a total return of {{total_return}}%.</p>",
  "titleTemplate": "Backtest Complete",
  "messageTemplate": "Your backtest for '{{strategy_name}}' has completed with {{total_return}}% return.",
  "defaultActionLabel": "View Results",
  "actionUrlTemplate": "/backtests/{{backtest_id}}",
  "defaultPriority": "normal",
  "previewData": {
    "user_name": "John Doe",
    "strategy_name": "SMA Crossover",
    "backtest_id": "abc-123",
    "total_return": 15.5
  },
  "changeReason": "Updated email body formatting"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/templates/{type}` (PUT)
2. **API Gateway validates JWT** → Verifies admin role, extracts admin_id
3. **Admin Controller validates template**
   - Validate Mustache syntax in all template fields
   - Validate all required variables are in previewData
   - Test render templates with previewData
4. **Begin transaction**
5. **Save current version to history**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/notification_db_schema.dbml
   INSERT INTO notification_template_history (
     template_id, version,
     email_subject_template, email_body_template,
     title_template, message_template, action_url_template,
     changed_by, change_reason
   )
   SELECT
     id, version,
     email_subject_template, email_body_template,
     title_template, message_template, action_url_template,
     $2, $3
   FROM notification_templates
   WHERE type = $1;
   ```
6. **Update template with new version**
   ```sql
   UPDATE notification_templates
   SET
     email_subject_template = $2,
     email_body_template = $3,
     title_template = $4,
     message_template = $5,
     default_action_label = $6,
     action_url_template = $7,
     default_priority = $8,
     preview_data = $9,
     version = version + 1,
     updated_by = $10,
     updated_at = NOW()
   WHERE type = $1
   RETURNING *;
   ```
7. **Commit transaction**
8. **Invalidate template cache**
   ```
   DEL notification:template:{type}
   ```
9. **Return updated template**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "template": {
      "id": "uuid",
      "type": "backtest_complete",
      "version": 3,
      "isActive": true,
      "emailSubjectTemplate": "Backtest Complete: {{strategy_name}}",
      "updatedAt": "2024-12-16T12:00:00Z"
    },
    "message": "Template updated successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TEMPLATE",
    "message": "Template validation failed",
    "details": {
      "field": "emailBodyTemplate",
      "error": "Invalid Mustache syntax at position 45"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 3.4 Preview Template

#### Inputs

**API Endpoint:** `POST /api/v1/admin/notifications/templates/{type}/preview`

**Request Body:**
```json
{
  "channel": "email",
  "previewData": {
    "user_name": "Test User",
    "strategy_name": "My Strategy",
    "total_return": 25.5
  }
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/templates/{type}/preview` (POST)
2. **API Gateway validates JWT** → Verifies admin role
3. **Admin Controller fetches template**
4. **Render template with preview data**
   - Use Mustache/Handlebars engine
   - Render email subject, body, title, message
5. **Return rendered preview**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "preview": {
      "channel": "email",
      "subject": "Backtest Complete: My Strategy",
      "body": "<h1>Hello Test User,</h1><p>Your backtest for 'My Strategy' has completed with a total return of 25.5%.</p>",
      "inApp": {
        "title": "Backtest Complete",
        "message": "Your backtest for 'My Strategy' has completed with 25.5% return.",
        "actionLabel": "View Results",
        "actionUrl": "/backtests/abc-123"
      }
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 3.5 Rollback Template

#### Inputs

**API Endpoint:** `POST /api/v1/admin/notifications/templates/{type}/rollback`

**Request Body:**
```json
{
  "targetVersion": 1,
  "reason": "Reverting due to formatting issues"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/templates/{type}/rollback` (POST)
2. **API Gateway validates JWT** → Verifies admin role
3. **Admin Controller validates target version exists**
   ```sql
   SELECT * FROM notification_template_history
   WHERE template_id = (SELECT id FROM notification_templates WHERE type = $1)
     AND version = $2;
   ```
4. **Save current version to history** (same as update)
5. **Restore from history**
   ```sql
   UPDATE notification_templates t
   SET
     email_subject_template = h.email_subject_template,
     email_body_template = h.email_body_template,
     title_template = h.title_template,
     message_template = h.message_template,
     action_url_template = h.action_url_template,
     version = t.version + 1,
     updated_by = $3,
     updated_at = NOW()
   FROM notification_template_history h
   WHERE t.type = $1
     AND h.template_id = t.id
     AND h.version = $2
   RETURNING t.*;
   ```
6. **Invalidate cache**
7. **Return restored template**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "template": {
      "id": "uuid",
      "type": "backtest_complete",
      "version": 4,
      "restoredFromVersion": 1
    },
    "message": "Template rolled back to version 1"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 3.6 Configure Notification Type

#### Inputs

**API Endpoint:** `PUT /api/v1/admin/notifications/types/{type}/config`

**Request Body:**
```json
{
  "displayName": "Portfolio Drawdown Alert",
  "description": "Sent when portfolio drawdown exceeds user's threshold",
  "icon": "trending-down",
  "color": "#EF4444",
  "defaultPriority": "high",
  "isEnabled": true,
  "isUserConfigurable": true
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/types/{type}/config` (PUT)
2. **API Gateway validates JWT** → Verifies admin role
3. **Admin Controller updates type config**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/notification_db_schema.dbml
   UPDATE notification_types_config
   SET
     display_name = COALESCE($2, display_name),
     description = COALESCE($3, description),
     icon = COALESCE($4, icon),
     color = COALESCE($5, color),
     default_priority = COALESCE($6, default_priority),
     is_enabled = COALESCE($7, is_enabled),
     is_user_configurable = COALESCE($8, is_user_configurable),
     updated_at = NOW()
   WHERE type = $1
   RETURNING *;
   ```
4. **Invalidate caches**
   ```
   DEL notification:type_config:*
   ```
5. **Return updated config**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "typeConfig": {
      "type": "portfolio_drawdown",
      "displayName": "Portfolio Drawdown Alert",
      "description": "Sent when portfolio drawdown exceeds user's threshold",
      "category": "portfolio",
      "icon": "trending-down",
      "color": "#EF4444",
      "defaultPriority": "high",
      "isEnabled": true,
      "isUserConfigurable": true,
      "updatedAt": "2024-12-16T12:00:00Z"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria
- Templates listed with type configuration
- Template updates versioned and stored in history
- Preview renders correctly with sample data
- Rollback restores previous version
- Type configuration updated

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Access denied" |
| Template not found | 404 | Return "Template not found" |
| Invalid template syntax | 400 | Return validation errors |
| Version not found (rollback) | 404 | Return "Version not found" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Template queries: < 50ms
- Template update with history: < 100ms
- Preview rendering: < 200ms
- Cache TTL: 1 hour for templates

#### Dependencies

**Database:**
- `notification_db` (PostgreSQL) - Tables: `notification_templates`, `notification_template_history`, `notification_types_config`
- Verify schema: docs/01-phase/database-schemas/notification_db_schema.dbml

**Cache:**
- Redis - Template caching

---


---

## PROC-NOTIFY-004: Admin - Send Broadcast Notification

**Source File:** `PROC-NOTIFY-004.md`  
**Path:** `processes\notification-service\PROC-NOTIFY-004.md`

### PROC-NOTIFY-004: Admin - Send Broadcast Notification

**Service Owner:** Notification Service
**Related FR:** FR-NOTIFY-004
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-023, ADR-032

#### Trigger
Admin user creates and sends a broadcast notification

#### Actor
Admin User

#### Preconditions
- User has admin role
- Broadcast notifications are enabled in system config

---

## 4.1 Create Broadcast Notification (Draft)

#### Inputs

**API Endpoint:** `POST /api/v1/admin/notifications/broadcasts`

**Request Body:**
```json
{
  "title": "System Maintenance Scheduled",
  "message": "Yieldly will undergo scheduled maintenance on December 20th from 2:00 AM to 4:00 AM UTC. During this time, the platform may be temporarily unavailable.",
  "priority": "high",
  "targeting": {
    "targetAllUsers": true
  },
  "channels": {
    "sendEmail": true,
    "sendInApp": true
  },
  "scheduledAt": null
}
```

**Advanced Targeting Example:**
```json
{
  "title": "New Feature: Price Alerts",
  "message": "We've added price alerts! Set alerts for your favorite assets.",
  "priority": "normal",
  "targeting": {
    "targetAllUsers": false,
    "targetUserIds": null,
    "targetFilter": {
      "has_broker_connection": true,
      "last_active_within_days": 30
    }
  },
  "channels": {
    "sendEmail": true,
    "sendInApp": true
  },
  "scheduledAt": "2024-12-20T09:00:00Z"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/broadcasts` (POST)
2. **API Gateway validates JWT** → Verifies admin role, extracts admin_id
3. **Admin Controller validates request**
   - Title required (max 255 chars)
   - Message required
   - Priority must be valid enum
   - If targetAllUsers is false, either targetUserIds or targetFilter required
   - scheduledAt must be in the future (if provided)
4. **Admin Controller creates broadcast record**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/notification_db_schema.dbml
   INSERT INTO broadcast_notifications (
     title, message, priority,
     target_all_users, target_user_ids, target_filter,
     send_email, send_in_app,
     scheduled_at, status,
     created_by
   ) VALUES (
     $1, $2, $3,
     $4, $5, $6,
     $7, $8,
     $9, 'draft',
     $10
   ) RETURNING *;
   ```
5. **Return created broadcast**

#### Outputs

**Success Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "broadcast": {
      "id": "uuid",
      "title": "System Maintenance Scheduled",
      "message": "Yieldly will undergo scheduled maintenance...",
      "priority": "high",
      "targeting": {
        "targetAllUsers": true,
        "targetUserIds": null,
        "targetFilter": null
      },
      "channels": {
        "sendEmail": true,
        "sendInApp": true
      },
      "scheduledAt": null,
      "status": "draft",
      "estimatedRecipients": null,
      "createdBy": "admin-user-id",
      "createdAt": "2024-12-16T12:00:00Z"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 4.2 Preview Broadcast Recipients

#### Inputs

**API Endpoint:** `POST /api/v1/admin/notifications/broadcasts/{id}/preview`

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/broadcasts/{id}/preview` (POST)
2. **API Gateway validates JWT** → Verifies admin role
3. **Admin Controller fetches broadcast**
4. **Admin Controller counts target recipients**
   ```sql
   -- If targetAllUsers = true
   SELECT COUNT(*) as total_users
   FROM users
   WHERE deleted_at IS NULL
     AND is_active = true;

   -- If targetFilter provided (example: active users with broker connection)
   -- Query user_db for users matching filter
   SELECT COUNT(*) as total_users
   FROM users u
   WHERE u.deleted_at IS NULL
     AND u.is_active = true
     AND ($1::boolean IS NULL OR EXISTS (
       SELECT 1 FROM broker_connections bc
       WHERE bc.user_id = u.id
         AND bc.status = 'active'
     ))
     AND ($2::int IS NULL OR u.last_login_at > NOW() - INTERVAL '1 day' * $2);
   ```
5. **Return recipient preview**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "broadcastId": "uuid",
    "targeting": {
      "targetAllUsers": false,
      "targetFilter": {
        "has_broker_connection": true,
        "last_active_within_days": 30
      }
    },
    "estimatedRecipients": {
      "total": 1250,
      "emailEnabled": 1180,
      "inAppEnabled": 1245
    },
    "sampleRecipients": [
      {"userId": "uuid-1", "email": "user1@example.com"},
      {"userId": "uuid-2", "email": "user2@example.com"},
      {"userId": "uuid-3", "email": "user3@example.com"}
    ]
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 4.3 Send Broadcast (Immediate or Schedule)

#### Inputs

**API Endpoint:** `POST /api/v1/admin/notifications/broadcasts/{id}/send`

**Request Body (optional - for scheduling):**
```json
{
  "scheduledAt": "2024-12-20T09:00:00Z"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/broadcasts/{id}/send` (POST)
2. **API Gateway validates JWT** → Verifies admin role, extracts admin_id
3. **Admin Controller fetches broadcast**
   - Verify status is 'draft' or 'scheduled'
4. **If scheduledAt provided:**
   - Update broadcast with scheduled time
   ```sql
   UPDATE broadcast_notifications
   SET status = 'scheduled',
       scheduled_at = $2,
       updated_at = NOW()
   WHERE id = $1
   RETURNING *;
   ```
   - Scheduler will pick up and send at scheduled time
5. **If immediate send:**
   - Update status to 'sending'
   ```sql
   UPDATE broadcast_notifications
   SET status = 'sending',
       approved_by = $2,
       updated_at = NOW()
   WHERE id = $1;
   ```
6. **Query target recipients**
   ```sql
   -- Example for targetAllUsers with email preferences
   SELECT u.id, u.email, np.email_system_broadcast, np.inapp_system_broadcast
   FROM users u
   LEFT JOIN notification_preferences np ON u.id = np.user_id
   WHERE u.deleted_at IS NULL
     AND u.is_active = true;
   ```
7. **Update total recipients count**
   ```sql
   UPDATE broadcast_notifications
   SET total_recipients = $2
   WHERE id = $1;
   ```
8. **For each recipient batch (100 users):**
   - Create in-app notifications (if enabled)
   ```sql
   INSERT INTO notifications (user_id, type, priority, title, message, data, created_at)
   SELECT
     u.id,
     'system_broadcast',
     $2,
     $3,
     $4,
     jsonb_build_object('broadcast_id', $5),
     NOW()
   FROM unnest($1::uuid[]) AS u(id)
   ON CONFLICT DO NOTHING;
   ```
   - Queue email jobs to Service Bus (if enabled)
   ```json
   {
     "messageId": "uuid",
     "eventType": "notification.email.broadcast",
     "payload": {
       "broadcastId": "uuid",
       "recipientBatch": ["user-id-1", "user-id-2"],
       "title": "System Maintenance Scheduled",
       "message": "..."
     }
   }
   ```
9. **Update broadcast statistics**
   ```sql
   UPDATE broadcast_notifications
   SET
     status = 'sent',
     sent_at = NOW(),
     inapp_created = $2,
     emails_sent = $3,
     updated_at = NOW()
   WHERE id = $1;
   ```
10. **Return send result**

#### Outputs

**Success Response - Immediate Send (200 OK):**
```json
{
  "success": true,
  "data": {
    "broadcast": {
      "id": "uuid",
      "status": "sent",
      "sentAt": "2024-12-16T12:00:05Z",
      "statistics": {
        "totalRecipients": 1250,
        "inAppCreated": 1245,
        "emailsQueued": 1180
      }
    },
    "message": "Broadcast sent successfully to 1250 recipients"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:05Z",
    "version": "v1"
  }
}
```

**Success Response - Scheduled (200 OK):**
```json
{
  "success": true,
  "data": {
    "broadcast": {
      "id": "uuid",
      "status": "scheduled",
      "scheduledAt": "2024-12-20T09:00:00Z",
      "estimatedRecipients": 1250
    },
    "message": "Broadcast scheduled for December 20, 2024 at 9:00 AM UTC"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 4.4 Cancel Scheduled Broadcast

#### Inputs

**API Endpoint:** `POST /api/v1/admin/notifications/broadcasts/{id}/cancel`

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/broadcasts/{id}/cancel` (POST)
2. **API Gateway validates JWT** → Verifies admin role
3. **Admin Controller fetches broadcast**
   - Verify status is 'scheduled'
4. **Update status to cancelled**
   ```sql
   UPDATE broadcast_notifications
   SET status = 'cancelled',
       updated_at = NOW()
   WHERE id = $1
     AND status = 'scheduled'
   RETURNING *;
   ```
5. **Return cancellation result**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "broadcast": {
      "id": "uuid",
      "status": "cancelled"
    },
    "message": "Scheduled broadcast has been cancelled"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "CANNOT_CANCEL",
    "message": "Cannot cancel broadcast with status 'sent'"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 4.5 List Broadcasts

#### Inputs

**API Endpoint:** `GET /api/v1/admin/notifications/broadcasts`

**Query Parameters:**
- `status` (string, optional): Filter by status (draft, scheduled, sending, sent, cancelled)
- `page` (int, optional): Page number (default: 1)
- `limit` (int, optional): Items per page (default: 20, max: 50)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/broadcasts` (GET)
2. **API Gateway validates JWT** → Verifies admin role
3. **Admin Controller queries broadcasts**
   ```sql
   SELECT
     id, title, priority, status,
     target_all_users, total_recipients,
     send_email, send_in_app,
     scheduled_at, sent_at,
     emails_sent, inapp_created,
     created_by, created_at
   FROM broadcast_notifications
   WHERE ($1::varchar IS NULL OR status = $1)
   ORDER BY created_at DESC
   LIMIT $2 OFFSET $3;
   ```
4. **Return broadcast list**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "broadcasts": [
      {
        "id": "uuid",
        "title": "System Maintenance Scheduled",
        "priority": "high",
        "status": "sent",
        "targetAllUsers": true,
        "totalRecipients": 1250,
        "channels": {
          "sendEmail": true,
          "sendInApp": true
        },
        "statistics": {
          "emailsSent": 1180,
          "inAppCreated": 1245
        },
        "scheduledAt": null,
        "sentAt": "2024-12-16T12:00:05Z",
        "createdBy": "admin-user-id",
        "createdAt": "2024-12-16T11:55:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 45,
      "totalPages": 3
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 4.6 Get Broadcast Details

#### Inputs

**API Endpoint:** `GET /api/v1/admin/notifications/broadcasts/{id}`

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/notifications/broadcasts/{id}` (GET)
2. **API Gateway validates JWT** → Verifies admin role
3. **Admin Controller queries broadcast with details**
   ```sql
   SELECT * FROM broadcast_notifications WHERE id = $1;
   ```
4. **If sent, query delivery statistics**
   ```sql
   SELECT
     status,
     COUNT(*) as count
   FROM email_deliveries
   WHERE notification_type = 'system_broadcast'
     AND data->>'broadcast_id' = $1
   GROUP BY status;
   ```
5. **Return broadcast details**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "broadcast": {
      "id": "uuid",
      "title": "System Maintenance Scheduled",
      "message": "Yieldly will undergo scheduled maintenance...",
      "priority": "high",
      "targeting": {
        "targetAllUsers": true,
        "targetUserIds": null,
        "targetFilter": null
      },
      "channels": {
        "sendEmail": true,
        "sendInApp": true
      },
      "status": "sent",
      "scheduledAt": null,
      "sentAt": "2024-12-16T12:00:05Z",
      "statistics": {
        "totalRecipients": 1250,
        "inAppCreated": 1245,
        "emailDelivery": {
          "sent": 1100,
          "delivered": 1080,
          "opened": 450,
          "failed": 20,
          "bounced": 5
        }
      },
      "createdBy": "admin-user-id",
      "approvedBy": "admin-user-id",
      "createdAt": "2024-12-16T11:55:00Z",
      "updatedAt": "2024-12-16T12:00:05Z"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria
- Broadcast created in draft status
- Recipient preview shows accurate counts
- Broadcast sent to all targeted users
- In-app notifications created
- Emails queued for delivery
- Statistics tracked accurately

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Access denied" |
| Broadcast not found | 404 | Return "Broadcast not found" |
| Invalid status transition | 400 | Return "Cannot send broadcast with status X" |
| Invalid targeting | 400 | Return validation errors |
| No recipients match filter | 400 | Return "No users match the targeting criteria" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Recipient count query: < 500ms
- In-app notification batch insert: 100 users per batch
- Email queuing: Async via Service Bus
- Large broadcasts (>10,000 users): Process in background

#### Dependencies

**Database:**
- `notification_db` (PostgreSQL) - Tables: `broadcast_notifications`, `notifications`, `email_deliveries`
- `user_db` (PostgreSQL) - Tables: `users`, `notification_preferences`
- Verify schema: docs/01-phase/database-schemas/notification_db_schema.dbml

**Message Queue:**
- Azure Service Bus - For email delivery queue

**Cache:**
- Redis - For recipient count caching

#### Notes

**Targeting Filters:**
Supported filter options for `target_filter`:
- `has_broker_connection` (boolean): Users with active broker connections
- `last_active_within_days` (int): Users active within N days
- `registered_after` (ISO8601): Users registered after date
- `subscription_tier` (string): Users on specific tier (future)

**Status Flow:**
```
draft → scheduled → sending → sent
         ↓
      cancelled
```

**Rate Limiting:**
- Max 5 broadcasts per hour per admin
- Max 3 scheduled broadcasts pending at once

**Approval Workflow (Future):**
For large broadcasts (>1000 users), consider requiring approval from second admin.

---


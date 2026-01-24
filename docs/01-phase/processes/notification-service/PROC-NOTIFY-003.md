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

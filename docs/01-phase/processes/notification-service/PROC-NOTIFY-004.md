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

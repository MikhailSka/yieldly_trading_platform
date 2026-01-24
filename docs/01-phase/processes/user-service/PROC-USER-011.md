### PROC-USER-011: Admin - Suspend User Account

**Service Owner:** User Service
**Related FR:** FR-ADMIN-001
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-032

#### Trigger
Admin suspends user account due to policy violation

#### Actor
Admin

#### Preconditions
- User has admin role
- Target user account exists
- Target user is not already suspended

#### Inputs

**API Endpoint:** `POST /api/v1/admin/users/{user_id}/suspend`

**Request Body:**
```json
{
  "reason": "string (required, max 500 chars)",
  "notifyUser": "boolean (optional, default true)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/users/{user_id}/suspend` (POST)
2. **API Gateway validates JWT** → Extracts admin user_id and role
3. **Admin Controller validates admin permissions**
   - Check if requesting user has `role = 'admin'`
   - Return 403 if not admin
4. **User Repository retrieves target user**
   ```sql
   SELECT user_id, email, status
   FROM users
   WHERE user_id = $1;
   ```
5. **Admin Controller validates suspension**
   - If user not found → Return 404
   - If already suspended → Return 409 "User already suspended"
6. **User Repository updates user status**
   ```sql
   UPDATE users
   SET status = 'suspended',
       suspended_at = NOW(),
       suspended_by = $2,
       suspension_reason = $3,
       updated_at = NOW()
   WHERE user_id = $1;
   ```
7. **Session Manager invalidates all user sessions**
   ```
   DEL session:{user_id}
   ```
8. **User Activity Logger records suspension**
   ```sql
   INSERT INTO user_activity_logs (
     user_id, activity_type, activity_description,
     admin_user_id, created_at
   ) VALUES (
     $1, 'account_suspended', $2, $3, NOW()
   );
   ```
9. **Notification Service sends email** (if notifyUser = true)
   - Publish to Service Bus topic: `notification.email.account_suspended`
   - Event message format (ADR-032):
   ```json
   {
     "messageId": "uuid",
     "eventType": "user.suspension.completed",
     "timestamp": "2024-12-01T12:00:00Z",
     "version": "1.0",
     "source": {
       "service": "user-service",
       "instance": "instance-id"
     },
     "payload": {
       "userId": "uuid",
       "email": "string",
       "reason": "string",
       "suspendedBy": "admin_user_id",
       "suspendedAt": "2024-12-01T12:00:00Z"
     },
     "metadata": {
       "correlationId": "uuid",
       "causationId": "uuid",
       "userId": "uuid"
     }
   }
   ```
10. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "status": "suspended",
    "suspendedAt": "2024-12-01T12:00:00Z",
    "message": "User account suspended successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (403 Forbidden - Not Admin):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin permissions required",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (409 Conflict - Already Suspended):**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "User account is already suspended",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- User status updated to 'suspended'
- All sessions invalidated
- Activity logged
- User notified via email (if requested)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| User not found | 404 | Return "User not found" |
| Already suspended | 409 | Return "User account is already suspended" |
| Invalid reason | 400 | Return "Suspension reason is required" |
| Database error | 500 | Log error, rollback, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards (admin role verification)

**Process-Specific Notes:**
- **Database Queries**: 3 queries (user lookup, status update, activity log)
- **Cache Operations**: 1 delete (session invalidation)
- **Expected Execution Time**: < 200ms (excluding email send)
- **Email Delivery**: Async via Service Bus

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`, `user_activity_logs`

**Cache:**
- Redis - session invalidation

**Message Queue:**
- Azure Service Bus - topics: `notification.email.account_suspended`

**External Services:**
- SendGrid (via Notification Service) - email delivery

---

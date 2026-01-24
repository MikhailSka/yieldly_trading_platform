### PROC-USER-016: Admin - View User Details

**Service Owner:** User Service
**Related FR:** FR-ADMIN-002
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-032

#### Trigger
Admin clicks on a user in the admin panel to view details

#### Actor
Admin

#### Preconditions
- User has admin role
- Target user exists

#### Inputs

**API Endpoint:** `GET /api/v1/admin/users/{user_id}`

**Path Parameters:**
- `user_id`: UUID (required)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/users/{user_id}` (GET)
2. **API Gateway validates JWT** → Extracts admin user_id and role
3. **Admin Controller validates admin permissions**
   - Check if requesting user has `role = 'admin'`
   - Return 403 if not admin
4. **User Repository retrieves comprehensive user data**
   ```sql
   SELECT
     u.id, u.email, u.email_verified, u.email_verified_at,
     u.auth_provider, u.auth_provider_id,
     u.status, u.role, u.invited_by_code,
     u.last_login_at, u.last_login_ip,
     u.failed_login_attempts, u.locked_until,
     u.suspended_at, u.suspended_by, u.suspension_reason,
     u.deletion_scheduled_at,
     u.created_at, u.updated_at, u.deleted_at,
     p.first_name, p.last_name, p.display_name,
     p.avatar_url, p.bio, p.trading_experience,
     pr.theme, pr.language, pr.timezone,
     pr.email_notifications_enabled, pr.in_app_notifications_enabled
   FROM users u
   LEFT JOIN user_profiles p ON u.id = p.user_id
   LEFT JOIN user_preferences pr ON u.id = pr.user_id
   WHERE u.id = $1;
   ```
5. **If user not found** → Return 404
6. **User Repository fetches usage statistics**
   ```sql
   -- Strategy count
   SELECT COUNT(*) as strategy_count
   FROM strategies
   WHERE user_id = $1 AND deleted_at IS NULL;

   -- Backtest count
   SELECT COUNT(*) as backtest_count
   FROM backtest_runs
   WHERE user_id = $1;

   -- Last activity
   SELECT activity_type, created_at
   FROM user_activity_logs
   WHERE user_id = $1
   ORDER BY created_at DESC
   LIMIT 10;
   ```
7. **If user suspended**:
   - Fetch admin who suspended
   ```sql
   SELECT id, email, CONCAT(first_name, ' ', last_name) as admin_name
   FROM users u
   JOIN user_profiles p ON u.id = p.user_id
   WHERE u.id = $1;
   ```
8. **Return user details**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "email": "string",
    "emailVerified": true,
    "emailVerifiedAt": "2024-11-15T10:30:00Z",
    "authProvider": "email",
    "status": "active",
    "role": "trader",
    "profile": {
      "firstName": "string",
      "lastName": "string",
      "displayName": "string",
      "avatarUrl": "string",
      "bio": "string",
      "tradingExperience": "intermediate"
    },
    "preferences": {
      "theme": "dark",
      "language": "en",
      "timezone": "America/New_York",
      "emailNotificationsEnabled": true,
      "inAppNotificationsEnabled": true
    },
    "security": {
      "lastLoginAt": "2024-12-01T08:00:00Z",
      "lastLoginIp": "192.168.1.1",
      "failedLoginAttempts": 0,
      "lockedUntil": null,
      "suspendedAt": null,
      "suspendedBy": null,
      "suspensionReason": null,
      "deletionScheduledAt": null
    },
    "statistics": {
      "strategyCount": 5,
      "backtestCount": 12,
      "lastActivities": [
        {
          "activityType": "profile_updated",
          "timestamp": "2024-12-01T10:00:00Z"
        }
      ]
    },
    "invitedByCode": "BETA-XXXX-XXXX",
    "createdAt": "2024-01-15T12:00:00Z",
    "updatedAt": "2024-12-01T10:00:00Z"
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

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "User not found",
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
- User details retrieved
- Statistics calculated
- Security information included
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| User not found | 404 | Return "User not found" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards (admin role verification)

**Process-Specific Notes:**
- **Database Queries**: 4-5 queries (user data, strategy count, backtest count, recent activity, optional suspended_by admin)
- **Expected Execution Time**: < 300ms
- **Admin Only**: Exposes sensitive data (IP addresses, security info, full preferences)

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`, `user_profiles`, `user_preferences`, `user_activity_logs`
- `strategy_db` (PostgreSQL) - for strategy count
- `backtest_db` (PostgreSQL) - for backtest count

---

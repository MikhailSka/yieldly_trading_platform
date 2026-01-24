### PROC-USER-010: GDPR Account Deletion

**Service Owner:** User Service
**Related FR:** FR-PROFILE-006
**Related NFR:** NFR-PERF-001, NFR-COMP-001
**Related ADR:** ADR-027, ADR-032

#### Trigger
User requests account deletion from settings

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User confirms deletion (requires password re-entry)

#### Inputs

**API Endpoint:** `POST /api/v1/users/delete-account`

**Request Body:**
```json
{
  "password": "string (required)",
  "confirmation": "DELETE MY ACCOUNT (required, case-sensitive)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/users/delete-account` (POST)
2. **Profile Controller validates password**
   - Fetch password_hash from database
   - Verify with bcrypt
   - Return 401 if incorrect
3. **Profile Controller validates confirmation text**
   - Must exactly match "DELETE MY ACCOUNT"
   - Case-sensitive
4. **Profile Controller marks account for deletion**
   ```sql
   UPDATE users
   SET account_status = 'pending_deletion',
       deletion_scheduled_at = NOW() + INTERVAL '30 days',
       updated_at = NOW()
   WHERE user_id = $1
   ```
5. **Session Manager invalidates all sessions**
   ```
   DEL session:{user_id}
   ```
6. **Notification Service sends deletion scheduled email**
   - "Your account will be deleted in 30 days"
   - Include cancellation link
7. **Return success response**
8. **After 30-day grace period, Scheduled Job runs:**
9. **Deletion Worker collects all data to delete**:
   - User profile and credentials
   - Strategies
   - Backtest results
   - Portfolio snapshots
   - Broker connections (revoke API keys)
   - Media files (avatars, strategy images)
   - Notification history
10. **Worker deletes data from all services**:
    ```sql
    -- User Service
    DELETE FROM users WHERE user_id = $1;
    
    -- Strategy Service
    DELETE FROM strategies WHERE user_id = $1;
    
    -- Backtesting Service
    DELETE FROM backtest_runs WHERE user_id = $1;
    
    -- Portfolio Service
    DELETE FROM portfolio_snapshots WHERE user_id = $1;
    
    -- Broker Service
    DELETE FROM broker_connections WHERE user_id = $1;
    
    -- Notification Service
    DELETE FROM notifications WHERE user_id = $1;
    ```
11. **Worker deletes media from Azure Blob Storage**
    - Delete `avatars/{user_id}/` folder
    - Delete `strategy-images/{user_id}/` folder
12. **Worker revokes Azure Key Vault secrets**
    - Delete all stored API keys for user
13. **Worker logs deletion completion**
    ```sql
    INSERT INTO gdpr_deletion_log (user_id, deleted_at, deleted_by)
    VALUES ($1, NOW(), 'system')
    ```
14. **Notification Service sends deletion confirmation**
    - Final email: "Your account has been deleted"

#### Outputs

**Immediate Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "pending_deletion",
    "deletionScheduledAt": "2025-12-23T12:00:00Z",
    "message": "Your account is scheduled for deletion in 30 days. You can cancel this within 30 days by logging in."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (401 Unauthorized - Incorrect Password):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Incorrect password",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (400 Bad Request - Wrong Confirmation Text):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Confirmation text must match exactly: DELETE MY ACCOUNT",
    "details": [
      {
        "field": "confirmation",
        "message": "Confirmation text must match exactly",
        "code": "INVALID_CONFIRMATION"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Email (Immediate):**
```
Subject: Account Deletion Scheduled

Your Yieldly account is scheduled for permanent deletion on 2025-12-23.

During this 30-day period, you can cancel the deletion by logging in to your account.

After 30 days, all your data will be permanently deleted and cannot be recovered:
- User profile and settings
- Trading strategies
- Backtest results
- Portfolio history
- Broker connections

If you did not request this deletion, please log in immediately to cancel.
```

#### Success Criteria
- Account marked for deletion
- All sessions invalidated
- User cannot log in (except to cancel deletion)
- Email sent with cancellation instructions
- After 30 days, all data permanently deleted

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Incorrect password | 401 | Return "Incorrect password" |
| Wrong confirmation text | 400 | Return "Confirmation text must match exactly" |
| Database error | 500 | Log error, do not proceed |
| Deletion worker failure | N/A | Retry 3 times, alert admin if fails |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-COMP-001**: GDPR Compliance (account deletion within 30 days)

**Process-Specific Notes:**
- **Immediate Response Time**: < 200ms (marking account for deletion)
- **Background Deletion Processing**: Completed within 24 hours after 30-day grace period
- **30-Day Grace Period**: User can cancel deletion by logging in
- **Database Queries**: 2 queries (password verification, account status update)

#### Dependencies
**Database:**
- All service databases (for deletion)
- `user_db`, `strategy_db`, `backtest_db`, `portfolio_db`, `broker_db`, `notification_db`
- Tables: `users`, `gdpr_deletion_log`

**Cache:**
- Redis - session invalidation

**Message Queue:**
- Azure Service Bus - scheduled deletion jobs

**External Services:**
- SendGrid (via Notification Service) - email delivery

**Storage:**
- Azure Blob Storage - media deletion: `avatars/{user_id}/`, `strategy-images/{user_id}/`

**Secrets/Key Vault:**
- Azure Key Vault - API key revocation for user

---

### PROC-USER-004: Password Reset Flow

**Service Owner:** User Service
**Related FR:** FR-AUTH-003
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-032  

#### Trigger
User clicks "Forgot Password" and submits email

#### Actor
Registered User

#### Preconditions
- User account exists
- Email is verified

#### Inputs

**Step 1 - Request Reset:**

**API Endpoint:** `POST /api/v1/auth/password-reset/request`

**Request Body:**
```json
{
  "email": "string (required, RFC 5322 format)"
}
```

**Step 2 - Reset Password:**

**API Endpoint:** `POST /api/v1/auth/password-reset/confirm`

**Request Body:**
```json
{
  "resetToken": "jwt_string (required)",
  "newPassword": "string (required, min 8 chars, 1 uppercase, 1 number, 1 special)"
}
```

#### Process Steps - Request Reset

1. **API Gateway receives request** → `/api/v1/auth/password-reset/request`
2. **Auth Controller validates email format**
3. **User Repository checks if user exists**
   ```sql
   SELECT user_id, email, account_status
   FROM users
   WHERE email = $1
   ```
4. **If user not found** → Return success anyway (prevent enumeration)
5. **If account suspended** → Return success anyway (security)
6. **Session Manager generates reset token**
   - JWT with 1-hour expiration
   - Payload: `{ user_id, email, type: 'password_reset', exp }`
7. **User Repository stores reset token**
   ```sql
   INSERT INTO password_reset_tokens (
     user_id, token_hash, status, expires_at, created_at
   ) VALUES (
     $1, $2, 'active', NOW() + INTERVAL '1 hour', NOW()
   );
   ```
8. **Notification Service sends reset email**
   - Publish to Service Bus topic: `notification.email.password_reset`
   - Event message format (ADR-032):
   ```json
   {
     "messageId": "uuid",
     "eventType": "user.password.requested",
     "timestamp": "2024-12-01T12:00:00Z",
     "version": "1.0",
     "source": {
       "service": "user-service",
       "instance": "instance-id"
     },
     "payload": {
       "userId": "uuid",
       "email": "string",
       "resetToken": "jwt_string",
       "resetLink": "https://app.yieldly.com/reset-password?token={token}",
       "expiresAt": "2024-12-01T13:00:00Z"
     },
     "metadata": {
       "correlationId": "uuid",
       "causationId": "uuid",
       "userId": "uuid"
     }
   }
   ```
9. **Return success response**

#### Process Steps - Reset Password

1. **API Gateway receives request** → `/api/v1/auth/password-reset/confirm`
2. **Session Manager validates reset token**
   - Verify JWT signature
   - Check expiration
   - Extract user_id from payload
3. **User Repository retrieves reset token**
   ```sql
   SELECT id, user_id, token_hash, status, expires_at
   FROM password_reset_tokens
   WHERE user_id = $1
     AND status = 'active'
     AND expires_at > NOW()
   ORDER BY created_at DESC
   LIMIT 1;
   ```
4. **Auth Controller verifies token matches**
   - Compare token hash with stored hash
   - Check token found and not expired
   - Return 400 if invalid or expired
5. **Auth Controller validates new password**
   - Check password strength requirements
6. **Session Manager generates new password hash**
   - bcrypt with cost factor 12
7. **User Repository updates password and marks token as used**
   ```sql
   -- Update password
   UPDATE users
   SET password_hash = $1,
       updated_at = NOW()
   WHERE user_id = $2;

   -- Mark token as used
   UPDATE password_reset_tokens
   SET status = 'used',
       used_at = NOW()
   WHERE id = $3;
   ```
8. **Session Manager invalidates all existing sessions**
   ```
   DEL session:{user_id}
   ```
9. **Notification Service sends confirmation email**
   - "Your password was changed"
10. **Return success response**

#### Outputs

**Request Reset Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "If an account exists with this email, you will receive password reset instructions."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Reset Password Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Password successfully reset. Please log in with your new password."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request - Invalid Token):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_RESET_TOKEN",
    "message": "Invalid or expired reset token",
    "details": []
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Reset token generated and stored
- Email sent with reset link
- Password updated successfully
- All sessions invalidated

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid reset token | 400 | Return "Invalid or expired reset token" |
| Weak new password | 400 | Return password requirements |
| Token expired | 400 | Return "Reset token expired, request new one" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards

**Process-Specific Notes:**
- **Request Reset Database Queries**: 2 queries (user lookup, token INSERT)
- **Reset Password Database Queries**: 3 queries (token lookup, password UPDATE, token UPDATE)
- **Cache Operations**: 1 delete (session invalidation)
- **Expected Execution Time**:
  - Request Reset: < 200ms (excluding email send)
  - Reset Password: < 300ms
- **Security Considerations**: Returns success even if user not found (prevents enumeration)
- **Token Management**: Separate table allows for better audit trail and token status tracking

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`, `password_reset_tokens`

**Cache:**
- Redis - session invalidation

**Message Queue:**
- Azure Service Bus - topics: `notification.email.password_reset`

**External Services:**
- SendGrid (via Notification Service) - email delivery

**Libraries:**
- bcrypt - password hashing
- JWT - reset token generation and validation

**Secrets/Key Vault:**
- Azure Key Vault - JWT signing keys

---

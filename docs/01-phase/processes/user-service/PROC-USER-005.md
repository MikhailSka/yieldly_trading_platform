### PROC-USER-005: Email Verification

**Service Owner:** User Service
**Related FR:** FR-AUTH-004
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-032  

#### Trigger
User clicks verification link in email

#### Actor
Newly Registered User

#### Preconditions
- User has registered
- Verification token is valid and not expired

#### Inputs

**API Endpoint:** `GET /api/v1/auth/verify-email`

**Query Parameters:**
```
GET /api/v1/auth/verify-email?token={jwt_token}
```

#### Process Steps

1. **API Gateway receives request** → Routes to User Service
2. **Auth Controller extracts token from query parameter**
3. **Session Manager validates verification token**
   - Verify JWT signature
   - Check expiration (24 hours)
   - Extract user_id and email from payload
4. **User Repository retrieves user**
   ```sql
   SELECT user_id, email, email_verified, account_status
   FROM users
   WHERE user_id = $1 AND email = $2
   ```
5. **Auth Controller checks current status**
   - If already `email_verified = true` → Return success (idempotent)
   - If account suspended → Return error
6. **User Repository updates verification status**
   ```sql
   UPDATE users
   SET email_verified = true,
       account_status = 'active',
       email_verified_at = NOW()
   WHERE user_id = $1
   ```
7. **Notification Service sends welcome email**
   - Publish to Service Bus topic: `notification.email.welcome`
   - Event message format (ADR-032):
   ```json
   {
     "messageId": "uuid",
     "eventType": "user.registration.completed",
     "timestamp": "2024-12-01T12:00:00Z",
     "version": "1.0",
     "source": {
       "service": "user-service",
       "instance": "instance-id"
     },
     "payload": {
       "userId": "uuid",
       "email": "string"
     },
     "metadata": {
       "correlationId": "uuid",
       "causationId": "uuid",
       "userId": "uuid"
     }
   }
   ```
8. **Frontend redirects to login page**
   - With success message

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Email verified successfully. You can now log in."
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
    "code": "INVALID_VERIFICATION_TOKEN",
    "message": "Invalid verification link",
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
- Email marked as verified
- Account status changed to "active"
- Welcome email sent
- Redirect to login

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid token | 400 | Return "Invalid verification link" |
| Expired token | 400 | Return "Verification link expired" |
| User not found | 404 | Return "User not found" |
| Already verified | 200 | Return success (idempotent) |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards

**Process-Specific Notes:**
- **Database Queries**: 2 queries (user lookup, verification status update)
- **Expected Execution Time**: < 200ms (excluding email send)
- **Email Delivery**: Async via Service Bus

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`

**Message Queue:**
- Azure Service Bus - topics: `notification.email.welcome`

**Libraries:**
- JWT - token validation

---

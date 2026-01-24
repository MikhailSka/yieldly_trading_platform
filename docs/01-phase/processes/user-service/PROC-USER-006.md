### PROC-USER-006: Session Management and JWT Refresh

**Service Owner:** User Service
**Related FR:** FR-AUTH-005
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-032  

#### Trigger
Access token expires (15 minutes)

#### Actor
Authenticated User

#### Preconditions
- User has valid refresh token
- Refresh token has not expired (7 days)

#### Inputs

**API Endpoint:** `POST /api/v1/auth/refresh`

**Request Body:**
```json
{
  "refreshToken": "jwt_string (required)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/auth/refresh`
2. **Session Manager validates refresh token**
   - Verify JWT signature
   - Check expiration (7 days)
   - Extract user_id from payload
3. **User Repository retrieves user**
   ```sql
   SELECT user_id, account_status
   FROM users
   WHERE user_id = $1
   ```
4. **Auth Controller checks account status**
   - If suspended or pending deletion → Invalidate session, return 403
5. **Cache Manager checks session exists in Redis**
   ```
   GET session:{user_id}
   ```
   - If not found → Token may be revoked, return 401
6. **Session Manager generates new access token**
   - JWT with 15-minute expiration
   - Same payload as original access token
7. **Session Manager optionally rotates refresh token**
   - If refresh token is >3 days old, generate new one
   - Improves security through rotation
8. **Cache Manager updates session in Redis**
   ```
   SET session:{user_id} {new_tokens}
   EXPIRE session:{user_id} 900
   ```
9. **Return new tokens**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "new_jwt_string",
    "refreshToken": "same_or_new_jwt_string"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (401 Unauthorized - Invalid Token):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_REFRESH_TOKEN",
    "message": "Invalid or expired refresh token",
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
- New access token generated
- Session updated in cache
- User continues working seamlessly

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid refresh token | 401 | Force user to log in again |
| Expired refresh token | 401 | Force user to log in again |
| Account suspended | 403 | Invalidate session, return error |
| Session not in cache | 401 | Force re-authentication |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards

**Process-Specific Notes:**
- **Database Queries**: 1 query (user lookup for account status)
- **Cache Operations**: 2 operations (read session, update session)
- **Expected Execution Time**: < 150ms
- **Security Note**: Refresh token rotation after 3 days for enhanced security

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`

**Cache:**
- Redis - session storage with 15-minute TTL

**Libraries:**
- JWT - token generation and validation

---

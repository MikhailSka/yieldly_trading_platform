### PROC-USER-015: User Logout

**Service Owner:** User Service
**Related FR:** FR-AUTH-002
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-032

#### Trigger
User clicks logout button or session timeout occurs

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Valid JWT access token provided

#### Inputs

**API Endpoint:** `POST /api/v1/auth/logout`

**Request Body:**
```json
{
  "refreshToken": "jwt_string (optional, if provided will be invalidated)"
}
```

#### Process Steps

1. **API Gateway receives request** → Routes to User Service `/api/v1/auth/logout`
2. **API Gateway validates JWT** → Extracts user_id from access token
3. **Auth Controller receives request**
4. **Session Manager invalidates session in Redis**
   ```
   DEL session:{user_id}
   ```
5. **If refresh token provided**:
   - Validate refresh token signature
   - Extract user_id (verify matches access token user_id)
   - Mark as revoked in cache (optional blacklist with TTL until expiration)
6. **User Activity Logger records logout** (optional)
   ```sql
   INSERT INTO user_activity_logs (
     user_id, activity_type, activity_description,
     ip_address, user_agent, created_at
   ) VALUES (
     $1, 'logout', 'User logged out',
     $2, $3, NOW()
   );
   ```
7. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Successfully logged out"
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
    "code": "INVALID_TOKEN",
    "message": "Invalid or expired access token",
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
- Session removed from Redis
- Refresh token invalidated (if provided)
- User activity logged (optional)
- HTTP 200 OK returned

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid access token | 401 | Return "Invalid or expired access token" |
| Session not found | 200 | Return success (already logged out, idempotent) |
| Redis error | 200 | Log warning, return success (fail-open for logout) |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards

**Process-Specific Notes:**
- **Cache Operations**: 1 delete (session removal)
- **Database Queries**: 0-1 query (optional activity log)
- **Expected Execution Time**: < 50ms
- **Idempotent**: Multiple logout calls safe (returns success if already logged out)

#### Dependencies
**Database:**
- `user_db` (PostgreSQL) - optional for activity logging
- Tables: `user_activity_logs` (optional)

**Cache:**
- Redis - session removal: `session:{user_id}`

#### Notes
- **Idempotency**: Logout is idempotent - calling multiple times safe
- **Fail-Open**: If Redis unavailable, still return success (prefer availability for logout)
- **Token Blacklist**: Refresh token blacklist optional - tokens expire naturally in 7 days
- **Client-Side**: Frontend should clear tokens from storage regardless of API response

---

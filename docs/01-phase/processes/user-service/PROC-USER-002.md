### PROC-USER-002: User Login (Email/Password)

**Service Owner:** User Service
**Related FR:** FR-AUTH-002
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-007, ADR-032  

#### Trigger
User submits login credentials via Web Application

#### Actor
Registered User

#### Preconditions
- User has completed registration
- Email has been verified
- Account status is "active"
- Account is not suspended

#### Inputs

**API Endpoint:** `POST /api/v1/auth/login`

**Request Body:**
```json
{
  "email": "string (required, RFC 5322 format)",
  "password": "string (required)"
}
```

#### Process Steps

1. **API Gateway receives request** → Routes to User Service `/api/v1/auth/login`
2. **Auth Controller validates input**
   - Check required fields present
   - Validate email format
3. **User Repository retrieves user**
   ```sql
   SELECT user_id, email, password_hash, account_status, email_verified
   FROM users
   WHERE email = $1
   ```
4. **Auth Controller checks account status**
   - If `email_verified = false` → Return 403 "Email not verified"
   - If `account_status = 'suspended'` → Return 403 "Account suspended"
   - If `account_status = 'pending_deletion'` → Return 403 "Account pending deletion"
5. **Session Manager verifies password**
   - Use bcrypt.CompareHashAndPassword
   - Return 401 if password incorrect
6. **Session Manager generates JWT tokens**
   - **Access Token**: 15-minute expiration
     ```json
     {
       "userId": "uuid",
       "email": "string",
       "role": "beta_tester",
       "exp": 1234567890
     }
     ```
   - **Refresh Token**: 7-day expiration (stored in database)
7. **Cache Manager stores session in Redis**
   ```
   KEY: session:{user_id}
   VALUE: { access_token, refresh_token, last_activity }
   TTL: 15 minutes
   ```
8. **User Repository updates last_login**
   ```sql
   UPDATE users
   SET last_login = NOW()
   WHERE user_id = $1
   ```
9. **Response returned with tokens**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt_string",
    "refreshToken": "jwt_string",
    "user": {
      "userId": "uuid",
      "email": "string",
      "name": "string",
      "role": "beta_tester"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials",
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
- JWT tokens generated
- Session cached in Redis
- Last login timestamp updated
- HTTP 200 OK returned

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| User not found | 401 | Generic "Invalid credentials" |
| Wrong password | 401 | Generic "Invalid credentials" (prevent enumeration) |
| Email not verified | 403 | Return verification required message |
| Account suspended | 403 | Return suspension message |
| Redis connection error | 200 | Log warning, proceed without cache |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards

**Process-Specific Notes:**
- **Database Queries**: 2 queries (user lookup, last_login update)
- **Cache Operations**: 1 write to Redis
- **Expected Execution Time**: < 200ms
- **Cache Strategy**: Session data cached in Redis with 15-minute TTL

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`

**Cache:**
- Redis - session storage: `session:{user_id}` with 15-minute TTL

**Libraries:**
- bcrypt - password hashing and verification
- JWT - token generation and signing

**Secrets/Key Vault:**
- Azure Key Vault - JWT signing keys

---

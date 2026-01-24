### PROC-USER-003: OAuth Login (Google)

**Service Owner:** User Service
**Related FR:** FR-AUTH-002
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-007, ADR-032  

#### Trigger
User clicks "Sign in with Google" button

#### Actor
User (existing or new)

#### Preconditions
- Auth0 integration configured
- Google OAuth app configured in Auth0
- Redirect URLs whitelisted

#### Inputs

**API Endpoint:** `POST /api/v1/auth/oauth/callback`

**Request Body:**
```json
{
  "code": "string (required, OAuth authorization code from Auth0)",
  "state": "string (required, CSRF protection)"
}
```

#### Process Steps

1. **Frontend redirects to Auth0**
   - Build OAuth URL with client_id, redirect_uri, scope
2. **User authenticates with Google**
   - Handled by Auth0 + Google
3. **Auth0 redirects to callback URL**
   - Includes authorization code and state
4. **Frontend calls User Service** → `/api/v1/auth/oauth/callback`
5. **OAuth Handler exchanges code for tokens**
   - POST to Auth0 token endpoint
   - Receive: access_token, id_token, user_info
6. **OAuth Handler extracts user info**
   ```json
   {
     "email": "string",
     "name": "string",
     "picture": "url",
     "emailVerified": true
   }
   ```
7. **User Repository checks if user exists**
   ```sql
   SELECT user_id, account_status
   FROM users
   WHERE email = $1 AND oauth_provider = 'google'
   ```
8. **If user exists**: 
   - Check account status (same as PROC-USER-002)
   - Proceed to step 11
9. **If new user (first OAuth login)**:
   - Create user record with `email_verified = true`
   - Set `oauth_provider = 'google'`
   - Set `oauth_provider_id` from id_token
   - No password_hash stored
10. **If profile picture provided**:
    - Download image from Google
    - Upload to Azure Blob Storage
    - Store blob URL in user profile
11. **Session Manager generates JWT tokens** (same as PROC-USER-002)
12. **Cache Manager stores session** (same as PROC-USER-002)
13. **Response returned to frontend**

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
      "avatarUrl": "blob_url"
    },
    "isNewUser": false
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request - CSRF):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "Invalid state parameter - CSRF protection triggered",
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
- OAuth flow completed successfully
- User record exists (created or matched)
- JWT tokens generated
- Session cached

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid state parameter | 400 | CSRF protection triggered |
| Auth0 error | 502 | Return "Authentication service error" |
| Account suspended | 403 | Return suspension message |
| Database error | 500 | Log error, retry |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards

**Process-Specific Notes:**
- **Database Queries**: 1-2 queries (user lookup + optional user creation)
- **Cache Operations**: 1 write to Redis (session storage)
- **Expected Execution Time**: < 500ms (depends on Auth0 + Google response times)
- **External Dependencies**: Auth0 token exchange (typically 100-200ms)

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`, `user_profiles`

**Cache:**
- Redis - session storage

**External Services:**
- Auth0 - OAuth provider and token exchange
- Google - identity provider

**Storage:**
- Azure Blob Storage - avatar storage: `avatars/{user_id}/oauth_avatar.jpg`

---

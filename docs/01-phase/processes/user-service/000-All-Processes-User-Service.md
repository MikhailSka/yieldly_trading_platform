# User Service Processes - Consolidated

This document contains all process documentation for the User Service.

**Total Documents:** 18  
**Last Generated:** 2025-11-30T23:58:38.356Z  
**Source Directory:** `processes/user-service`


---

## Table of Contents

1. [PROC-USER-001](#proc-user-001)
2. [PROC-USER-002](#proc-user-002)
3. [PROC-USER-003](#proc-user-003)
4. [PROC-USER-004](#proc-user-004)
5. [PROC-USER-005](#proc-user-005)
6. [PROC-USER-006](#proc-user-006)
7. [PROC-USER-007](#proc-user-007)
8. [PROC-USER-008](#proc-user-008)
9. [PROC-USER-009](#proc-user-009)
10. [PROC-USER-010](#proc-user-010)
11. [PROC-USER-011](#proc-user-011)
12. [PROC-USER-012](#proc-user-012)
13. [PROC-USER-013](#proc-user-013)
14. [PROC-USER-014](#proc-user-014)
15. [PROC-USER-015](#proc-user-015)
16. [PROC-USER-016](#proc-user-016)
17. [PROC-USER-017](#proc-user-017)
18. [PROC-USER-018](#proc-user-018)

---

## PROC-USER-001: User Registration with Invite Code (Multi-Step)

**Source File:** `PROC-USER-001.md`  
**Path:** `processes\user-service\PROC-USER-001.md`

### PROC-USER-001: User Registration with Invite Code (Multi-Step)

**Service Owner:** User Service
**Related FR:** FR-AUTH-001
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-007, ADR-026, ADR-032

#### Trigger
User submits multi-step registration form with invite code via Web Application

#### Actor
New User (Beta Tester / Free User / Other)

#### Preconditions
- Valid invite code exists in system
- Invite code has not reached maximum uses
- Invite code has not expired
- Email address not already registered

#### Registration Flow Overview
Registration is a **3-step process**:
1. **Step 1**: Email/Password or OAuth authentication + invite code
2. **Step 2**: Email verification (for email/password users)
3. **Step 3**: Complete profile information (name, bio, preferences)

---

### Step 1: Initial Registration (Email/Password)

#### Inputs

**API Endpoint:** `POST /api/v1/auth/register`

**Request Body:**
```json
{
  "email": "string (required, RFC 5322 format)",
  "password": "string (required, min 8 chars, 1 uppercase, 1 number, 1 special)",
  "inviteCode": "string (required)",
  "authProvider": "email",
  "detectedTimezone": "string (required, IANA timezone format)"
}
```

#### Process Steps

1. **Frontend auto-detects timezone**
   - Use JavaScript: `Intl.DateTimeFormat().resolvedOptions().timeZone`
   - Example: `"America/New_York"`, `"Europe/Warsaw"`, `"UTC"`
   - Send to backend as `detected_timezone`
2. **API Gateway receives request** → Routes to User Service `/api/v1/auth/register`
3. **Auth Controller validates input**
   - Check required fields present
   - Validate email format (RFC 5322)
   - Validate password strength (min 8 chars, 1 uppercase, 1 number, 1 special)
   - Validate timezone format (IANA timezone database)
4. **Invite Code Manager validates code**
   - Query `invite_codes` table
   - Check `is_active = true`
   - Check `max_uses > current_uses` (if not unlimited)
   - Check `valid_until > NOW()` (if expiration set)
   - Return error if invalid
5. **User Repository checks email uniqueness**
   - Query `users` table WHERE `email = input.email`
   - Return error if exists
6. **Session Manager generates password hash**
   - Use bcrypt with cost factor 12
   - Salt automatically generated
7. **User Repository creates user record**
   ```sql
   INSERT INTO users (
     email, password_hash, auth_provider,
     role, status, invited_by_code, created_at
   ) VALUES (
     $1, $2, 'email',
     'trader', 'pending_verification', $3, NOW()
   ) RETURNING id;
   ```
8. **User Repository creates user_profiles record**
   ```sql
   INSERT INTO user_profiles (
     user_id, created_at, updated_at
   ) VALUES (
     $1, NOW(), NOW()
   );
   ```
9. **User Repository creates user_preferences record**
   ```sql
   INSERT INTO user_preferences (
     user_id, timezone, created_at, updated_at
   ) VALUES (
     $1, $2, NOW(), NOW()
   );
   ```
10. **Invite Code Manager increments usage**
    ```sql
    UPDATE invite_codes
    SET current_uses = current_uses + 1, updated_at = NOW()
    WHERE code = $1;
    ```
11. **Invite Code Manager records usage**
    ```sql
    INSERT INTO invite_code_usage (
      invite_code_id, user_id, used_at
    ) VALUES (
      $1, $2, NOW()
    );
    ```
12. **Session Manager generates verification token**
    - Create JWT with 24-hour expiration
    - Payload: `{ user_id, email, type: 'email_verification' }`
13. **User Repository stores verification token**
    ```sql
    INSERT INTO email_verification_tokens (
      user_id, token_hash, email, status, expires_at, created_at
    ) VALUES (
      $1, $2, $3, 'active', NOW() + INTERVAL '24 hours', NOW()
    );
    ```
14. **Notification Service sends verification email**
    - Publish to Service Bus topic: `notification.email.verification`
    - Event message format (ADR-032):
    ```json
    {
      "messageId": "uuid",
      "eventType": "user.verification.requested",
      "timestamp": "2024-12-01T12:00:00Z",
      "version": "1.0",
      "source": {
        "service": "user-service",
        "instance": "instance-id"
      },
      "payload": {
        "userId": "uuid",
        "email": "string",
        "verificationToken": "jwt_string",
        "verificationLink": "https://app.yieldly.com/verify?token={token}"
      },
      "metadata": {
        "correlationId": "uuid",
        "causationId": "uuid",
        "userId": "uuid"
      }
    }
    ```
15. **Response returned to client**

#### Outputs (Step 1)

**Success Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "email": "string",
    "status": "pending_verification",
    "message": "Registration successful. Please verify your email to continue.",
    "nextStep": "email_verification"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

### Step 1B: Initial Registration (OAuth - Google)

#### Inputs

**API Endpoint:** `POST /api/v1/auth/register/oauth`

**Request Body:**
```json
{
  "inviteCode": "string (required)",
  "oauthProvider": "google",
  "oauthCode": "string (required, authorization code from Google)",
  "detectedTimezone": "string (required, IANA timezone format)"
}
```

#### Process Steps

1. **Frontend auto-detects timezone** (same as Step 1)
2. **API Gateway receives request** → Routes to User Service `/api/v1/auth/register/oauth`
3. **OAuth Handler validates invite code** (same as Step 1)
4. **OAuth Handler exchanges code for tokens**
   - POST to Auth0/Google token endpoint
   - Receive: access_token, id_token, user_info
5. **OAuth Handler extracts user info**
   ```json
   {
     "email": "string",
     "name": "string",
     "picture": "url",
     "email_verified": true,
     "given_name": "string",
     "family_name": "string"
   }
   ```
6. **User Repository checks email uniqueness**
7. **User Repository creates user record**
   ```sql
   INSERT INTO users (
     email, email_verified, auth_provider, auth_provider_id,
     role, status, invited_by_code, created_at
   ) VALUES (
     $1, true, 'google', $2,
     'trader', 'active', $3, NOW()
   ) RETURNING id;
   ```
8. **User Repository creates user_profiles record**
   ```sql
   INSERT INTO user_profiles (
     user_id, first_name, last_name, display_name,
     created_at, updated_at
   ) VALUES (
     $1, $2, $3, $4, NOW(), NOW()
   );
   ```
   - `first_name` from `given_name`
   - `last_name` from `family_name`
   - `display_name` from `name`
9. **User Repository creates user_preferences record** (same as Step 1)
10. **If profile picture provided**:
    - Download image from Google
    - Upload to Azure Blob Storage: `avatars/{user_id}/oauth_avatar.jpg`
    - Update `user_profiles.avatar_url`
11. **Invite Code Manager increments usage** (same as Step 1)
12. **Session Manager generates JWT tokens**
    - Access token (15 min)
    - Refresh token (7 days)
13. **Response returned with tokens**

#### Outputs (Step 1B - OAuth)

**Success Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "email": "string",
    "status": "active",
    "accessToken": "jwt_string",
    "refreshToken": "jwt_string",
    "profile": {
      "firstName": "string",
      "lastName": "string",
      "displayName": "string",
      "avatarUrl": "url"
    },
    "message": "Registration successful. Please complete your profile.",
    "nextStep": "complete_profile"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

### Step 2: Email Verification (For Email/Password Users Only)

See **PROC-USER-005: Email Verification** for full details.

After verification:
- User `status` changes from `'pending_verification'` to `'active'`
- User receives welcome email
- User is redirected to complete profile (Step 3)

---

### Step 3: Complete Profile Information

#### Trigger
User completes profile after email verification or OAuth login

#### Inputs

**API Endpoint:** `POST /api/v1/users/profile/complete`

**Request Body:**
```json
{
  "firstName": "string (optional but recommended, max 100 chars)",
  "lastName": "string (optional but recommended, max 100 chars)",
  "displayName": "string (optional, defaults to firstName, max 100 chars)",
  "bio": "string (optional, max 500 chars)",
  "tradingExperience": "beginner|intermediate|advanced (optional, defaults to beginner)",
  "preferences": {
    "theme": "light|dark|system (optional, defaults to system)",
    "language": "en|pl|ru (optional, defaults to en)",
    "timezone": "string (optional, defaults to detectedTimezone, IANA format)",
    "emailNotificationsEnabled": "boolean (optional, defaults to true)",
    "inAppNotificationsEnabled": "boolean (optional, defaults to true)",
    "defaultChartTimeframe": "1m|5m|15m|1h|4h|1d (optional, defaults to 1h)",
    "defaultChartType": "candlestick|line|bar (optional, defaults to candlestick)"
  }
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/users/profile/complete` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Profile Controller validates input**
   - Validate name lengths (max 100 chars each)
   - Validate bio length (max 500 chars)
   - Validate enum values (experience, theme, language, timeframe, chart_type)
   - Validate timezone format (IANA timezone database)
4. **User Repository updates user_profiles**
   ```sql
   UPDATE user_profiles
   SET first_name = COALESCE($1, first_name),
       last_name = COALESCE($2, last_name),
       display_name = COALESCE($3, COALESCE($1, display_name)),
       bio = COALESCE($4, bio),
       trading_experience = COALESCE($5, trading_experience),
       updated_at = NOW()
   WHERE user_id = $6;
   ```
5. **User Repository updates user_preferences**
   ```sql
   UPDATE user_preferences
   SET theme = COALESCE($1, theme),
       language = COALESCE($2, language),
       timezone = COALESCE($3, timezone),
       email_notifications_enabled = COALESCE($4, email_notifications_enabled),
       in_app_notifications_enabled = COALESCE($5, in_app_notifications_enabled),
       default_chart_timeframe = COALESCE($6, default_chart_timeframe),
       default_chart_type = COALESCE($7, default_chart_type),
       updated_at = NOW()
   WHERE user_id = $8;
   ```
6. **User Activity Logger records profile completion**
   ```sql
   INSERT INTO user_activity_logs (
     user_id, activity_type, activity_description, created_at
   ) VALUES (
     $1, 'profile_completed', 'User completed profile setup', NOW()
   );
   ```
7. **Return completed profile**

#### Outputs (Step 3)

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "email": "string",
    "profile": {
      "firstName": "string",
      "lastName": "string",
      "displayName": "string",
      "bio": "string",
      "tradingExperience": "beginner",
      "avatarUrl": "string"
    },
    "preferences": {
      "theme": "system",
      "language": "en",
      "timezone": "America/New_York",
      "emailNotificationsEnabled": true,
      "inAppNotificationsEnabled": true,
      "defaultChartTimeframe": "1h",
      "defaultChartType": "candlestick"
    },
    "message": "Profile completed successfully. Welcome to Yieldly!",
    "nextStep": "dashboard"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria (Overall)
- User record created in `users` table
- User profile created in `user_profiles` table
- User preferences created in `user_preferences` table
- Invite code usage incremented and recorded
- Verification email sent (for email/password) or OAuth completed
- Profile information completed
- HTTP 201 Created returned

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid invite code | 400 | Return specific error message |
| Expired invite code | 400 | Return "Invite code has expired" |
| Email already exists | 409 | Return "Email already registered" |
| Weak password | 400 | Return password requirements |
| Invalid timezone | 400 | Return "Invalid timezone format" |
| Invalid enum value | 400 | Return "Invalid value for {field}" |
| OAuth provider error | 502 | Return "Authentication service error" |
| Database error | 500 | Log error, rollback, return generic message |
| Email service failure | 201 | User created, log warning for retry |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards

**Process-Specific Notes:**
- **Step 1 Database Queries**: 5-7 queries (user creation, profile creation, invite code validation)
- **Step 1B Database Queries**: 5-7 queries (similar to Step 1 with OAuth token exchange)
- **Step 3 Database Queries**: 3 queries (profile update, preferences update, activity log)
- **Email Delivery**: Async via Service Bus, delivered within 5 seconds
- **Cache Strategy**: None (registration is infrequent)
- **Expected Execution Time**:
  - Step 1: < 300ms (excluding email send)
  - Step 1B: < 500ms (depends on OAuth provider response time)
  - Step 3: < 200ms

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`, `user_profiles`, `user_preferences`, `invite_codes`, `invite_code_usage`, `email_verification_tokens`

**Cache:**
- None (registration is infrequent)

**Message Queue:**
- Azure Service Bus - topics: `notification.email.verification`

**External Services:**
- SendGrid (via Notification Service) - email delivery
- Auth0 / Google OAuth - OAuth authentication (Step 1B only)

**Storage:**
- Azure Blob Storage - OAuth avatars storage: `avatars/{user_id}/oauth_avatar.jpg`

---


---

## PROC-USER-002: User Login (Email/Password)

**Source File:** `PROC-USER-002.md`  
**Path:** `processes\user-service\PROC-USER-002.md`

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


---

## PROC-USER-003: OAuth Login (Google)

**Source File:** `PROC-USER-003.md`  
**Path:** `processes\user-service\PROC-USER-003.md`

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


---

## PROC-USER-004: Password Reset Flow

**Source File:** `PROC-USER-004.md`  
**Path:** `processes\user-service\PROC-USER-004.md`

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


---

## PROC-USER-005: Email Verification

**Source File:** `PROC-USER-005.md`  
**Path:** `processes\user-service\PROC-USER-005.md`

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


---

## PROC-USER-006: Session Management and JWT Refresh

**Source File:** `PROC-USER-006.md`  
**Path:** `processes\user-service\PROC-USER-006.md`

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


---

## PROC-USER-007: User Profile Update

**Source File:** `PROC-USER-007.md`  
**Path:** `processes\user-service\PROC-USER-007.md`

### PROC-USER-007: User Profile Update

**Service Owner:** User Service
**Related FR:** FR-PROFILE-001, FR-PROFILE-002, FR-PROFILE-003, FR-PROFILE-004
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User submits profile update form from settings page

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Valid JWT access token provided
- User account is active

#### Inputs

**API Endpoint:** `PUT /api/v1/users/profile`

**Request Body:**
```json
{
  "profile": {
    "firstName": "string (optional, max 100 chars)",
    "lastName": "string (optional, max 100 chars)",
    "displayName": "string (optional, max 100 chars)",
    "bio": "string (optional, max 500 chars)",
    "tradingExperience": "beginner|intermediate|advanced (optional)"
  },
  "preferences": {
    "theme": "light|dark|system (optional)",
    "language": "en|pl|ru (optional)",
    "timezone": "string (optional, IANA timezone)",
    "defaultPositionSize": "decimal (optional)",
    "preferredMarginMode": "margin|spot (optional)",
    "preferredTradingPairs": ["array of strings (optional)"],
    "defaultChartTimeframe": "1m|5m|15m|1h|4h|1d (optional)",
    "defaultChartType": "candlestick|line|bar (optional)",
    "emailNotificationsEnabled": "boolean (optional)",
    "inAppNotificationsEnabled": "boolean (optional)"
  }
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/users/profile` (PUT)
2. **API Gateway validates JWT** → Extracts user_id
3. **Profile Controller receives request**
4. **Profile Controller validates input**
   - Validate name lengths (max 100 chars for first_name, last_name, display_name)
   - Validate bio length (max 500 chars)
   - Validate enum values:
     - `trading_experience`: beginner, intermediate, advanced
     - `theme`: light, dark, system
     - `language`: en, pl, ru
     - `preferred_margin_mode`: margin, spot
     - `default_chart_timeframe`: 1m, 5m, 15m, 1h, 4h, 1d
     - `default_chart_type`: candlestick, line, bar
   - Validate timezone format (IANA timezone database)
   - Validate `default_position_size` is positive decimal if provided
   - Validate `preferred_trading_pairs` array format if provided
5. **User Repository retrieves current profile and preferences**
   ```sql
   SELECT
     u.id, u.email, u.status,
     p.first_name, p.last_name, p.display_name, p.bio, p.trading_experience, p.avatar_url,
     pr.theme, pr.language, pr.timezone, pr.default_position_size,
     pr.preferred_margin_mode, pr.preferred_trading_pairs,
     pr.default_chart_timeframe, pr.default_chart_type,
     pr.email_notifications_enabled, pr.in_app_notifications_enabled
   FROM users u
   LEFT JOIN user_profiles p ON u.id = p.user_id
   LEFT JOIN user_preferences pr ON u.id = pr.user_id
   WHERE u.id = $1;
   ```
6. **Profile Controller checks user status**
   - If `status != 'active'` → Return 403 "Account is not active"
7. **Profile Controller merges updates**
   - Only update fields that are present in request
   - Preserve existing values for omitted fields
   - If `display_name` not provided but `first_name` is, update `display_name = first_name`
8. **User Repository updates user_profiles**
   ```sql
   UPDATE user_profiles
   SET first_name = COALESCE($1, first_name),
       last_name = COALESCE($2, last_name),
       display_name = COALESCE($3, COALESCE($1, display_name)),
       bio = COALESCE($4, bio),
       trading_experience = COALESCE($5, trading_experience),
       updated_at = NOW()
   WHERE user_id = $6
   RETURNING *;
   ```
9. **User Repository updates user_preferences**
   ```sql
   UPDATE user_preferences
   SET theme = COALESCE($1, theme),
       language = COALESCE($2, language),
       timezone = COALESCE($3, timezone),
       default_position_size = COALESCE($4, default_position_size),
       preferred_margin_mode = COALESCE($5, preferred_margin_mode),
       preferred_trading_pairs = COALESCE($6, preferred_trading_pairs),
       default_chart_timeframe = COALESCE($7, default_chart_timeframe),
       default_chart_type = COALESCE($8, default_chart_type),
       email_notifications_enabled = COALESCE($9, email_notifications_enabled),
       in_app_notifications_enabled = COALESCE($10, in_app_notifications_enabled),
       updated_at = NOW()
   WHERE user_id = $11
   RETURNING *;
   ```
10. **User Activity Logger records profile update**
    ```sql
    INSERT INTO user_activity_logs (
      user_id, activity_type, activity_description,
      ip_address, user_agent, created_at
    ) VALUES (
      $1, 'profile_updated', 'User updated profile information',
      $2, $3, NOW()
    );
    ```
11. **Cache Manager invalidates cached user data**
    ```
    DEL user:{user_id}:profile
    DEL user:{user_id}:preferences
    ```
12. **Return updated profile**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "email": "string",
    "profile": {
      "firstName": "string",
      "lastName": "string",
      "displayName": "string",
      "bio": "string",
      "tradingExperience": "intermediate",
      "avatarUrl": "string"
    },
    "preferences": {
      "theme": "dark",
      "language": "en",
      "timezone": "America/New_York",
      "defaultPositionSize": 100.00,
      "preferredMarginMode": "spot",
      "preferredTradingPairs": ["BTCUSDT", "ETHUSDT"],
      "defaultChartTimeframe": "1h",
      "defaultChartType": "candlestick",
      "emailNotificationsEnabled": true,
      "inAppNotificationsEnabled": true
    },
    "updatedAt": "2025-11-23T12:34:56Z",
    "message": "Profile updated successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request - Validation Error):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "timezone",
        "message": "Invalid timezone format. Use IANA timezone (e.g., 'America/New_York')",
        "code": "INVALID_TIMEZONE"
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

#### Success Criteria
- Profile updated in `user_profiles` table
- Preferences updated in `user_preferences` table
- Activity logged in `user_activity_logs` table
- Cache invalidated
- Updated profile and preferences returned
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid timezone | 400 | Return "Invalid timezone format. Use IANA timezone (e.g., 'America/New_York')" |
| Invalid enum value | 400 | Return "Invalid value for {field}. Allowed: {values}" |
| Name too long | 400 | Return "Name exceeds maximum length of 100 characters" |
| Bio too long | 400 | Return "Bio exceeds maximum length of 500 characters" |
| Invalid position size | 400 | Return "Position size must be a positive number" |
| User not found | 404 | Return "User not found" |
| Account not active | 403 | Return "Account is not active" |
| Database error | 500 | Log error, rollback transaction, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 4 queries (1 SELECT, 2 UPDATEs, 1 INSERT for activity log)
- **Cache Operations**: 2 deletes (profile and preferences cache invalidation)
- **Expected Execution Time**: < 200ms
- **Cache Strategy**: Cache invalidation on update, lazy loading on next read

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`, `user_profiles`, `user_preferences`, `user_activity_logs`

**Cache:**
- Redis - profile and preferences cache (`user:{user_id}:profile`, `user:{user_id}:preferences`)

---


---

## PROC-USER-008: Profile Avatar Upload

**Source File:** `PROC-USER-008.md`  
**Path:** `processes\user-service\PROC-USER-008.md`

### PROC-USER-008: Profile Avatar Upload

**Service Owner:** User Service
**Related FR:** FR-MEDIA-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-009, ADR-032

#### Trigger
User uploads profile picture

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Image file size ≤ 5MB
- Image format: JPEG, PNG, or WebP

#### Inputs

**API Endpoint:** `POST /api/v1/users/profile/avatar`

**Multipart Form Data:**
- `file`: Binary image data (max 5MB, allowed types: image/jpeg, image/png, image/webp)
- `user_id`: UUID (from JWT)

#### Process Steps

1. **API Gateway receives multipart request** → `/api/v1/users/profile/avatar` (POST)
2. **Profile Controller validates file**
   - Check file size ≤ 5MB
   - Check MIME type (image/jpeg, image/png, image/webp)
   - Check image dimensions (max 2000x2000)
3. **Profile Controller generates blob name**
   - Format: `avatars/{user_id}/{timestamp}.{extension}`
   - Example: `avatars/123e4567-e89b-12d3-a456-426614174000/1638360000.jpg`
4. **Profile Controller uploads to Azure Blob Storage**
   ```go
   blobClient := containerClient.NewBlockBlobClient(blobName)
   _, err := blobClient.UploadStream(ctx, fileStream, &azblob.UploadStreamOptions{})
   ```
5. **Profile Controller retrieves blob URL**
   - Public read URL from Azure Blob Storage
6. **User Repository retrieves old avatar URL** (if exists)
   ```sql
   SELECT avatar_url FROM users WHERE user_id = $1
   ```
7. **User Repository updates avatar URL**
   ```sql
   UPDATE users
   SET avatar_url = $1,
       updated_at = NOW()
   WHERE user_id = $2
   RETURNING avatar_url
   ```
8. **Profile Controller deletes old avatar** (if exists and not default)
   - Background job to clean up old blob
9. **Cache Manager invalidates cached profile**
10. **Return new avatar URL**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "avatarUrl": "https://yieldlystorage.blob.core.windows.net/avatars/user_id/image.jpg",
    "message": "Avatar uploaded successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (413 Payload Too Large):**
```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File size exceeds 5MB limit",
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
- Image uploaded to Azure Blob Storage
- Avatar URL updated in database
- Old avatar deleted
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| File too large | 413 | Return "File size exceeds 5MB limit" |
| Invalid file type | 400 | Return "Only JPEG, PNG, WebP allowed" |
| Azure upload error | 500 | Log error, retry with exponential backoff |
| Database error | 500 | Rollback blob upload, return error |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 2 queries (1 SELECT old avatar, 1 UPDATE avatar URL)
- **Cache Operations**: 1 delete (profile cache invalidation)
- **Expected Execution Time**: < 2 seconds (depends on upload size and file size)
- **Blob Upload Time**: < 1.5 seconds (5MB file)
- **Special Considerations**: File upload operations have higher latency than standard API operations

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`

**Cache:**
- Redis - profile cache

**Storage:**
- Azure Blob Storage - avatar storage: `avatars/{user_id}/{timestamp}.{extension}`

---


---

## PROC-USER-009: GDPR Data Export

**Source File:** `PROC-USER-009.md`  
**Path:** `processes\user-service\PROC-USER-009.md`

### PROC-USER-009: GDPR Data Export

**Service Owner:** User Service
**Related FR:** FR-PROFILE-005
**Related NFR:** NFR-PERF-001, NFR-COMP-001
**Related ADR:** ADR-027, ADR-032

#### Trigger
User requests data export from account settings

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- No active export in progress (rate limit: 1 per 24 hours)

#### Inputs

**API Endpoint:** `POST /api/v1/users/data-export`

**Request Body:**
```json
{
  "format": "json (required, currently only json supported)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/users/data-export` (POST)
2. **Profile Controller checks rate limit**
   ```
   GET rate_limit:export:{user_id}
   ```
   - If exists → Return 429 "Export request already in progress"
3. **Profile Controller sets rate limit**
   ```
   SET rate_limit:export:{user_id} 1
   EXPIRE rate_limit:export:{user_id} 86400
   ```
4. **Profile Controller publishes async job**
   - Publish to Service Bus topic: `user.export`
   - Event message format (ADR-032):
   ```json
   {
     "messageId": "uuid",
     "eventType": "user.export.requested",
     "timestamp": "2024-12-01T12:00:00Z",
     "version": "1.0",
     "source": {
       "service": "user-service",
       "instance": "instance-id"
     },
     "payload": {
       "userId": "uuid",
       "format": "json",
       "requestedAt": "2024-12-01T12:00:00Z"
     },
     "metadata": {
       "correlationId": "uuid",
       "causationId": "uuid",
       "userId": "uuid"
     }
   }
   ```
5. **Return immediate response** (async processing)
6. **Background Worker consumes job**
7. **Worker collects data from all services**:
   - **User Service**: User profile, preferences, sessions
   - **Strategy Service**: User strategies (code, descriptions)
   - **Backtesting Service**: Backtest results, trades
   - **Broker Service**: Connection metadata (no API keys)
   - **Portfolio Service**: Portfolio snapshots
   - **Notification Service**: Notification history
8. **Worker aggregates data into JSON structure**
   ```json
   {
     "user_data": { ... },
     "strategies": [ ... ],
     "backtests": [ ... ],
     "portfolio_history": [ ... ],
     "notifications": [ ... ],
     "export_date": "timestamp"
   }
   ```
9. **Worker uploads to Azure Blob Storage**
   - Blob name: `gdpr-exports/{user_id}/{timestamp}.json`
   - TTL: 7 days (auto-delete)
10. **Worker generates secure download link**
    - Azure Blob SAS token with 7-day expiration
11. **Notification Service emails user**
    - Subject: "Your data export is ready"
    - Body: Download link + expiration warning
12. **Worker marks export complete**
    ```sql
    INSERT INTO gdpr_exports (user_id, export_url, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '7 days')
    ```

#### Outputs

**Immediate Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "estimatedCompletion": "< 30 minutes",
    "message": "Data export request received. You will receive an email with download link within 30 minutes."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (429 Too Many Requests - Rate Limit):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Export in progress or recently completed. Please wait 24 hours between export requests.",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Email to User (After Export Completes):**
```
Subject: Your Yieldly data export is ready

Your data export has been prepared and is available for download for the next 7 days.

Download link: https://yieldlystorage.blob.core.windows.net/gdpr-exports/user_id/export.json?sas_token

This link expires on: 2025-11-30 12:00:00 UTC

If you did not request this export, please contact support immediately.
```

#### Success Criteria
- Export job created
- Rate limit applied
- User receives download link via email
- Export file available for 7 days

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Rate limit exceeded | 429 | Return "Export in progress or recently completed" |
| Service unavailable | 503 | Retry job 3 times with backoff |
| Database error | 500 | Log error, retry |
| Email delivery failure | 200 | Log warning, allow manual download from UI |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-COMP-001**: GDPR Compliance (data export within 30 days, typically < 30 minutes)

**Process-Specific Notes:**
- **Immediate Response Time**: < 200ms (job queuing)
- **Export Generation Time**: < 30 minutes (background job)
- **File Size**: Typically 1-50 MB (depends on user data volume)
- **Email Delivery**: < 5 minutes after export ready
- **Rate Limit**: 1 export per 24 hours per user

#### Dependencies
**Database:**
- All service databases (read-only access for data collection)
- `user_db`, `strategy_db`, `backtest_db`, `portfolio_db`, `notification_db`
- Tables: `gdpr_exports`

**Cache:**
- Redis - rate limiting: `rate_limit:export:{user_id}`

**Message Queue:**
- Azure Service Bus - topics: `user.export`

**External Services:**
- SendGrid (via Notification Service) - email delivery

**Storage:**
- Azure Blob Storage - GDPR exports storage: `gdpr-exports/{user_id}/{timestamp}.json` (7-day TTL)

---


---

## PROC-USER-010: GDPR Account Deletion

**Source File:** `PROC-USER-010.md`  
**Path:** `processes\user-service\PROC-USER-010.md`

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


---

## PROC-USER-011: Admin - Suspend User Account

**Source File:** `PROC-USER-011.md`  
**Path:** `processes\user-service\PROC-USER-011.md`

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


---

## PROC-USER-012: Admin - Generate Invite Codes

**Source File:** `PROC-USER-012.md`  
**Path:** `processes\user-service\PROC-USER-012.md`

### PROC-USER-012: Admin - Generate Invite Codes

**Service Owner:** User Service
**Related FR:** FR-ADMIN-003
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-032

#### Trigger
Admin generates new invite codes for beta users

#### Actor
Admin

#### Preconditions
- User has admin role
- Count is within allowed limits (max 100 per request)

#### Inputs

**API Endpoint:** `POST /api/v1/admin/invite-codes/generate`

**Request Body:**
```json
{
  "count": "integer (required, min 1, max 100)",
  "maxUses": "integer (optional, default 1, null for unlimited)",
  "validUntil": "ISO 8601 timestamp (optional, null for no expiration)",
  "notes": "string (optional, max 500 chars)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/invite-codes/generate` (POST)
2. **API Gateway validates JWT** → Extracts admin user_id and role
3. **Admin Controller validates admin permissions**
   - Check if requesting user has `role = 'admin'`
   - Return 403 if not admin
4. **Admin Controller validates input**
   - Check `count >= 1` and `count <= 100`
   - If `maxUses` provided, check `maxUses >= 1`
   - If `validUntil` provided, check it's in the future
   - Validate notes length (max 500 chars)
5. **Invite Code Manager generates codes**
   - Generate random alphanumeric codes (8-10 chars)
   - Ensure uniqueness by checking against existing codes
   - Format: `BETA-XXXX-XXXX` (e.g., `BETA-A3F9-K2L8`)
6. **Invite Code Repository bulk inserts**
   ```sql
   INSERT INTO invite_codes (
     code, generated_by_user_id, max_uses, valid_from, valid_until,
     is_active, notes, created_at, updated_at
   )
   VALUES ($1, $2, $3, NOW(), $4, true, $5, NOW(), NOW())
   RETURNING code, max_uses, valid_until;
   ```
7. **Return generated codes list**

#### Outputs

**Success Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "codes": [
      {
        "code": "BETA-A3F9-K2L8",
        "maxUses": 1,
        "validFrom": "2024-12-01T12:00:00Z",
        "validUntil": "2025-01-01T00:00:00Z",
        "isActive": true
      },
      {
        "code": "BETA-B7C2-M5N9",
        "maxUses": 1,
        "validFrom": "2024-12-01T12:00:00Z",
        "validUntil": "2025-01-01T00:00:00Z",
        "isActive": true
      }
    ],
    "totalGenerated": 2,
    "generatedBy": "admin_user_id",
    "message": "Successfully generated 2 invite codes"
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

**Error Response (400 Bad Request - Invalid Count):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "count",
        "message": "Count must be between 1 and 100",
        "code": "INVALID_COUNT"
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

#### Success Criteria
- Invite codes generated successfully
- Codes are unique
- Codes inserted into database
- List of generated codes returned
- HTTP 201 Created

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Invalid count | 400 | Return "Count must be between 1 and 100" |
| Invalid maxUses | 400 | Return "maxUses must be a positive integer" |
| Invalid validUntil | 400 | Return "validUntil must be in the future" |
| Notes too long | 400 | Return "Notes exceed maximum length of 500 characters" |
| Database error | 500 | Log error, rollback, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards (admin role verification)

**Process-Specific Notes:**
- **Database Queries**: 1 bulk INSERT (all codes inserted in single transaction)
- **Expected Execution Time**: < 300ms (for 100 codes)
- **Code Generation**: Random alphanumeric with uniqueness check
- **Max Batch Size**: 100 codes per request to prevent performance degradation

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `invite_codes`

---


---

## PROC-USER-013: Admin - List All Users

**Source File:** `PROC-USER-013.md`  
**Path:** `processes\user-service\PROC-USER-013.md`

### PROC-USER-013: Admin - List All Users

**Service Owner:** User Service
**Related FR:** FR-ADMIN-002
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-029, ADR-032

#### Trigger
Admin opens user management panel to view all users

#### Actor
Admin

#### Preconditions
- User has admin role

#### Inputs

**API Endpoint:** `GET /api/v1/admin/users`

**Query Parameters:**
```
GET /api/v1/admin/users?
  search={keyword}
  &status=active|pending_verification|suspended|pending_deletion
  &role=trader|admin
  &page={number}
  &page_size={number}
  &sort_by=created_at|last_login|email
  &sort_order=asc|desc
```

#### Process Steps
1. **API Gateway receives request** → `/api/v1/admin/users` (GET)
2. **Admin Controller validates admin permissions**
3. **Admin Controller validates pagination parameters**
   - Default: `page=1`, `page_size=50`
   - Max `page_size=100`
4. **Admin Controller validates sorting parameters**
   - Default: `sort_by=created_at`, `sort_order=desc`
   - Allowed `sort_by`: created_at, last_login, email
5. **User Repository queries total count** (for pagination metadata)
   ```sql
   SELECT COUNT(DISTINCT u.id)
   FROM users u
   LEFT JOIN user_profiles p ON u.id = p.user_id
   WHERE ($1 IS NULL OR u.email ILIKE '%' || $1 || '%' OR p.display_name ILIKE '%' || $1 || '%')
     AND ($2 IS NULL OR u.status = $2)
     AND ($3 IS NULL OR u.role = $3);
   ```
6. **User Repository queries users with filters, sorting, and pagination**
   ```sql
   SELECT
     u.id, u.email, u.role, u.status, u.email_verified,
     u.created_at, u.last_login, u.invited_by_code,
     p.first_name, p.last_name, p.display_name, p.avatar_url
   FROM users u
   LEFT JOIN user_profiles p ON u.id = p.user_id
   WHERE ($1 IS NULL OR u.email ILIKE '%' || $1 || '%' OR p.display_name ILIKE '%' || $1 || '%')
     AND ($2 IS NULL OR u.status = $2)
     AND ($3 IS NULL OR u.role = $3)
   ORDER BY
     CASE WHEN $4 = 'created_at' AND $5 = 'desc' THEN u.created_at END DESC,
     CASE WHEN $4 = 'created_at' AND $5 = 'asc' THEN u.created_at END ASC,
     CASE WHEN $4 = 'last_login' AND $5 = 'desc' THEN u.last_login END DESC,
     CASE WHEN $4 = 'last_login' AND $5 = 'asc' THEN u.last_login END ASC,
     CASE WHEN $4 = 'email' AND $5 = 'asc' THEN u.email END ASC,
     CASE WHEN $4 = 'email' AND $5 = 'desc' THEN u.email END DESC
   LIMIT $6 OFFSET $7;
   ```
   **Parameters:**
   - `$1` = search keyword
   - `$2` = status filter
   - `$3` = role filter
   - `$4` = sort_by
   - `$5` = sort_order
   - `$6` = page_size (limit)
   - `$7` = offset (calculated as `(page - 1) * page_size`)
7. **For each user, fetch strategy and backtest counts** (separate optimized queries)
   ```sql
   SELECT user_id, COUNT(*) as strategy_count
   FROM strategies
   WHERE user_id = ANY($1) AND deleted_at IS NULL
   GROUP BY user_id;

   SELECT user_id, COUNT(*) as backtest_count
   FROM backtest_runs
   WHERE user_id = ANY($1)
   GROUP BY user_id;
   ```
8. **Merge counts with user data**
9. **Calculate pagination metadata**
   - `total_pages = CEIL(total_count / page_size)`
10. **Return paginated user list with metadata**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "userId": "uuid",
      "email": "string",
      "displayName": "string",
      "avatarUrl": "string",
      "role": "trader",
      "status": "active",
      "emailVerified": true,
      "createdAt": "2024-12-01T12:00:00Z",
      "lastLogin": "2024-12-01T12:00:00Z",
      "invitedByCode": "string",
      "strategyCount": 5,
      "backtestCount": 12
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 1250,
    "totalPages": 25,
    "hasNextPage": true,
    "hasPreviousPage": false
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

#### Success Criteria
- Users retrieved with filters applied
- Pagination works correctly
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Invalid filter value | 400 | Return "Invalid filter value" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards (admin role verification)

**Process-Specific Notes:**
- **Database Queries**: 3 queries (1 count, 1 users, 2 for counts aggregation)
- **Expected Execution Time**: < 300ms
- **Pagination**: Default page_size=50, max page_size=100
- **Search Optimization**: Uses ILIKE for email and display_name search
- **Sorting**: Supports multiple sort options (created_at, last_login, email)

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`, `user_profiles`
- `strategy_db` (PostgreSQL) - for strategy count
- `backtest_db` (PostgreSQL) - for backtest count

---


---

## PROC-USER-014: View User Public Profile

**Source File:** `PROC-USER-014.md`  
**Path:** `processes\user-service\PROC-USER-014.md`

### PROC-USER-014: View User Public Profile

**Service Owner:** User Service
**Related FR:** FR-PROFILE-007
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User clicks on another user's profile (e.g., from public strategy author)

#### Actor
Authenticated User or Anonymous User

#### Preconditions
- None (public endpoint, accessible to all)

#### Inputs

**API Endpoint:** `GET /api/v1/users/{user_id}/profile/public`

**Query Parameters:** None

#### Process Steps
1. **API Gateway receives request**
2. **User Repository retrieves public profile**
   ```sql
   SELECT
     u.id, u.created_at,
     p.first_name, p.last_name, p.display_name, p.bio,
     p.avatar_url, p.trading_experience,
     COUNT(DISTINCT s.id) FILTER (WHERE s.is_public = true) as public_strategy_count,
     COUNT(DISTINCT sf.id) as total_favorites
   FROM users u
   LEFT JOIN user_profiles p ON u.id = p.user_id
   LEFT JOIN strategies s ON u.id = s.user_id AND s.deleted_at IS NULL AND s.is_public = true
   LEFT JOIN strategy_favorites sf ON s.id = sf.strategy_id
   WHERE u.id = $1 AND u.status = 'active'
   GROUP BY u.id, p.first_name, p.last_name, p.display_name, p.bio, p.avatar_url, p.trading_experience;
   ```
3. **Return public profile data**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "displayName": "string",
    "bio": "string",
    "avatarUrl": "string",
    "tradingExperience": "intermediate",
    "memberSince": "2024-01-15T12:00:00Z",
    "publicStrategyCount": 8,
    "totalFavorites": 42
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
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
- Public profile returned
- Private information not exposed (email, preferences, etc.)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| User not found | 404 | Return "User not found" |
| User account suspended | 404 | Return "User not found" (don't reveal suspension) |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 1 query (single JOIN with aggregation)
- **Expected Execution Time**: < 150ms
- **Cache Strategy**: Can cache public profiles with 5-minute TTL
- **Privacy Consideration**: Returns 404 for suspended accounts (don't reveal suspension status)

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`, `user_profiles`
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_favorites`

#### Notes
- **Privacy**: Only public information is exposed (no email, preferences, or account status)
- **Future**: Will support friend system and additional stats for friends
- **Suspended Accounts**: Returns 404 instead of revealing suspension status

---


---

## PROC-USER-015: User Logout

**Source File:** `PROC-USER-015.md`  
**Path:** `processes\user-service\PROC-USER-015.md`

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


---

## PROC-USER-016: Admin - View User Details

**Source File:** `PROC-USER-016.md`  
**Path:** `processes\user-service\PROC-USER-016.md`

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


---

## PROC-USER-017: Admin - List Invite Codes

**Source File:** `PROC-USER-017.md`  
**Path:** `processes\user-service\PROC-USER-017.md`

### PROC-USER-017: Admin - List Invite Codes

**Service Owner:** User Service
**Related FR:** FR-ADMIN-003
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-029, ADR-032

#### Trigger
Admin opens invite code management panel

#### Actor
Admin

#### Preconditions
- User has admin role

#### Inputs

**API Endpoint:** `GET /api/v1/admin/invite-codes`

**Query Parameters:**
```
GET /api/v1/admin/invite-codes?
  status=active|expired|exhausted
  &search={code_or_notes}
  &page={number}
  &page_size={number}
  &sort_by=created_at|code|current_uses|valid_until
  &sort_order=asc|desc
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/invite-codes` (GET)
2. **API Gateway validates JWT** → Extracts admin user_id and role
3. **Admin Controller validates admin permissions**
   - Check if requesting user has `role = 'admin'`
   - Return 403 if not admin
4. **Admin Controller validates pagination parameters**
   - Default: `page=1`, `page_size=50`
   - Max `page_size=100`
5. **Admin Controller validates sorting parameters**
   - Default: `sort_by=created_at`, `sort_order=desc`
   - Allowed `sort_by`: created_at, code, current_uses, valid_until
6. **Invite Code Repository queries total count** (for pagination metadata)
   ```sql
   SELECT COUNT(*)
   FROM invite_codes
   WHERE ($1 IS NULL OR code ILIKE '%' || $1 || '%' OR notes ILIKE '%' || $1 || '%')
     AND (
       CASE
         WHEN $2 = 'active' THEN is_active = true AND (valid_until IS NULL OR valid_until > NOW()) AND current_uses < max_uses
         WHEN $2 = 'expired' THEN valid_until IS NOT NULL AND valid_until <= NOW()
         WHEN $2 = 'exhausted' THEN current_uses >= max_uses
         ELSE true
       END
     );
   ```
7. **Invite Code Repository queries invite codes with filters, sorting, and pagination**
   ```sql
   SELECT
     ic.id, ic.code, ic.generated_by_user_id,
     ic.max_uses, ic.current_uses,
     ic.valid_from, ic.valid_until, ic.is_active, ic.notes,
     ic.created_at, ic.updated_at,
     u.email as generated_by_email,
     CONCAT(p.first_name, ' ', p.last_name) as generated_by_name
   FROM invite_codes ic
   LEFT JOIN users u ON ic.generated_by_user_id = u.id
   LEFT JOIN user_profiles p ON u.id = p.user_id
   WHERE ($1 IS NULL OR ic.code ILIKE '%' || $1 || '%' OR ic.notes ILIKE '%' || $1 || '%')
     AND (
       CASE
         WHEN $2 = 'active' THEN ic.is_active = true AND (ic.valid_until IS NULL OR ic.valid_until > NOW()) AND ic.current_uses < ic.max_uses
         WHEN $2 = 'expired' THEN ic.valid_until IS NOT NULL AND ic.valid_until <= NOW()
         WHEN $2 = 'exhausted' THEN ic.current_uses >= ic.max_uses
         ELSE true
       END
     )
   ORDER BY
     CASE WHEN $3 = 'created_at' AND $4 = 'desc' THEN ic.created_at END DESC,
     CASE WHEN $3 = 'created_at' AND $4 = 'asc' THEN ic.created_at END ASC,
     CASE WHEN $3 = 'code' AND $4 = 'asc' THEN ic.code END ASC,
     CASE WHEN $3 = 'code' AND $4 = 'desc' THEN ic.code END DESC,
     CASE WHEN $3 = 'current_uses' AND $4 = 'desc' THEN ic.current_uses END DESC,
     CASE WHEN $3 = 'current_uses' AND $4 = 'asc' THEN ic.current_uses END ASC,
     CASE WHEN $3 = 'valid_until' AND $4 = 'desc' THEN ic.valid_until END DESC,
     CASE WHEN $3 = 'valid_until' AND $4 = 'asc' THEN ic.valid_until END ASC
   LIMIT $5 OFFSET $6;
   ```
   **Parameters:**
   - `$1` = search query
   - `$2` = status filter
   - `$3` = sort_by
   - `$4` = sort_order
   - `$5` = page_size (limit)
   - `$6` = offset (calculated as `(page - 1) * page_size`)
8. **Calculate pagination metadata**
   - `total_pages = CEIL(total_count / page_size)`
9. **Return paginated invite codes list with metadata**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "code": "BETA-A3F9-K2L8",
      "generatedBy": {
        "userId": "uuid",
        "email": "admin@yieldly.com",
        "name": "Admin User"
      },
      "maxUses": 1,
      "currentUses": 0,
      "validFrom": "2024-12-01T00:00:00Z",
      "validUntil": "2025-01-01T00:00:00Z",
      "isActive": true,
      "status": "active",
      "notes": "Beta tester batch #1",
      "createdAt": "2024-12-01T12:00:00Z",
      "updatedAt": "2024-12-01T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 150,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
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

#### Success Criteria
- Invite codes retrieved with filters applied
- Pagination works correctly
- Status computed correctly (active, expired, exhausted)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Invalid filter value | 400 | Return "Invalid filter value" |
| Invalid sort field | 400 | Return "Invalid sort field" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards (admin role verification)

**Process-Specific Notes:**
- **Database Queries**: 2 queries (1 count, 1 codes with JOINs)
- **Expected Execution Time**: < 250ms
- **Pagination**: Default page_size=50, max page_size=100
- **Search**: Searches both `code` and `notes` fields with ILIKE
- **Status Calculation**: Computed based on is_active, valid_until, and usage limits

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `invite_codes`, `users`, `user_profiles`

---


---

## PROC-USER-018: Admin - Revoke Invite Code

**Source File:** `PROC-USER-018.md`  
**Path:** `processes\user-service\PROC-USER-018.md`

### PROC-USER-018: Admin - Revoke Invite Code

**Service Owner:** User Service
**Related FR:** FR-ADMIN-003
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-032

#### Trigger
Admin revokes an invite code from admin panel

#### Actor
Admin

#### Preconditions
- User has admin role
- Invite code exists
- Invite code is not already revoked

#### Inputs

**API Endpoint:** `DELETE /api/v1/admin/invite-codes/{code_id}`

**Path Parameters:**
- `code_id`: UUID (required)

**Request Body:**
```json
{
  "reason": "string (optional, max 500 chars, reason for revocation)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/invite-codes/{code_id}` (DELETE)
2. **API Gateway validates JWT** → Extracts admin user_id and role
3. **Admin Controller validates admin permissions**
   - Check if requesting user has `role = 'admin'`
   - Return 403 if not admin
4. **Admin Controller validates input**
   - Validate reason length (max 500 chars) if provided
5. **Invite Code Repository retrieves invite code**
   ```sql
   SELECT id, code, is_active, current_uses, max_uses
   FROM invite_codes
   WHERE id = $1;
   ```
6. **Admin Controller validates revocation**
   - If code not found → Return 404
   - If already `is_active = false` → Return 409 "Code already revoked"
7. **Invite Code Repository revokes code**
   ```sql
   UPDATE invite_codes
   SET is_active = false,
       notes = CASE
         WHEN notes IS NULL THEN CONCAT('Revoked by admin: ', COALESCE($1, 'No reason provided'))
         ELSE CONCAT(notes, ' | Revoked by admin: ', COALESCE($1, 'No reason provided'))
       END,
       updated_at = NOW()
   WHERE id = $2
   RETURNING code, current_uses, max_uses;
   ```
8. **User Activity Logger records revocation** (optional)
   ```sql
   INSERT INTO user_activity_logs (
     user_id, activity_type, activity_description, metadata, created_at
   ) VALUES (
     $1, 'invite_code_revoked',
     CONCAT('Admin revoked invite code: ', $2),
     jsonb_build_object(
       'invite_code_id', $3,
       'invite_code', $2,
       'reason', $4
     ),
     NOW()
   );
   ```
9. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "code": "BETA-A3F9-K2L8",
    "isActive": false,
    "currentUses": 0,
    "maxUses": 1,
    "message": "Invite code successfully revoked"
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
    "message": "Invite code not found",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (409 Conflict - Already Revoked):**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Invite code is already revoked",
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
- Invite code `is_active` set to `false`
- Revocation reason appended to notes
- Activity logged
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Code not found | 404 | Return "Invite code not found" |
| Already revoked | 409 | Return "Invite code is already revoked" |
| Reason too long | 400 | Return "Reason exceeds maximum length of 500 characters" |
| Database error | 500 | Log error, rollback, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards (admin role verification)

**Process-Specific Notes:**
- **Database Queries**: 3 queries (code lookup, revoke UPDATE, activity log INSERT)
- **Expected Execution Time**: < 200ms
- **Audit Trail**: Revocation reason stored in notes field with timestamp
- **Soft Delete**: Code remains in database (is_active = false) for audit purposes

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `invite_codes`, `user_activity_logs` (optional)

#### Notes
- **Soft Revocation**: Code is not deleted, just marked as inactive
- **Audit Trail**: Revocation reason appended to existing notes
- **Already Used Codes**: Can still be revoked (prevents future uses if max_uses not reached)
- **No Cascade**: Existing users who registered with this code remain unaffected

---


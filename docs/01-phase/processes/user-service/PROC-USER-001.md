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

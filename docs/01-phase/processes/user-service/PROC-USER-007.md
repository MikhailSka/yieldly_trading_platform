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

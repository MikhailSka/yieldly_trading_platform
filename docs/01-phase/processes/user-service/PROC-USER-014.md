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

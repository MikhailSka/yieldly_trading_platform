### PROC-STRATEGY-001: List Strategies with Filters

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-004, FR-STRATEGY-005, FR-STRATEGY-008
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032, ADR-029

#### Trigger
- **User**: Opens strategy list, browses public strategies, or explores strategy templates
- **Admin**: Opens admin panel to manage strategies (can see all strategies regardless of visibility)

#### Actor
Authenticated User or Admin

#### Use Cases
- **Normal User**: Browse own strategies, explore public strategies, or view templates
- **Admin**: Manage all strategies in admin panel (can see private strategies, inactive strategies)

#### Preconditions
- User is authenticated

#### Inputs

**API Endpoint:** `GET /api/v1/strategies`

**Query Parameters:**
```
GET /api/v1/strategies?
  scope=my|public|templates
  &is_public=true|false (admin only, users cannot use this)
  &is_template=true|false (admin only, users cannot use this)
  &status=draft|active|archived
  &tags={comma-separated}
  &search={keyword}
  &sort_by=created_at|name|updated_at|popularity|backtest_count
  &favorites_only=true|false
  &include_favorites=true
  &page={number}
  &page_size={number}
```

#### Scope Options
- **my**: User's own strategies only (includes all statuses if owned by user)
- **public**: Strategies marked as public by other users (`is_public=true AND status='active'`)
- **templates**: Official templates created by admins (`is_template=true AND status='active'`)

#### Process Steps

1. **API Gateway receives request**
2. **Authorization check**:
   - If user is **NOT admin** → Apply restrictions:
     - Force appropriate filters based on `scope`:
       - `scope=my`: Filter to `user_id = current_user_id`
       - `scope=public`: Force `is_public = true AND status = 'active'`
       - `scope=templates`: Force `is_template = true AND status = 'active'`
     - Reject request if `is_public` or `is_template` parameters are used (403 Forbidden)
   - If user **IS admin** → Allow all filters (can see private strategies, drafts, inactive)
3. **Strategy Controller parses query parameters**
4. **Strategy Repository queries with filters**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT
     s.id, s.name, s.description, s.tags, s.status, s.is_public, s.is_template,
     s.backtest_count, s.created_at, s.updated_at, s.image_url,
     COUNT(DISTINCT siu.indicator_id) as indicator_count,
     COALESCE(ss.view_count, 0) as view_count,
     EXISTS(
       SELECT 1 FROM strategy_favorites sf
       WHERE sf.strategy_id = s.id AND sf.user_id = $1
     ) as is_favorited
   FROM strategies s
   LEFT JOIN strategy_indicator_usage siu ON s.id = siu.strategy_id
   LEFT JOIN strategy_statistics ss ON s.id = ss.strategy_id
   WHERE s.deleted_at IS NULL
     AND (
       CASE
         WHEN $2 = 'my' THEN s.user_id = $1
         WHEN $2 = 'public' THEN s.is_public = true AND s.status = 'active'
         WHEN $2 = 'templates' THEN s.is_template = true AND s.status = 'active'
       END
     )
     AND ($3 IS NULL OR s.status = $3)
     AND ($4 IS NULL OR s.is_public = $4)  -- Admin only
     AND ($5 IS NULL OR s.is_template = $5)  -- Admin only
     AND ($6 IS NULL OR s.tags ILIKE '%' || $6 || '%')
     AND ($7 IS NULL OR s.name ILIKE '%' || $7 || '%' OR s.description ILIKE '%' || $7 || '%')
     AND ($8 IS NULL OR $8 = false OR EXISTS(
       SELECT 1 FROM strategy_favorites sf2
       WHERE sf2.strategy_id = s.id AND sf2.user_id = $1
     ))
   GROUP BY s.id, ss.view_count
   ORDER BY
     CASE WHEN $9 = 'popularity' THEN COALESCE(ss.view_count, 0) END DESC,
     CASE WHEN $9 = 'backtest_count' THEN s.backtest_count END DESC,
     CASE WHEN $9 = 'updated_at' THEN s.updated_at END DESC,
     CASE WHEN $9 = 'name' THEN s.name END ASC,
     CASE WHEN $9 = 'created_at' OR $9 IS NULL THEN s.created_at END DESC
   LIMIT $10 OFFSET $11;
   ```
   **Parameters:**
   - `$1` = user_id (current user)
   - `$2` = scope (my, public, templates)
   - `$3` = status (optional, for filtering by status)
   - `$4` = is_public (optional, admin only)
   - `$5` = is_template (optional, admin only)
   - `$6` = tags filter (optional)
   - `$7` = search keyword (optional)
   - `$8` = favorites_only (optional)
   - `$9` = sort_by (optional, defaults to created_at)
   - `$10` = limit (page_size)
   - `$11` = offset (page * page_size)

5. **If include_favorites=true, mark favorited strategies in response**
6. **Return paginated strategy list**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": [
    {
      "strategyId": "uuid",
      "name": "My SMA Strategy",
      "description": "Simple moving average crossover",
      "tags": ["trend-following", "beginner"],
      "status": "active",
      "isPublic": false,
      "isTemplate": false,
      "backtestCount": 5,
      "indicatorCount": 2,
      "viewCount": 142,
      "imageUrl": "https://storage.example.com/strategies/uuid.png",
      "isFavorited": true,
      "createdAt": "2024-11-01T12:00:00Z",
      "updatedAt": "2024-11-15T14:30:00Z"
    },
    {
      "strategyId": "uuid",
      "name": "RSI Momentum Template",
      "description": "RSI-based momentum strategy for trending markets",
      "tags": ["momentum", "beginner"],
      "status": "active",
      "isPublic": false,
      "isTemplate": true,
      "backtestCount": 0,
      "indicatorCount": 1,
      "viewCount": 1547,
      "imageUrl": null,
      "isFavorited": false,
      "createdAt": "2024-11-20T10:00:00Z",
      "updatedAt": "2024-11-20T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 47,
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

#### Success Criteria
- Strategies retrieved based on scope and filters
- Admin-only filters enforced correctly
- Results paginated correctly
- Only authorized strategies returned
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid scope parameter | 400 | Return "Invalid scope value. Must be: my, public, or templates" |
| Unauthorized is_public filter | 403 | Return "Admin permissions required to use is_public filter" |
| Unauthorized is_template filter | 403 | Return "Admin permissions required to use is_template filter" |
| Invalid sort_by value | 400 | Return "Invalid sort_by value" |
| Database error | 500 | Log error, return generic message |

#### Filter Parameters Explained
- **`scope`**: Main filter that determines which strategies to show
  - `my`: User's own strategies (all statuses)
  - `public`: Public strategies from other users (active only)
  - `templates`: Official admin-created templates (active only)
- **`favorites_only=true`**: Returns ONLY user's favorited strategies
- **`include_favorites=true`**: Returns all matching strategies but marks which ones are favorited (adds `isFavorited` field)
- **`is_public`** and **`is_template`**: Admin-only filters for management purposes
- Both favorites parameters can be used together or separately

#### Example Use Cases

**User viewing own strategies:**
```
GET /api/v1/strategies?scope=my&status=active
```
→ User sees only their active strategies

**User searching public strategies:**
```
GET /api/v1/strategies?scope=public&search=moving+average&sort_by=popularity
```
→ User sees popular public strategies matching search term

**User viewing templates:**
```
GET /api/v1/strategies?scope=templates&tags=beginner&include_favorites=true
```
→ User sees beginner templates with favorites marked

**User viewing only favorited strategies:**
```
GET /api/v1/strategies?favorites_only=true
```
→ User sees all their favorited strategies (own, public, templates combined)

**Admin managing all templates:**
```
GET /api/v1/strategies?is_template=true&status=draft
```
→ Admin sees draft templates (including inactive ones for review)

**Admin reviewing private strategies:**
```
GET /api/v1/strategies?is_public=false&sort_by=created_at
```
→ Admin sees all private strategies for moderation

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1 complex query with JOINs and filters
- Expected Execution Time: P95 < 300ms
- Cache Strategy: Consider caching template list (24-hour TTL) for non-admin users

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_indicator_usage`, `strategy_statistics`, `strategy_favorites`

#### Notes
- **Replaces PROC-STRATEGY-004**: This unified endpoint now handles template browsing
- **Authorization Model**: Similar to PROC-INDICATOR-001, uses role-based filter enforcement
- **Marketplace Ready**: Sorting by popularity and view count enables future marketplace features
- **Security**: Admin-only filters prevent users from bypassing visibility restrictions
- **Future Enhancement**: Consider adding category/difficulty level filters for better template discovery

---

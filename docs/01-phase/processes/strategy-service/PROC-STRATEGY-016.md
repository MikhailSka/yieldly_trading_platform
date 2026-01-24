### PROC-STRATEGY-016: Manage Strategy Tags (User)

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-009
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User adds, removes, or searches for tags on their strategies

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User is authenticated
- For add/remove operations: User owns the strategy

#### Sub-Processes

This process encompasses three related operations:
1. **Add Tag to Strategy** - Attach a tag to a strategy
2. **Remove Tag from Strategy** - Detach a tag from a strategy
3. **Search/List Available Tags** - Get tag suggestions for autocomplete

---

## 1. Add Tag to Strategy

#### Inputs

**API Endpoint:** `POST /api/v1/strategies/{id}/tags`

**Request Body:**
```json
{
  "tagName": "string (required, max 50 chars, alphanumeric + hyphens)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/tags` (POST)
2. **Strategy Controller validates ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 "Strategy not found"
   - If `user_id != current_user_id` → Return 403 "You do not own this strategy"
3. **Tag Manager validates tag name**
   - Trim whitespace
   - Convert to lowercase
   - Validate format: `^[a-z0-9-]{1,50}$`
   - If invalid → Return 400 "Invalid tag name format"
4. **Tag Manager finds or creates tag**
   ```sql
   -- Check if tag already exists for this user or as public tag
   SELECT id, name, is_public, created_by_user_id
   FROM tags
   WHERE name = $1
     AND (is_public = true OR created_by_user_id = $2);
   ```
   - If found → Use existing tag_id
   - If not found → Create new private tag:
   ```sql
   INSERT INTO tags (name, created_by_user_id, is_public, usage_count)
   VALUES ($1, $2, false, 0)
   RETURNING id;
   ```
5. **Tag Repository links tag to strategy**
   ```sql
   INSERT INTO strategy_tags (strategy_id, tag_id, tagged_by_user_id)
   VALUES ($1, $2, $3)
   ON CONFLICT (strategy_id, tag_id) DO NOTHING
   RETURNING id;
   ```
6. **Tag Manager increments usage count** (if new link created)
   ```sql
   UPDATE tags
   SET usage_count = usage_count + 1,
       updated_at = NOW()
   WHERE id = $1;
   ```
7. **Return success response**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "tag": {
      "tagId": "uuid",
      "name": "trend-following",
      "isPublic": false,
      "createdByUserId": "uuid"
    },
    "message": "Tag added successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 400 - Invalid Tag Name):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TAG_NAME",
    "message": "Tag name must be 1-50 characters, lowercase alphanumeric and hyphens only",
    "details": {
      "providedTag": "Invalid Tag!",
      "validFormat": "^[a-z0-9-]{1,50}$"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 2. Remove Tag from Strategy

#### Inputs

**API Endpoint:** `DELETE /api/v1/strategies/{id}/tags/{tagId}`

**Path Parameters:**
- `{id}`: Strategy UUID
- `{tagId}`: Tag UUID

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/tags/{tagId}` (DELETE)
2. **Strategy Controller validates ownership**
   - Same as Add Tag step 2
3. **Tag Repository removes link**
   ```sql
   DELETE FROM strategy_tags
   WHERE strategy_id = $1 AND tag_id = $2
   RETURNING id;
   ```
   - If no rows deleted → Return 404 "Tag not found on this strategy"
4. **Tag Manager decrements usage count**
   ```sql
   UPDATE tags
   SET usage_count = usage_count - 1,
       updated_at = NOW()
   WHERE id = $1;
   ```
5. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "tagId": "uuid",
    "message": "Tag removed successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 3. Search/List Available Tags (Autocomplete)

#### Inputs

**API Endpoint:** `GET /api/v1/tags/search?q={query}&page={page}&page_size={page_size}`

**Query Parameters:**
- `q`: Search query (optional, min 1 char)
- `page`: Page number (optional, default: 1)
- `page_size`: Results per page (optional, default: 20, max: 50)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/tags/search` (GET)
2. **Tag Repository searches tags with pagination**
   ```sql
   -- Get public tags + user's private tags matching query
   SELECT
     t.id,
     t.name,
     t.is_public,
     t.usage_count,
     t.created_by_user_id,
     COUNT(*) OVER() as total_count
   FROM tags t
   WHERE (t.is_public = true OR t.created_by_user_id = $1)
     AND ($2 IS NULL OR t.name ILIKE $2 || '%')
   ORDER BY
     t.is_public DESC,       -- Public tags first
     t.usage_count DESC,     -- Then by popularity
     t.name ASC              -- Then alphabetically
   LIMIT $3 OFFSET $4;
   ```
   **Parameters:**
   - `$1` = user_id
   - `$2` = query (or NULL)
   - `$3` = page_size
   - `$4` = offset = (page - 1) * page_size
3. **Return tag list**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": [
    {
      "tagId": "uuid",
      "name": "trend-following",
      "isPublic": true,
      "usageCount": 45,
      "category": "public"
    },
    {
      "tagId": "uuid",
      "name": "trend-experimental",
      "isPublic": false,
      "usageCount": 2,
      "category": "private"
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

---

## 4. Get Strategy Tags

#### Inputs

**API Endpoint:** `GET /api/v1/strategies/{id}/tags`

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/tags` (GET)
2. **Tag Repository retrieves strategy tags**
   ```sql
   SELECT
     t.id,
     t.name,
     t.is_public,
     t.usage_count,
     st.tagged_at,
     st.tagged_by_user_id
   FROM strategy_tags st
   JOIN tags t ON st.tag_id = t.id
   WHERE st.strategy_id = $1
   ORDER BY st.tagged_at ASC;
   ```
3. **Return tag list**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "tags": [
      {
        "tagId": "uuid",
        "name": "trend-following",
        "isPublic": true,
        "taggedAt": "2024-11-15T10:00:00Z"
      },
      {
        "tagId": "uuid",
        "name": "my-experimental",
        "isPublic": false,
        "taggedAt": "2024-11-20T14:30:00Z"
      }
    ],
    "total": 2
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria

**Add Tag:**
- Tag linked to strategy in strategy_tags table
- Tag usage_count incremented
- HTTP 201 Created

**Remove Tag:**
- Tag unlinked from strategy
- Tag usage_count decremented
- Unused private tags cleaned up
- HTTP 200 OK

**Search Tags:**
- Returns public tags + user's private tags
- Results ordered by relevance
- HTTP 200 OK

**Get Strategy Tags:**
- Returns all tags on strategy
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Strategy not found | 404 | Return "Strategy not found" |
| Invalid tag name format | 400 | Return "Invalid tag name format" with validation details |
| Tag already on strategy | 201 | Return success (idempotent) |
| Tag not on strategy (remove) | 404 | Return "Tag not found on this strategy" |
| Duplicate tag (different case) | 400 | Return "Tag already exists" with existing tag info |

#### Tag Naming Rules

**Format Rules:**
- Length: 1-50 characters
- Characters: Lowercase letters (a-z), numbers (0-9), hyphens (-)
- Cannot start or end with hyphen
- No spaces, underscores, or special characters

**Examples:**
- ✅ Valid: "trend-following", "high-risk", "scalping", "rsi-strategy"
- ❌ Invalid: "Trend Following" (uppercase), "high_risk" (underscore), "scalping!" (special char)

**Auto-normalization:**
- Input is automatically trimmed and converted to lowercase
- Users see normalized version in response

#### UI/UX Recommendations

**Tag Input Component:**
```
┌─────────────────────────────────────┐
│ Tags: [trend-following] [scalping]  │ ← Existing tags (removable)
│                                      │
│ Add tag: [trend________________] ⊕  │ ← Input field
│                                      │
│ Suggestions:                         │
│ • trend-following (public, 45 uses) │ ← Autocomplete dropdown
│ • trend-experimental (private, 2)   │
│ • Create new: "trend"                │
└─────────────────────────────────────┘
```

**Tag Display:**
- Public tags: Blue badge with globe icon
- Private tags: Gray badge with lock icon
- Usage count shown on hover

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Add Tag**: P95 < 150ms (2-3 queries)
- **Remove Tag**: P95 < 100ms (2 queries)
- **Search Tags**: P95 < 100ms (1 indexed query with ILIKE)
- **Get Strategy Tags**: P95 < 50ms (1 simple JOIN query)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `tags`, `strategy_tags`, `strategies`

#### Notes
- **Tag Reuse**: Tags are reusable across strategies (many-to-many relationship)
- **Private vs Public**:
  - Users create private tags by default
  - Only admins can create public tags (via PROC-STRATEGY-017)
  - Public tags are visible to all users in autocomplete
  - Private tags are only visible to their creator
- **Case Insensitivity**: Tag names are stored lowercase, searches are case-insensitive
- **Autocomplete**: Search endpoint powers tag autocomplete in UI
- **Tag Lifecycle**: Tags with usage_count = 0 remain in database for future reuse (updated_at tracks last usage)
- **Tag Limits**: No hard limit on tags per strategy (reasonable limit: ~10-15 tags recommended in UI)
- **Related Processes**:
  - PROC-STRATEGY-001 (List Strategies with Filters) - Filter by tags
  - PROC-STRATEGY-017 (Admin - Manage Public Tags) - Create/manage public tags
  - PROC-STRATEGY-003 (Create New Strategy) - Can include initial tags
  - PROC-STRATEGY-004 (Edit Existing Strategy) - Update strategy with tags

---

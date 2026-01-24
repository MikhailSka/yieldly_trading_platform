### PROC-STRATEGY-017: Admin - Manage Public Tags

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-009
**Related NFR:** NFR-PERF-001, NFR-SEC-005
**Related ADR:** ADR-032

#### Trigger
Admin creates, updates, or manages public tags for platform-wide strategy categorization

#### Actor
Admin

#### Preconditions
- User has admin role
- For update/delete operations: Tag exists

#### Sub-Processes

This process encompasses admin-only tag management operations:
1. **Create Public Tag** - Create a new platform-wide tag
2. **List All Tags** - View all public and private tags with admin filters
3. **Convert Tag to Public** - Make a user's private tag public
4. **Merge Duplicate Tags** - Combine duplicate or similar tags
5. **Delete Tag** - Remove a tag (admin only, with safety checks)

---

## 1. Create Public Tag

#### Inputs

**API Endpoint:** `POST /api/v1/admin/tags`

**Request Body:**
```json
{
  "name": "string (required, max 50 chars)",
  "description": "string (optional, max 200 chars)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/tags` (POST)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden "Admin permissions required"
3. **Tag Manager validates tag name**
   - Trim whitespace, convert to lowercase
   - Validate format: `^[a-z0-9-]{1,50}$`
   - If invalid → Return 400 "Invalid tag name format"
4. **Tag Manager checks for existing tag**
   ```sql
   SELECT id, name, is_public, created_by_user_id
   FROM tags
   WHERE name = $1;
   ```
   - If found and `is_public = true` → Return 409 "Public tag already exists"
   - If found and `is_public = false` → Suggest using "Convert to Public" endpoint
5. **Tag Repository creates public tag**
   ```sql
   INSERT INTO tags (name, created_by_user_id, is_public, usage_count)
   VALUES ($1, NULL, true, 0)
   RETURNING id, name, is_public, created_at;
   ```
   **Parameters:**
   - `$1` = tag_name (normalized)
   - `created_by_user_id` = NULL (system/admin tag)
6. **Return success response**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "tag": {
      "tagId": "uuid",
      "name": "mean-reversion",
      "isPublic": true,
      "usageCount": 0,
      "createdAt": "2024-12-01T12:00:00Z"
    },
    "message": "Public tag created successfully. Visible to all users."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 409 - Tag Already Exists):**
```json
{
  "success": false,
  "error": {
    "code": "TAG_ALREADY_EXISTS",
    "message": "A tag with this name already exists",
    "details": {
      "existingTag": {
        "tagId": "uuid",
        "name": "mean-reversion",
        "isPublic": false,
        "createdByUserId": "uuid",
        "usageCount": 3
      },
      "suggestion": "Use PATCH /api/v1/admin/tags/{id}/make-public to convert this tag to public"
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

## 2. List All Tags (Admin View)

#### Inputs

**API Endpoint:** `GET /api/v1/admin/tags?visibility={visibility}&sort={sort}&page={page}&limit={limit}`

**Query Parameters:**
- `visibility`: Filter by visibility (optional: "public", "private", "all", default: "all")
- `sort`: Sort order (optional: "name", "usage", "created", default: "usage")
- `page`: Page number (optional, default: 1)
- `limit`: Results per page (optional, default: 50, max: 200)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/tags` (GET)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Tag Repository retrieves tags with filters**
   ```sql
   SELECT
     t.id,
     t.name,
     t.is_public,
     t.created_by_user_id,
     t.usage_count,
     t.created_at,
     t.updated_at,
     u.username as created_by_username,
     COUNT(DISTINCT st.strategy_id) as strategy_count
   FROM tags t
   LEFT JOIN users u ON t.created_by_user_id = u.id
   LEFT JOIN strategy_tags st ON t.id = st.tag_id
   WHERE
     CASE
       WHEN $1 = 'public' THEN t.is_public = true
       WHEN $1 = 'private' THEN t.is_public = false
       ELSE true
     END
   GROUP BY t.id, u.username
   ORDER BY
     CASE
       WHEN $2 = 'name' THEN t.name
       WHEN $2 = 'created' THEN t.created_at::text
       ELSE t.usage_count::text
     END DESC
   LIMIT $3 OFFSET $4;
   ```
   **Parameters:**
   - `$1` = visibility filter
   - `$2` = sort field
   - `$3` = limit
   - `$4` = offset (page - 1) * limit
4. **Return paginated tag list**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "tags": [
      {
        "tagId": "uuid",
        "name": "trend-following",
        "isPublic": true,
        "usageCount": 45,
        "strategyCount": 42,
        "createdByUserId": null,
        "createdByUsername": null,
        "createdAt": "2024-10-01T10:00:00Z",
        "updatedAt": "2024-12-01T09:00:00Z"
      },
      {
        "tagId": "uuid",
        "name": "experimental",
        "isPublic": false,
        "usageCount": 3,
        "strategyCount": 3,
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "createdAt": "2024-11-15T14:30:00Z",
        "updatedAt": "2024-11-20T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 127,
      "totalPages": 3
    },
    "filters": {
      "visibility": "all",
      "sort": "usage"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 3. Convert Tag to Public

#### Inputs

**API Endpoint:** `PATCH /api/v1/admin/tags/{id}/make-public`

**Path Parameters:**
- `{id}`: Tag UUID

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/tags/{id}/make-public` (PATCH)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Tag Repository retrieves tag**
   ```sql
   SELECT id, name, is_public, created_by_user_id, usage_count
   FROM tags
   WHERE id = $1;
   ```
   - If not found → Return 404 "Tag not found"
   - If already public → Return 200 OK (idempotent)
4. **Tag Manager checks for public tag name conflict**
   ```sql
   SELECT id FROM tags
   WHERE name = $1 AND is_public = true AND id != $2;
   ```
   - If exists → Return 409 "Public tag with this name already exists. Use merge endpoint instead."
5. **Tag Repository converts tag to public**
   ```sql
   UPDATE tags
   SET
     is_public = true,
     updated_at = NOW()
   WHERE id = $1
   RETURNING *;
   ```
6. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "tag": {
      "tagId": "uuid",
      "name": "scalping",
      "isPublic": true,
      "usageCount": 7,
      "originalCreator": "alice",
      "convertedAt": "2024-12-01T12:00:00Z"
    },
    "message": "Tag converted to public. Now visible to all users."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 4. Merge Duplicate Tags

#### Inputs

**API Endpoint:** `POST /api/v1/admin/tags/merge`

**Request Body:**
```json
{
  "sourceTagIds": ["uuid", "uuid"],
  "targetTagId": "uuid",
  "makePublic": "boolean (optional, default: false)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/tags/merge` (POST)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Tag Manager validates tags exist**
   ```sql
   SELECT id, name, is_public, usage_count
   FROM tags
   WHERE id = ANY($1);
   ```
   - If any tag not found → Return 404 "One or more tags not found"
4. **Tag Manager validates target tag**
   - Ensure targetTagId is not in sourceTagIds
   - If invalid → Return 400 "Target tag cannot be in source tags"
5. **Tag Repository begins transaction**
6. **Tag Repository reassigns strategy_tags**
   ```sql
   -- Update all strategy_tags pointing to source tags
   UPDATE strategy_tags
   SET tag_id = $1  -- target tag
   WHERE tag_id = ANY($2)  -- source tags
     AND NOT EXISTS (
       -- Avoid duplicates
       SELECT 1 FROM strategy_tags st2
       WHERE st2.strategy_id = strategy_tags.strategy_id
         AND st2.tag_id = $1
     );
   ```
7. **Tag Repository deletes duplicate strategy_tags**
   ```sql
   -- Delete remaining source tag links (duplicates)
   DELETE FROM strategy_tags
   WHERE tag_id = ANY($1);  -- source tags
   ```
8. **Tag Repository updates usage counts**
   ```sql
   -- Recalculate target tag usage
   UPDATE tags
   SET usage_count = (
     SELECT COUNT(*) FROM strategy_tags WHERE tag_id = $1
   ),
   updated_at = NOW()
   WHERE id = $1;
   ```
9. **Tag Repository deletes source tags**
   ```sql
   DELETE FROM tags
   WHERE id = ANY($1);  -- source tags
   ```
10. **Tag Repository optionally makes target public**
    ```sql
    UPDATE tags
    SET is_public = true,
        updated_at = NOW()
    WHERE id = $1 AND $2 = true;
    ```
11. **Commit transaction**
12. **Return merge summary**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "mergeResult": {
      "targetTag": {
        "tagId": "uuid",
        "name": "trend-following",
        "isPublic": true,
        "usageCount": 52
      },
      "mergedTags": [
        {"tagId": "uuid", "name": "trend", "previousUsage": 5},
        {"tagId": "uuid", "name": "trending", "previousUsage": 2}
      ],
      "totalStrategiesUpdated": 7,
      "duplicatesRemoved": 0
    },
    "message": "Successfully merged 2 tags into 'trend-following'. 7 strategies updated."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 5. Delete Tag (Admin)

#### Inputs

**API Endpoint:** `DELETE /api/v1/admin/tags/{id}?force={boolean}`

**Path Parameters:**
- `{id}`: Tag UUID

**Query Parameters:**
- `force`: Force delete even if tag is in use (optional, default: false)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/tags/{id}` (DELETE)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Tag Repository retrieves tag**
   ```sql
   SELECT id, name, is_public, usage_count
   FROM tags
   WHERE id = $1;
   ```
   - If not found → Return 404 "Tag not found"
4. **Tag Manager checks usage**
   - If `usage_count > 0` and `force != true` → Return 409 "Tag is in use. Use force=true to delete or merge with another tag."
5. **Tag Repository deletes strategy_tags links**
   ```sql
   DELETE FROM strategy_tags
   WHERE tag_id = $1;
   ```
6. **Tag Repository deletes tag**
   ```sql
   DELETE FROM tags
   WHERE id = $1
   RETURNING name;
   ```
7. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "tagName": "obsolete-tag",
    "strategiesAffected": 5,
    "message": "Tag deleted successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 409 - Tag In Use):**
```json
{
  "success": false,
  "error": {
    "code": "TAG_IN_USE",
    "message": "Cannot delete tag that is currently in use",
    "details": {
      "tagName": "trend-following",
      "usageCount": 45,
      "strategyCount": 42,
      "suggestions": [
        "Use DELETE /api/v1/admin/tags/{id}?force=true to force deletion",
        "Use POST /api/v1/admin/tags/merge to merge with another tag"
      ]
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

#### Success Criteria

**Create Public Tag:**
- Public tag created in database
- Visible to all users in autocomplete
- HTTP 201 Created

**List All Tags:**
- Returns all tags with admin filters
- Includes creator and usage statistics
- HTTP 200 OK

**Convert to Public:**
- Tag marked as public
- No name conflicts
- HTTP 200 OK

**Merge Tags:**
- All strategy links reassigned to target tag
- Source tags deleted
- Usage counts updated
- HTTP 200 OK

**Delete Tag:**
- Tag deleted from database
- All strategy links removed
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Invalid tag name format | 400 | Return validation details |
| Public tag already exists | 409 | Return existing tag info, suggest conversion |
| Tag not found | 404 | Return "Tag not found" |
| Tag in use (delete) | 409 | Return usage count, suggest force or merge |
| Name conflict (convert) | 409 | Return conflict details, suggest merge |
| Target tag in sources (merge) | 400 | Return "Invalid merge parameters" |

#### Admin Use Cases

**Use Case 1: Create Platform Tags**
```
Admin creates standard tags for categorization:
1. Admin creates "trend-following" (public)
2. Admin creates "mean-reversion" (public)
3. Admin creates "scalping" (public)
4. All users can now use these tags
```

**Use Case 2: Promote Popular User Tag**
```
Admin notices many users creating "swing-trading" tag:
1. Admin uses List Tags to find "swing-trading" variants
2. Admin converts most popular variant to public
3. Admin merges other variants into the public tag
4. All users now see unified "swing-trading" tag
```

**Use Case 3: Clean Up Duplicates**
```
Admin finds duplicate tags:
1. Admin lists all tags, finds "trend", "trends", "trending"
2. Admin decides "trend-following" is the canonical tag
3. Admin merges "trend", "trends", "trending" → "trend-following"
4. All strategies automatically updated
```

**Use Case 4: Remove Obsolete Tag**
```
Admin removes deprecated tag:
1. Admin identifies "old-category" is no longer used
2. Admin checks usage (0 strategies)
3. Admin deletes tag
4. Or if in use: Admin merges into new category first
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-005**: Access Control (admin-only operations)

**Process-Specific Notes:**
- **Create Public Tag**: P95 < 150ms
- **List All Tags**: P95 < 300ms (paginated, indexed)
- **Convert to Public**: P95 < 100ms
- **Merge Tags**: P95 < 500ms (transaction with multiple updates)
- **Delete Tag**: P95 < 200ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `tags`, `strategy_tags`, `strategies`

#### Notes
- **Admin-Only**: All operations in this process require admin role
- **Audit Trail**: All tag management operations should be logged (future: tag_events table)
- **Idempotent**: Convert to public and create operations are idempotent
- **Transaction Safety**: Merge operation uses database transaction for consistency
- **Force Delete**: Deleting a tag in use removes it from all strategies (use with caution)
- **Name Normalization**: All tag names stored lowercase
- **No Cascade Delete**: Deleting a tag does not delete strategies (only unlinks)
- **Related Processes**:
  - PROC-STRATEGY-016 (Manage Strategy Tags) - User-facing tag operations
  - PROC-STRATEGY-001 (List Strategies with Filters) - Filter by public tags
  - PROC-STRATEGY-003 (Create New Strategy) - Use public tags on creation

---

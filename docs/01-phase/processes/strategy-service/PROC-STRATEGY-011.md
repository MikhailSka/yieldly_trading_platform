### PROC-STRATEGY-011: View Strategy Version History

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-008
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-024, ADR-032

#### Trigger
User views version history of their strategy to track changes or select version for revert/backtest

#### Actor
Authenticated User (Strategy Owner) or Admin

#### Preconditions
- User is authenticated
- User owns the strategy OR is admin
- Strategy exists and is not deleted

#### Inputs

**API Endpoint:** `GET /api/v1/strategies/{id}/versions`

**Query Parameters:**
```
GET /api/v1/strategies/{id}/versions?
  page={number}
  &page_size={number}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/versions` (GET)
2. **Strategy Controller validates access**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.is_template, s.is_public,
          s.current_version_id, s.template_version_id, s.published_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
   - If `user_id != current_user_id AND user is not admin` → Return 403 Forbidden
3. **Version Manager retrieves version history**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT
     sv.id,
     sv.version_number,
     sv.description,
     sv.created_by_user_id,
     sv.created_at,
     u.username as created_by_username,
     LENGTH(sv.code) as code_size_bytes,
     CASE
       WHEN sv.id = $2 THEN 'current'
       WHEN sv.id = $3 THEN 'template'
       WHEN sv.id = $4 THEN 'published'
       ELSE 'archived'
     END as version_status,
     -- Count backtests using this version
     (SELECT COUNT(*) FROM backtests b WHERE b.strategy_version_id = sv.id) as backtest_count
   FROM strategy_versions sv
   LEFT JOIN users u ON sv.created_by_user_id = u.id
   WHERE sv.strategy_id = $1
   ORDER BY sv.version_number DESC
   LIMIT $5 OFFSET $6;
   ```
   **Parameters:**
   - `$1` = strategy_id
   - `$2` = current_version_id
   - `$3` = template_version_id
   - `$4` = published_version_id
   - `$5` = limit (page_size)
   - `$6` = offset (page * page_size)
4. **Return paginated version history**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "strategyName": "My SMA Strategy",
    "currentVersionId": "uuid-v5",
    "templateVersionId": null,
    "publishedVersionId": "uuid-v2",
    "versions": [
      {
        "versionId": "uuid-v5",
        "versionNumber": 5,
        "description": "Optimized entry/exit logic",
        "versionStatus": "current",
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "codeSizeBytes": 2048,
        "backtestCount": 3,
        "createdAt": "2024-12-05T14:30:00Z"
      },
      {
        "versionId": "uuid-v4",
        "versionNumber": 4,
        "description": "Added stop-loss logic",
        "versionStatus": "archived",
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "codeSizeBytes": 1980,
        "backtestCount": 5,
        "createdAt": "2024-12-03T10:15:00Z"
      },
      {
        "versionId": "uuid-v3",
        "versionNumber": 3,
        "description": "Improved indicator parameters",
        "versionStatus": "archived",
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "codeSizeBytes": 1856,
        "backtestCount": 2,
        "createdAt": "2024-11-28T16:45:00Z"
      },
      {
        "versionId": "uuid-v2",
        "versionNumber": 2,
        "description": "Tested and stable version",
        "versionStatus": "published",
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "codeSizeBytes": 1756,
        "backtestCount": 12,
        "createdAt": "2024-11-20T12:00:00Z"
      },
      {
        "versionId": "uuid-v1",
        "versionNumber": 1,
        "description": "Initial version",
        "versionStatus": "archived",
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "codeSizeBytes": 1520,
        "backtestCount": 1,
        "createdAt": "2024-11-15T09:00:00Z"
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 5,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this strategy",
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
- All versions retrieved for the strategy
- Version status properly labeled (current, template, published, archived)
- Backtest count included for each version
- Results sorted by version number (newest first)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Strategy not found | 404 | Return "Strategy not found" |
| Not strategy owner (not admin) | 403 | Return "You do not have access to this strategy" |
| Database error | 500 | Log error, return generic message |

#### Version Status Explained

- **current**: This is the latest working version (current_version_id)
- **template**: This version is published as a template (template_version_id)
- **published**: This version is published as public (published_version_id)
- **archived**: Previous version, not currently active

**Note**: A version can have multiple statuses if it's used for multiple purposes (e.g., a version can be both "current" and "published")

#### UI Display Recommendations

**Version Timeline View:**
```
v5 (Current) ← You are here
├─ Dec 5, 2024
├─ "Optimized entry/exit logic"
├─ 3 backtests
└─ 2.0 KB

v4 (Archived)
├─ Dec 3, 2024
├─ "Added stop-loss logic"
├─ 5 backtests
└─ 1.9 KB

v3 (Archived)
├─ Nov 28, 2024
├─ "Improved indicator parameters"
├─ 2 backtests
└─ 1.8 KB

v2 (Published) ← Public users see this
├─ Nov 20, 2024
├─ "Tested and stable version"
├─ 12 backtests
└─ 1.7 KB

v1 (Archived)
├─ Nov 15, 2024
├─ "Initial version"
├─ 1 backtest
└─ 1.5 KB
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 2 queries (strategy validation, version list with JOIN)
- Expected Execution Time: P95 < 200ms
- Code is NOT included in list (only metadata) for performance

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `users`, `backtests`

#### Notes
- **Code Excluded**: Version history does NOT include full code (use PROC-STRATEGY-012 for specific version details)
- **Performance**: Fast listing by excluding large code field
- **Backtest Integration**: Shows how many backtests used each version (helps identify well-tested versions)
- **Admin Access**: Admins can view version history of any strategy (for template management)
- **Related Processes**:
  - PROC-STRATEGY-012 (View Specific Version) - Get full details including code
  - PROC-STRATEGY-013 (Revert to Previous Version) - Restore old version as current
  - PROC-STRATEGY-002 (Load Strategy into Editor) - Load specific version for editing/backtesting

---

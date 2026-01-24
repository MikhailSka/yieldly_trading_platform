### PROC-STRATEGY-007: Publish Strategy as Public

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-008
**Related NFR:** NFR-PERF-001, NFR-SEC-005
**Related ADR:** ADR-024, ADR-032

#### Trigger
User publishes their strategy to make it visible to other users

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User is authenticated
- User owns the strategy
- Strategy exists and is not deleted
- Target version exists and is valid
- Strategy status is 'active' (cannot publish drafts)

#### Inputs

**API Endpoint:** `PATCH /api/v1/strategies/{id}/publish`

**Request Body:**
```json
{
  "versionNumber": "integer (required, which version to publish)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/publish` (PATCH)
2. **Strategy Controller validates ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.status, s.is_template, s.is_public,
          s.current_version_id, s.published_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
   - If `user_id != current_user_id` → Return 403 Forbidden
   - If `is_template = true` → Return 403 "Templates can only be managed by admins"
3. **Strategy Controller validates strategy status**
   - If `status != 'active'` → Return 400 "Only active strategies can be published. Current status: {status}"
4. **Version Manager validates target version exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT sv.id, sv.version_number, sv.code, sv.description
   FROM strategy_versions sv
   WHERE sv.strategy_id = $1 AND sv.version_number = $2;
   ```
   - If version not found → Return 400 "Version {n} not found"
5. **Code Validator validates version code** (security check)
   - Same validation as PROC-STRATEGY-003 steps 5-7
   - Ensures published versions are safe
   - If validation fails → Return 400 with validation errors
6. **Strategy Repository updates strategy publication status**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE strategies
   SET
     is_public = true,
     published_version_id = $1,
     updated_at = NOW()
   WHERE id = $2 AND user_id = $3
   RETURNING *;
   ```
   **Parameters:**
   - `$1` = version_id (UUID of target version)
   - `$2` = strategy_id
   - `$3` = user_id (ensure ownership)
7. **Strategy Event Logger logs publication event**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   INSERT INTO strategy_events (
     strategy_id, user_id, event_type, event_timestamp,
     event_description, event_metadata
   ) VALUES (
     $1, $2, 'published_as_public', NOW(),
     'Strategy published as public',
     jsonb_build_object(
       'versionNumber', $3,
       'publishedVersionId', $4
     )
   );
   ```
8. **Return updated strategy details**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "My SMA Crossover Strategy",
    "description": "Simple moving average crossover for trending markets",
    "status": "active",
    "isTemplate": false,
    "isPublic": true,
    "publishedVersionId": "uuid",
    "publishedVersionNumber": 2,
    "currentVersionId": "uuid",
    "currentVersionNumber": 3,
    "message": "Strategy published (version 2). You can continue editing without affecting the published version.",
    "updatedAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Not Owner):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not own this strategy",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 400 - Invalid Status):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS",
    "message": "Only active strategies can be published. Current status: draft",
    "details": {
      "strategyId": "uuid",
      "currentStatus": "draft",
      "requiredStatus": "active"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 400 - Invalid Version):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_VERSION",
    "message": "Strategy version 5 not found",
    "details": {
      "strategyId": "uuid",
      "requestedVersion": 5,
      "availableVersions": [1, 2, 3]
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Strategy marked as public (`is_public = true`)
- Published version ID updated to target version
- Event logged to strategy_events table
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Strategy is template | 403 | Return "Templates can only be managed by admins" |
| Strategy not found | 404 | Return "Strategy not found" |
| Strategy not active | 400 | Return "Only active strategies can be published. Current status: {status}" |
| Version not found | 400 | Return "Strategy version {n} not found" with available versions |
| Code validation failed | 400 | Return validation errors with line numbers |
| Already published same version | 200 | Return success (idempotent operation) |
| Database error | 500 | Log error, rollback transaction |

#### Version Control Explained

**Key Concept**: Separating current version from published version

- **current_version_id**: The latest version, user continues editing here
- **published_version_id**: The frozen version shown to all users as public strategy

**Workflow Example:**
1. User creates "My SMA Strategy" → v1 created
2. User tests and refines → v2, v3 created (current_version_id = v3)
3. User publishes v2: `published_version_id = v2`, `is_public = true`
4. Other users browse public strategies → see v2 code
5. User continues experimenting → v4, v5 created
6. Other users still see v2 (stable published version)
7. Later, user re-publishes with v5: `published_version_id = v5`
8. Now other users see v5 when viewing this public strategy

**Benefits:**
- **Stability**: Published version doesn't change unexpectedly
- **Flexibility**: User can experiment without breaking published strategy
- **Version Control**: Can update published version at any time
- **Testing**: Test new versions before making them public

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-005**: Access Control (ownership validation)

**Process-Specific Notes:**
- Database Queries: 3-4 queries (strategy fetch, version validation, update, event log)
- Expected Execution Time: P95 < 300ms
- Code Validation: < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `strategy_events`

**Libraries:**
- Python AST parser - Code validation
- Regex - Security scanning

#### Notes
- **User-facing Feature**: Any user can publish their own strategies
- **Version Immutability**: Published versions are read-only, user must create new version to change
- **Audit Trail**: All publication events logged to strategy_events
- **Security**: Code validation ensures only safe code is published
- **Marketplace Ready**: Published strategies are discoverable via PROC-STRATEGY-001 with `scope=public`
- **Related Processes**:
  - PROC-STRATEGY-003 (Create New Strategy) - How user creates initial strategy
  - PROC-STRATEGY-004 (Edit Existing Strategy) - How user creates new versions
  - PROC-STRATEGY-001 (List Strategies with Filters) - How users discover published strategies
  - PROC-STRATEGY-014 (Admin - Publish Strategy as Template) - Admin-only template publishing
  - PROC-STRATEGY-008 (Unpublish Strategy) - How to revert publication

---

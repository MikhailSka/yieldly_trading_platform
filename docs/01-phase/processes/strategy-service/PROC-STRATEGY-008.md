### PROC-STRATEGY-008: Unpublish Strategy

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-008
**Related NFR:** NFR-PERF-001, NFR-SEC-005
**Related ADR:** ADR-024, ADR-032

#### Trigger
User unpublishes their strategy to make it private again

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User is authenticated
- User owns the strategy
- Strategy exists and is currently published (`is_public = true`)
- Strategy is not a template (templates can only be managed by admins)

#### Inputs

**API Endpoint:** `PATCH /api/v1/strategies/{id}/unpublish`

**Request Body:**
```json
{}
```
Note: No body required, action is idempotent

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/unpublish` (PATCH)
2. **Strategy Controller validates ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.status, s.is_template, s.is_public,
          s.published_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
   - If `user_id != current_user_id` → Return 403 Forbidden
   - If `is_template = true` → Return 403 "Templates can only be managed by admins"
3. **Strategy Repository updates strategy to unpublish**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE strategies
   SET
     is_public = false,
     published_version_id = NULL,
     updated_at = NOW()
   WHERE id = $1 AND user_id = $2
   RETURNING *;
   ```
   **Parameters:**
   - `$1` = strategy_id
   - `$2` = user_id (ensure ownership)
4. **Strategy Event Logger logs unpublication event**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   INSERT INTO strategy_events (
     strategy_id, user_id, event_type, event_timestamp,
     event_description, event_metadata
   ) VALUES (
     $1, $2, 'unpublished', NOW(),
     'Strategy unpublished (made private)',
     jsonb_build_object(
       'previousPublicStatus', true,
       'previousPublishedVersionId', $3
     )
   );
   ```
5. **Return updated strategy details**

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
    "isPublic": false,
    "publishedVersionId": null,
    "currentVersionId": "uuid",
    "currentVersionNumber": 3,
    "message": "Strategy unpublished. It is now private and only visible to you.",
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

**Error Response (HTTP 403 - Template):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Templates can only be managed by admins. Use PROC-STRATEGY-015 to unpublish templates.",
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
- Strategy marked as private (`is_public = false`)
- Published version ID cleared (`published_version_id = NULL`)
- Event logged to strategy_events table
- Strategy no longer visible in public listings (PROC-STRATEGY-001 with `scope=public`)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Strategy is template | 403 | Return "Templates can only be managed by admins" |
| Strategy not found | 404 | Return "Strategy not found" |
| Already unpublished | 200 | Return success (idempotent operation) |
| Database error | 500 | Log error, rollback transaction |

#### Use Cases

**Scenario 1: User wants to update public strategy extensively**
1. User unpublishes strategy (this endpoint)
2. User makes extensive edits (PROC-STRATEGY-004)
3. User tests new version
4. User re-publishes with updated version (PROC-STRATEGY-007)

**Scenario 2: User receives negative feedback**
1. User unpublishes strategy immediately
2. User addresses issues in new version
3. Optionally re-publishes improved version later

**Scenario 3: User changes mind about sharing**
1. User unpublishes strategy
2. Strategy becomes private, only visible to user
3. Can re-publish at any time

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-005**: Access Control (ownership validation)

**Process-Specific Notes:**
- Database Queries: 2-3 queries (strategy fetch, update, event log)
- Expected Execution Time: P95 < 200ms
- No code validation needed (only changing visibility)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_events`

#### Notes
- **User-facing Feature**: Any user can unpublish their own published strategies
- **Idempotent**: Can call multiple times safely (already unpublished returns success)
- **Immediate Effect**: Strategy immediately removed from public listings
- **Audit Trail**: Unpublication event logged for compliance
- **Reversible**: User can re-publish at any time using PROC-STRATEGY-007
- **No Data Loss**: Published version ID preserved in audit log (event_metadata)
- **Related Processes**:
  - PROC-STRATEGY-007 (Publish Strategy as Public) - Reverse operation
  - PROC-STRATEGY-001 (List Strategies with Filters) - Unpublished strategies not in `scope=public`
  - PROC-STRATEGY-015 (Admin - Unpublish Template) - Admin-only template unpublishing

---

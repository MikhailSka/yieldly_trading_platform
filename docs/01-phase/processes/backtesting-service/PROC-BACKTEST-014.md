### PROC-BACKTEST-014: Archive/Restore Individual Backtest

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-029, ADR-032

#### Trigger
User wants to archive a backtest to hide it from default list, or restore a previously archived backtest

#### Actor
Authenticated User (owner of the backtest)

#### Preconditions
- User is authenticated
- User owns the backtest
- Backtest exists and is not deleted (deleted_at IS NULL)

#### Overview

This process supports two operations:
1. **Archive** - Hide backtest from default list (can be restored)
2. **Restore** - Un-archive a previously archived backtest

**Archive vs Delete:**
- `archived_at` - User hides from default list, can restore. Still accessible via filter.
- `deleted_at` - Soft delete, not shown anywhere. Kept for audit trail only.

**Note:** Archived/deleted backtests still count toward user's quota because they were executed.

---

## 1. Archive Backtest

#### Inputs

**API Endpoint:** `POST /api/v1/backtests/{id}/archive`

**Path Parameters:**
- `{id}`: Backtest UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/{id}/archive` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates backtest exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, group_id, status, archived_at, deleted_at
   FROM backtests
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest not found" (treat deleted as not existing)
   - If archived_at IS NOT NULL → Return 409 "Backtest is already archived"
4. **Backtesting Repository archives backtest**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET archived_at = NOW()
   WHERE id = $1
   RETURNING id, archived_at;
   ```
5. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "archivedAt": "2024-12-16T12:00:00Z",
    "message": "Backtest archived successfully. You can restore it from the archived list."
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (404 - Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "BACKTEST_NOT_FOUND",
    "message": "Backtest not found",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (409 - Already Archived):**
```json
{
  "success": false,
  "error": {
    "code": "ALREADY_ARCHIVED",
    "message": "Backtest is already archived",
    "details": {
      "archivedAt": "2024-12-15T10:00:00Z"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 2. Restore Backtest

#### Inputs

**API Endpoint:** `POST /api/v1/backtests/{id}/restore`

**Path Parameters:**
- `{id}`: Backtest UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/{id}/restore` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates backtest exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, group_id, status, archived_at, deleted_at
   FROM backtests
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest not found" (cannot restore deleted)
   - If archived_at IS NULL → Return 409 "Backtest is not archived"
4. **Backtesting Repository restores backtest**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET archived_at = NULL
   WHERE id = $1
   RETURNING id;
   ```
5. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "message": "Backtest restored successfully. It is now visible in your backtest list."
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (409 - Not Archived):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_ARCHIVED",
    "message": "Backtest is not archived",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 3. Soft Delete Backtest

#### Inputs

**API Endpoint:** `DELETE /api/v1/backtests/{id}`

**Path Parameters:**
- `{id}`: Backtest UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/{id}` (DELETE)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates backtest exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, group_id, deleted_at
   FROM backtests
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest not found" (already deleted)
4. **Backtesting Repository soft deletes backtest**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET deleted_at = NOW(),
       archived_at = COALESCE(archived_at, NOW())  -- Also archive if not already
   WHERE id = $1
   RETURNING id, deleted_at;
   ```
5. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "deletedAt": "2024-12-16T12:00:00Z",
    "message": "Backtest deleted successfully. This action cannot be undone by the user."
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria

**Archive:**
- Backtest archived_at set to current timestamp
- Backtest hidden from default list queries
- HTTP 200 OK

**Restore:**
- Backtest archived_at set to NULL
- Backtest visible in default list queries
- HTTP 200 OK

**Delete:**
- Backtest deleted_at set to current timestamp
- Backtest not visible anywhere (except admin audit)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Backtest not found | 404 | Return "Backtest not found" |
| Not owner | 403 | Return "Access denied" |
| Already archived (archive) | 409 | Return "Backtest is already archived" |
| Not archived (restore) | 409 | Return "Backtest is not archived" |
| Already deleted | 404 | Return "Backtest not found" (treat as non-existent) |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Archive/Restore/Delete**: P95 < 100ms (single UPDATE query)
- **Indexes Used**:
  - `backtests.id` (primary key)
  - `(user_id, archived_at)` - for filtering archived backtests

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtests`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

#### Notes

**Quota Implications:**
- Archived backtests still count toward user's monthly quota
- Deleted backtests still count toward user's monthly quota
- Rationale: The backtest was executed and consumed compute resources

**Group Backtests:**
- Individual backtests within a group can be archived separately
- Archiving a group does NOT automatically archive its backtests (handled in PROC-BACKTEST-016)
- Restoring a group does NOT automatically restore its backtests

**Data Retention:**
- Archived backtests: Kept indefinitely (user can restore)
- Deleted backtests: Kept for audit trail (90 days recommended, then hard delete via cleanup job)

**UI Considerations:**
- Default list view: `WHERE archived_at IS NULL AND deleted_at IS NULL`
- Archived list view: `WHERE archived_at IS NOT NULL AND deleted_at IS NULL`
- Deleted items: Not shown to users (admin/audit only)

**Related Processes:**
- PROC-BACKTEST-005: List User Backtests (filter by archived status)
- PROC-BACKTEST-015: Archive/Restore Backtest Group
- PROC-BACKTEST-006: Get Backtest Details (include archived_at in response)

---

### PROC-BACKTEST-015: Archive/Restore Backtest Group

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-029, ADR-032

#### Trigger
User wants to archive a backtest group to hide it from default list, or restore a previously archived group

#### Actor
Authenticated User (owner of the backtest group)

#### Preconditions
- User is authenticated
- User owns the backtest group
- Group exists and is not deleted (deleted_at IS NULL)

#### Overview

This process supports two operations:
1. **Archive** - Hide backtest group from default list (can be restored)
2. **Restore** - Un-archive a previously archived backtest group

**Archive vs Delete:**
- `archived_at` - User hides from default list, can restore. Still accessible via filter.
- `deleted_at` - Soft delete, not shown anywhere. Kept for audit trail only.

**Cascade Behavior:**
- Archiving a group automatically archives all its backtests
- Restoring a group automatically restores all its backtests
- Deleting a group automatically deletes all its backtests

**Note:** Archived/deleted groups still count toward user's quota because they were executed.

---

## 1. Archive Backtest Group

#### Inputs

**API Endpoint:** `POST /api/v1/backtests/groups/{id}/archive`

**Path Parameters:**
- `{id}`: Backtest Group UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/groups/{id}/archive` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates group exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, status, symbol_count, archived_at, deleted_at
   FROM backtest_groups
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest group not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest group not found" (treat deleted as not existing)
   - If archived_at IS NOT NULL → Return 409 "Backtest group is already archived"
4. **Backtesting Repository begins transaction**
5. **Backtesting Repository archives the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtest_groups
   SET archived_at = NOW()
   WHERE id = $1
   RETURNING id, archived_at;
   ```
6. **Backtesting Repository archives all backtests in the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET archived_at = NOW()
   WHERE group_id = $1
     AND archived_at IS NULL
     AND deleted_at IS NULL
   RETURNING id;
   ```
7. **Commit transaction**
8. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "archivedAt": "2024-12-16T12:00:00Z",
    "backtestsArchived": 5,
    "message": "Backtest group and 5 backtests archived successfully. You can restore it from the archived list."
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
    "code": "BACKTEST_GROUP_NOT_FOUND",
    "message": "Backtest group not found",
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
    "message": "Backtest group is already archived",
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

## 2. Restore Backtest Group

#### Inputs

**API Endpoint:** `POST /api/v1/backtests/groups/{id}/restore`

**Path Parameters:**
- `{id}`: Backtest Group UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/groups/{id}/restore` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates group exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, status, symbol_count, archived_at, deleted_at
   FROM backtest_groups
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest group not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest group not found" (cannot restore deleted)
   - If archived_at IS NULL → Return 409 "Backtest group is not archived"
4. **Backtesting Repository begins transaction**
5. **Backtesting Repository restores the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtest_groups
   SET archived_at = NULL
   WHERE id = $1
   RETURNING id;
   ```
6. **Backtesting Repository restores all backtests in the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   -- Only restore backtests that are not individually deleted
   UPDATE backtests
   SET archived_at = NULL
   WHERE group_id = $1
     AND deleted_at IS NULL
   RETURNING id;
   ```
7. **Commit transaction**
8. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "backtestsRestored": 5,
    "message": "Backtest group and 5 backtests restored successfully. They are now visible in your list."
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
    "message": "Backtest group is not archived",
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

## 3. Soft Delete Backtest Group

#### Inputs

**API Endpoint:** `DELETE /api/v1/backtests/groups/{id}`

**Path Parameters:**
- `{id}`: Backtest Group UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/groups/{id}` (DELETE)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates group exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, deleted_at
   FROM backtest_groups
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest group not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest group not found" (already deleted)
4. **Backtesting Repository begins transaction**
5. **Backtesting Repository soft deletes the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtest_groups
   SET deleted_at = NOW(),
       archived_at = COALESCE(archived_at, NOW())  -- Also archive if not already
   WHERE id = $1
   RETURNING id, deleted_at;
   ```
6. **Backtesting Repository soft deletes all backtests in the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET deleted_at = NOW(),
       archived_at = COALESCE(archived_at, NOW())
   WHERE group_id = $1
     AND deleted_at IS NULL
   RETURNING id;
   ```
7. **Commit transaction**
8. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "deletedAt": "2024-12-16T12:00:00Z",
    "backtestsDeleted": 5,
    "message": "Backtest group and 5 backtests deleted successfully. This action cannot be undone by the user."
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
- Group archived_at set to current timestamp
- All non-deleted backtests in group archived
- Group hidden from default list queries
- HTTP 200 OK

**Restore:**
- Group archived_at set to NULL
- All non-deleted backtests in group restored
- Group visible in default list queries
- HTTP 200 OK

**Delete:**
- Group deleted_at set to current timestamp
- All backtests in group soft deleted
- Group not visible anywhere (except admin audit)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Group not found | 404 | Return "Backtest group not found" |
| Not owner | 403 | Return "Access denied" |
| Already archived (archive) | 409 | Return "Backtest group is already archived" |
| Not archived (restore) | 409 | Return "Backtest group is not archived" |
| Already deleted | 404 | Return "Backtest group not found" (treat as non-existent) |
| Database error | 500 | Rollback transaction, log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Archive/Restore/Delete**: P95 < 200ms (transaction with 2 UPDATE queries)
- **Indexes Used**:
  - `backtest_groups.id` (primary key)
  - `(user_id, archived_at)` - for filtering archived groups
  - `backtests.group_id` - for cascade operations

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtest_groups`, `backtests`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

#### Notes

**Cascade Behavior Explained:**

| Operation | Group | Backtests in Group |
|-----------|-------|-------------------|
| Archive Group | archived_at = NOW() | All non-deleted backtests archived |
| Restore Group | archived_at = NULL | All non-deleted backtests restored |
| Delete Group | deleted_at = NOW() | All non-deleted backtests deleted |

**Edge Cases:**
- If a backtest was individually deleted before the group, it stays deleted
- If a backtest was individually archived before the group archive, it gets the same archived_at timestamp
- When restoring a group, only backtests that are not individually deleted are restored

**Quota Implications:**
- Archived groups still count toward user's monthly quota
- Deleted groups still count toward user's monthly quota
- Rationale: The backtests were executed and consumed compute resources

**Data Retention:**
- Archived groups: Kept indefinitely (user can restore)
- Deleted groups: Kept for audit trail (90 days recommended, then hard delete via cleanup job)

**UI Considerations:**
- Default list view: `WHERE archived_at IS NULL AND deleted_at IS NULL`
- Archived list view: `WHERE archived_at IS NOT NULL AND deleted_at IS NULL`
- Deleted items: Not shown to users (admin/audit only)

**Running Groups:**
- Groups with status `running` or `queued` can be archived
- Archiving does NOT cancel running backtests
- Use PROC-BACKTEST-003 (Cancel Backtest) to stop running backtests first if needed

**Related Processes:**
- PROC-BACKTEST-013: List Backtest Groups (filter by archived status)
- PROC-BACKTEST-014: Archive/Restore Individual Backtest
- PROC-BACKTEST-010: Get Backtest Group Status (include archived_at in response)
- PROC-BACKTEST-003: Cancel Backtest (to stop running before archive)

---

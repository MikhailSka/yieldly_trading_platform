### PROC-STRATEGY-013: Revert Strategy to Previous Version

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-008
**Related NFR:** NFR-PERF-001, NFR-SEC-002
**Related ADR:** ADR-024, ADR-032

#### Trigger
User reverts strategy to a previous version after testing or discovering issues with current version

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User is authenticated
- User owns the strategy
- Strategy exists and is not deleted
- Target version exists
- Strategy is not a template (templates can only be managed by admins)

#### Inputs

**API Endpoint:** `POST /api/v1/strategies/{id}/revert`

**Request Body:**
```json
{
  "versionNumber": "integer (required, which version to revert to)",
  "description": "string (optional, description for the new version created)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/revert` (POST)
2. **Strategy Controller validates ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.status, s.is_template, s.is_public,
          s.current_version_id, s.version_count
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
   - If `user_id != current_user_id` → Return 403 Forbidden
   - If `is_template = true` → Return 403 "Templates cannot be reverted. Contact admin."
3. **Version Manager validates target version exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT sv.id, sv.version_number, sv.code, sv.description
   FROM strategy_versions sv
   WHERE sv.strategy_id = $1 AND sv.version_number = $2;
   ```
   - If version not found → Return 404 "Version {n} not found"
4. **Code Validator validates target version code** (security check)
   - Same validation as PROC-STRATEGY-003 steps 5-7
   - Ensures reverted code is still safe (security standards may have changed)
   - If validation fails → Return 400 with validation errors
5. **Version Manager creates new version with old code**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   -- New version number = current version_count + 1
   INSERT INTO strategy_versions (
     strategy_id, version_number, code, description,
     created_by_user_id, created_at
   ) VALUES (
     $1,
     (SELECT version_count + 1 FROM strategies WHERE id = $1),
     $2,  -- Code from target version
     COALESCE($3, 'Reverted to version ' || $4),
     $5,  -- Current user ID
     NOW()
   )
   RETURNING id, version_number;
   ```
   **Parameters:**
   - `$1` = strategy_id
   - `$2` = code (from target version)
   - `$3` = description (user-provided or default)
   - `$4` = target version number (for default description)
   - `$5` = user_id
6. **Strategy Repository updates current version**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE strategies
   SET
     current_version_id = $1,  -- New version ID
     version_count = version_count + 1,
     updated_at = NOW()
   WHERE id = $2
   RETURNING *;
   ```
   **Parameters:**
   - `$1` = new_version_id (from step 5)
   - `$2` = strategy_id
7. **Strategy Event Logger logs revert event**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   INSERT INTO strategy_events (
     strategy_id, user_id, event_type, event_timestamp,
     event_description, event_metadata
   ) VALUES (
     $1, $2, 'version_created', NOW(),
     'Reverted to previous version',
     jsonb_build_object(
       'newVersionNumber', $3,
       'revertedFromVersion', $4,
       'revertedToVersion', $5,
       'action', 'revert'
     )
   );
   ```
8. **Return new version details**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "My SMA Strategy",
    "description": "Simple moving average crossover",
    "oldVersionNumber": 5,
    "revertedToVersionNumber": 3,
    "newVersionNumber": 6,
    "newVersionId": "uuid",
    "message": "Successfully reverted to version 3. Created new version 6 with the code from version 3.",
    "code": "def entry_signal(data):\n    sma_short = SMA(data.close, 20)\n    ...",
    "versionDescription": "Reverted to version 3",
    "createdAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Template):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Templates cannot be reverted. Contact admin to update template version.",
    "details": {
      "isTemplate": true,
      "recommendation": "Admin can use PROC-STRATEGY-014 to publish different version as template"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 404 - Version Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "VERSION_NOT_FOUND",
    "message": "Strategy version 10 not found",
    "details": {
      "strategyId": "uuid",
      "requestedVersion": 10,
      "availableVersions": [1, 2, 3, 4, 5]
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 400 - Code Validation Failed):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Code validation failed. Version 3 code no longer meets current security standards.",
    "details": [
      {
        "line": 15,
        "message": "Prohibited import: os",
        "severity": "error"
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
- New version created with code from target version
- Strategy's current_version_id updated to new version
- Version count incremented
- Event logged with revert metadata
- HTTP 201 Created

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Strategy is template | 403 | Return "Templates cannot be reverted. Contact admin." |
| Strategy not found | 404 | Return "Strategy not found" |
| Version not found | 404 | Return "Strategy version {n} not found" with available versions |
| Code validation failed | 400 | Return validation errors (old code may not meet current standards) |
| Reverting to current version | 400 | Return "Already on version {n}" |
| Database error | 500 | Log error, rollback transaction |

#### Revert vs Edit Explained

**Revert Creates New Version** (this process):
- Takes code from old version
- Creates NEW version with that code
- Preserves complete history
- Old versions remain unchanged

**Why Not Just Update current_version_id?**
- **Audit Trail**: Every change creates a version
- **Rollback History**: Can see when reverts happened
- **No Data Loss**: Original versions never modified
- **Backtest Integrity**: Existing backtests still reference correct versions

**Example Timeline:**
```
v1 (Initial)
v2 (Improvements)
v3 (More changes)
v4 (Bug introduced) ← current_version_id
User discovers bug, reverts to v3:
v5 (Revert to v3) ← new version created, current_version_id = v5
  └─ Code is identical to v3
  └─ But version number is v5
  └─ Description: "Reverted to version 3"
```

#### Use Cases

**Use Case 1: Bug Discovery**
```
1. User on v5, discovers critical bug
2. User views version history (PROC-STRATEGY-011)
3. User identifies v3 was stable
4. User reverts to v3 (this endpoint)
5. New v6 created with v3 code
6. User can continue editing from stable base
```

**Use Case 2: A/B Testing Different Approaches**
```
1. User on v4 (approach A)
2. User tries approach B, creates v5, v6
3. Backtest results show approach A was better
4. User reverts to v4
5. New v7 created with v4 code
6. User can refine approach A from there
```

**Use Case 3: Accidental Deletion**
```
1. User accidentally deletes important logic in v8
2. User immediately reverts to v7
3. New v9 created with v7 code
4. No work lost, can re-apply intended changes carefully
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-002**: Code validation and security scanning requirements

**Process-Specific Notes:**
- Database Queries: 4-5 queries (ownership check, version fetch, validation, INSERT, UPDATE, event log)
- Expected Execution Time: P95 < 400ms
- Code Validation: < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `strategy_events`

**Libraries:**
- Python AST parser - Code validation
- Regex - Security scanning

#### Notes
- **Creates New Version**: Revert always creates a new version (preserves history)
- **Code Validation**: Old code must still pass current security standards
- **Template Protection**: Templates cannot be reverted (admin must use PROC-STRATEGY-013)
- **Audit Trail**: Revert action logged with full metadata
- **Idempotent**: Can revert to same version multiple times (each creates new version)
- **Published Strategies**: Reverting does NOT change published_version_id automatically
- **User Decision**: After revert, user can optionally re-publish new version (PROC-STRATEGY-007)
- **Related Processes**:
  - PROC-STRATEGY-011 (View Version History) - Select version to revert to
  - PROC-STRATEGY-012 (View Specific Version) - Review version before reverting
  - PROC-STRATEGY-004 (Edit Existing Strategy) - Alternative to revert
  - PROC-STRATEGY-007 (Publish Strategy) - Re-publish after revert if needed

---

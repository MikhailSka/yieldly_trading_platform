### PROC-STRATEGY-004: Edit Existing Strategy

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-024, ADR-032  

#### Trigger
User saves changes to strategy code or metadata

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User owns the strategy
- Strategy exists
- Strategy is not a template (templates can only be edited by admins)

#### Inputs

**API Endpoint:** `PUT /api/v1/strategies/{id}`

**Request Body:**
```json
{
  "name": "string (optional)",
  "description": "string (optional)",
  "code": "string (optional)",
  "tags": ["array (optional)"],
  "riskLevel": "string (optional)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}` (PUT)
2. **Strategy Controller validates ownership**
   ```sql
   SELECT user_id, is_template FROM strategies WHERE strategy_id = $1
   ```
   - If `user_id != current_user_id` → Return 403 Forbidden
   - If `is_template = true` → Return 403 "Cannot edit templates"
3. **Strategy Controller retrieves current strategy**
   ```sql
   SELECT * FROM strategies WHERE strategy_id = $1
   ```
4. **If code is being updated**:
   - **Code Validator validates new code** (same as PROC-STRATEGY-003 steps 4-6)
   - If validation fails → Return 400 with errors
5. **Strategy Manager merges updates**
   - Only update provided fields
   - Preserve existing values for omitted fields
6. **Strategy Manager checks if code changed**
   - Compare `new_code` with `current_code`
   - If code changed → increment version
7. **Strategy Repository updates strategy**
   ```sql
   UPDATE strategies
   SET name = COALESCE($1, name),
       description = COALESCE($2, description),
       code = COALESCE($3, code),
       tags = COALESCE($4, tags),
       risk_level = COALESCE($5, risk_level),
       version = CASE WHEN $3 IS NOT NULL THEN version + 1 ELSE version END,
       updated_at = NOW()
   WHERE strategy_id = $6
   RETURNING *
   ```
8. **If code changed, Version Manager creates new version**
   ```sql
   INSERT INTO strategy_versions (
     strategy_id, version, code, created_at, change_note
   ) VALUES ($1, $2, $3, NOW(), 'User edit')
   ```
9. **Return updated strategy**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "string",
    "code": "string",
    "version": 2,
    "updatedAt": "2024-12-01T12:00:00Z",
    "validationStatus": "valid"
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

#### Success Criteria
- Strategy updated in database
- New version created if code changed
- Updated strategy returned
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Strategy not found | 404 | Return "Strategy not found" |
| Code validation failed | 400 | Return validation errors |
| Cannot edit template | 403 | Return "Templates can only be edited by admins" |
| Database error | 500 | Log error, rollback |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 2-4 queries per request (ownership check, fetch current, update, optional version insert)
- Expected Execution Time: P95 < 300ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`

---

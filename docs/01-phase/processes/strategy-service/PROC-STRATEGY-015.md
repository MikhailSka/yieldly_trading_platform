### PROC-STRATEGY-015: Admin - Unpublish Template

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-005
**Related NFR:** NFR-PERF-001, NFR-SEC-005
**Related ADR:** ADR-024, ADR-032

#### Trigger
Admin unpublishes a template to remove it from the template library

#### Actor
Admin

#### Preconditions
- User has admin role
- Strategy exists and is currently a template (`is_template = true`)

#### Inputs

**API Endpoint:** `PATCH /api/v1/admin/strategies/{id}/unpublish-template`

**Request Body:**
```json
{}
```
Note: No body required, action is idempotent

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/strategies/{id}/unpublish-template` (PATCH)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden "Admin permissions required"
3. **Strategy Repository validates strategy exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.status, s.is_template, s.is_public,
          s.template_version_id, s.created_by_admin
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
4. **Strategy Repository updates strategy to unpublish template**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE strategies
   SET
     is_template = false,
     template_version_id = NULL,
     updated_at = NOW()
   WHERE id = $1
   RETURNING *;
   ```
   **Parameters:**
   - `$1` = strategy_id

   **Note**: `created_by_admin` flag is NOT cleared - preserves original creator metadata
5. **Strategy Event Logger logs template unpublication event**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   INSERT INTO strategy_events (
     strategy_id, user_id, event_type, event_timestamp,
     event_description, event_metadata
   ) VALUES (
     $1, $2, 'unpublished', NOW(),
     'Template unpublished by admin',
     jsonb_build_object(
       'previousTemplateStatus', true,
       'previousTemplateVersionId', $3,
       'adminId', $2
     )
   );
   ```
6. **Return updated strategy details**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "SMA Crossover Template",
    "description": "Former template, now returned to original creator",
    "status": "active",
    "isTemplate": false,
    "isPublic": false,
    "createdByAdmin": true,
    "templateVersionId": null,
    "currentVersionId": "uuid",
    "currentVersionNumber": 5,
    "message": "Template unpublished. No longer visible in template library. Original creator retains ownership.",
    "updatedAt": "2024-12-01T12:00:00Z"
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
    "message": "Admin permissions required",
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
- Strategy marked as non-template (`is_template = false`)
- Template version ID cleared (`template_version_id = NULL`)
- Event logged to strategy_events table
- Strategy no longer visible in template listings (PROC-STRATEGY-001 with `scope=templates`)
- Original creator retains ownership
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Strategy not found | 404 | Return "Strategy not found" |
| Already unpublished | 200 | Return success (idempotent operation) |
| Database error | 500 | Log error, rollback transaction |

#### Use Cases

**Scenario 1: Template contains outdated practices**
1. Admin unpublishes template (this endpoint)
2. Template removed from template library immediately
3. Original creator still owns strategy and can edit
4. Optionally, admin can contact creator about updating
5. Admin can re-publish improved version later (PROC-STRATEGY-014)

**Scenario 2: Template has security issues**
1. Admin discovers security vulnerability in template
2. Admin unpublishes template immediately
3. Template removed from all users' template library
4. Admin fixes issue or contacts original creator
5. Admin publishes corrected version

**Scenario 3: Consolidating template library**
1. Admin reviews all templates
2. Admin unpublishes redundant or low-quality templates
3. Keeps only high-quality, well-maintained templates
4. Improves user experience by reducing noise

**Scenario 4: Original creator requests removal**
1. Original creator contacts admin to remove their strategy from templates
2. Admin unpublishes template
3. Strategy reverted to creator's private control
4. Creator can continue using/editing privately

#### Ownership After Unpublishing

**Important**: Unpublishing a template does NOT delete the strategy or change ownership

- **Original creator**: Retains full ownership and access
- **Strategy status**: Remains active (unless explicitly changed)
- **Visibility**: Becomes private to original creator only
- **created_by_admin flag**: Preserved for historical tracking
- **Audit trail**: Complete history maintained in strategy_events

**If template was admin-created:**
- Strategy ownership remains with admin account
- Admin can delete strategy separately if needed (PROC-STRATEGY-005)
- Or admin can keep it private for future use

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-005**: Access Control (admin-only operation)

**Process-Specific Notes:**
- Database Queries: 2-3 queries (strategy fetch, update, event log)
- Expected Execution Time: P95 < 200ms
- No code validation needed (only changing visibility)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_events`

#### Notes
- **Admin-Only Feature**: Regular users cannot unpublish templates
- **Idempotent**: Can call multiple times safely (already unpublished returns success)
- **Immediate Effect**: Template immediately removed from template library
- **Audit Trail**: Unpublication event logged for compliance
- **Reversible**: Admin can re-publish at any time using PROC-STRATEGY-014
- **No Data Loss**: Template version ID preserved in audit log (event_metadata)
- **Ownership Preserved**: Original creator retains ownership of strategy
- **Graceful Degradation**: If strategy was both template AND public, only template flag is cleared
- **Related Processes**:
  - PROC-STRATEGY-014 (Admin - Publish Strategy as Template) - Reverse operation
  - PROC-STRATEGY-001 (List Strategies with Filters) - Unpublished templates not in `scope=templates`
  - PROC-STRATEGY-008 (Unpublish Strategy) - User-facing unpublish for public strategies

---

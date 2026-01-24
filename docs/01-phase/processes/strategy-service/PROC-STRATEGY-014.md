### PROC-STRATEGY-014: Admin - Publish Strategy as Template

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-005
**Related NFR:** NFR-PERF-001, NFR-SEC-005
**Related ADR:** ADR-024, ADR-032

#### Trigger
Admin publishes a strategy as an official template for all users

#### Actor
Admin

#### Preconditions
- User has admin role
- Strategy exists and is not deleted
- Target version exists and is valid
- Strategy status is 'active' (cannot publish drafts as templates)

#### Inputs

**API Endpoint:** `PATCH /api/v1/admin/strategies/{id}/publish-template`

**Request Body:**
```json
{
  "versionNumber": "integer (required, which version to publish as template)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/strategies/{id}/publish-template` (PATCH)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden "Admin permissions required"
3. **Strategy Repository validates strategy exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.status, s.is_template, s.is_public,
          s.current_version_id, s.template_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
4. **Strategy Controller validates strategy status**
   - If `status != 'active'` → Return 400 "Only active strategies can be published as templates. Current status: {status}"
5. **Version Manager validates target version exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT sv.id, sv.version_number, sv.code, sv.description
   FROM strategy_versions sv
   WHERE sv.strategy_id = $1 AND sv.version_number = $2;
   ```
   - If version not found → Return 400 "Version {n} not found"
6. **Code Validator validates version code** (security check)
   - Same validation as PROC-STRATEGY-003 steps 5-7
   - Extra scrutiny for templates (official content)
   - If validation fails → Return 400 with validation errors
7. **Strategy Repository updates strategy as template**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE strategies
   SET
     is_template = true,
     template_version_id = $1,
     created_by_admin = true,
     updated_at = NOW()
   WHERE id = $2
   RETURNING *;
   ```
   **Parameters:**
   - `$1` = version_id (UUID of target version)
   - `$2` = strategy_id
8. **Strategy Event Logger logs template publication event**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   INSERT INTO strategy_events (
     strategy_id, user_id, event_type, event_timestamp,
     event_description, event_metadata
   ) VALUES (
     $1, $2, 'published_as_template', NOW(),
     'Strategy published as official template by admin',
     jsonb_build_object(
       'versionNumber', $3,
       'templateVersionId', $4,
       'adminId', $2
     )
   );
   ```
9. **Return updated strategy details**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "SMA Crossover Template",
    "description": "Official template for simple moving average crossover strategies",
    "status": "active",
    "isTemplate": true,
    "isPublic": false,
    "createdByAdmin": true,
    "templateVersionId": "uuid",
    "templateVersionNumber": 2,
    "currentVersionId": "uuid",
    "currentVersionNumber": 3,
    "message": "Strategy published as template (version 2). Visible to all users in template library. Original creator can continue editing without affecting template.",
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

**Error Response (HTTP 400 - Invalid Status):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS",
    "message": "Only active strategies can be published as templates. Current status: draft",
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
- Strategy marked as template (`is_template = true`)
- Template version ID updated to target version
- `created_by_admin` flag set to true
- Event logged to strategy_events table
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Strategy not found | 404 | Return "Strategy not found" |
| Strategy not active | 400 | Return "Only active strategies can be published as templates. Current status: {status}" |
| Version not found | 400 | Return "Strategy version {n} not found" with available versions |
| Code validation failed | 400 | Return validation errors with line numbers |
| Already published same version | 200 | Return success (idempotent operation) |
| Database error | 500 | Log error, rollback transaction |

#### Template Version Control

**Key Concept**: Admin can publish any user's strategy as template without affecting ownership

- **Original creator**: Retains ownership, can continue editing (current_version_id)
- **Template users**: See frozen template version (template_version_id)
- **Admin control**: Can update which version is the template at any time

**Workflow Example:**
1. User "Alice" creates "Advanced SMA Strategy" → v1, v2, v3
2. Admin reviews and likes v2
3. Admin publishes v2 as template: `template_version_id = v2`, `is_template = true`
4. All users can now browse and use this template (seeing v2 code)
5. Alice continues working → v4, v5 created
6. Template users still see v2 (stable, admin-approved version)
7. Alice's current version is v5, but template stays at v2
8. Admin later decides v5 is better → re-publishes as template with v5
9. Template users now see v5

**Benefits:**
- **Quality Control**: Admin approves which versions become templates
- **Stability**: Templates don't change when original creator edits
- **Recognition**: Original creator credited, maintains ownership
- **Flexibility**: Admin can promote community strategies to templates
- **Version Control**: Clear separation between template and working versions

#### Admin Workflow for Creating Templates

**Recommended Process:**
1. Admin creates their own strategy OR finds excellent user strategy
2. Admin tests strategy thoroughly
3. Admin ensures strategy is well-documented (description, tags)
4. Admin sets strategy status to 'active'
5. Admin uses this endpoint to publish specific version as template
6. Template appears in all users' template library (PROC-STRATEGY-001 with `scope=templates`)

**Alternative: Publishing User Strategies as Templates:**
1. Admin discovers high-quality user strategy
2. Admin contacts user for permission (optional, platform policy)
3. Admin publishes user's strategy as template
4. User retains ownership and can continue editing
5. Template library shows strategy with credit to original creator

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-005**: Access Control (admin-only operation)

**Process-Specific Notes:**
- Database Queries: 3-4 queries (strategy fetch, version validation, update, event log)
- Expected Execution Time: P95 < 300ms
- Code Validation: < 100ms (extra scrutiny for templates)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `strategy_events`

**Libraries:**
- Python AST parser - Code validation
- Regex - Security scanning

#### Notes
- **Admin-Only Feature**: Regular users cannot publish templates
- **Version Immutability**: Template versions are read-only, admin must re-publish to change
- **Audit Trail**: All template publications logged to strategy_events
- **Security**: Code validation with extra scrutiny (templates are official content)
- **Original Creator Rights**: Original creator maintains ownership and edit rights
- **Discovery**: Templates visible to all users via PROC-STRATEGY-001 with `scope=templates`
- **Separate from Public**: A strategy can be both template AND public (different version IDs)
- **Related Processes**:
  - PROC-STRATEGY-001 (List Strategies with Filters) - How users discover templates
  - PROC-STRATEGY-007 (Publish Strategy as Public) - User-facing publication
  - PROC-STRATEGY-015 (Admin - Unpublish Template) - How to revert template status

---

### PROC-STRATEGY-002: Get Strategy Details (with Optional Version)

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-005, FR-STRATEGY-008
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views strategy details, clicks "Use Template", "Edit Strategy", loads a public strategy, or views a specific version for backtesting

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Strategy exists (template, public, or user's own)

#### Inputs

**API Endpoint:** `GET /api/v1/strategies/{id}?version={number}`

**Query Parameters:**
```
GET /api/v1/strategies/{id}?
  version={number} (optional, specific version number to load)
```

**Version Parameter Behavior:**
- If `version` is provided → Load that specific version
- If `version` is NOT provided → Load appropriate default version:
  - Own strategy → Load current version (current_version_id)
  - Template → Load template version (template_version_id)
  - Public → Load published version (published_version_id)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}?version={number}` (GET)
2. **Strategy Controller validates strategy exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT
     s.id, s.user_id, s.name, s.description, s.tags, s.status,
     s.is_template, s.is_public, s.created_by_admin, s.version_count,
     s.image_url, s.current_version_id, s.template_version_id,
     s.published_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
3. **Strategy Controller validates user access**
   - If user owns strategy (user_id = current_user_id) → Allow
   - If is_template = true → Allow (read-only)
   - If is_public = true AND status = 'active' → Allow (read-only)
   - Otherwise → Return 403 Forbidden
4. **Version Manager determines which version to load**
   ```
   If version parameter provided:
     target_version_number = version parameter
   Else if user owns strategy:
     target_version_id = current_version_id
   Else if is_template:
     target_version_id = template_version_id
   Else if is_public:
     target_version_id = published_version_id
   ```
5. **Version Manager fetches target version**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT
     sv.id, sv.version_number, sv.code, sv.description,
     sv.created_by_user_id, sv.created_at,
     u.username as created_by_username
   FROM strategy_versions sv
   LEFT JOIN users u ON sv.created_by_user_id = u.id
   WHERE sv.strategy_id = $1
     AND (
       -- Load by version number if specified
       ($2 IS NOT NULL AND sv.version_number = $2)
       OR
       -- Or load by version ID
       ($3 IS NOT NULL AND sv.id = $3)
     );
   ```
   **Parameters:**
   - `$1` = strategy_id
   - `$2` = version_number (if provided)
   - `$3` = version_id (from step 4)
   - If version not found → Return 404 "Version {n} not found"
6. **Strategy Manager gets indicator usage**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT ARRAY_AGG(DISTINCT i.name) as indicators_used
   FROM strategy_indicator_usage siu
   LEFT JOIN indicators i ON siu.indicator_id = i.id
   WHERE siu.strategy_id = $1;
   ```
7. **Determine edit permissions**
   - can_edit = (user owns strategy AND loading current version)
   - read_only = !can_edit
8. **Return full strategy details**

#### Outputs

**Success Response (HTTP 200) - Own Strategy, Current Version:**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "My SMA Strategy",
    "description": "Simple moving average crossover",
    "code": "def entry_signal(data):\n    sma_short = SMA(data.close, 20)\n    ...",
    "tags": ["trend-following", "beginner"],
    "indicatorsUsed": ["SMA", "EMA"],
    "status": "active",
    "version": {
      "versionId": "uuid",
      "versionNumber": 5,
      "description": "Latest improvements",
      "isCurrent": true,
      "isTemplate": false,
      "isPublished": false,
      "createdByUsername": "alice",
      "createdAt": "2024-12-05T14:30:00Z"
    },
    "versionCount": 5,
    "isOwner": true,
    "isTemplate": false,
    "isPublic": false,
    "canEdit": true,
    "editMode": "editable",
    "message": "Strategy loaded. You can edit and save changes."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (HTTP 200) - Template:**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "SMA Crossover Template",
    "description": "Official template for simple moving average crossover",
    "code": "def entry_signal(data):\n    sma_short = SMA(data.close, 20)\n    ...",
    "tags": ["trend-following", "beginner"],
    "indicatorsUsed": ["SMA"],
    "status": "active",
    "version": {
      "versionId": "uuid",
      "versionNumber": 2,
      "description": "Tested and stable version",
      "isCurrent": false,
      "isTemplate": true,
      "isPublished": false,
      "createdByUsername": "admin",
      "createdAt": "2024-11-20T12:00:00Z"
    },
    "versionCount": 5,
    "isOwner": false,
    "isTemplate": true,
    "isPublic": false,
    "canEdit": false,
    "editMode": "readonly",
    "message": "Template loaded (version 2). Create your own copy to edit."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (HTTP 200) - Specific Version for Backtest:**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "My SMA Strategy",
    "description": "Simple moving average crossover",
    "code": "def entry_signal(data):\n    sma_short = SMA(data.close, 20)\n    ...",
    "tags": ["trend-following", "beginner"],
    "indicatorsUsed": ["SMA"],
    "status": "active",
    "version": {
      "versionId": "uuid",
      "versionNumber": 3,
      "description": "Version for backtesting",
      "isCurrent": false,
      "isTemplate": false,
      "isPublished": false,
      "createdByUsername": "alice",
      "createdAt": "2024-11-28T16:45:00Z"
    },
    "versionCount": 5,
    "isOwner": true,
    "isTemplate": false,
    "isPublic": false,
    "canEdit": false,
    "editMode": "readonly",
    "message": "Version 3 loaded for backtesting. This is a read-only snapshot."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
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

**Error Response (HTTP 403 - Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You don't have permission to view this strategy",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Frontend Behavior

**Editable Mode** (user's own strategy, current version):
- Load into editor with edit permissions
- Show "Save Changes" button
- When user clicks save → Call PROC-STRATEGY-004 to update existing
- Auto-save drafts enabled

**Read-Only Mode** (template, public, or specific version):
- Load into editor in read-only mode
- Show "Save as New Strategy" button
- When user clicks save → Call PROC-STRATEGY-003 to create new strategy
- Syntax highlighting enabled, but no editing

**Backtest Mode** (specific version for backtesting):
- Load version into backtest configuration
- Display version number and description
- Show "Run Backtest" button
- Pass `strategy_version_id` to Backtesting Service

#### Success Criteria
- Strategy data fetched successfully
- Correct version loaded based on context
- User access validated
- Full code and metadata returned
- Edit permissions correctly set
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Strategy not found | 404 | Return "Strategy not found" |
| Version not found | 404 | Return "Strategy version {n} not found" with available versions |
| Strategy deleted | 404 | Return "Strategy no longer available" |
| Access denied | 403 | Return "You don't have permission to view this strategy" |
| Private strategy | 403 | Return "This strategy is private" |
| Database error | 500 | Log error, return generic message |

#### Version Loading Logic Explained

**Own Strategy (no version specified):**
```
User owns strategy → Load current_version_id
→ canEdit = true
→ User can edit and save changes
```

**Template (no version specified):**
```
is_template = true → Load template_version_id
→ canEdit = false
→ User sees the official template version
→ Original creator's current version may be different
```

**Public Strategy (no version specified):**
```
is_public = true → Load published_version_id
→ canEdit = false
→ User sees the public version
→ Original creator's current version may be different
```

**Specific Version (version parameter provided):**
```
version=3 → Load version 3
→ canEdit = false (even for owner, it's a historical snapshot)
→ Read-only view for review or backtesting
```

#### Use Cases

**Use Case 1: Edit Own Strategy**
```
GET /api/v1/strategies/{id}/load
→ Loads current version
→ canEdit = true
→ User edits and saves (PROC-STRATEGY-004)
```

**Use Case 2: Use Template**
```
GET /api/v1/strategies/{template_id}/load
→ Loads template_version_id
→ canEdit = false
→ User modifies and saves as new (PROC-STRATEGY-003)
```

**Use Case 3: Backtest Specific Version**
```
GET /api/v1/strategies/{id}/load?version=3
→ Loads version 3 code
→ canEdit = false
→ User runs backtest on version 3
→ Backtesting Service receives strategy_version_id for v3
```

**Use Case 4: Compare Versions**
```
GET /api/v1/strategies/{id}/load?version=2
→ Load v2 in one window
GET /api/v1/strategies/{id}/load?version=5
→ Load v5 in another window
→ Side-by-side comparison
```

**Use Case 5: View Public Strategy**
```
GET /api/v1/strategies/{public_id}/load
→ Loads published_version_id
→ canEdit = false
→ User can view code, save as their own, or run backtest
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 3 queries (strategy fetch, version fetch, indicators)
- Expected Execution Time: P95 < 200ms
- Full code included in response

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `strategy_indicator_usage`, `indicators`, `users`

#### Notes
- **Version-Aware**: Now supports loading specific versions for backtesting
- **Smart Defaults**: Automatically loads appropriate version based on context
- **Edit Permissions**: Only current version of owned strategy is editable
- **Backtest Integration**: Backtesting Service uses strategy_version_id to ensure reproducibility
- **Historical Snapshots**: Old versions loaded as read-only for review
- **Template Stability**: Templates always show template_version_id, not creator's current version
- **Related Processes**:
  - PROC-STRATEGY-003 (Create New Strategy) - Save template/public as new
  - PROC-STRATEGY-004 (Edit Existing Strategy) - Save changes to owned strategy
  - PROC-STRATEGY-011 (View Version History) - List versions before loading
  - PROC-STRATEGY-012 (View Specific Version) - Alternative to load for viewing only
  - Backtesting Service - Run backtest on specific strategy_version_id

---

### PROC-STRATEGY-012: View Specific Strategy Version

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-008
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-024, ADR-032

#### Trigger
User views details of a specific strategy version to review code, compare versions, or prepare for backtest

#### Actor
Authenticated User (Strategy Owner) or Admin

#### Preconditions
- User is authenticated
- User owns the strategy OR is admin
- Strategy exists and is not deleted
- Target version exists

#### Inputs

**API Endpoint:** `GET /api/v1/strategies/{id}/versions/{versionNumber}`

**Path Parameters:**
- `{id}`: Strategy UUID
- `{versionNumber}`: Version number (integer, e.g., 1, 2, 3)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/versions/{versionNumber}` (GET)
2. **Strategy Controller validates access**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.name, s.description, s.is_template, s.is_public,
          s.status, s.tags, s.current_version_id, s.template_version_id,
          s.published_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 "Strategy not found"
   - If `user_id != current_user_id AND user is not admin` → Return 403 Forbidden
3. **Version Manager retrieves specific version**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT
     sv.id,
     sv.version_number,
     sv.code,
     sv.description,
     sv.created_by_user_id,
     sv.created_at,
     u.username as created_by_username,
     LENGTH(sv.code) as code_size_bytes
   FROM strategy_versions sv
   LEFT JOIN users u ON sv.created_by_user_id = u.id
   WHERE sv.strategy_id = $1 AND sv.version_number = $2;
   ```
   **Parameters:**
   - `$1` = strategy_id
   - `$2` = version_number
   - If version not found → Return 404 "Version {n} not found"
4. **Determine version status**
   - Check if this version is current, template, or published
5. **Get backtest statistics for this version**
   ```sql
   SELECT
     COUNT(*) as total_backtests,
     AVG(total_return) as avg_return,
     AVG(sharpe_ratio) as avg_sharpe,
     MAX(created_at) as last_backtest_at
   FROM backtests
   WHERE strategy_version_id = $1 AND status = 'completed';
   ```
6. **Return version details**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "strategyName": "My SMA Strategy",
    "strategyDescription": "Simple moving average crossover for trending markets",
    "strategyStatus": "active",
    "strategyTags": ["trend-following", "beginner"],
    "version": {
      "versionId": "uuid",
      "versionNumber": 3,
      "description": "Improved indicator parameters",
      "code": "def entry_signal(data):\n    sma_short = SMA(data.close, 20)\n    sma_long = SMA(data.close, 50)\n    return sma_short > sma_long\n\ndef exit_signal(data):\n    sma_short = SMA(data.close, 20)\n    sma_long = SMA(data.close, 50)\n    return sma_short < sma_long",
      "codeSizeBytes": 1856,
      "versionStatus": {
        "isCurrent": false,
        "isTemplate": false,
        "isPublished": false,
        "label": "archived"
      },
      "createdByUserId": "uuid",
      "createdByUsername": "alice",
      "createdAt": "2024-11-28T16:45:00Z"
    },
    "backtestStats": {
      "totalBacktests": 2,
      "averageReturn": 12.5,
      "averageSharpe": 1.8,
      "lastBacktestAt": "2024-11-29T10:30:00Z"
    }
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
- Version details retrieved successfully
- Full code included in response
- Version status correctly determined
- Backtest statistics calculated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Strategy not found | 404 | Return "Strategy not found" |
| Version not found | 404 | Return "Strategy version {n} not found" with available versions |
| Not strategy owner (not admin) | 403 | Return "You do not have access to this strategy" |
| Database error | 500 | Log error, return generic message |

#### Use Cases

**Use Case 1: Review Old Version Before Reverting**
```
User workflow:
1. View version history (PROC-STRATEGY-011)
2. User sees v3 had good backtest results
3. User views v3 details (this endpoint)
4. User reviews code to confirm it's the right version
5. User reverts to v3 (PROC-STRATEGY-013)
```

**Use Case 2: Compare Two Versions**
```
User workflow:
1. User views v2 (this endpoint)
2. User notes code differences
3. User views v5 (this endpoint)
4. User compares side-by-side
5. User decides which approach is better
```

**Use Case 3: Backtest Specific Version**
```
User workflow:
1. User views version history
2. User selects v4 for backtesting
3. User views v4 details (this endpoint)
4. User reviews code is correct
5. User runs backtest on v4 (Backtesting Service uses strategy_version_id)
```

**Use Case 4: Understand Published Version**
```
User workflow:
1. User publishes v2 as public
2. Later, user wants to see what code is public
3. User views published version in history
4. User views v2 details (this endpoint)
5. User sees exact code that other users see
```

#### Version Status Object Explained

```json
"versionStatus": {
  "isCurrent": false,      // Is this the current working version?
  "isTemplate": false,     // Is this the template version?
  "isPublished": false,    // Is this the published public version?
  "label": "archived"      // Human-readable status
}
```

**Possible labels:**
- `"current"` - This is the latest working version
- `"template"` - This version is shown as a template
- `"published"` - This version is shown as public
- `"current, published"` - Both current AND published
- `"archived"` - Old version, not actively used

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 3 queries (strategy validation, version details, backtest stats)
- Expected Execution Time: P95 < 250ms
- Full code included (can be large, ~2-50 KB typical)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `users`, `backtests`

#### Notes
- **Full Code Included**: Unlike PROC-STRATEGY-011, this includes the complete strategy code
- **Backtest Stats**: Shows how this specific version performed in backtests
- **Admin Access**: Admins can view any strategy version (for template review)
- **Immutable**: Version code is read-only, cannot be modified (only create new version)
- **Code Syntax**: Code returned as-is, frontend can apply syntax highlighting
- **Related Processes**:
  - PROC-STRATEGY-011 (View Version History) - List all versions
  - PROC-STRATEGY-013 (Revert to Previous Version) - Make old version current
  - PROC-STRATEGY-002 (Load Strategy into Editor) - Load version for editing
  - Backtesting Service - Run backtest on specific version

---

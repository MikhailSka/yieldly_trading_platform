### PROC-BACKTEST-013: List Backtest Groups

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-029, ADR-032

#### Trigger
User navigates to backtest groups page or requests list of multi-symbol backtest groups

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Valid JWT access token provided

#### Inputs
**API Endpoint:** `GET /api/v1/backtests/groups`

**Query Parameters:**
```
GET /api/v1/backtests/groups?
  page={number}&
  page_size={number}&
  sort_by={field}&
  sort_order={asc|desc}&
  status={status}&
  strategy_id={uuid}&
  date_from={ISO8601}&
  date_to={ISO8601}&
  search={term}&
  include_archived={boolean}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 20, max: 100): Items per page
- `sort_by` (string, default: created_at): Field to sort by
  - Allowed: `created_at`, `completed_at`, `status`, `symbol_count`, `strategy_name`
- `sort_order` (string, default: desc): Sort direction (`asc` or `desc`)
- `status` (string, optional): Filter by status (`queued`, `running`, `completed`, `cancelled`)
- `strategy_id` (uuid, optional): Filter by specific strategy
- `date_from` (ISO8601, optional): Filter groups created after this date
- `date_to` (ISO8601, optional): Filter groups created before this date
- `search` (string, optional, max 100 chars): Search in strategy name, symbols
- `include_archived` (boolean, default: false): If true, include archived groups in results. If false (default), only non-archived groups are returned.

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service `/api/v1/backtests/groups`
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates query parameters**
   - Validate `page` >= 1
   - Validate `page_size` between 1 and 100
   - Validate `sort_by` is in allowed fields list
   - Validate `sort_order` is `asc` or `desc`
   - Validate `status` is valid enum value if provided
   - Validate date formats (ISO8601) if provided
   - Validate `search` length <= 100 characters
   - Return 400 if any validation fails
4. **Backtest Controller builds query filters**
   - Apply user_id filter (always)
   - Apply optional filters for status, strategy_id
   - Apply date range filters if provided
   - Apply search filter (ILIKE on strategy_name, symbols)
5. **Backtesting Repository counts total matching records**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT COUNT(*)
   FROM backtest_groups g
   WHERE g.user_id = $1
     AND g.deleted_at IS NULL  -- Never show deleted groups
     AND ($2::boolean IS TRUE OR g.archived_at IS NULL)  -- Filter archived unless include_archived=true
     AND ($3::backtest_group_status IS NULL OR g.status = $3)
     AND ($4::uuid IS NULL OR g.strategy_id = $4)
     AND ($5::timestamptz IS NULL OR g.created_at >= $5)
     AND ($6::timestamptz IS NULL OR g.created_at <= $6)
     AND ($7::varchar IS NULL OR (
       g.strategy_name ILIKE '%' || $7 || '%' OR
       g.symbols ILIKE '%' || $7 || '%'
     ))
   ```
6. **Backtesting Repository fetches paginated results**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     g.id,
     g.user_id,
     g.strategy_id,
     g.strategy_name,
     g.symbols,
     g.symbol_count,
     g.timeframe,
     g.start_date,
     g.end_date,
     g.initial_capital,
     g.commission_rate,
     g.slippage_rate,
     g.status,
     g.backtests_completed,
     g.backtests_failed,
     g.created_at,
     g.started_at,
     g.completed_at,
     g.notes,
     g.tags,
     g.archived_at
   FROM backtest_groups g
   WHERE g.user_id = $1
     AND g.deleted_at IS NULL  -- Never show deleted groups
     AND ($2::boolean IS TRUE OR g.archived_at IS NULL)  -- Filter archived unless include_archived=true
     AND ($3::backtest_group_status IS NULL OR g.status = $3)
     AND ($4::uuid IS NULL OR g.strategy_id = $4)
     AND ($5::timestamptz IS NULL OR g.created_at >= $5)
     AND ($6::timestamptz IS NULL OR g.created_at <= $6)
     AND ($7::varchar IS NULL OR (
       g.strategy_name ILIKE '%' || $7 || '%' OR
       g.symbols ILIKE '%' || $7 || '%'
     ))
   ORDER BY {sort_by} {sort_order}
   LIMIT $8 OFFSET $9
   ```
7. **For each group, fetch aggregate results summary** (if completed)
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     b.group_id,
     AVG(r.total_return) as avg_return,
     AVG(r.sharpe_ratio) as avg_sharpe,
     AVG(r.win_rate) as avg_win_rate,
     MAX(r.total_return) as best_return,
     MIN(r.total_return) as worst_return,
     SUM(r.total_trades) as total_trades
   FROM backtests b
   JOIN backtest_results r ON b.id = r.backtest_id
   WHERE b.group_id IN ($1, $2, ...)  -- IDs from step 6
     AND b.status = 'completed'
   GROUP BY b.group_id
   ```
8. **Backtest Controller formats response**
   - Calculate pagination metadata
   - Transform database rows to response DTOs
   - Include aggregate metrics for completed groups
9. **Return paginated response**

#### Outputs

**Success Response (200 OK) - ADR-032 Format:**
```json
{
  "success": true,
  "data": [
    {
      "groupId": "uuid",
      "strategyId": "uuid",
      "strategyName": "SMA Crossover Strategy",
      "symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"],
      "symbolCount": 5,
      "timeframe": "1h",
      "dateRange": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-12-31T00:00:00Z"
      },
      "initialCapitalPerSymbol": 10000.00,
      "status": "completed",
      "archivedAt": null,
      "progress": {
        "completed": 5,
        "failed": 0,
        "total": 5
      },
      "aggregateResults": {
        "averageReturn": 19.3,
        "averageSharpeRatio": 1.45,
        "averageWinRate": 57.8,
        "bestReturn": {
          "symbol": "SOLUSDT",
          "value": 45.2
        },
        "worstReturn": {
          "symbol": "XRPUSDT",
          "value": -5.3
        },
        "totalTrades": 253
      },
      "createdAt": "2024-12-01T10:00:00Z",
      "completedAt": "2024-12-01T10:04:35Z",
      "notes": "Testing strategy across major altcoins",
      "tags": ["multi-asset", "diversification"]
    },
    {
      "groupId": "uuid-2",
      "strategyId": "uuid",
      "strategyName": "RSI Reversal Strategy",
      "symbols": ["BTCUSDT", "ETHUSDT"],
      "symbolCount": 2,
      "timeframe": "4h",
      "dateRange": {
        "start": "2024-06-01T00:00:00Z",
        "end": "2024-12-31T00:00:00Z"
      },
      "initialCapitalPerSymbol": 5000.00,
      "status": "running",
      "archivedAt": null,
      "progress": {
        "completed": 1,
        "failed": 0,
        "total": 2
      },
      "aggregateResults": null,
      "createdAt": "2024-12-15T14:30:00Z",
      "completedAt": null,
      "notes": null,
      "tags": []
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 12,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Empty List (200 OK):**
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request - Invalid Sort Field):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid sort field",
    "details": [
      {
        "field": "sort_by",
        "message": "Invalid sort field. Allowed: created_at, completed_at, status, symbol_count, strategy_name",
        "code": "INVALID_SORT_FIELD"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Groups retrieved for authenticated user only
- Pagination metadata calculated correctly
- Filters applied correctly
- Aggregate results included for completed groups
- Search matches strategy name or symbols
- Results sorted as requested
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid page number | 400 | Return "Page number must be >= 1" |
| Invalid page size | 400 | Return "Page size must be between 1 and 100" |
| Invalid sort field | 400 | Return "Invalid sort field. Allowed: {fields}" |
| Invalid status filter | 400 | Return "Invalid status. Allowed: queued, running, completed, cancelled" |
| Invalid date format | 400 | Return "Invalid date format. Use ISO 8601" |
| Search term too long | 400 | Return "Search term must be 100 characters or less" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 3 queries (COUNT, SELECT groups, aggregate results)
- **Cache Strategy**: None (data changes frequently)
- **Expected Execution Time**: < 350ms
- **Indexes Required**:
  - `(user_id, created_at)` - primary list query
  - `(user_id, status)` - status filtering
  - `(user_id, strategy_id)` - strategy filtering

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtest_groups`, `backtests`, `backtest_results`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

#### Notes

**Aggregate Results:**
- Only calculated for groups with at least one completed backtest
- Failed backtests excluded from averages
- Null if group has no completed backtests yet

**Group vs Individual Backtests:**
- This endpoint lists only groups (multi-symbol runs)
- Use PROC-BACKTEST-005 to list individual backtests
- Use `group_id` filter in PROC-BACKTEST-005 to see backtests within a group

**Archive Filtering:**
- By default, archived groups are hidden from list results
- Use `include_archived=true` to show all groups (including archived)
- Deleted groups (deleted_at IS NOT NULL) are never shown to users
- The `archivedAt` field is included in response to indicate archive status

**UI Considerations:**
- Default view: Show only active (non-archived) groups
- Archived view: Filter with `include_archived=true` and show only archived items
- The response includes `archivedAt` so UI can display archive status

**Related Processes:**
- PROC-BACKTEST-005: List User Backtests (individual backtests)
- PROC-BACKTEST-010: Get Backtest Group Status (detailed group status)
- PROC-BACKTEST-011: Get Backtest Group Results (full group results)
- PROC-BACKTEST-014: Archive/Restore Individual Backtest
- PROC-BACKTEST-015: Archive/Restore Backtest Group

---

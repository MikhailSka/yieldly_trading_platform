### PROC-BACKTEST-005: List User Backtests

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-029, ADR-032

#### Trigger
User navigates to backtest history page or requests list of backtests

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Valid JWT access token provided

#### Inputs
**API Endpoint:** `GET /api/v1/backtests`

**Query Parameters:**
```
GET /api/v1/backtests?
  page={number}&
  page_size={number}&
  sort_by={field}&
  sort_order={asc|desc}&
  status={status}&
  symbol={symbol}&
  timeframe={timeframe}&
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
  - Allowed: `created_at`, `completed_at`, `symbol`, `status`, `total_return`, `sharpe_ratio`, `win_rate`
- `sort_order` (string, default: desc): Sort direction (`asc` or `desc`)
- `status` (string, optional): Filter by status (`queued`, `running`, `completed`, `failed`, `cancelled`)
- `symbol` (string, optional): Filter by trading pair (e.g., `BTCUSDT`)
- `timeframe` (string, optional): Filter by timeframe (`1m`, `5m`, `15m`, `1h`, `4h`, `1d`)
- `strategy_id` (uuid, optional): Filter by specific strategy
- `group_id` (uuid, optional): Filter by specific backtest group (to list backtests in a group)
- `standalone_only` (boolean, default: false): If true, only return backtests not in a group
- `date_from` (ISO8601, optional): Filter backtests created after this date
- `date_to` (ISO8601, optional): Filter backtests created before this date
- `search` (string, optional, max 100 chars): Search in strategy name, symbol
- `include_archived` (boolean, default: false): If true, include archived backtests in results. If false (default), only non-archived backtests are returned.

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service `/api/v1/backtests`
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates query parameters**
   - Validate `page` >= 1
   - Validate `page_size` between 1 and 100
   - Validate `sort_by` is in allowed fields list
   - Validate `sort_order` is `asc` or `desc`
   - Validate `status` is valid enum value if provided
   - Validate `timeframe` is valid enum value if provided
   - Validate date formats (ISO8601) if provided
   - Validate `search` length <= 100 characters
   - Return 400 if any validation fails
4. **Backtest Controller builds query filters**
   - Apply user_id filter (always)
   - Apply optional filters for status, symbol, timeframe, strategy_id
   - Apply date range filters if provided
   - Apply search filter (ILIKE on strategy_name, symbol)
5. **Backtesting Repository counts total matching records**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT COUNT(*)
   FROM backtests b
   WHERE b.user_id = $1
     AND b.deleted_at IS NULL  -- Never show deleted backtests
     AND ($2::boolean IS TRUE OR b.archived_at IS NULL)  -- Filter archived unless include_archived=true
     AND ($3::backtest_status IS NULL OR b.status = $3)
     AND ($4::varchar IS NULL OR b.symbol = $4)
     AND ($5::varchar IS NULL OR b.timeframe = $5)
     AND ($6::uuid IS NULL OR b.strategy_id = $6)
     AND ($7::timestamptz IS NULL OR b.created_at >= $7)
     AND ($8::timestamptz IS NULL OR b.created_at <= $8)
     AND ($9::varchar IS NULL OR (
       b.strategy_name ILIKE '%' || $9 || '%' OR
       b.symbol ILIKE '%' || $9 || '%'
     ))
   ```
6. **Backtesting Repository fetches paginated results**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     b.id,
     b.user_id,
     b.strategy_id,
     b.group_id,
     b.strategy_name,
     b.symbol,
     b.timeframe,
     b.start_date,
     b.end_date,
     b.initial_capital,
     b.status,
     b.created_at,
     b.started_at,
     b.completed_at,
     b.execution_duration_ms,
     b.error_message,
     b.archived_at,
     r.total_return,
     r.sharpe_ratio,
     r.max_drawdown,
     r.total_trades,
     r.win_rate
   FROM backtests b
   LEFT JOIN backtest_results r ON b.id = r.backtest_id
   WHERE b.user_id = $1
     AND b.deleted_at IS NULL  -- Never show deleted backtests
     AND ($2::boolean IS TRUE OR b.archived_at IS NULL)  -- Filter archived unless include_archived=true
     AND ($3::backtest_status IS NULL OR b.status = $3)
     AND ($4::varchar IS NULL OR b.symbol = $4)
     AND ($5::varchar IS NULL OR b.timeframe = $5)
     AND ($6::uuid IS NULL OR b.strategy_id = $6)
     AND ($7::uuid IS NULL OR b.group_id = $7)
     AND ($8::boolean IS FALSE OR b.group_id IS NULL)
     AND ($9::timestamptz IS NULL OR b.created_at >= $9)
     AND ($10::timestamptz IS NULL OR b.created_at <= $10)
     AND ($11::varchar IS NULL OR (
       b.strategy_name ILIKE '%' || $11 || '%' OR
       b.symbol ILIKE '%' || $11 || '%'
     ))
   ORDER BY {sort_by} {sort_order}
   LIMIT $12 OFFSET $13
   ```
7. **Backtest Controller formats response**
   - Calculate pagination metadata
   - Transform database rows to response DTOs
8. **Return paginated response**

#### Outputs

**Success Response (200 OK) - ADR-032 Format:**
```json
{
  "success": true,
  "data": [
    {
      "backtestId": "uuid",
      "groupId": null,
      "strategyId": "uuid",
      "strategyName": "SMA Crossover Strategy",
      "symbol": "BTCUSDT",
      "timeframe": "1h",
      "dateRange": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-12-31T00:00:00Z"
      },
      "initialCapital": 10000.00,
      "status": "completed",
      "archivedAt": null,
      "results": {
        "totalReturn": 25.01,
        "sharpeRatio": 1.42,
        "maxDrawdown": -15.2,
        "totalTrades": 47,
        "winRate": 62.5
      },
      "createdAt": "2024-12-01T10:00:00Z",
      "completedAt": "2024-12-01T10:02:35Z",
      "executionDurationMs": 155000
    },
    {
      "backtestId": "uuid-2",
      "groupId": "group-uuid",
      "strategyId": "uuid",
      "strategyName": "SMA Crossover Strategy",
      "symbol": "ETHUSDT",
      "timeframe": "1h",
      "dateRange": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-12-31T00:00:00Z"
      },
      "initialCapital": 10000.00,
      "status": "completed",
      "archivedAt": null,
      "results": {
        "totalReturn": 18.30,
        "sharpeRatio": 1.35,
        "maxDrawdown": -12.8,
        "totalTrades": 52,
        "winRate": 57.7
      },
      "createdAt": "2024-12-01T10:00:00Z",
      "completedAt": "2024-12-01T10:02:35Z",
      "executionDurationMs": 142000,
      "groupInfo": {
        "groupId": "group-uuid",
        "symbolCount": 5,
        "groupStatus": "completed"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 47,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
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
        "message": "Invalid sort field. Allowed: created_at, completed_at, symbol, status, total_return, sharpe_ratio, win_rate",
        "code": "INVALID_SORT_FIELD"
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
- Backtests retrieved for authenticated user only
- Pagination metadata calculated correctly
- Filters applied correctly
- Search matches strategy name or symbol
- Results sorted as requested
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid page number | 400 | Return "Page number must be >= 1" |
| Invalid page size | 400 | Return "Page size must be between 1 and 100" |
| Invalid sort field | 400 | Return "Invalid sort field. Allowed: {fields}" |
| Invalid status filter | 400 | Return "Invalid status. Allowed: queued, running, completed, failed, cancelled" |
| Invalid date format | 400 | Return "Invalid date format. Use ISO 8601 (e.g., 2024-01-01T00:00:00Z)" |
| Search term too long | 400 | Return "Search term must be 100 characters or less" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 2 queries (COUNT for total, SELECT for data)
- **Cache Strategy**: None (data changes frequently)
- **Expected Execution Time**: < 300ms
- **Indexes Required**:
  - `(user_id, created_at)` - primary list query
  - `(user_id, status)` - status filtering
  - `(user_id, strategy_id)` - strategy filtering
  - `symbol` - symbol filtering

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtests`, `backtest_results`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

#### Notes

**Archive Filtering:**
- By default, archived backtests are hidden from list results
- Use `include_archived=true` to show all backtests (including archived)
- Deleted backtests (deleted_at IS NOT NULL) are never shown to users
- The `archivedAt` field is included in response to indicate archive status

**UI Considerations:**
- Default view: Show only active (non-archived) backtests
- Archived view: Filter with `include_archived=true` and show only archived items
- The response includes `archivedAt` so UI can display archive status

**Related Processes:**
- PROC-BACKTEST-014: Archive/Restore Individual Backtest
- PROC-BACKTEST-015: Archive/Restore Backtest Group

---

### PROC-BACKTEST-006: Get Backtest Trades

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-029, ADR-032

#### Trigger
User clicks on trade history/log within a completed backtest result

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User owns the backtest
- Backtest has completed (status = 'completed')

#### Inputs
**API Endpoint:** `GET /api/v1/backtests/{backtestId}/trades`

**Path Parameters:**
- `backtestId` (uuid, required): The backtest ID

**Query Parameters:**
```
GET /api/v1/backtests/{backtestId}/trades?
  page={number}&
  page_size={number}&
  sort_by={field}&
  sort_order={asc|desc}&
  direction={long|short}&
  profitable={true|false}&
  date_from={ISO8601}&
  date_to={ISO8601}&
  search={term}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 50, max: 200): Items per page
- `sort_by` (string, default: entry_timestamp): Field to sort by
  - Allowed: `entry_timestamp`, `exit_timestamp`, `pnl`, `pnl_percent`, `duration_hours`, `trade_number`
- `sort_order` (string, default: asc): Sort direction (`asc` or `desc`)
- `direction` (string, optional): Filter by trade direction (`long` or `short`)
- `profitable` (boolean, optional): Filter by profitability (`true` = pnl > 0, `false` = pnl <= 0)
- `date_from` (ISO8601, optional): Filter trades with entry after this date
- `date_to` (ISO8601, optional): Filter trades with entry before this date
- `search` (string, optional, max 100 chars): Search in symbol, exit_reason

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service `/api/v1/backtests/{backtestId}/trades`
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates path parameter**
   - Validate `backtestId` is valid UUID format
   - Return 400 if invalid
4. **Backtest Controller validates ownership**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT user_id, status
   FROM backtests
   WHERE id = $1
   ```
   - If not found → Return 404 "Backtest not found"
   - If `user_id != current_user_id` → Return 403 "Access denied"
   - If `status != 'completed'` → Return 400 "Backtest not yet completed"
5. **Backtest Controller validates query parameters**
   - Validate pagination parameters
   - Validate sort field is in allowed list
   - Validate filter values
   - Return 400 if validation fails
6. **Backtesting Repository counts total matching trades**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT COUNT(*)
   FROM trades t
   WHERE t.backtest_id = $1
     AND ($2::trade_direction IS NULL OR t.direction = $2)
     AND ($3::boolean IS NULL OR (
       ($3 = true AND t.pnl > 0) OR
       ($3 = false AND t.pnl <= 0)
     ))
     AND ($4::timestamptz IS NULL OR t.entry_timestamp >= $4)
     AND ($5::timestamptz IS NULL OR t.entry_timestamp <= $5)
     AND ($6::varchar IS NULL OR (
       t.symbol ILIKE '%' || $6 || '%' OR
       t.exit_reason ILIKE '%' || $6 || '%'
     ))
   ```
7. **Backtesting Repository fetches paginated trades**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     t.id,
     t.backtest_id,
     t.trade_number,
     t.direction,
     t.symbol,
     t.entry_timestamp,
     t.entry_price,
     t.quantity,
     t.entry_value,
     t.exit_timestamp,
     t.exit_price,
     t.exit_value,
     t.pnl,
     t.pnl_percent,
     t.commission_paid,
     t.slippage_cost,
     t.duration_hours,
     t.exit_reason
   FROM trades t
   WHERE t.backtest_id = $1
     AND ($2::trade_direction IS NULL OR t.direction = $2)
     AND ($3::boolean IS NULL OR (
       ($3 = true AND t.pnl > 0) OR
       ($3 = false AND t.pnl <= 0)
     ))
     AND ($4::timestamptz IS NULL OR t.entry_timestamp >= $4)
     AND ($5::timestamptz IS NULL OR t.entry_timestamp <= $5)
     AND ($6::varchar IS NULL OR (
       t.symbol ILIKE '%' || $6 || '%' OR
       t.exit_reason ILIKE '%' || $6 || '%'
     ))
   ORDER BY {sort_by} {sort_order}
   LIMIT $7 OFFSET $8
   ```
8. **Backtest Controller calculates trade summary statistics**
   - Total winning trades in filter
   - Total losing trades in filter
   - Average PnL in filter
9. **Return paginated response with summary**

#### Outputs

**Success Response (200 OK) - ADR-032 Format:**
```json
{
  "success": true,
  "data": {
    "trades": [
      {
        "tradeId": "uuid",
        "tradeNumber": 1,
        "direction": "long",
        "symbol": "BTCUSDT",
        "entry": {
          "timestamp": "2024-01-15T14:30:00Z",
          "price": 42500.00,
          "quantity": 0.5,
          "value": 21250.00
        },
        "exit": {
          "timestamp": "2024-01-16T10:45:00Z",
          "price": 43200.00,
          "value": 21600.00,
          "reason": "take_profit"
        },
        "pnl": 315.50,
        "pnlPercent": 1.48,
        "costs": {
          "commission": 21.25,
          "slippage": 10.63
        },
        "durationHours": 20.25
      }
    ],
    "summary": {
      "filteredTrades": 47,
      "winningTrades": 30,
      "losingTrades": 17,
      "averagePnl": 53.25,
      "averagePnlPercent": 0.42
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 47,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (403 Forbidden - Not Owner):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (400 Bad Request - Backtest Not Complete):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "Backtest not yet completed",
    "details": [
      {
        "field": "backtestId",
        "message": "Trade data is only available for completed backtests",
        "code": "BACKTEST_NOT_COMPLETED"
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
- Trades retrieved for valid, owned, completed backtest
- Pagination metadata calculated correctly
- Filters applied correctly
- Summary statistics calculated for filtered results
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid backtest ID format | 400 | Return "Invalid backtest ID format" |
| Backtest not found | 404 | Return "Backtest not found" |
| Not backtest owner | 403 | Return "Access denied" |
| Backtest not completed | 400 | Return "Backtest not yet completed" |
| Invalid page number | 400 | Return "Page number must be >= 1" |
| Invalid page size | 400 | Return "Page size must be between 1 and 200" |
| Invalid sort field | 400 | Return "Invalid sort field. Allowed: {fields}" |
| Invalid direction filter | 400 | Return "Invalid direction. Allowed: long, short" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 3 queries (ownership check, COUNT, SELECT)
- **Cache Strategy**: Consider caching trade data (immutable once backtest complete)
- **Expected Execution Time**: < 300ms
- **Note**: Backtests can have thousands of trades; pagination is essential
- **Indexes Required**:
  - `(backtest_id, trade_number)` - unique constraint
  - `(backtest_id, entry_timestamp)` - date filtering
  - `(backtest_id, direction)` - direction filtering
  - `(backtest_id, pnl)` - profitability filtering

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtests`, `trades`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

---

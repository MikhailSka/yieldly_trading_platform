### PROC-HISTORICAL-003: List Available Symbols

**Service Owner:** Historical Data Service
**Related FR:** FR-BACKTEST-001, FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-025, ADR-032

#### Trigger
- **User**: User opens backtest configuration page to select symbol and date range for backtest
- **Admin**: Admin navigates to historical data management page to view all downloaded symbols

#### Actor
- Authenticated User (user endpoint)
- Admin User (admin endpoint with additional details)

#### Preconditions
- User is authenticated with valid JWT
- For admin endpoint: User has admin role

#### Overview

This process provides two endpoints with different access levels:

1. **User Endpoint** (`GET /api/v1/historical/symbols`) - Available to all authenticated users
   - Shows symbols with available data for backtest selection
   - Displays date ranges to help users choose valid backtest periods
   - Simplified response focused on backtest setup needs

2. **Admin Endpoint** (`GET /api/v1/admin/historical/symbols`) - Admin only
   - Full details including quality stats, sync status, and aggregate statistics
   - Additional filtering options for data management
   - Includes symbols without data (for tracking download needs)

**Storage Architecture:** Historical data is stored in 1-minute (1m) timeframe only. Higher timeframes (5m, 15m, 1h, 4h, 1d) are computed on-the-fly during retrieval (see PROC-HISTORICAL-002). The `availableTimeframes` shown to users represents what can be computed from available 1m data, not separately stored data.

---

## 1. User Endpoint: List Available Symbols for Backtesting

#### Inputs
**API Endpoint:** `GET /api/v1/historical/symbols`

**Query Parameters:**
```
GET /api/v1/historical/symbols?
  page={number}&
  page_size={number}&
  exchange={exchange}&
  search={term}&
  timeframe={timeframe}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 50, max: 100): Items per page
- `exchange` (string, optional): Filter by exchange (`bybit`, `binance`)
- `search` (string, optional, max 50 chars): Search in symbol name
- `timeframe` (string, optional): Filter symbols - any symbol with 1m data can support all timeframes, so this filters to symbols with sufficient data coverage for the requested timeframe granularity

#### Process Steps (User Endpoint)

1. **API Gateway receives request** → Routes to Historical Data Service `/api/v1/historical/symbols`
2. **API Gateway validates JWT** → Extracts user_id
3. **Historical Data Controller validates query parameters**
   - Validate pagination parameters
   - Validate exchange and timeframe if provided
   - Return 400 if validation fails
4. **Historical Data Repository counts matching records (only symbols with data)**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: All symbols with 1m data support all timeframes (computed on-the-fly)
   SELECT COUNT(*)
   FROM symbols_metadata sm
   WHERE sm.total_candles_count > 0
     AND sm.is_active = true
     AND ($1::exchange_type IS NULL OR sm.exchange = $1)
     AND ($2::varchar IS NULL OR sm.symbol ILIKE '%' || $2 || '%');
   ```
5. **Historical Data Repository fetches paginated results**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: available_timeframes is always '1m' (stored), but all timeframes are computable
   SELECT
     sm.exchange,
     sm.symbol,
     sm.base_asset,
     sm.quote_asset,
     '1m,5m,15m,1h,4h,1d' as available_timeframes, -- All timeframes computed from 1m
     sm.earliest_data_timestamp,
     sm.latest_data_timestamp
   FROM symbols_metadata sm
   WHERE sm.total_candles_count > 0
     AND sm.is_active = true
     AND ($1::exchange_type IS NULL OR sm.exchange = $1)
     AND ($2::varchar IS NULL OR sm.symbol ILIKE '%' || $2 || '%')
   ORDER BY sm.symbol ASC
   LIMIT $3 OFFSET $4;
   ```
6. **For each symbol, calculate available date range from 1m data**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: Only 1m data exists; higher timeframes share the same date range
   SELECT
     MIN(start_timestamp) as earliest,
     MAX(end_timestamp) as latest
   FROM symbol_data_ranges
   WHERE exchange = $1 AND symbol = $2 AND timeframe = '1m';
   ```
7. **Calculate available timeframes from 1m data range**
   - All timeframes (1m, 5m, 15m, 1h, 4h, 1d) are available if 1m data exists
   - Date ranges are the same for all timeframes (computed from 1m)
8. **Return user-friendly response**

#### Outputs (User Endpoint)

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "symbols": [
      {
        "exchange": "bybit",
        "symbol": "BTCUSDT",
        "baseAsset": "BTC",
        "quoteAsset": "USDT",
        "availableData": {
          "earliestDate": "2020-01-01T00:00:00Z",
          "latestDate": "2024-12-16T11:59:00Z",
          "storageTimeframe": "1m",
          "note": "All timeframes computed from 1m data",
          "supportedTimeframes": ["1m", "5m", "15m", "1h", "4h", "1d"]
        }
      },
      {
        "exchange": "binance",
        "symbol": "ETHUSDT",
        "baseAsset": "ETH",
        "quoteAsset": "USDT",
        "availableData": {
          "earliestDate": "2021-06-01T00:00:00Z",
          "latestDate": "2024-12-16T11:59:00Z",
          "storageTimeframe": "1m",
          "note": "All timeframes computed from 1m data",
          "supportedTimeframes": ["1m", "5m", "15m", "1h", "4h", "1d"]
        }
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 89,
    "totalPages": 2,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 2. Admin Endpoint: List Downloaded Symbols (Full Details)

#### Inputs
**API Endpoint:** `GET /api/v1/admin/historical/symbols`

**Query Parameters:**
```
GET /api/v1/admin/historical/symbols?
  page={number}&
  page_size={number}&
  sort_by={field}&
  sort_order={asc|desc}&
  exchange={exchange}&
  search={term}&
  has_data={boolean}&
  timeframe={timeframe}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 50, max: 200): Items per page
- `sort_by` (string, default: symbol): Field to sort by
  - Allowed: `symbol`, `exchange`, `earliest_data`, `latest_data`, `total_candles`, `completeness`, `last_synced`
- `sort_order` (string, default: asc): Sort direction (`asc` or `desc`)
- `exchange` (string, optional): Filter by exchange (`bybit`, `binance`)
- `search` (string, optional, max 50 chars): Search in symbol name
- `has_data` (boolean, optional): If true, only symbols with downloaded data; if false, only symbols without data

**Note:** There is no `timeframe` filter for admin endpoint because all symbols with 1m data automatically support all timeframes (computed on-the-fly).

#### Process Steps

1. **API Gateway receives request** → Routes to Historical Data Service `/api/v1/admin/historical/symbols`
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Historical Data Controller validates query parameters**
   - Validate `page` >= 1
   - Validate `page_size` between 1 and 200
   - Validate `sort_by` is in allowed fields list
   - Validate `sort_order` is `asc` or `desc`
   - Validate `exchange` is valid enum value if provided
   - Validate `timeframe` is valid enum value if provided
   - Validate `search` length <= 50 characters
   - Return 400 if any validation fails
5. **Historical Data Repository counts total matching records**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: No timeframe filter - all symbols with 1m data support all timeframes
   SELECT COUNT(*)
   FROM symbols_metadata sm
   WHERE ($1::exchange_type IS NULL OR sm.exchange = $1)
     AND ($2::varchar IS NULL OR sm.symbol ILIKE '%' || $2 || '%')
     AND ($3::boolean IS NULL OR
       ($3 = true AND sm.total_candles_count > 0) OR
       ($3 = false AND sm.total_candles_count = 0)
     );
   ```
6. **Historical Data Repository fetches paginated results**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: available_timeframes in DB is '1m', but all timeframes are supported via aggregation
   SELECT
     sm.id,
     sm.exchange,
     sm.symbol,
     sm.base_asset,
     sm.quote_asset,
     '1m' as storage_timeframe, -- Only 1m is stored
     sm.earliest_data_timestamp,
     sm.latest_data_timestamp,
     sm.total_candles_count,
     sm.data_completeness_percentage,
     sm.is_active,
     sm.is_delisted,
     sm.delisted_at,
     sm.last_synced_at,
     sm.created_at,
     sm.updated_at
   FROM symbols_metadata sm
   WHERE ($1::exchange_type IS NULL OR sm.exchange = $1)
     AND ($2::varchar IS NULL OR sm.symbol ILIKE '%' || $2 || '%')
     AND ($3::boolean IS NULL OR
       ($3 = true AND sm.total_candles_count > 0) OR
       ($3 = false AND sm.total_candles_count = 0)
     )
   ORDER BY {sort_by} {sort_order}
   LIMIT $4 OFFSET $5;
   ```
7. **For each symbol, fetch data range (1m only)**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: Only 1m timeframe is stored; higher timeframes computed on retrieval
   SELECT
     exchange,
     symbol,
     '1m' as timeframe,
     MIN(start_timestamp) as earliest,
     MAX(end_timestamp) as latest,
     SUM(candle_count) as total_candles
   FROM symbol_data_ranges
   WHERE exchange = $1 AND symbol = $2 AND timeframe = '1m'
   GROUP BY exchange, symbol;
   ```
8. **Calculate aggregate statistics**
   ```sql
   SELECT
     COUNT(DISTINCT symbol) as unique_symbols,
     SUM(total_candles_count) as total_candles,
     COUNT(DISTINCT exchange) as exchanges_count
   FROM symbols_metadata
   WHERE total_candles_count > 0;
   ```
9. **Historical Data Controller formats response**
   - Calculate pagination metadata
   - Transform database rows to response DTOs
10. **Return paginated response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "symbols": [
      {
        "symbolId": "uuid",
        "exchange": "bybit",
        "symbol": "BTCUSDT",
        "baseAsset": "BTC",
        "quoteAsset": "USDT",
        "status": {
          "isActive": true,
          "isDelisted": false
        },
        "dataAvailability": {
          "hasData": true,
          "earliestData": "2020-01-01T00:00:00Z",
          "latestData": "2024-12-16T11:59:00Z",
          "totalCandles": 2628000,
          "completenessPercentage": 99.2,
          "storageTimeframe": "1m",
          "supportedTimeframes": ["1m", "5m", "15m", "1h", "4h", "1d"],
          "note": "Higher timeframes computed from 1m data"
        },
        "storageDetails": {
          "timeframe": "1m",
          "earliestData": "2020-01-01T00:00:00Z",
          "latestData": "2024-12-16T11:59:00Z",
          "candleCount": 2628000,
          "rangeCount": 1
        },
        "lastSyncedAt": "2024-12-16T10:00:00Z",
        "createdAt": "2023-01-15T00:00:00Z"
      },
      {
        "symbolId": "uuid-2",
        "exchange": "binance",
        "symbol": "ETHUSDT",
        "baseAsset": "ETH",
        "quoteAsset": "USDT",
        "status": {
          "isActive": true,
          "isDelisted": false
        },
        "dataAvailability": {
          "hasData": true,
          "earliestData": "2021-06-01T00:00:00Z",
          "latestData": "2024-12-16T11:59:00Z",
          "totalCandles": 1864800,
          "completenessPercentage": 98.5,
          "storageTimeframe": "1m",
          "supportedTimeframes": ["1m", "5m", "15m", "1h", "4h", "1d"],
          "note": "Higher timeframes computed from 1m data"
        },
        "storageDetails": {
          "timeframe": "1m",
          "earliestData": "2021-06-01T00:00:00Z",
          "latestData": "2024-12-16T11:59:00Z",
          "candleCount": 1864800,
          "rangeCount": 2
        },
        "lastSyncedAt": "2024-12-15T18:00:00Z",
        "createdAt": "2023-06-01T00:00:00Z"
      }
    ],
    "aggregateStats": {
      "totalSymbols": 156,
      "symbolsWithData": 89,
      "totalCandles": 4523891,
      "exchangeBreakdown": {
        "bybit": { "symbols": 78, "candles": 2345678 },
        "binance": { "symbols": 78, "candles": 2178213 }
      }
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 156,
    "totalPages": 4,
    "hasNextPage": true,
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
  "data": {
    "symbols": [],
    "aggregateStats": {
      "totalSymbols": 0,
      "symbolsWithData": 0,
      "totalCandles": 0,
      "exchangeBreakdown": {}
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
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

**Error Response (403 Forbidden - Not Admin):**
```json
{
  "success": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Admin access required",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (400 Bad Request - Invalid Filter):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid sort field",
    "details": [
      {
        "field": "sort_by",
        "message": "Invalid sort field. Allowed: symbol, exchange, earliest_data, latest_data, total_candles, completeness, last_synced",
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
- Symbols retrieved with data availability information
- Pagination metadata calculated correctly
- Filters applied correctly
- Aggregate statistics calculated
- Admin access verified
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin access required" |
| Invalid page number | 400 | Return "Page number must be >= 1" |
| Invalid page size | 400 | Return "Page size must be between 1 and 200" |
| Invalid sort field | 400 | Return "Invalid sort field. Allowed: {fields}" |
| Invalid exchange filter | 400 | Return "Invalid exchange. Allowed: bybit, binance" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 3-4 queries (COUNT, symbols, ranges, aggregate)
- **Cache Strategy**: Consider caching aggregate stats (TTL: 5 minutes)
- **Expected Execution Time**: < 500ms
- **Indexes Required**:
  - `(exchange, symbol)` - unique lookup
  - `total_candles_count` - for has_data filter
  - `symbol` - for search
  - `last_synced_at` - for sorting

#### Dependencies

**Database:**
- `historical_db` (TimescaleDB) - Tables: `symbols_metadata`, `symbol_data_ranges`
- Verify schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml

#### Notes

**Access Levels:**

| Endpoint | Access | Purpose |
|----------|--------|---------|
| `GET /api/v1/historical/symbols` | All authenticated users | Backtest symbol/date selection |
| `GET /api/v1/admin/historical/symbols` | Admin only | Data management and monitoring |

**User Endpoint Design:**
- Only shows symbols with available data (no empty symbols)
- Only shows active symbols (not delisted)
- Focused on date range information needed for backtest setup
- Users can filter by exchange and timeframe to find suitable data

**Admin Endpoint Design:**
- Full details including quality stats, sync status
- Can view symbols without data (to track download needs)
- Aggregate statistics for monitoring data coverage
- Additional sorting and filtering options

**1-Minute Storage Architecture:**
- All data is stored at 1-minute (1m) granularity only
- Higher timeframes (5m, 15m, 1h, 4h, 1d) are computed on-the-fly during retrieval
- `supportedTimeframes` always includes all timeframes if 1m data exists
- `storageTimeframe` is always '1m' - this is what's actually stored

**Data Range Information:**
- `rangeCount` > 1 indicates gaps in data (multiple non-contiguous ranges)
- `completenessPercentage` is calculated based on expected 1m candles vs actual
- Delisted symbols may still have historical data available
- All timeframes share the same date range (computed from 1m data)

**Use Cases:**
1. **User**: Select symbol and date range when configuring a backtest
2. **User**: Verify data availability before running backtest
3. **Admin**: Review data coverage before enabling new trading pairs
4. **Admin**: Identify gaps in data that need to be filled
5. **Admin**: Monitor data ingestion progress
6. **Admin**: Plan data cleanup or retention policies

**Related Processes:**
- PROC-HISTORICAL-001: Ingest Historical Data
- PROC-HISTORICAL-002: Get Historical OHLCV Data
- PROC-HISTORICAL-004: Get Symbol Data Details (Admin)
- PROC-HISTORICAL-005: Delete Historical Data (Admin)
- PROC-HISTORICAL-006: Run Data Correctness Check (Admin)
- PROC-BACKTEST-001: Run Backtest (uses this endpoint for symbol/date validation)

---

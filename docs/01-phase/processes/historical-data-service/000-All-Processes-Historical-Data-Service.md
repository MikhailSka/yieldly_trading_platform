# Historical Data Service Processes - Consolidated

This document contains all process documentation for the Historical Data Service.

**Total Documents:** 8  
**Last Generated:** 2025-11-30T23:58:38.364Z  
**Source Directory:** `processes/historical-data-service`


---

## Table of Contents

1. [PROC-HISTORICAL-001](#proc-historical-001)
2. [PROC-HISTORICAL-002](#proc-historical-002)
3. [PROC-HISTORICAL-003](#proc-historical-003)
4. [PROC-HISTORICAL-004](#proc-historical-004)
5. [PROC-HISTORICAL-005](#proc-historical-005)
6. [PROC-HISTORICAL-006](#proc-historical-006)
7. [PROC-HISTORICAL-007](#proc-historical-007)
8. [PROC-HISTORICAL-008](#proc-historical-008)

---

## PROC-HISTORICAL-001: Ingest Historical Data (Admin)

**Source File:** `PROC-HISTORICAL-001.md`  
**Path:** `processes\historical-data-service\PROC-HISTORICAL-001.md`

### PROC-HISTORICAL-001: Ingest Historical Data (Admin)

**Service Owner:** Historical Data Service
**Related FR:** FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-021, ADR-025, ADR-032

#### Trigger
Admin initiates data download for a specific symbol and date range

#### Actor
Admin User

#### Preconditions
- User is authenticated with admin role
- Valid JWT access token with admin permissions
- Admin broker connection exists for the target exchange (see PROC-BROKER-001)
- Symbol is valid and trading on the exchange

#### Overview

This process downloads historical OHLCV data from exchanges through the Broker Connectivity Service. The data flow is:

1. Admin triggers download via Historical Data Service API
2. Historical Data Service creates a sync job and calls Broker Connectivity Service
3. Broker Connectivity Service downloads data from exchange (paginated, respecting rate limits)
4. Broker Connectivity Service streams data back to Historical Data Service
5. Historical Data Service validates and saves data to TimescaleDB
6. Symbol metadata and data ranges are updated

**Note:** This is a **synchronous operation** - the API call blocks until download completes or fails. For large date ranges, consider implementing background job processing in future iterations.

**Storage Architecture:** Historical data is **always stored in 1-minute (1m) timeframe only**. Higher timeframes (5m, 15m, 1h, 4h, 1d) are aggregated on-the-fly when data is retrieved (see PROC-HISTORICAL-002). This simplifies storage, ensures data consistency, and avoids redundant data.

---

#### Inputs
**API Endpoint:** `POST /api/v1/admin/historical/ingest`

**Request Body:**
```json
{
  "exchange": "bybit",
  "symbol": "BTCUSDT",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-12-31T23:59:59Z"
}
```

**Field Details:**
- `exchange` (string, required): Exchange identifier (`bybit`, `binance`)
- `symbol` (string, required): Trading pair symbol (e.g., `BTCUSDT`)
- `startDate` (ISO8601, required): Start of date range (inclusive)
- `endDate` (ISO8601, required): End of date range (inclusive)

**Note:** Data is always downloaded and stored in 1-minute (1m) timeframe. There is no timeframe parameter - all data is stored at 1m granularity and higher timeframes are computed on retrieval.

#### Process Steps

1. **API Gateway receives request** → Routes to Historical Data Service `/api/v1/admin/historical/ingest`
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Historical Data Controller validates request**
   - Validate `exchange` is valid enum value
   - Validate `symbol` format (uppercase, valid trading pair)
   - Validate `endDate` >= `startDate`
   - Validate date range <= 2 years
   - Return 400 if any validation fails
5. **Historical Data Controller checks for existing data**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: timeframe is always '1m' since we only store 1-minute data
   SELECT
     start_timestamp,
     end_timestamp,
     candle_count
   FROM symbol_data_ranges
   WHERE exchange = $1
     AND symbol = $2
     AND timeframe = '1m'
     AND (
       (start_timestamp <= $3 AND end_timestamp >= $3) OR
       (start_timestamp <= $4 AND end_timestamp >= $4) OR
       (start_timestamp >= $3 AND end_timestamp <= $4)
     );
   ```
   - If overlapping data exists, calculate actual range needed (fill gaps)
6. **Ingestion Manager calls Broker Connectivity Service**
   - Request: `POST /api/v1/broker/historical/download`
   - Body:
     ```json
     {
       "exchange": "bybit",
       "symbol": "BTCUSDT",
       "timeframe": "1m",
       "startDate": "2024-01-01T00:00:00Z",
       "endDate": "2024-12-31T23:59:59Z"
     }
     ```
   - **Note:** Always requests 1m timeframe from exchange - this is the storage granularity
   - Broker Service creates `data_sync_job` record (see broker_connectivity_db_schema.dbml)
   - Broker Service downloads data from exchange via paginated API calls
   - Broker Service streams OHLCV data back in batches
7. **For each batch received from Broker Service:**
8. **Data Validator validates each candle**
   - Check OHLC relationships: `low <= open`, `low <= close`, `high >= open`, `high >= close`, `low <= high`
   - Check volume >= 0
   - Check timestamp aligns with 1-minute boundaries
   - Mark invalid candles with `quality_status = 'invalid'`
   - Mark suspicious candles (price spikes > 10%, volume anomalies) with `quality_status = 'suspicious'`
9. **Historical Data Repository batch inserts to TimescaleDB**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: timeframe is always '1m' - we only store 1-minute candles
   INSERT INTO ohlcv_data (
     timestamp,
     exchange,
     symbol,
     timeframe,
     open,
     high,
     low,
     close,
     volume,
     quality_status,
     quality_score,
     ingested_at
   ) VALUES
   ($1, $2, $3, '1m', $4, $5, $6, $7, $8, $9, $10, NOW()),
   ...
   ON CONFLICT (exchange, symbol, timeframe, timestamp) DO UPDATE
   SET open = EXCLUDED.open,
       high = EXCLUDED.high,
       low = EXCLUDED.low,
       close = EXCLUDED.close,
       volume = EXCLUDED.volume,
       quality_status = EXCLUDED.quality_status,
       quality_score = EXCLUDED.quality_score,
       ingested_at = NOW();
   ```
   - Batch size: 1000 candles per insert
10. **After all batches complete, update data ranges**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
    -- Merge overlapping ranges using stored procedure
    -- Note: timeframe is always '1m'
    SELECT merge_data_ranges(
      $1::exchange_type,  -- exchange
      $2,                  -- symbol
      '1m',               -- timeframe (always 1m)
      $3,                  -- start_timestamp
      $4,                  -- end_timestamp
      $5                   -- candle_count
    );
    ```
11. **Update symbol metadata**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
    -- Note: available_timeframes is always '1m' since we only store 1m data
    -- Higher timeframes (5m, 15m, 1h, 4h, 1d) are computed on retrieval
    INSERT INTO symbols_metadata (
      exchange,
      symbol,
      base_asset,
      quote_asset,
      available_timeframes,
      earliest_data_timestamp,
      latest_data_timestamp,
      total_candles_count,
      is_active,
      last_synced_at
    ) VALUES (
      $1, $2, $3, $4, '1m', $5, $6, $7, true, NOW()
    )
    ON CONFLICT (exchange, symbol) DO UPDATE
    SET available_timeframes = '1m',
        earliest_data_timestamp = (
          SELECT MIN(start_timestamp)
          FROM symbol_data_ranges
          WHERE exchange = $1 AND symbol = $2 AND timeframe = '1m'
        ),
        latest_data_timestamp = (
          SELECT MAX(end_timestamp)
          FROM symbol_data_ranges
          WHERE exchange = $1 AND symbol = $2 AND timeframe = '1m'
        ),
        total_candles_count = (
          SELECT SUM(candle_count)
          FROM symbol_data_ranges
          WHERE exchange = $1 AND symbol = $2 AND timeframe = '1m'
        ),
        last_synced_at = NOW(),
        updated_at = NOW();
    ```
12. **Log admin action** (audit trail)
13. **Return ingestion summary**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "symbol": "BTCUSDT",
    "storageTimeframe": "1m",
    "dateRange": {
      "requested": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-12-31T23:59:59Z"
      },
      "actual": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-12-31T23:59:00Z"
      }
    },
    "summary": {
      "candlesDownloaded": 525600,
      "candlesInserted": 525590,
      "candlesUpdated": 0,
      "candlesSkipped": 10,
      "qualityStats": {
        "valid": 525580,
        "suspicious": 10,
        "invalid": 0
      }
    },
    "timing": {
      "durationSeconds": 263,
      "downloadRatePerSecond": 2000
    },
    "ingestedAt": "2024-12-16T12:00:00Z",
    "ingestedBy": "admin-user-id"
  },
  "meta": {
    "timestamp": "2024-12-16T12:04:23Z",
    "version": "v1"
  }
}
```

**Note:** `storageTimeframe` is always `1m`. Higher timeframes are computed on retrieval.

**Error Response (400 Bad Request - Invalid Range):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid date range",
    "details": [
      {
        "field": "dateRange",
        "message": "Date range cannot exceed 2 years",
        "code": "DATE_RANGE_TOO_LARGE"
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

**Error Response (403 Forbidden):**
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

**Error Response (502 Broker Service Error):**
```json
{
  "success": false,
  "error": {
    "code": "BROKER_SERVICE_ERROR",
    "message": "Failed to download data from exchange",
    "details": {
      "exchange": "bybit",
      "reason": "Exchange API rate limit exceeded",
      "retryAfter": 60
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- All valid candles inserted into TimescaleDB
- Data ranges updated/merged correctly
- Symbol metadata updated
- Quality status assigned to each candle
- Admin action logged
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin access required" |
| Invalid exchange | 400 | Return "Invalid exchange. Allowed: bybit, binance" |
| Invalid symbol format | 400 | Return "Invalid symbol format" |
| Invalid date range | 400 | Return "Invalid date range" |
| Date range too large | 400 | Return "Date range cannot exceed 2 years" |
| No admin broker connection | 503 | Return "No admin broker connection configured for exchange" |
| Broker Service timeout | 504 | Return "Download timeout - try smaller date range" |
| Exchange rate limit | 429 | Return "Exchange rate limit exceeded. Retry after X seconds" |
| Exchange API error | 502 | Retry with exponential backoff, then return error |
| Database error | 500 | Rollback batch, retry, log error |
| Invalid candle data | 200 | Mark as invalid, continue processing |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Ingestion speed**: ~2000 candles/second (limited by exchange API rate limits)
- **Batch insert size**: 1000 candles per database insert
- **Data is always stored at 1-minute granularity**
- **Typical download times** (1m data):
  - 1 day (~1,440 candles): < 1 second
  - 1 month (~43,200 candles): ~20-30 seconds
  - 1 year (~525,600 candles): ~4-5 minutes
- **Memory management**: Streaming response from Broker Service avoids loading all data in memory

#### Dependencies

**Database:**
- `historical_db` (TimescaleDB) - Tables: `ohlcv_data`, `symbols_metadata`, `symbol_data_ranges`
- Verify schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml

**External Services:**
- Broker Connectivity Service: `POST /api/v1/broker/historical/download` (PROC-BROKER-005)

**Message Queue:**
- None for synchronous operation (future: Azure Service Bus for async jobs)

#### Notes

**Data Flow Architecture:**
```
Admin → Historical Data Service → Broker Connectivity Service → Exchange API
                ↓                            ↓
         TimescaleDB              data_sync_jobs (broker_db)
```

**Synchronous vs Asynchronous:**
- Current implementation is synchronous - API blocks until complete
- For very large downloads (> 1 year), consider:
  - Breaking into smaller date ranges
  - Future iteration: Convert to async job with status polling

**1-Minute Storage Architecture:**
- All data is stored at 1-minute (1m) granularity only
- Higher timeframes (5m, 15m, 1h, 4h, 1d) are computed on-the-fly during retrieval
- Benefits:
  - Single source of truth - no data inconsistency between timeframes
  - Reduced storage - no duplicate data across multiple timeframes
  - Flexible - any timeframe can be computed from 1m data
  - Simplified ingestion - only one timeframe to download and validate
- See PROC-HISTORICAL-002 for timeframe aggregation logic

**Gap Filling:**
- If partial data exists, only missing ranges are downloaded
- Data ranges are automatically merged after download
- Overlapping data is updated (upsert behavior)

**Data Quality:**
- Each candle receives a quality_status during validation
- `valid`: Passed all checks
- `suspicious`: Has anomalies but usable (e.g., large price spike)
- `invalid`: Failed critical validation, excluded from queries

**Admin Broker Connection:**
- Downloads use a dedicated admin broker connection, not user connections
- Admin connection must be configured per exchange before downloads
- See PROC-BROKER-001 for connection setup

**Related Processes:**
- PROC-BROKER-005: Download Historical Data (Broker Service side)
- PROC-HISTORICAL-002: Get Historical OHLCV Data (query downloaded data)
- PROC-HISTORICAL-003: List Available Symbols (view what's downloaded)
- PROC-HISTORICAL-006: Run Data Correctness Check (Admin) (validate downloaded data)
- PROC-HISTORICAL-007: List Download Jobs (Admin) (view job history)
- PROC-BROKER-009: List Available Symbols from Exchange (discover symbols to download)

---


---

## PROC-HISTORICAL-002: Get Historical OHLCV Data

**Source File:** `PROC-HISTORICAL-002.md`  
**Path:** `processes\historical-data-service\PROC-HISTORICAL-002.md`

### PROC-HISTORICAL-002: Get Historical OHLCV Data

**Service Owner:** Historical Data Service
**Related FR:** FR-BACKTEST-001, FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-025, ADR-032

#### Trigger
Frontend requests historical OHLCV data to display backtest results with executed trades overlaid on price charts

#### Actor
Authenticated User, System (Frontend Application)

#### Preconditions
- User is authenticated with valid JWT
- Symbol has historical data available for requested range

#### Overview

This endpoint serves historical OHLCV data for frontend visualization purposes. Primary use cases:
1. **Backtest Result Visualization**: Display price charts with trade markers after backtest completion
2. **Data Preview**: Allow users to preview available data before running backtests
3. **Chart Analysis**: Display historical price action for analysis

**Important:** This is a standard API endpoint for serving cached/stored data. The Backtesting Service uses direct database access to TimescaleDB for actual backtest execution (see PROC-BACKTEST-001, step 16) for performance reasons.

**Storage Architecture:** Historical data is **stored in 1-minute (1m) timeframe only**. When requesting higher timeframes (5m, 15m, 1h, 4h, 1d), this endpoint **aggregates 1m candles on-the-fly** to produce the requested timeframe. This ensures data consistency and eliminates redundant storage.

---

#### Inputs
**API Endpoint:** `GET /api/v1/historical/data`

**Query Parameters:**
```
GET /api/v1/historical/data?
  exchange={exchange}&
  symbol={symbol}&
  timeframe={timeframe}&
  start_date={ISO8601}&
  end_date={ISO8601}&
  limit={number}
```

**Parameter Details:**
- `exchange` (string, required): Exchange identifier (`bybit`, `binance`)
- `symbol` (string, required): Trading pair symbol (e.g., `BTCUSDT`)
- `timeframe` (string, required): Candle timeframe (`1m`, `5m`, `15m`, `1h`, `4h`, `1d`)
- `start_date` (ISO8601, required): Start of date range
- `end_date` (ISO8601, required): End of date range
- `limit` (integer, optional, default: 10000, max: 50000): Maximum candles to return

#### Process Steps

1. **API Gateway receives request** → Routes to Historical Data Service `/api/v1/historical/data`
2. **API Gateway validates JWT** → Extracts user_id
3. **Historical Data Controller validates query parameters**
   - Validate `exchange` is valid enum value
   - Validate `symbol` format (uppercase, valid trading pair)
   - Validate `timeframe` is valid enum value
   - Validate `start_date` and `end_date` are valid ISO8601 dates
   - Validate `end_date` >= `start_date`
   - Validate `limit` is between 1 and 50000
   - Return 400 if any validation fails
4. **Historical Data Controller checks cache**
   ```
   GET historical:{exchange}:{symbol}:{timeframe}:{start_date}:{end_date}
   ```
   - If cache hit and data is complete → Return cached response
5. **Historical Data Repository fetches and aggregates data from TimescaleDB**

   **For 1m timeframe (direct query):**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   SELECT
     timestamp,
     open,
     high,
     low,
     close,
     volume
   FROM ohlcv_data
   WHERE exchange = $1
     AND symbol = $2
     AND timeframe = '1m'
     AND timestamp BETWEEN $3 AND $4
     AND quality_status != 'invalid'
   ORDER BY timestamp ASC
   LIMIT $5;
   ```

   **For higher timeframes (aggregation query):**
   ```sql
   -- IMPORTANT: Data is stored at 1m only; this aggregates to requested timeframe
   -- Example for 1h timeframe (interval = '1 hour')
   SELECT
     time_bucket($3::interval, timestamp) AS timestamp,
     (ARRAY_AGG(open ORDER BY timestamp ASC))[1] AS open,
     MAX(high) AS high,
     MIN(low) AS low,
     (ARRAY_AGG(close ORDER BY timestamp DESC))[1] AS close,
     SUM(volume) AS volume
   FROM ohlcv_data
   WHERE exchange = $1
     AND symbol = $2
     AND timeframe = '1m'
     AND timestamp BETWEEN $4 AND $5
     AND quality_status != 'invalid'
   GROUP BY time_bucket($3::interval, timestamp)
   ORDER BY timestamp ASC
   LIMIT $6;
   ```

   **Timeframe to Interval Mapping:**
   - `1m` → Direct query (no aggregation)
   - `5m` → `'5 minutes'`
   - `15m` → `'15 minutes'`
   - `1h` → `'1 hour'`
   - `4h` → `'4 hours'`
   - `1d` → `'1 day'`
6. **Historical Data Controller validates data completeness**
   - Calculate expected candles based on timeframe and date range
   - Check for gaps in timestamps
   - Calculate completeness percentage
7. **Historical Data Controller caches result** (if query covers completed date range)
   - Cache TTL: 1 hour for date ranges that have ended
   - Do not cache if end_date is recent (data may still be updating)
8. **Return OHLCV data with metadata**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "dateRange": {
      "requested": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-06-30T23:59:59Z"
      },
      "actual": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-06-30T23:00:00Z"
      }
    },
    "candles": [
      {
        "timestamp": "2024-01-01T00:00:00Z",
        "open": 42500.00,
        "high": 42650.00,
        "low": 42400.00,
        "close": 42580.00,
        "volume": 1250.45
      },
      {
        "timestamp": "2024-01-01T01:00:00Z",
        "open": 42580.00,
        "high": 42800.00,
        "low": 42550.00,
        "close": 42750.00,
        "volume": 980.32
      }
    ],
    "metadata": {
      "totalCandles": 4344,
      "expectedCandles": 4344,
      "completenessPercentage": 100.0,
      "hasGaps": false,
      "dataSource": "database"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response with Data Gaps (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "dateRange": {
      "requested": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-06-30T23:59:59Z"
      },
      "actual": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-06-30T23:00:00Z"
      }
    },
    "candles": [
      "..."
    ],
    "metadata": {
      "totalCandles": 4320,
      "expectedCandles": 4344,
      "completenessPercentage": 99.4,
      "hasGaps": true,
      "gaps": [
        {
          "start": "2024-03-15T14:00:00Z",
          "end": "2024-03-15T18:00:00Z",
          "missingCandles": 4
        },
        {
          "start": "2024-05-20T09:00:00Z",
          "end": "2024-05-21T05:00:00Z",
          "missingCandles": 20
        }
      ],
      "dataSource": "database"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (404 No Data Available):**
```json
{
  "success": false,
  "error": {
    "code": "DATA_NOT_FOUND",
    "message": "No historical data available for requested range",
    "details": {
      "exchange": "bybit",
      "symbol": "BTCUSDT",
      "timeframe": "1h",
      "requestedRange": {
        "start": "2018-01-01T00:00:00Z",
        "end": "2018-12-31T23:59:59Z"
      },
      "availableRange": {
        "start": "2020-01-01T00:00:00Z",
        "end": "2024-12-16T11:00:00Z"
      }
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "timeframe",
        "message": "Invalid timeframe. Allowed: 1m, 5m, 15m, 1h, 4h, 1d",
        "code": "INVALID_TIMEFRAME"
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
- Data retrieved from database
- Data completeness calculated
- Gaps identified if present
- Response includes metadata for frontend awareness
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid exchange | 400 | Return "Invalid exchange. Allowed: bybit, binance" |
| Invalid symbol format | 400 | Return "Invalid symbol format" |
| Invalid timeframe | 400 | Return "Invalid timeframe. Allowed: 1m, 5m, 15m, 1h, 4h, 1d" |
| Invalid date range | 400 | Return "Invalid date range: end_date must be >= start_date" |
| Limit exceeded | 400 | Return "Limit must be between 1 and 50000" |
| No data available | 404 | Return "No historical data available for requested range" |
| Partial data available | 200 | Return available data with completeness metadata |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Target P95 latency**: < 500ms (for up to 10,000 candles)
- **Large requests**: > 10,000 candles may take up to 2 seconds
- **Cache Strategy**: Redis cache for frequently requested ranges (TTL: 1 hour)
- **Database Index**: Uses composite index on (exchange, symbol, timeframe, timestamp)

#### Dependencies

**Database:**
- `historical_db` (TimescaleDB) - Tables: `ohlcv_data`
- Verify schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml

**Cache:**
- Redis (query cache for common date ranges)

#### Notes

**Use Cases:**
1. **Backtest Result Display**: Frontend fetches OHLCV data to overlay executed trades on price chart
2. **Data Preview**: User previews available data before running a backtest
3. **Analysis Tools**: Display historical price action for manual analysis

**Data Quality Filtering:**
- Candles with `quality_status = 'invalid'` are excluded by default
- Candles with `quality_status = 'suspicious'` are included but may have anomalies

**Backtesting Service Direct Access:**
- Note: The Backtesting Service accesses TimescaleDB directly for actual backtest execution
- This is a deliberate design decision for performance (see PROC-BACKTEST-001, step 16)
- This API endpoint is for frontend visualization and data preview, not for backtest execution

**1-Minute Storage & On-the-Fly Aggregation:**
- All data is stored at 1-minute (1m) granularity only
- Higher timeframes are computed by aggregating 1m candles on-the-fly
- Aggregation logic:
  - `open`: First 1m candle's open in the period
  - `high`: Maximum high across all 1m candles
  - `low`: Minimum low across all 1m candles
  - `close`: Last 1m candle's close in the period
  - `volume`: Sum of all 1m volumes
- TimescaleDB's `time_bucket()` function provides efficient aggregation
- Performance is optimized through TimescaleDB hypertables and continuous aggregates (if needed)

**Large Response Handling:**
- For very large date ranges, consider implementing streaming or pagination
- Frontend should handle large datasets efficiently (e.g., downsampling for display)

**Related Processes:**
- PROC-HISTORICAL-001: Ingest Historical Data
- PROC-HISTORICAL-003: List Available Symbols (user access for backtest setup)
- PROC-BACKTEST-001: Run Backtest (uses direct DB access for performance)
- PROC-BACKTEST-002: View Backtest Results (frontend uses this endpoint for chart display)

---


---

## PROC-HISTORICAL-003: List Available Symbols

**Source File:** `PROC-HISTORICAL-003.md`  
**Path:** `processes\historical-data-service\PROC-HISTORICAL-003.md`

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


---

## PROC-HISTORICAL-004: Get Symbol Data Details (Admin)

**Source File:** `PROC-HISTORICAL-004.md`  
**Path:** `processes\historical-data-service\PROC-HISTORICAL-004.md`

### PROC-HISTORICAL-004: Get Symbol Data Details (Admin)

**Service Owner:** Historical Data Service
**Related FR:** FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-025, ADR-032

#### Trigger
Admin clicks on a symbol in the historical data management page to view detailed information about downloaded data and associated download jobs

#### Actor
Admin User

#### Preconditions
- User is authenticated with admin role
- Valid JWT access token with admin permissions
- Symbol exists in the system

#### Inputs
**API Endpoint:** `GET /api/v1/admin/historical/symbols/{exchange}/{symbol}`

**Path Parameters:**
- `{exchange}`: Exchange identifier (`bybit`, `binance`)
- `{symbol}`: Trading pair symbol (e.g., `BTCUSDT`)

**Query Parameters:**
```
GET /api/v1/admin/historical/symbols/{exchange}/{symbol}?
  include_jobs={boolean}&
  include_quality_checks={boolean}&
  jobs_limit={number}
```

**Parameter Details:**
- `include_jobs` (boolean, default: true): Include associated download jobs
- `include_quality_checks` (boolean, default: true): Include recent quality check results
- `jobs_limit` (integer, default: 10, max: 50): Number of recent download jobs to include

#### Process Steps

1. **API Gateway receives request** → Routes to Historical Data Service `/api/v1/admin/historical/symbols/{exchange}/{symbol}`
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Historical Data Controller validates path parameters**
   - Validate `exchange` is valid enum value
   - Validate `symbol` is non-empty string
   - Return 400 if invalid
5. **Historical Data Repository fetches symbol metadata**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   SELECT
     sm.id,
     sm.exchange,
     sm.symbol,
     sm.base_asset,
     sm.quote_asset,
     sm.available_timeframes,
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
   WHERE sm.exchange = $1 AND sm.symbol = $2;
   ```
   - If not found → Return 404 "Symbol not found"
6. **Historical Data Repository fetches all data ranges for symbol**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   SELECT
     id,
     exchange,
     symbol,
     timeframe,
     start_timestamp,
     end_timestamp,
     candle_count,
     created_at,
     updated_at
   FROM symbol_data_ranges
   WHERE exchange = $1 AND symbol = $2
   ORDER BY timeframe, start_timestamp;
   ```
7. **Calculate storage statistics from OHLCV data**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   SELECT
     timeframe,
     COUNT(*) as actual_candle_count,
     MIN(timestamp) as actual_earliest,
     MAX(timestamp) as actual_latest,
     COUNT(*) FILTER (WHERE quality_status = 'valid') as valid_count,
     COUNT(*) FILTER (WHERE quality_status = 'suspicious') as suspicious_count,
     COUNT(*) FILTER (WHERE quality_status = 'invalid') as invalid_count
   FROM ohlcv_data
   WHERE exchange = $1 AND symbol = $2
   GROUP BY timeframe
   ORDER BY timeframe;
   ```
8. **If include_jobs = true, fetch associated download jobs from Broker DB**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     dsj.id,
     dsj.data_type,
     dsj.symbol,
     dsj.timeframe,
     dsj.start_date,
     dsj.end_date,
     dsj.status,
     dsj.progress_percentage,
     dsj.total_batches,
     dsj.completed_batches,
     dsj.total_records_expected,
     dsj.total_records_downloaded,
     dsj.total_records_inserted,
     dsj.retry_count,
     dsj.error_message,
     dsj.started_at,
     dsj.completed_at,
     dsj.duration_seconds,
     dsj.created_at,
     bc.exchange
   FROM data_sync_jobs dsj
   JOIN broker_connections bc ON dsj.broker_connection_id = bc.id
   WHERE bc.exchange = $1 AND dsj.symbol = $2
   ORDER BY dsj.created_at DESC
   LIMIT $3;
   ```
9. **If include_quality_checks = true, fetch recent quality checks**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   SELECT
     id,
     exchange,
     symbol,
     timeframe,
     check_type,
     check_timestamp,
     check_start_timestamp,
     check_end_timestamp,
     issues_found,
     issues_details,
     auto_resolved,
     manual_review_required
   FROM data_quality_checks
   WHERE exchange = $1 AND symbol = $2
   ORDER BY check_timestamp DESC
   LIMIT 20;
   ```
10. **Historical Data Controller formats response**
11. **Return detailed symbol information**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "symbolInfo": {
      "symbolId": "uuid",
      "exchange": "bybit",
      "symbol": "BTCUSDT",
      "baseAsset": "BTC",
      "quoteAsset": "USDT",
      "status": {
        "isActive": true,
        "isDelisted": false,
        "delistedAt": null
      },
      "lastSyncedAt": "2024-12-16T10:00:00Z",
      "createdAt": "2023-01-15T00:00:00Z",
      "updatedAt": "2024-12-16T10:00:00Z"
    },
    "dataOverview": {
      "totalCandles": 125680,
      "earliestData": "2020-01-01T00:00:00Z",
      "latestData": "2024-12-16T11:00:00Z",
      "completenessPercentage": 99.2,
      "availableTimeframes": ["1m", "5m", "15m", "1h", "4h", "1d"]
    },
    "timeframeBreakdown": [
      {
        "timeframe": "1h",
        "overview": {
          "totalCandles": 43824,
          "earliestData": "2020-01-01T00:00:00Z",
          "latestData": "2024-12-16T11:00:00Z",
          "expectedCandles": 44184,
          "completenessPercentage": 99.2
        },
        "dataRanges": [
          {
            "rangeId": "uuid-range-1",
            "startTimestamp": "2020-01-01T00:00:00Z",
            "endTimestamp": "2024-12-16T11:00:00Z",
            "candleCount": 43824
          }
        ],
        "qualityStats": {
          "validCandles": 43750,
          "suspiciousCandles": 74,
          "invalidCandles": 0
        }
      },
      {
        "timeframe": "1d",
        "overview": {
          "totalCandles": 1826,
          "earliestData": "2020-01-01T00:00:00Z",
          "latestData": "2024-12-16T00:00:00Z",
          "expectedCandles": 1826,
          "completenessPercentage": 100.0
        },
        "dataRanges": [
          {
            "rangeId": "uuid-range-2",
            "startTimestamp": "2020-01-01T00:00:00Z",
            "endTimestamp": "2024-12-16T00:00:00Z",
            "candleCount": 1826
          }
        ],
        "qualityStats": {
          "validCandles": 1826,
          "suspiciousCandles": 0,
          "invalidCandles": 0
        }
      }
    ],
    "downloadJobs": [
      {
        "jobId": "uuid-job-1",
        "dataType": "ohlcv",
        "timeframe": "1h",
        "dateRange": {
          "start": "2024-11-01T00:00:00Z",
          "end": "2024-12-01T00:00:00Z"
        },
        "status": "completed",
        "progress": {
          "percentage": 100.0,
          "completedBatches": 5,
          "totalBatches": 5
        },
        "records": {
          "expected": 720,
          "downloaded": 720,
          "inserted": 720
        },
        "timing": {
          "startedAt": "2024-12-01T09:00:00Z",
          "completedAt": "2024-12-01T09:02:35Z",
          "durationSeconds": 155
        },
        "createdAt": "2024-12-01T09:00:00Z"
      },
      {
        "jobId": "uuid-job-2",
        "dataType": "ohlcv",
        "timeframe": "1h",
        "dateRange": {
          "start": "2024-12-01T00:00:00Z",
          "end": "2024-12-16T00:00:00Z"
        },
        "status": "in_progress",
        "progress": {
          "percentage": 65.5,
          "completedBatches": 3,
          "totalBatches": 5
        },
        "records": {
          "expected": 360,
          "downloaded": 235,
          "inserted": 235
        },
        "timing": {
          "startedAt": "2024-12-16T10:00:00Z",
          "completedAt": null,
          "durationSeconds": null
        },
        "error": null,
        "createdAt": "2024-12-16T10:00:00Z"
      }
    ],
    "qualityChecks": [
      {
        "checkId": "uuid-check-1",
        "timeframe": "1h",
        "checkType": "missing_data",
        "checkedAt": "2024-12-15T00:00:00Z",
        "checkRange": {
          "start": "2024-12-01T00:00:00Z",
          "end": "2024-12-15T00:00:00Z"
        },
        "result": {
          "issuesFound": 0,
          "autoResolved": false,
          "manualReviewRequired": false
        }
      },
      {
        "checkId": "uuid-check-2",
        "timeframe": "1h",
        "checkType": "price_spike",
        "checkedAt": "2024-12-14T00:00:00Z",
        "checkRange": {
          "start": "2024-11-01T00:00:00Z",
          "end": "2024-12-01T00:00:00Z"
        },
        "result": {
          "issuesFound": 2,
          "autoResolved": true,
          "manualReviewRequired": false,
          "details": [
            {
              "timestamp": "2024-11-15T14:00:00Z",
              "issue": "Price spike detected: 5.2% change in 1 hour",
              "resolved": true
            }
          ]
        }
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Symbol not found",
    "details": {
      "exchange": "bybit",
      "symbol": "INVALIDPAIR"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
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

#### Success Criteria
- Symbol metadata retrieved
- Data ranges retrieved for all timeframes
- Quality statistics calculated
- Download jobs included if requested
- Quality checks included if requested
- Admin access verified
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin access required" |
| Symbol not found | 404 | Return "Symbol not found" |
| Invalid exchange | 400 | Return "Invalid exchange. Allowed: bybit, binance" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 4-6 queries (metadata, ranges, stats, jobs, quality checks)
- **Cross-Database**: Download jobs are in broker_db, requires cross-service call or direct query
- **Expected Execution Time**: < 500ms
- **Large Data Consideration**: Quality checks and jobs are limited to avoid large responses

#### Dependencies

**Database:**
- `historical_db` (TimescaleDB) - Tables: `symbols_metadata`, `symbol_data_ranges`, `ohlcv_data`, `data_quality_checks`
- `broker_db` (PostgreSQL) - Tables: `data_sync_jobs`, `broker_connections`
- Verify schemas:
  - docs/01-phase/database-schemas/historical_data_db_schema.dbml
  - docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

#### Notes

**Cross-Service Data:**
- Download jobs are stored in `broker_db`, not `historical_db`
- This process may need to query across databases or call Broker Service API
- Consider caching job information if cross-service calls are slow

**Data Range Interpretation:**
- Multiple ranges for same timeframe indicate gaps in data
- Admin can identify where additional downloads are needed
- Ranges are automatically merged when overlapping data is downloaded

**Quality Statistics:**
- Quality status is assigned during data ingestion
- `suspicious` candles are usable but flagged for review
- `invalid` candles are excluded from backtest queries

**Use Cases:**
1. Admin investigates data coverage for specific symbol
2. Admin checks status of ongoing download jobs
3. Admin reviews quality issues before backtesting
4. Admin identifies gaps that need additional data download

**Related Processes:**
- PROC-HISTORICAL-003: List Downloaded Symbols (Admin)
- PROC-HISTORICAL-005: Delete Historical Data (Admin)
- PROC-HISTORICAL-006: Run Data Correctness Check (Admin)
- PROC-HISTORICAL-007: List Download Jobs (Admin)

---


---

## PROC-HISTORICAL-005: Delete Historical Data (Admin)

**Source File:** `PROC-HISTORICAL-005.md`  
**Path:** `processes\historical-data-service\PROC-HISTORICAL-005.md`

### PROC-HISTORICAL-005: Delete Historical Data (Admin)

**Service Owner:** Historical Data Service
**Related FR:** FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-025, ADR-032

#### Trigger
Admin wants to remove historical data for a specific symbol/timeframe to free storage, remove corrupted data, or clean up test data

#### Actor
Admin User

#### Preconditions
- User is authenticated with admin role
- Valid JWT access token with admin permissions
- Symbol exists and has data to delete

#### Overview

This process supports two deletion modes:
1. **Delete by Symbol** - Remove all data for a symbol
2. **Delete by Date Range** - Remove data within a specific date range

**Important:** This is a destructive operation. Data cannot be recovered after deletion (must be re-downloaded from exchange).

**Storage Architecture:** Historical data is stored in 1-minute (1m) timeframe only. Higher timeframes are computed on-the-fly during retrieval (see PROC-HISTORICAL-002). Therefore, there is no "delete by timeframe" option - deleting data always removes the underlying 1m candles.

---

## 1. Delete All Data for Symbol (All 1m Candles)

#### Inputs
**API Endpoint:** `DELETE /api/v1/admin/historical/symbols/{exchange}/{symbol}`

**Path Parameters:**
- `{exchange}`: Exchange identifier (`bybit`, `binance`)
- `{symbol}`: Trading pair symbol (e.g., `BTCUSDT`)

**Query Parameters:**
```
DELETE /api/v1/admin/historical/symbols/{exchange}/{symbol}?
  confirm=true
```

**Parameter Details:**
- `confirm` (boolean, required): Must be `true` to confirm deletion

#### Process Steps

1. **API Gateway receives request** → Routes to Historical Data Service
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Validate confirmation parameter**
   - If `confirm` != true → Return 400 "Confirmation required"
5. **Historical Data Controller verifies symbol exists**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   SELECT id, exchange, symbol, total_candles_count
   FROM symbols_metadata
   WHERE exchange = $1 AND symbol = $2;
   ```
   - If not found → Return 404 "Symbol not found"
6. **Begin transaction**
7. **Delete all OHLCV data for symbol (all 1m candles)**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: All data is stored at 1m timeframe only
   DELETE FROM ohlcv_data
   WHERE exchange = $1 AND symbol = $2 AND timeframe = '1m'
   RETURNING COUNT(*) as deleted_count;
   ```
8. **Delete all data ranges for symbol**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: Only 1m timeframe exists in data ranges
   DELETE FROM symbol_data_ranges
   WHERE exchange = $1 AND symbol = $2 AND timeframe = '1m';
   ```
9. **Delete quality check records for symbol**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   DELETE FROM data_quality_checks
   WHERE exchange = $1 AND symbol = $2;
   ```
10. **Update symbol metadata**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
    UPDATE symbols_metadata
    SET total_candles_count = 0,
        earliest_data_timestamp = NULL,
        latest_data_timestamp = NULL,
        available_timeframes = NULL,
        data_completeness_percentage = NULL,
        last_synced_at = NOW(),
        updated_at = NOW()
    WHERE exchange = $1 AND symbol = $2;
    ```
11. **Commit transaction**
12. **Invalidate cache entries for symbol**
    ```
    DEL historical:{exchange}:{symbol}:*
    ```
13. **Log admin action** (audit trail)
14. **Return deletion summary**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "symbol": "BTCUSDT",
    "deletionSummary": {
      "candlesDeleted": 2628000,
      "dataRangesDeleted": 1,
      "qualityChecksDeleted": 15,
      "note": "All 1m candles deleted. Higher timeframes were computed on-the-fly and are no longer available."
    },
    "message": "All historical data (1m candles) for bybit:BTCUSDT has been deleted. Symbol metadata retained.",
    "deletedAt": "2024-12-16T12:00:00Z",
    "deletedBy": "admin-user-id"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 2. Delete Data by Date Range

#### Inputs
**API Endpoint:** `DELETE /api/v1/admin/historical/data`

**Request Body:**
```json
{
  "exchange": "bybit",
  "symbol": "BTCUSDT",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-06-30T23:59:59Z",
  "confirm": true
}
```

**Note:** No timeframe parameter - data is always stored at 1m granularity. Deleting a date range removes all 1m candles in that range.

#### Process Steps

1-4. Same authentication and authorization
5. **Validate date range**
   - `endDate` >= `startDate`
   - Range must be reasonable (not entire dataset unless intended)
6. **Begin transaction**
7. **Delete OHLCV data within date range (1m candles)**
   ```sql
   -- Note: All data is stored at 1m timeframe only
   DELETE FROM ohlcv_data
   WHERE exchange = $1
     AND symbol = $2
     AND timeframe = '1m'
     AND timestamp >= $3
     AND timestamp <= $4
   RETURNING COUNT(*) as deleted_count;
   ```
8. **Recalculate and update data ranges**
   - This is complex: may split existing ranges or shrink them
   - Only affects '1m' timeframe ranges (the only stored timeframe)
9. **Update symbol metadata**
10. **Commit transaction**
11. **Invalidate cache**
12. **Log admin action**
13. **Return deletion summary**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "symbol": "BTCUSDT",
    "storageTimeframe": "1m",
    "dateRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-06-30T23:59:59Z"
    },
    "deletionSummary": {
      "candlesDeleted": 262080,
      "note": "Deleted 1m candles. Higher timeframes were computed on-the-fly and are affected proportionally."
    },
    "message": "Historical data (1m candles) for the specified range has been deleted.",
    "deletedAt": "2024-12-16T12:00:00Z",
    "deletedBy": "admin-user-id"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Error Responses

**Error Response (400 Bad Request - No Confirmation):**
```json
{
  "success": false,
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "Deletion confirmation required",
    "details": {
      "hint": "Add confirm=true query parameter to confirm deletion"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Symbol not found",
    "details": {
      "exchange": "bybit",
      "symbol": "INVALIDPAIR"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (403 Forbidden):**
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

#### Success Criteria
- Data deleted from OHLCV table
- Data ranges updated or deleted
- Quality checks cleaned up
- Symbol metadata updated
- Cache invalidated
- Admin action logged for audit
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin access required" |
| No confirmation | 400 | Return "Deletion confirmation required" |
| Symbol not found | 404 | Return "Symbol not found" |
| Invalid date range | 400 | Return "Invalid date range" |
| Database error | 500 | Rollback transaction, log error |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Large Deletions**: Deleting millions of candles may take several seconds
- **Transaction Size**: For very large deletes, consider batched deletion
- **TimescaleDB**: Use chunk-based operations when possible for efficiency
- **Expected Execution Time**: < 5 seconds for typical operations

#### Dependencies

**Database:**
- `historical_db` (TimescaleDB) - Tables: `ohlcv_data`, `symbol_data_ranges`, `symbols_metadata`, `data_quality_checks`
- Verify schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml

**Cache:**
- Redis - Invalidate cached queries

#### Notes

**Data Recovery:**
- Deleted data CANNOT be recovered from database
- Data must be re-downloaded from exchange if needed
- Consider backing up before large deletions

**Audit Trail:**
- All deletions should be logged with:
  - Admin user ID
  - Deletion parameters
  - Number of records deleted
  - Timestamp

**1-Minute Storage Architecture:**
- All data is stored at 1-minute (1m) granularity only
- Higher timeframes (5m, 15m, 1h, 4h, 1d) are computed on-the-fly during retrieval
- Deleting 1m candles affects all timeframes (since they are computed from 1m)
- There is no "delete by timeframe" option because only 1m is stored

**Use Cases:**
1. Remove corrupted/invalid data
2. Clean up test data from development
3. Free storage space for rarely used symbols
4. Remove data before delisting symbol

**TimescaleDB Considerations:**
- Deleting data in compressed chunks may be slower
- Consider decompressing chunks before deletion if performance is critical
- Large range deletions may benefit from `drop_chunks()` if deleting entire time periods

**Related Processes:**
- PROC-HISTORICAL-001: Ingest Historical Data (to re-download)
- PROC-HISTORICAL-003: List Downloaded Symbols (Admin)
- PROC-HISTORICAL-004: Get Symbol Data Details (Admin)
- PROC-HISTORICAL-006: Run Data Correctness Check (Admin)

---


---

## PROC-HISTORICAL-006: Run Data Correctness Check (Admin)

**Source File:** `PROC-HISTORICAL-006.md`  
**Path:** `processes\historical-data-service\PROC-HISTORICAL-006.md`

### PROC-HISTORICAL-006: Run Data Correctness Check (Admin)

**Service Owner:** Historical Data Service
**Related FR:** FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-025, ADR-032

#### Trigger
Admin wants to verify data quality and completeness for a specific symbol/timeframe, either manually or as part of data maintenance

#### Actor
Admin User

#### Preconditions
- User is authenticated with admin role
- Valid JWT access token with admin permissions
- Symbol has data available for the specified range

#### Overview

Data correctness checks include:
1. **Missing Data Detection** - Find gaps in timestamp sequences
2. **Duplicate Detection** - Find duplicate candles
3. **OHLC Relationship Check** - Verify low <= open/close <= high
4. **Price Spike Detection** - Identify abnormal price movements
5. **Volume Anomaly Detection** - Identify abnormal volume patterns

---

#### Inputs
**API Endpoint:** `POST /api/v1/admin/historical/quality-check`

**Request Body:**
```json
{
  "exchange": "bybit",
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-12-31T23:59:59Z",
  "checkTypes": ["missing_data", "duplicate_data", "ohlc_relationship", "price_spike", "volume_anomaly"],
  "autoFix": false,
  "priceSpikeThreshold": 10.0,
  "volumeAnomalyMultiplier": 5.0
}
```

**Field Details:**
- `exchange` (string, required): Exchange identifier
- `symbol` (string, required): Trading pair symbol
- `timeframe` (string, required): Timeframe to check
- `startDate` (ISO8601, required): Start of check range
- `endDate` (ISO8601, required): End of check range
- `checkTypes` (array, required): Types of checks to perform
  - `missing_data` - Detect gaps in data
  - `duplicate_data` - Detect duplicate timestamps
  - `ohlc_relationship` - Verify OHLC price relationships
  - `price_spike` - Detect unusual price movements
  - `volume_anomaly` - Detect unusual volume
- `autoFix` (boolean, default: false): Automatically fix issues where possible
- `priceSpikeThreshold` (float, default: 10.0): Price change % to flag as spike
- `volumeAnomalyMultiplier` (float, default: 5.0): Multiple of average volume to flag

#### Process Steps

1. **API Gateway receives request** → Routes to Historical Data Service
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Historical Data Controller validates request**
   - Validate exchange and symbol exist
   - Validate timeframe is valid
   - Validate date range (end >= start)
   - Validate checkTypes are valid
5. **Verify data exists for range**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   SELECT COUNT(*) as candle_count
   FROM ohlcv_data
   WHERE exchange = $1
     AND symbol = $2
     AND timeframe = $3
     AND timestamp BETWEEN $4 AND $5;
   ```
   - If count = 0 → Return 404 "No data found for specified range"

6. **For each check type, run the appropriate check:**

   **6a. Missing Data Detection:**
   ```sql
   -- Find expected timestamps vs actual
   WITH expected_times AS (
     SELECT generate_series(
       $4::timestamptz,
       $5::timestamptz,
       $6::interval  -- timeframe interval (e.g., '1 hour')
     ) as expected_timestamp
   ),
   actual_times AS (
     SELECT timestamp as actual_timestamp
     FROM ohlcv_data
     WHERE exchange = $1 AND symbol = $2 AND timeframe = $3
       AND timestamp BETWEEN $4 AND $5
   )
   SELECT expected_timestamp as missing_timestamp
   FROM expected_times
   LEFT JOIN actual_times ON expected_times.expected_timestamp = actual_times.actual_timestamp
   WHERE actual_times.actual_timestamp IS NULL
   ORDER BY expected_timestamp;
   ```

   **6b. Duplicate Detection:**
   ```sql
   SELECT timestamp, COUNT(*) as duplicate_count
   FROM ohlcv_data
   WHERE exchange = $1 AND symbol = $2 AND timeframe = $3
     AND timestamp BETWEEN $4 AND $5
   GROUP BY timestamp
   HAVING COUNT(*) > 1
   ORDER BY timestamp;
   ```

   **6c. OHLC Relationship Check:**
   ```sql
   SELECT timestamp, open, high, low, close
   FROM ohlcv_data
   WHERE exchange = $1 AND symbol = $2 AND timeframe = $3
     AND timestamp BETWEEN $4 AND $5
     AND (
       low > open OR low > close OR
       high < open OR high < close OR
       low > high
     )
   ORDER BY timestamp;
   ```

   **6d. Price Spike Detection:**
   ```sql
   WITH price_changes AS (
     SELECT
       timestamp,
       close,
       LAG(close) OVER (ORDER BY timestamp) as prev_close,
       ABS((close - LAG(close) OVER (ORDER BY timestamp)) /
           NULLIF(LAG(close) OVER (ORDER BY timestamp), 0) * 100) as pct_change
     FROM ohlcv_data
     WHERE exchange = $1 AND symbol = $2 AND timeframe = $3
       AND timestamp BETWEEN $4 AND $5
   )
   SELECT timestamp, close, prev_close, pct_change
   FROM price_changes
   WHERE pct_change > $6  -- threshold parameter
   ORDER BY timestamp;
   ```

   **6e. Volume Anomaly Detection:**
   ```sql
   WITH volume_stats AS (
     SELECT AVG(volume) as avg_volume
     FROM ohlcv_data
     WHERE exchange = $1 AND symbol = $2 AND timeframe = $3
       AND timestamp BETWEEN $4 AND $5
   )
   SELECT o.timestamp, o.volume, vs.avg_volume,
          o.volume / NULLIF(vs.avg_volume, 0) as volume_ratio
   FROM ohlcv_data o, volume_stats vs
   WHERE o.exchange = $1 AND o.symbol = $2 AND o.timeframe = $3
     AND o.timestamp BETWEEN $4 AND $5
     AND o.volume > vs.avg_volume * $6  -- multiplier parameter
   ORDER BY o.timestamp;
   ```

7. **If autoFix = true, attempt automatic fixes:**
   - **Duplicates**: Keep the first record, delete others
   - **OHLC Issues**: Mark as `invalid` quality status
   - **Price Spikes**: Mark as `suspicious` quality status
   - **Volume Anomalies**: Mark as `suspicious` quality status

8. **Save quality check results**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   INSERT INTO data_quality_checks (
     exchange, symbol, timeframe, check_type,
     check_timestamp, check_start_timestamp, check_end_timestamp,
     issues_found, issues_details, auto_resolved, manual_review_required
   ) VALUES (
     $1, $2, $3, $4,
     NOW(), $5, $6,
     $7, $8, $9, $10
   );
   ```

9. **Update quality status on affected candles if autoFix = true**
   ```sql
   UPDATE ohlcv_data
   SET quality_status = $1,
       quality_score = $2
   WHERE exchange = $3 AND symbol = $4 AND timeframe = $5
     AND timestamp = ANY($6);  -- array of affected timestamps
   ```

10. **Return quality check results**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "checkId": "uuid",
    "exchange": "bybit",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "dateRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-12-31T23:59:59Z"
    },
    "summary": {
      "candlesChecked": 8760,
      "totalIssuesFound": 15,
      "issuesAutoFixed": 3,
      "manualReviewRequired": 12,
      "checkDurationMs": 2340
    },
    "results": {
      "missingData": {
        "checked": true,
        "issuesFound": 5,
        "details": [
          { "timestamp": "2024-03-15T14:00:00Z" },
          { "timestamp": "2024-03-15T15:00:00Z" },
          { "timestamp": "2024-06-20T09:00:00Z" },
          { "timestamp": "2024-06-20T10:00:00Z" },
          { "timestamp": "2024-06-20T11:00:00Z" }
        ],
        "autoFixed": false,
        "recommendation": "Download missing data for gaps on 2024-03-15 and 2024-06-20"
      },
      "duplicateData": {
        "checked": true,
        "issuesFound": 0,
        "details": [],
        "autoFixed": false
      },
      "ohlcRelationship": {
        "checked": true,
        "issuesFound": 2,
        "details": [
          {
            "timestamp": "2024-05-10T08:00:00Z",
            "issue": "low (45100) > open (45000)",
            "values": { "open": 45000, "high": 45500, "low": 45100, "close": 45200 }
          },
          {
            "timestamp": "2024-09-22T16:00:00Z",
            "issue": "high (44800) < close (44900)",
            "values": { "open": 44700, "high": 44800, "low": 44600, "close": 44900 }
          }
        ],
        "autoFixed": true,
        "resolution": "Marked 2 candles as invalid quality status"
      },
      "priceSpike": {
        "checked": true,
        "issuesFound": 3,
        "threshold": 10.0,
        "details": [
          {
            "timestamp": "2024-02-28T12:00:00Z",
            "priceChange": 12.5,
            "previousClose": 40000,
            "currentClose": 45000
          },
          {
            "timestamp": "2024-07-15T00:00:00Z",
            "priceChange": 15.2,
            "previousClose": 55000,
            "currentClose": 46640
          },
          {
            "timestamp": "2024-11-05T08:00:00Z",
            "priceChange": 11.8,
            "previousClose": 68000,
            "currentClose": 76024
          }
        ],
        "autoFixed": true,
        "resolution": "Marked 3 candles as suspicious quality status"
      },
      "volumeAnomaly": {
        "checked": true,
        "issuesFound": 5,
        "multiplier": 5.0,
        "averageVolume": 1250.5,
        "details": [
          {
            "timestamp": "2024-01-10T15:00:00Z",
            "volume": 8500,
            "volumeRatio": 6.8
          },
          {
            "timestamp": "2024-04-14T09:00:00Z",
            "volume": 12000,
            "volumeRatio": 9.6
          }
        ],
        "autoFixed": false,
        "recommendation": "Review high-volume candles - may be legitimate during high volatility"
      }
    },
    "checkedAt": "2024-12-16T12:00:00Z",
    "checkedBy": "admin-user-id"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (404 No Data Found):**
```json
{
  "success": false,
  "error": {
    "code": "NO_DATA_FOUND",
    "message": "No data found for specified range",
    "details": {
      "exchange": "bybit",
      "symbol": "BTCUSDT",
      "timeframe": "1h",
      "dateRange": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-12-31T23:59:59Z"
      }
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (403 Forbidden):**
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

#### Success Criteria
- All requested check types executed
- Issues identified and categorized
- Results saved to quality_checks table
- Auto-fixes applied if requested
- Quality status updated on affected candles
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin access required" |
| Invalid exchange | 400 | Return "Invalid exchange" |
| Invalid timeframe | 400 | Return "Invalid timeframe" |
| Invalid date range | 400 | Return "Invalid date range" |
| Invalid check types | 400 | Return "Invalid check type(s)" |
| No data in range | 404 | Return "No data found for specified range" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Large Range Checks**: Checking years of data may take several seconds
- **Expected Execution Time**: < 5 seconds for 1 year of hourly data
- **Consider**: Running as background job for very large ranges
- **Indexes Used**: (exchange, symbol, timeframe, timestamp)

#### Dependencies

**Database:**
- `historical_db` (TimescaleDB) - Tables: `ohlcv_data`, `data_quality_checks`
- Verify schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml

#### Notes

**Check Type Details:**

| Check Type | Auto-Fixable | Resolution |
|------------|--------------|------------|
| `missing_data` | No | Must re-download from exchange |
| `duplicate_data` | Yes | Delete duplicate rows, keep first |
| `ohlc_relationship` | Partial | Mark as invalid (can't fix values) |
| `price_spike` | Partial | Mark as suspicious (may be legitimate) |
| `volume_anomaly` | Partial | Mark as suspicious (may be legitimate) |

**Quality Status Values:**
- `valid` - Passed all checks
- `suspicious` - Flagged for review but usable
- `invalid` - Failed critical checks, excluded from queries

**Scheduled Checks:**
- Consider running checks automatically after data ingestion
- Periodic checks (weekly) can catch issues from exchange corrections

**False Positives:**
- Price spikes may be legitimate during high volatility
- Volume anomalies may be legitimate during news events
- Manual review recommended before bulk deletion

**Use Cases:**
1. Verify data quality before running backtests
2. Investigate backtest anomalies
3. Routine data maintenance
4. Post-ingestion validation

**Related Processes:**
- PROC-HISTORICAL-001: Ingest Historical Data
- PROC-HISTORICAL-003: List Downloaded Symbols (Admin)
- PROC-HISTORICAL-004: Get Symbol Data Details (Admin)
- PROC-HISTORICAL-005: Delete Historical Data (Admin)

---


---

## PROC-HISTORICAL-007: List Download Jobs (Admin)

**Source File:** `PROC-HISTORICAL-007.md`  
**Path:** `processes\historical-data-service\PROC-HISTORICAL-007.md`

### PROC-HISTORICAL-007: List Download Jobs (Admin)

**Service Owner:** Historical Data Service
**Related FR:** FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-025, ADR-032

#### Trigger
Admin navigates to download jobs page to view status of historical data download jobs

#### Actor
Admin User

#### Preconditions
- User is authenticated with admin role
- Valid JWT access token with admin permissions

#### Inputs
**API Endpoint:** `GET /api/v1/admin/historical/jobs`

**Query Parameters:**
```
GET /api/v1/admin/historical/jobs?
  page={number}&
  page_size={number}&
  sort_by={field}&
  sort_order={asc|desc}&
  status={status}&
  exchange={exchange}&
  symbol={symbol}&
  date_from={ISO8601}&
  date_to={ISO8601}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 20, max: 100): Items per page
- `sort_by` (string, default: created_at): Field to sort by
  - Allowed: `created_at`, `started_at`, `completed_at`, `status`, `symbol`, `progress_percentage`
- `sort_order` (string, default: desc): Sort direction (`asc` or `desc`)
- `status` (string, optional): Filter by status (`pending`, `in_progress`, `completed`, `failed`, `cancelled`)
- `exchange` (string, optional): Filter by exchange (`bybit`, `binance`)
- `symbol` (string, optional): Filter by symbol (exact match or partial)
- `date_from` (ISO8601, optional): Filter jobs created after this date
- `date_to` (ISO8601, optional): Filter jobs created before this date

#### Process Steps

1. **API Gateway receives request** → Routes to Historical Data Service `/api/v1/admin/historical/jobs`
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Historical Data Controller validates query parameters**
   - Validate `page` >= 1
   - Validate `page_size` between 1 and 100
   - Validate `sort_by` is in allowed fields list
   - Validate `sort_order` is `asc` or `desc`
   - Validate `status` is valid enum value if provided
   - Validate `exchange` is valid enum value if provided
   - Return 400 if any validation fails
5. **Query counts total matching records**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT COUNT(*)
   FROM data_sync_jobs dsj
   JOIN broker_connections bc ON dsj.broker_connection_id = bc.id
   WHERE ($1::sync_status IS NULL OR dsj.status = $1)
     AND ($2::exchange_type IS NULL OR bc.exchange = $2)
     AND ($3::varchar IS NULL OR dsj.symbol ILIKE '%' || $3 || '%')
     AND ($4::timestamptz IS NULL OR dsj.created_at >= $4)
     AND ($5::timestamptz IS NULL OR dsj.created_at <= $5);
   ```
6. **Fetch paginated download jobs**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     dsj.id,
     dsj.broker_connection_id,
     bc.exchange,
     dsj.data_type,
     dsj.symbol,
     dsj.timeframe,
     dsj.start_date,
     dsj.end_date,
     dsj.status,
     dsj.progress_percentage,
     dsj.total_batches,
     dsj.completed_batches,
     dsj.total_records_expected,
     dsj.total_records_downloaded,
     dsj.total_records_inserted,
     dsj.retry_count,
     dsj.max_retries,
     dsj.error_message,
     dsj.started_at,
     dsj.completed_at,
     dsj.duration_seconds,
     dsj.created_at,
     dsj.updated_at
   FROM data_sync_jobs dsj
   JOIN broker_connections bc ON dsj.broker_connection_id = bc.id
   WHERE ($1::sync_status IS NULL OR dsj.status = $1)
     AND ($2::exchange_type IS NULL OR bc.exchange = $2)
     AND ($3::varchar IS NULL OR dsj.symbol ILIKE '%' || $3 || '%')
     AND ($4::timestamptz IS NULL OR dsj.created_at >= $4)
     AND ($5::timestamptz IS NULL OR dsj.created_at <= $5)
   ORDER BY {sort_by} {sort_order}
   LIMIT $6 OFFSET $7;
   ```
7. **Calculate aggregate statistics**
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
     COUNT(*) FILTER (WHERE status = 'in_progress') as running_count,
     COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
     COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
     COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
     SUM(total_records_inserted) as total_records_inserted
   FROM data_sync_jobs
   WHERE created_at >= NOW() - INTERVAL '7 days';
   ```
8. **Historical Data Controller formats response**
9. **Return paginated response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "jobId": "uuid-1",
        "exchange": "bybit",
        "dataType": "ohlcv",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "dateRange": {
          "start": "2024-01-01T00:00:00Z",
          "end": "2024-12-31T23:59:59Z"
        },
        "status": "completed",
        "progress": {
          "percentage": 100.0,
          "completedBatches": 12,
          "totalBatches": 12
        },
        "records": {
          "expected": 8760,
          "downloaded": 8760,
          "inserted": 8755
        },
        "timing": {
          "createdAt": "2024-12-15T10:00:00Z",
          "startedAt": "2024-12-15T10:00:05Z",
          "completedAt": "2024-12-15T10:03:45Z",
          "durationSeconds": 220
        },
        "retries": {
          "count": 0,
          "maxRetries": 3
        },
        "error": null
      },
      {
        "jobId": "uuid-2",
        "exchange": "binance",
        "dataType": "ohlcv",
        "symbol": "ETHUSDT",
        "timeframe": "4h",
        "dateRange": {
          "start": "2024-06-01T00:00:00Z",
          "end": "2024-12-31T23:59:59Z"
        },
        "status": "in_progress",
        "progress": {
          "percentage": 45.5,
          "completedBatches": 5,
          "totalBatches": 11
        },
        "records": {
          "expected": 1540,
          "downloaded": 700,
          "inserted": 700
        },
        "timing": {
          "createdAt": "2024-12-16T11:30:00Z",
          "startedAt": "2024-12-16T11:30:05Z",
          "completedAt": null,
          "durationSeconds": null
        },
        "retries": {
          "count": 0,
          "maxRetries": 3
        },
        "error": null
      },
      {
        "jobId": "uuid-3",
        "exchange": "bybit",
        "dataType": "ohlcv",
        "symbol": "SOLUSDT",
        "timeframe": "1h",
        "dateRange": {
          "start": "2024-01-01T00:00:00Z",
          "end": "2024-06-30T23:59:59Z"
        },
        "status": "failed",
        "progress": {
          "percentage": 75.0,
          "completedBatches": 6,
          "totalBatches": 8
        },
        "records": {
          "expected": 4380,
          "downloaded": 3285,
          "inserted": 3285
        },
        "timing": {
          "createdAt": "2024-12-14T09:00:00Z",
          "startedAt": "2024-12-14T09:00:05Z",
          "completedAt": "2024-12-14T09:15:30Z",
          "durationSeconds": 925
        },
        "retries": {
          "count": 3,
          "maxRetries": 3
        },
        "error": "Exchange API rate limit exceeded. Max retries reached."
      }
    ],
    "aggregateStats": {
      "last7Days": {
        "pending": 2,
        "running": 1,
        "completed": 45,
        "failed": 3,
        "cancelled": 1,
        "totalRecordsInserted": 523400
      }
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 52,
    "totalPages": 3,
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
    "jobs": [],
    "aggregateStats": {
      "last7Days": {
        "pending": 0,
        "running": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
        "totalRecordsInserted": 0
      }
    }
  },
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

**Error Response (403 Forbidden):**
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

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid status filter",
    "details": [
      {
        "field": "status",
        "message": "Invalid status. Allowed: pending, in_progress, completed, failed, cancelled",
        "code": "INVALID_STATUS"
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
- Download jobs retrieved with full status information
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
| Invalid page size | 400 | Return "Page size must be between 1 and 100" |
| Invalid sort field | 400 | Return "Invalid sort field. Allowed: {fields}" |
| Invalid status filter | 400 | Return "Invalid status. Allowed: pending, in_progress, completed, failed, cancelled" |
| Invalid exchange filter | 400 | Return "Invalid exchange. Allowed: bybit, binance" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 3 queries (COUNT, jobs, aggregate stats)
- **Expected Execution Time**: < 300ms
- **Indexes Required**:
  - `data_sync_jobs(status)` - for status filtering
  - `data_sync_jobs(created_at)` - for date filtering and sorting
  - `data_sync_jobs(symbol)` - for symbol filtering

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `data_sync_jobs`, `broker_connections`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

#### Notes

**Cross-Service Consideration:**
- Download jobs are stored in `broker_db`, not `historical_db`
- This endpoint may be served by Historical Data Service or Broker Service
- Recommendation: Serve from Historical Data Service for unified admin experience

**Job Status Values:**
- `pending` - Job queued, waiting to start
- `in_progress` - Currently downloading data
- `completed` - Successfully finished
- `failed` - Failed after all retries exhausted
- `cancelled` - Cancelled by admin

**Monitoring Use Cases:**
1. View active downloads in progress
2. Identify failed jobs that need attention
3. Review download history
4. Monitor overall download throughput

**Related Processes:**
- PROC-HISTORICAL-001: Ingest Historical Data
- PROC-HISTORICAL-004: Get Symbol Data Details (Admin)
- PROC-HISTORICAL-008: Cancel Download Job (Admin)
- PROC-BROKER-005: Download Historical Data

---


---

## PROC-HISTORICAL-008: Cancel Download Job (Admin)

**Source File:** `PROC-HISTORICAL-008.md`  
**Path:** `processes\historical-data-service\PROC-HISTORICAL-008.md`

### PROC-HISTORICAL-008: Cancel Download Job (Admin)

**Service Owner:** Historical Data Service
**Related FR:** FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-025, ADR-032

#### Trigger
Admin wants to cancel a pending or in-progress download job

#### Actor
Admin User

#### Preconditions
- User is authenticated with admin role
- Valid JWT access token with admin permissions
- Download job exists and is in cancellable state (pending or in_progress)

#### Inputs
**API Endpoint:** `POST /api/v1/admin/historical/jobs/{jobId}/cancel`

**Path Parameters:**
- `{jobId}`: Download Job UUID

**Request Body:** (optional)
```json
{
  "reason": "No longer needed - symbol will be delisted"
}
```

#### Process Steps

1. **API Gateway receives request** → Routes to Historical Data Service `/api/v1/admin/historical/jobs/{jobId}/cancel`
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Historical Data Controller validates job exists and is cancellable**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     dsj.id,
     dsj.broker_connection_id,
     bc.exchange,
     dsj.symbol,
     dsj.timeframe,
     dsj.status,
     dsj.progress_percentage,
     dsj.completed_batches,
     dsj.total_batches,
     dsj.total_records_downloaded,
     dsj.total_records_inserted
   FROM data_sync_jobs dsj
   JOIN broker_connections bc ON dsj.broker_connection_id = bc.id
   WHERE dsj.id = $1;
   ```
   - If not found → Return 404 "Download job not found"
   - If status NOT IN ('pending', 'in_progress') → Return 400 "Job cannot be cancelled (already {status})"
5. **Update job status to cancelled**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   UPDATE data_sync_jobs
   SET status = 'cancelled',
       error_message = COALESCE($2, 'Cancelled by admin'),
       completed_at = NOW(),
       updated_at = NOW()
   WHERE id = $1
   RETURNING *;
   ```
6. **Cancel any pending batches**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   UPDATE data_sync_job_batches
   SET status = 'cancelled',
       error_message = 'Parent job cancelled',
       completed_at = NOW()
   WHERE data_sync_job_id = $1
     AND status IN ('pending', 'in_progress');
   ```
7. **If job was in_progress, send cancellation signal**
   - Publish cancellation message to Azure Service Bus
   - Topic: `historical.download.commands`
   - Message:
     ```json
     {
       "messageId": "uuid",
       "eventType": "download.job.cancel",
       "timestamp": "2024-12-16T12:00:00Z",
       "version": "1.0",
       "source": {
         "service": "historical-data-service",
         "instance": "instance-id"
       },
       "payload": {
         "jobId": "uuid",
         "reason": "Cancelled by admin"
       },
       "metadata": {
         "correlationId": "uuid",
         "causationId": "uuid",
         "userId": "admin-user-id"
       }
     }
     ```
8. **Log admin action** (audit trail)
9. **Return cancellation result**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "exchange": "bybit",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "previousStatus": "in_progress",
    "currentStatus": "cancelled",
    "progressAtCancellation": {
      "percentage": 45.5,
      "completedBatches": 5,
      "totalBatches": 11,
      "recordsDownloaded": 3980,
      "recordsInserted": 3980
    },
    "partialDataInfo": {
      "hasPartialData": true,
      "message": "3980 candles were downloaded before cancellation. This data is available for use.",
      "dateRange": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-05-15T12:00:00Z"
      }
    },
    "cancelledAt": "2024-12-16T12:00:00Z",
    "cancelledBy": "admin-user-id",
    "reason": "No longer needed - symbol will be delisted"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Pending Job (200 OK):**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "exchange": "binance",
    "symbol": "ETHUSDT",
    "timeframe": "4h",
    "previousStatus": "pending",
    "currentStatus": "cancelled",
    "progressAtCancellation": {
      "percentage": 0,
      "completedBatches": 0,
      "totalBatches": 8,
      "recordsDownloaded": 0,
      "recordsInserted": 0
    },
    "partialDataInfo": {
      "hasPartialData": false,
      "message": "Job was cancelled before any data was downloaded."
    },
    "cancelledAt": "2024-12-16T12:00:00Z",
    "cancelledBy": "admin-user-id",
    "reason": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Download job not found",
    "details": {
      "jobId": "invalid-uuid"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (400 Bad Request - Already Terminal):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "Job cannot be cancelled",
    "details": {
      "currentStatus": "completed",
      "allowedStatuses": ["pending", "in_progress"]
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (403 Forbidden):**
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

#### Success Criteria
- Job status updated to 'cancelled'
- Pending batches marked as cancelled
- Cancellation signal sent for in-progress jobs
- Admin action logged
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin access required" |
| Job not found | 404 | Return "Download job not found" |
| Already completed | 400 | Return "Job cannot be cancelled (already completed)" |
| Already failed | 400 | Return "Job cannot be cancelled (already failed)" |
| Already cancelled | 400 | Return "Job cannot be cancelled (already cancelled)" |
| Database error | 500 | Log error, return generic message |
| Message queue error | 500 | Log error, continue (job status already updated) |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Expected Execution Time**: < 200ms
- **Message Publishing**: Async - don't wait for consumer acknowledgment
- **Graceful Stop**: Running download workers should check for cancellation periodically

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `data_sync_jobs`, `data_sync_job_batches`, `broker_connections`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Topic: `historical.download.commands`

#### Notes

**Partial Data Handling:**
- When a job is cancelled mid-download, partial data remains in the database
- Partial data is valid and usable for backtesting
- Response includes information about what data was downloaded before cancellation
- Admin can choose to keep partial data or delete it using PROC-HISTORICAL-005

**Worker Cancellation:**
- Download workers poll for cancellation signals periodically
- Worker should stop gracefully after completing current batch
- Data integrity is maintained - no partial batches

**Race Conditions:**
- Job may complete between status check and cancellation
- If job completes during cancellation, status becomes 'completed' not 'cancelled'
- Response accurately reflects final status

**Cancellation vs Retry:**
- Cancelled jobs are NOT automatically retried
- Admin must create a new job to resume downloading
- Consider adding a "resume" feature in future

**Audit Trail:**
- Cancellation reason is stored in `error_message` field
- Admin user ID recorded for accountability
- Timestamp of cancellation recorded

**Use Cases:**
1. Stop unnecessary download (wrong parameters)
2. Free up resources for higher priority downloads
3. Cancel jobs for symbols being delisted
4. Stop downloads during exchange maintenance

**Related Processes:**
- PROC-HISTORICAL-001: Ingest Historical Data (create new download)
- PROC-HISTORICAL-005: Delete Historical Data (Admin) (clean up partial data)
- PROC-HISTORICAL-007: List Download Jobs (Admin) (view job status)
- PROC-BROKER-005: Download Historical Data

---


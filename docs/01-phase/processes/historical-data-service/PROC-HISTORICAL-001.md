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

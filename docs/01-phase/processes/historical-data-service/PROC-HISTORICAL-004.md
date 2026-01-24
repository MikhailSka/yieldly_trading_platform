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

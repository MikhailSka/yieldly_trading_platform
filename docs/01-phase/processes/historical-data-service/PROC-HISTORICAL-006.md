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

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

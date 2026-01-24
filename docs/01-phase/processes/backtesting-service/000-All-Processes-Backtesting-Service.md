# Backtesting Service Processes - Consolidated

This document contains all process documentation for the Backtesting Service.

**Total Documents:** 15  
**Last Generated:** 2025-11-30T23:58:38.360Z  
**Source Directory:** `processes/backtesting-service`


---

## Table of Contents

1. [PROC-BACKTEST-001](#proc-backtest-001)
2. [PROC-BACKTEST-002](#proc-backtest-002)
3. [PROC-BACKTEST-003](#proc-backtest-003)
4. [PROC-BACKTEST-004](#proc-backtest-004)
5. [PROC-BACKTEST-005](#proc-backtest-005)
6. [PROC-BACKTEST-006](#proc-backtest-006)
7. [PROC-BACKTEST-007](#proc-backtest-007)
8. [PROC-BACKTEST-008](#proc-backtest-008)
9. [PROC-BACKTEST-009](#proc-backtest-009)
10. [PROC-BACKTEST-010](#proc-backtest-010)
11. [PROC-BACKTEST-011](#proc-backtest-011)
12. [PROC-BACKTEST-012](#proc-backtest-012)
13. [PROC-BACKTEST-013](#proc-backtest-013)
14. [PROC-BACKTEST-014](#proc-backtest-014)
15. [PROC-BACKTEST-015](#proc-backtest-015)

---

## PROC-BACKTEST-001: Run Backtest (Async)

**Source File:** `PROC-BACKTEST-001.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-001.md`

### PROC-BACKTEST-001: Run Backtest (Async)

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-001
**Related NFR:** NFR-PERF-003, NFR-PERF-001
**Related ADR:** ADR-019, ADR-024, ADR-032

#### Trigger
User clicks "Run Backtest" button in UI

#### Actor
Authenticated User

#### Preconditions
- User has a valid strategy
- User has not exceeded backtest quota (max 100 per month)
- Historical data available for requested date range
- 1-10 symbols provided (multi-symbol support)

#### Inputs
**API Endpoint:** `POST /api/v1/backtests`

**Request Body (Single Symbol):**
```json
{
  "strategyId": "uuid",
  "symbols": ["BTCUSDT"],
  "exchange": "bybit",
  "timeframe": "1h",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "initialCapital": 10000,
  "commissionRate": 0.001,
  "slippage": 0.0005,
  "notes": "Optional user notes",
  "tags": "trend,momentum"
}
```

**Request Body (Multi-Symbol - Up to 10 symbols):**
```json
{
  "strategyId": "uuid",
  "symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"],
  "exchange": "bybit",
  "timeframe": "1h",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "initialCapital": 10000,
  "commissionRate": 0.001,
  "slippage": 0.0005,
  "notes": "Testing strategy across major altcoins",
  "tags": "multi-asset,diversification"
}
```

**Validation Rules:**
- `symbols`: Required array, 1-10 unique symbols
- `strategyId`: Required UUID
- `exchange`: Required, valid exchange name
- `timeframe`: Required, one of: 1m, 5m, 15m, 1h, 4h, 1d
- `startDate`: Required, ISO date
- `endDate`: Required, ISO date, must be >= startDate
- `initialCapital`: Required, positive number (per symbol)
- `commissionRate`: Optional, default 0.001 (0.1%)
- `slippage`: Optional, default 0.0005 (0.05%)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates request body**
   - Validate all required fields present
   - Validate symbols array: 1-10 unique symbols
   - Validate each symbol format (uppercase, valid trading pair)
   - Return 400 if validation fails
4. **Backtest Controller validates user quota**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT backtests_run, backtests_limit
   FROM backtest_quota
   WHERE user_id = $1
     AND period_start <= NOW()
     AND period_end > NOW()
   ```
   - Calculate: required_quota = number of symbols
   - If (backtests_run + required_quota) > backtests_limit → Return 429 "Monthly backtest quota exceeded"
5. **Backtest Controller validates date range**
   - `endDate >= startDate`
   - Date range <= 2 years
   - Return 400 if invalid
6. **Backtest Controller checks data availability for ALL symbols**
   - For each symbol in symbols array:
     - Query Historical Data Service: `GET /api/v1/historical/availability?symbol={symbol}&exchange={exchange}&timeframe={timeframe}&startDate={startDate}&endDate={endDate}`
     - Collect any symbols with missing data
   - If any symbols have incomplete data → Return 400 with list of unavailable symbols
7. **Backtest Controller fetches strategy**
   - Call Strategy Service: `GET /api/v1/strategies/{strategyId}`
   - Verify user owns the strategy
   - Return 404 if strategy not found
   - Return 403 if not owner
8. **Backtest Controller creates backtest group (if multiple symbols)**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   -- Only create group if symbols.length > 1
   INSERT INTO backtest_groups (
     user_id, strategy_id, strategy_code, strategy_name,
     timeframe, start_date, end_date,
     initial_capital, commission_rate, slippage_rate,
     symbols, symbol_count, status,
     notes, tags, created_at
   ) VALUES (
     $1, $2, $3, $4,
     $5, $6, $7,
     $8, $9, $10,
     $11, $12, 'queued',
     $13, $14, NOW()
   ) RETURNING id
   ```
9. **Backtest Controller creates individual backtest records (for each symbol)**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   -- Repeat for each symbol in symbols array
   INSERT INTO backtests (
     user_id, strategy_id, group_id,
     strategy_code, strategy_name,
     symbol, timeframe, start_date, end_date,
     initial_capital, commission_rate, slippage_rate,
     status, notes, tags, created_at
   ) VALUES (
     $1, $2, $3,  -- group_id is NULL for single-symbol backtests
     $4, $5,
     $6, $7, $8, $9,
     $10, $11, $12,
     'queued', $13, $14, NOW()
   ) RETURNING id
   ```
10. **Backtest Controller increments quota usage**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
    UPDATE backtest_quota
    SET backtests_run = backtests_run + $1,  -- increment by number of symbols
        updated_at = NOW()
    WHERE user_id = $2
      AND period_start <= NOW()
      AND period_end > NOW()
    ```
11. **Backtest Controller publishes jobs to Azure Service Bus (one per symbol)**
    - Topic: `backtest.jobs`
    - Message (ADR-032 format) - published for EACH symbol:
      ```json
      {
        "messageId": "uuid",
        "eventType": "backtest.execution.queued",
        "timestamp": "2024-12-01T10:00:00Z",
        "version": "1.0",
        "source": {
          "service": "backtesting-service",
          "instance": "instance-id"
        },
        "payload": {
          "backtestId": "uuid",
          "groupId": "uuid-or-null",
          "userId": "uuid",
          "strategyId": "uuid",
          "strategyCode": "...",
          "parameters": {
            "symbol": "BTCUSDT",
            "exchange": "bybit",
            "timeframe": "1h",
            "startDate": "2024-01-01",
            "endDate": "2024-12-31",
            "initialCapital": 10000,
            "commissionRate": 0.001,
            "slippage": 0.0005
          }
        },
        "metadata": {
          "correlationId": "uuid",
          "causationId": "uuid",
          "userId": "uuid"
        }
      }
      ```
12. **Return immediate response** (backtests run async in parallel)
13. **Job Consumer picks up messages from queue (parallel processing)**
    - Multiple consumers can process different symbols simultaneously
14. **For each backtest job (Steps 14-23 execute per symbol):**
15. **Strategy Adapter converts code to backtrader format**
    - Wrap user's `entry_signal()` and `exit_signal()` in backtrader Strategy class
16. **Data Adapter fetches OHLCV data from TimescaleDB**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
    SELECT timestamp, open, high, low, close, volume
    FROM ohlcv_data
    WHERE symbol = $1
    AND exchange = $2
    AND timeframe = $3
    AND timestamp BETWEEN $4 AND $5
    ORDER BY timestamp ASC
    ```
17. **Data Adapter converts to pandas DataFrame**
18. **Backtest Engine Wrapper initializes backtrader**
    ```python
    cerebro = bt.Cerebro()
    cerebro.addstrategy(UserStrategy)
    cerebro.adddata(data_feed)
    cerebro.broker.setcash(initial_capital)
    cerebro.broker.setcommission(commission=commission_rate)
    ```
19. **Backtest Engine runs simulation**
    ```python
    cerebro.run()
    ```
20. **Result Parser extracts results**
    - Final portfolio value
    - Total trades
    - Winning/losing trades
    - Win rate
    - Profit factor
    - Maximum drawdown
    - Sharpe ratio
    - Equity curve data
21. **Result Publisher saves results to database**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
    INSERT INTO backtest_results (
      backtest_id, initial_capital, final_capital, net_profit,
      total_return, annual_return, sharpe_ratio, sortino_ratio, calmar_ratio,
      max_drawdown, avg_drawdown, max_drawdown_duration_hours,
      total_trades, winning_trades, losing_trades, win_rate,
      profit_factor, avg_win, avg_loss, largest_win, largest_loss,
      avg_trade_duration_hours, market_exposure_percent,
      created_at
    ) VALUES (...)
    ```
22. **Result Publisher updates backtest status**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
    UPDATE backtests
    SET status = 'completed',
        completed_at = NOW(),
        execution_duration_ms = $1
    WHERE id = $2
    ```
23. **Result Publisher saves trade log**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
    INSERT INTO trades (
      backtest_id, trade_number, direction, symbol,
      entry_timestamp, entry_price, quantity, entry_value,
      exit_timestamp, exit_price, exit_value,
      pnl, pnl_percent, commission_paid, slippage_cost,
      duration_hours, exit_reason
    ) VALUES ...
    ```
24. **Result Publisher saves equity curve**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
    INSERT INTO equity_curve_points (
      backtest_id, timestamp, portfolio_value, cash, position_value, point_number
    ) VALUES ...
    ```
25. **Result Publisher updates group status (if part of group)**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
    -- Increment completed count
    UPDATE backtest_groups
    SET backtests_completed = backtests_completed + 1,
        started_at = COALESCE(started_at, NOW()),
        status = CASE
          WHEN backtests_completed + backtests_failed + 1 = symbol_count THEN 'completed'
          ELSE 'running'
        END,
        completed_at = CASE
          WHEN backtests_completed + backtests_failed + 1 = symbol_count THEN NOW()
          ELSE NULL
        END
    WHERE id = $1
    ```
26. **Result Publisher logs completion event**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
    INSERT INTO backtest_events (
      backtest_id, event_type, event_timestamp, event_message, event_data
    ) VALUES (
      $1, 'completed', NOW(), 'Backtest completed successfully',
      '{"executionDurationMs": 45000, "totalTrades": 47}'
    )
    ```
27. **Notification Service notifies user**
    - For single backtest: Publish to Service Bus: `backtest.execution.completed`
    - For group completion: Publish to Service Bus: `backtest.group.completed`
    - Message format per ADR-032
    - In-app + email notification (only when all backtests in group complete)

#### Outputs

**Immediate Response - Single Symbol (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "groupId": null,
    "status": "queued",
    "symbol": "BTCUSDT",
    "estimatedCompletion": "< 5 minutes",
    "pollUrl": "/api/v1/backtests/{backtestId}/status"
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:00Z",
    "version": "v1"
  }
}
```

**Immediate Response - Multi-Symbol (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "status": "queued",
    "symbolCount": 5,
    "backtests": [
      {
        "backtestId": "uuid-1",
        "symbol": "BTCUSDT",
        "status": "queued"
      },
      {
        "backtestId": "uuid-2",
        "symbol": "ETHUSDT",
        "status": "queued"
      },
      {
        "backtestId": "uuid-3",
        "symbol": "SOLUSDT",
        "status": "queued"
      },
      {
        "backtestId": "uuid-4",
        "symbol": "BNBUSDT",
        "status": "queued"
      },
      {
        "backtestId": "uuid-5",
        "symbol": "XRPUSDT",
        "status": "queued"
      }
    ],
    "estimatedCompletion": "< 5 minutes",
    "pollUrl": "/api/v1/backtests/groups/{groupId}/status",
    "quotaUsed": 5,
    "quotaRemaining": 48
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:00Z",
    "version": "v1"
  }
}
```

**Service Bus Notification - Single Backtest Complete:**
```json
{
  "messageId": "uuid",
  "eventType": "backtest.execution.completed",
  "timestamp": "2024-12-01T10:02:35Z",
  "version": "1.0",
  "source": {
    "service": "backtesting-service",
    "instance": "instance-id"
  },
  "payload": {
    "backtestId": "uuid",
    "groupId": null,
    "userId": "uuid",
    "status": "completed",
    "symbol": "BTCUSDT",
    "summary": {
      "finalValue": 12500.50,
      "totalReturn": 25.01,
      "totalTrades": 47,
      "winRate": 62.5
    },
    "url": "/api/v1/backtests/{backtestId}"
  },
  "metadata": {
    "correlationId": "uuid",
    "causationId": "uuid",
    "userId": "uuid"
  }
}
```

**Service Bus Notification - Group Complete:**
```json
{
  "messageId": "uuid",
  "eventType": "backtest.group.completed",
  "timestamp": "2024-12-01T10:05:35Z",
  "version": "1.0",
  "source": {
    "service": "backtesting-service",
    "instance": "instance-id"
  },
  "payload": {
    "groupId": "uuid",
    "userId": "uuid",
    "status": "completed",
    "symbolCount": 5,
    "backtestsCompleted": 5,
    "backtestsFailed": 0,
    "summary": {
      "bestPerformer": {
        "symbol": "SOLUSDT",
        "totalReturn": 45.2
      },
      "worstPerformer": {
        "symbol": "XRPUSDT",
        "totalReturn": -5.3
      },
      "averageReturn": 18.5
    },
    "url": "/api/v1/backtests/groups/{groupId}"
  },
  "metadata": {
    "correlationId": "uuid",
    "causationId": "uuid",
    "userId": "uuid"
  }
}
```

#### Success Criteria
- Backtest group created (for multi-symbol)
- Individual backtest records created for each symbol
- Jobs published to queue for parallel processing
- User receives immediate response with all backtest IDs
- Backtests execute successfully in parallel
- Results saved to database for each symbol
- Group status updated as individual backtests complete
- User notified when all backtests in group complete

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Empty symbols array | 400 | Return "At least one symbol is required" |
| Too many symbols | 400 | Return "Maximum 10 symbols allowed per backtest" |
| Duplicate symbols | 400 | Return "Duplicate symbols not allowed" |
| Invalid symbol format | 400 | Return "Invalid symbol format: {symbol}" |
| Quota exceeded | 429 | Return "Monthly backtest quota exceeded. Need {n} slots, {m} available" |
| Invalid date range | 400 | Return "Invalid date range" |
| Data unavailable | 400 | Return "Historical data not available for: {symbols}" with list of unavailable symbols |
| Strategy not found | 404 | Return "Strategy not found" |
| Not strategy owner | 403 | Return "Access denied to strategy" |
| Execution error | 500 | Mark individual backtest as "failed", continue others, update group status |

**Error Response - Partial Data Availability:**
```json
{
  "success": false,
  "error": {
    "code": "DATA_UNAVAILABLE",
    "message": "Historical data not available for some symbols",
    "details": [
      {
        "symbol": "OBSCUREUSDT",
        "reason": "No data available for requested date range"
      },
      {
        "symbol": "NEWCOINUSDT",
        "reason": "Data only available from 2024-06-01"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response - Quota Exceeded:**
```json
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Monthly backtest quota exceeded",
    "details": {
      "requested": 5,
      "available": 3,
      "limit": 100,
      "used": 97,
      "resetsAt": "2025-01-01T00:00:00Z"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-PERF-003**: Backtest Execution Performance (30s - 5min depending on data volume)

**Process-Specific Notes:**
- Immediate response (queuing): < 500ms (including all DB inserts)
- Queue delivery: < 5 seconds per message
- Parallel execution: All symbols process simultaneously via separate consumers
- Individual execution time: 30 seconds - 5 minutes per symbol
- Total group completion: Depends on slowest individual backtest (not cumulative)

#### Dependencies
**Database:**
- `backtest_db` (PostgreSQL) - Tables: `backtest_groups`, `backtests`, `backtest_results`, `trades`, `equity_curve_points`, `backtest_events`, `backtest_quota`
- `historical_db` (TimescaleDB) - Tables: `ohlcv_data`
- Verify schemas: docs/01-phase/database-schemas/backtest_db_schema.dbml, historical_data_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Topics: `backtest.jobs`, `backtest.execution.completed`, `backtest.group.completed`

**External Services:**
- Strategy Service: `GET /api/v1/strategies/{strategyId}`
- Historical Data Service: `GET /api/v1/historical/availability`

**Libraries:**
- backtrader (backtesting engine)
- TA-Lib (technical indicators)
- pandas (data manipulation)

#### Notes

**Multi-Symbol Processing:**
- Each symbol runs as an independent backtest job
- Jobs are processed in parallel by multiple consumers
- Individual backtest failures don't affect other symbols in the group
- Group status tracks overall progress (queued → running → completed)
- Users can monitor individual symbol progress or group-level progress

**Quota Counting:**
- Each symbol counts as 1 backtest against quota
- Multi-symbol backtest with 5 symbols uses 5 quota slots
- Cancelled or failed backtests still count against quota

**Historical Data Access Pattern:**
- **Data Availability Check** (Step 6): Uses Historical Data Service API endpoint
  - `GET /api/v1/historical/availability` to validate data exists
  - This is a lightweight check before committing to backtest execution
- **Backtest Execution** (Step 16): Uses direct TimescaleDB access
  - Queries `ohlcv_data` table directly for performance
  - This is a deliberate architectural decision for high-volume data retrieval
  - See PROC-HISTORICAL-002 for the API endpoint used by frontend visualization
- **Frontend Visualization**: After backtest completes, frontend uses
  - `GET /api/v1/historical/data` (PROC-HISTORICAL-002) to fetch OHLCV for chart display
  - This endpoint serves the same data but with caching optimized for frontend needs

**Symbol Selection:**
- Users select symbols using PROC-HISTORICAL-003 (`GET /api/v1/historical/symbols`)
- This endpoint shows available symbols and their date ranges
- Users can see which timeframes have data before configuring backtest

**Related Processes:**
- PROC-HISTORICAL-002: Get Historical OHLCV Data (frontend chart visualization)
- PROC-HISTORICAL-003: List Available Symbols (user endpoint for symbol/date selection)
- PROC-BACKTEST-002: View Backtest Results (individual backtest results)
- PROC-BACKTEST-010: Poll Backtest Status (individual backtest polling)
- PROC-BACKTEST-011: Get Backtest Group Status (group-level polling)
- PROC-BACKTEST-012: Get Backtest Group Results (aggregated group results)
- PROC-BACKTEST-007: Cancel Running Backtest (can cancel individual or entire group)

---


---

## PROC-BACKTEST-002: View Backtest Results

**Source File:** `PROC-BACKTEST-002.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-002.md`

### PROC-BACKTEST-002: View Backtest Results

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User clicks on completed backtest from history

#### Actor
Authenticated User

#### Preconditions
- Backtest has completed successfully
- User owns the backtest

#### Inputs
**API Endpoint:** `GET /api/v1/backtests/{backtestId}`

#### Process Steps

1. **API Gateway receives request**
2. **Backtest Controller validates ownership**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/backtesting_db_schema.dbml
   SELECT user_id FROM backtest_runs WHERE backtest_id = $1
   ```
   - If `user_id != current_user_id` → Return 403 Forbidden
3. **Backtesting Repository fetches backtest details**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtesting_db_schema.dbml
   SELECT *
   FROM backtest_runs
   WHERE backtest_id = $1
   ```
4. **Backtesting Repository fetches performance metrics**
   - Already stored in `backtest_runs` table
5. **Backtesting Repository fetches equity curve**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtesting_db_schema.dbml
   SELECT timestamp, portfolio_value
   FROM backtest_equity_curve
   WHERE backtest_id = $1
   ORDER BY timestamp ASC
   ```
6. **Backtesting Repository fetches trade summary**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtesting_db_schema.dbml
   SELECT action, COUNT(*), AVG(pnl)
   FROM backtest_trades
   WHERE backtest_id = $1
   GROUP BY action
   ```
7. **Report Formatter aggregates data**
8. **Return comprehensive results**

#### Outputs
**Success Response (ADR-032):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "strategyName": "My SMA Strategy",
    "symbol": "BTCUSDT",
    "exchange": "bybit",
    "timeframe": "1h",
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-12-31"
    },
    "parameters": {
      "initialCapital": 10000,
      "commissionRate": 0.001,
      "slippage": 0.0005
    },
    "results": {
      "finalValue": 12500.50,
      "totalReturnPct": 25.01,
      "totalReturnUsd": 2500.50,
      "totalTrades": 47,
      "winningTrades": 30,
      "losingTrades": 17,
      "winRate": 63.83,
      "profitFactor": 1.85,
      "maxDrawdown": -15.2,
      "sharpeRatio": 1.42,
      "sortinoRatio": 1.89,
      "averageTradePct": 0.53,
      "largestWin": 250.75,
      "largestLoss": -180.50,
      "averageWin": 125.30,
      "averageLoss": -85.20
    },
    "equityCurve": [
      {"timestamp": "2024-01-01T00:00:00Z", "value": 10000},
      {"timestamp": "2024-01-02T00:00:00Z", "value": 10150}
    ],
    "tradeSummary": {
      "buyOrders": 47,
      "sellOrders": 47,
      "averageHoldingPeriod": "36 hours"
    },
    "status": "completed",
    "createdAt": "2024-12-01T10:00:00Z",
    "completedAt": "2024-12-01T10:02:35Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- All backtest data retrieved
- Performance metrics calculated
- Equity curve data included
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not backtest owner | 403 | Return "Access denied" |
| Backtest not found | 404 | Return "Backtest not found" |
| Backtest still running | 200 | Return partial results with "in_progress" status |
| Database error | 500 | Log error, retry |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Target P95 latency: < 300ms
- Includes fetching backtest details, equity curve, and trade summary

#### Dependencies
**Database:**
- `backtest_db` (PostgreSQL) - Tables: `backtest_runs`, `backtest_equity_curve`, `backtest_trades`
- Verify schema: docs/01-phase/database-schemas/backtesting_db_schema.dbml

---


---

## PROC-BACKTEST-003: Generate Detailed Backtest Report

**Source File:** `PROC-BACKTEST-003.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-003.md`

### PROC-BACKTEST-003: Generate Detailed Backtest Report

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-004
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User clicks "Download Report" button

#### Actor
Authenticated User

#### Preconditions
- Backtest has completed
- User owns backtest

#### Inputs
**API Endpoint:** `POST /api/v1/backtests/{backtestId}/report`

**Request Body:**
```json
{
  "format": "pdf"
}
```

#### Process Steps

1. **API Gateway receives request**
2. **Backtest Controller validates ownership** (same as PROC-BACKTEST-002 step 2)
3. **Backtest Controller checks if report exists in blob storage**
   ```
   Blob path: backtests/reports/{backtestId}.pdf
   ```
   - If exists and recent (< 7 days) → Return cached report URL
4. **Report Formatter fetches all backtest data** (same as PROC-BACKTEST-002)
5. **Report Formatter generates PDF**
   - Use ReportLab library
   - Include:
     - Executive summary
     - Performance metrics table
     - Equity curve chart
     - Trade log table
     - Risk metrics
     - Strategy code (for reference)
6. **Result Publisher uploads to Azure Blob Storage**
   ```python
   blob_client = container_client.get_blob_client(f"reports/{backtestId}.pdf")
   blob_client.upload_blob(pdf_data)
   ```
7. **Result Publisher generates secure download link**
   - SAS token with 7-day expiration
8. **Return download URL**

#### Outputs
**Success Response (ADR-032):**
```json
{
  "success": true,
  "data": {
    "reportUrl": "https://yieldlystorage.blob.core.windows.net/backtests/reports/{id}.pdf?sas_token",
    "expiresAt": "2024-12-08T12:00:00Z",
    "fileSizeBytes": 524288
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- PDF report generated
- Report uploaded to blob storage
- Download URL returned
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not backtest owner | 403 | Return "Access denied" |
| Backtest not complete | 400 | Return "Backtest not yet complete" |
| Report generation error | 500 | Log error, retry |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- First generation: < 3 seconds (includes PDF generation and upload)
- Cached report: < 200ms (direct URL return)
- Cache TTL: 7 days

#### Dependencies
**Database:**
- `backtest_db` (PostgreSQL) - Tables: `backtest_runs`, `backtest_equity_curve`, `backtest_trades`
- Verify schema: docs/01-phase/database-schemas/backtesting_db_schema.dbml

**Storage:**
- Azure Blob Storage - Container: `backtests`, Path: `reports/{backtestId}.pdf`

**Libraries:**
- ReportLab (PDF generation)
- matplotlib (charts)

---


---

## PROC-BACKTEST-004: Expose Raw Indicator Library Data

**Source File:** `PROC-BACKTEST-004.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-004.md`

### PROC-BACKTEST-004: Expose Raw Indicator Library Data

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-008
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-030, ADR-032

#### Overview

This endpoint exposes **raw indicator data directly from the TA-Lib library**. It is primarily used by the Strategy Service for indicator synchronization (PROC-INDICATOR-004).

**Important Notes:**
- This endpoint returns raw library data, NOT user-facing indicator information
- User-facing indicator data (with descriptions, categories, examples) is managed in the Strategy Service
- Admin configures indicators in Strategy Service after sync

#### Trigger
Strategy Service requests raw indicator definitions for sync comparison

#### Actor
Strategy Service (system call) - Internal service-to-service communication

#### Preconditions
- TA-Lib library is installed and configured
- Caller has valid service-to-service authentication

#### Inputs
**API Endpoint:** `GET /api/v1/backtesting/indicators`

**Query Parameters:**
```
GET /api/v1/backtesting/indicators?library={talib|pandas_ta|all}
```

**Parameter Details:**
- `library` (string, default: talib): Which library to query
  - `talib`: TA-Lib indicators (currently supported)
  - `pandas_ta`: Pandas TA indicators (future)
  - `all`: All available libraries

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service
2. **Backtest Controller validates request**
   - Validate library parameter
   - Return 400 if invalid library specified
3. **Indicator Library Manager fetches all functions from TA-Lib**
   ```python
   import talib

   indicators = []
   for func_name in talib.get_functions():
       try:
           func = talib.abstract.Function(func_name)
           info = func.info
           indicators.append({
               "name": func_name,
               "fullName": info.get('display_name', func_name),
               "group": info['group'],
               "technicalSpec": {
                   "parameters": extract_parameters(info),
                   "inputs": info['input_names'],
                   "outputs": info['output_names'],
                   "function": f"talib.{func_name}"
               }
           })
       except Exception as e:
           # Log and skip problematic indicator
           logger.warning(f"Failed to load indicator {func_name}: {e}")
   ```
4. **Cache Manager checks/updates cache**
   - Cache key: `indicators:raw:{library}`
   - TTL: 24 hours (library rarely changes)
5. **Return raw indicator definitions**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "library": "talib",
    "libraryVersion": "0.4.24",
    "indicators": [
      {
        "name": "SMA",
        "fullName": "Simple Moving Average",
        "group": "Overlap Studies",
        "technicalSpec": {
          "parameters": [
            {
              "name": "timeperiod",
              "type": "integer",
              "default": 30,
              "min": 2,
              "max": 100000
            }
          ],
          "inputs": ["close"],
          "outputs": ["real"],
          "function": "talib.SMA"
        }
      },
      {
        "name": "RSI",
        "fullName": "Relative Strength Index",
        "group": "Momentum Indicators",
        "technicalSpec": {
          "parameters": [
            {
              "name": "timeperiod",
              "type": "integer",
              "default": 14,
              "min": 2,
              "max": 100000
            }
          ],
          "inputs": ["close"],
          "outputs": ["real"],
          "function": "talib.RSI"
        }
      },
      {
        "name": "MACD",
        "fullName": "Moving Average Convergence/Divergence",
        "group": "Momentum Indicators",
        "technicalSpec": {
          "parameters": [
            {"name": "fastperiod", "type": "integer", "default": 12, "min": 2, "max": 100000},
            {"name": "slowperiod", "type": "integer", "default": 26, "min": 2, "max": 100000},
            {"name": "signalperiod", "type": "integer", "default": 9, "min": 1, "max": 100000}
          ],
          "inputs": ["close"],
          "outputs": ["macd", "macdsignal", "macdhist"],
          "function": "talib.MACD"
        }
      }
    ],
    "totalCount": 158,
    "groups": [
      "Overlap Studies",
      "Momentum Indicators",
      "Volume Indicators",
      "Volatility Indicators",
      "Price Transform",
      "Cycle Indicators",
      "Pattern Recognition"
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "cached": true,
    "cacheExpires": "2024-12-02T12:00:00Z"
  }
}
```

**Error Response (400 - Invalid Library):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_LIBRARY",
    "message": "Invalid library specified",
    "details": {
      "requested": "unknown_lib",
      "supported": ["talib", "pandas_ta", "all"]
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- All TA-Lib indicators retrieved from library
- Technical specifications extracted accurately
- Response properly cached
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid library | 400 | Return "Invalid library. Supported: talib, pandas_ta, all" |
| TA-Lib not installed | 500 | Log error, return "Indicator library unavailable" |
| Library load error | 500 | Log error, return partial results if possible |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Expected Execution Time**: P95 < 500ms (uncached), < 50ms (cached)
- **Cache Strategy**: Cache for 24 hours (library content rarely changes)
- **Cache Key**: `indicators:raw:{library}`
- **Response Size**: ~150 indicators, ~50KB response

#### Dependencies

**Libraries:**
- TA-Lib (technical analysis library) - Core dependency

**Cache:**
- Redis - Response caching for performance

#### Notes

**Purpose:**
This endpoint serves as the **source of truth** for what indicators are available in the backtesting engine. It does NOT provide:
- User-friendly descriptions (admin adds these in Strategy Service)
- Categories (admin assigns these in Strategy Service)
- Usage examples (admin writes these in Strategy Service)
- Active/inactive status (managed in Strategy Service)

**Data Flow:**
```
TA-Lib Library
     ↓
PROC-BACKTEST-004 (this process - exposes raw data)
     ↓
PROC-INDICATOR-004 (Strategy Service - syncs and stores)
     ↓
Admin configures indicators (description, category, examples)
     ↓
Admin activates indicators
     ↓
Users see indicators in strategy editor
```

**Consistency:**
The technical_spec from this endpoint is what the backtesting engine actually uses. The Strategy Service must sync with this to ensure indicators work correctly during backtests.

---


---

## PROC-BACKTEST-005: List User Backtests

**Source File:** `PROC-BACKTEST-005.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-005.md`

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


---

## PROC-BACKTEST-006: Get Backtest Trades

**Source File:** `PROC-BACKTEST-006.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-006.md`

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


---

## PROC-BACKTEST-007: Cancel Running Backtest

**Source File:** `PROC-BACKTEST-007.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-007.md`

### PROC-BACKTEST-007: Cancel Running Backtest

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-019, ADR-032

#### Trigger
User clicks "Cancel" button on a queued or running backtest

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User owns the backtest
- Backtest status is 'queued' or 'running'

#### Inputs
**API Endpoint:** `POST /api/v1/backtests/{backtestId}/cancel`

**Path Parameters:**
- `backtestId` (uuid, required): The backtest ID to cancel

**Request Body:**
```json
{
  "reason": "string (optional, max 500 chars, user-provided cancellation reason)"
}
```

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service `/api/v1/backtests/{backtestId}/cancel`
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates path parameter**
   - Validate `backtestId` is valid UUID format
   - Return 400 if invalid
4. **Backtest Controller validates ownership and status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, status
   FROM backtests
   WHERE id = $1
   ```
   - If not found → Return 404 "Backtest not found"
   - If `user_id != current_user_id` → Return 403 "Access denied"
   - If `status NOT IN ('queued', 'running')` → Return 400 "Backtest cannot be cancelled"
5. **Backtest Controller updates backtest status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET status = 'cancelled',
       completed_at = NOW(),
       error_message = COALESCE($2, 'Cancelled by user')
   WHERE id = $1
     AND status IN ('queued', 'running')
   RETURNING id, status
   ```
   - If no rows updated → Status changed concurrently, return 409
6. **Backtest Controller records cancellation event**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   INSERT INTO backtest_events (
     backtest_id, event_type, event_timestamp, event_message, event_data
   ) VALUES (
     $1, 'cancelled', NOW(), 'Backtest cancelled by user',
     '{"cancelledBy": "user_id", "reason": "optional_reason"}'::jsonb
   )
   ```
7. **Backtest Controller publishes cancellation message to Service Bus**
   - Topic: `backtest.jobs.cancel`
   - Message (ADR-032 format):
   ```json
   {
     "messageId": "uuid",
     "eventType": "backtest.execution.cancelled",
     "timestamp": "2024-12-01T12:00:00Z",
     "version": "1.0",
     "source": {
       "service": "backtesting-service",
       "instance": "instance-id"
     },
     "payload": {
       "backtestId": "uuid",
       "userId": "uuid",
       "reason": "Cancelled by user",
       "previousStatus": "running"
     },
     "metadata": {
       "correlationId": "uuid",
       "causationId": "uuid",
       "userId": "uuid"
     }
   }
   ```
8. **Job Consumer receives cancellation message** (async)
   - If job is currently processing, interrupt execution
   - Clean up any partial results
   - Release resources
9. **Return success response**

#### Outputs

**Success Response (200 OK) - ADR-032 Format:**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "status": "cancelled",
    "message": "Backtest cancelled successfully",
    "cancelledAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request - Cannot Cancel):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "Backtest cannot be cancelled",
    "details": [
      {
        "field": "status",
        "message": "Only queued or running backtests can be cancelled. Current status: completed",
        "code": "INVALID_STATUS_TRANSITION"
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

**Error Response (409 Conflict - Concurrent Modification):**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Backtest status changed during cancellation",
    "details": [
      {
        "field": "status",
        "message": "The backtest status was modified by another process. Please refresh and try again.",
        "code": "CONCURRENT_MODIFICATION"
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
- Backtest status updated to 'cancelled'
- Cancellation event recorded in backtest_events
- Cancellation message published to Service Bus
- Running job interrupted (if applicable)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid backtest ID format | 400 | Return "Invalid backtest ID format" |
| Backtest not found | 404 | Return "Backtest not found" |
| Not backtest owner | 403 | Return "Access denied" |
| Backtest already completed | 400 | Return "Backtest cannot be cancelled. Status: completed" |
| Backtest already failed | 400 | Return "Backtest cannot be cancelled. Status: failed" |
| Backtest already cancelled | 400 | Return "Backtest is already cancelled" |
| Concurrent status change | 409 | Return "Backtest status changed during cancellation" |
| Service Bus publish error | 200 | Log warning, status still updated (eventual consistency) |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 3 queries (SELECT for validation, UPDATE status, INSERT event)
- **Cache Strategy**: None
- **Expected Execution Time**: < 200ms (excluding async job termination)
- **Async Operations**: Job termination happens asynchronously via Service Bus
- **Idempotency**: Multiple cancel requests for same backtest return success if already cancelled

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtests`, `backtest_events`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Topic: `backtest.jobs.cancel`

#### Notes

**Cancellation Behavior by Status:**
- **queued**: Remove from queue, mark as cancelled, no partial results
- **running**: Interrupt execution, clean up partial data, mark as cancelled

**Race Condition Handling:**
- Use optimistic locking via WHERE clause in UPDATE
- If UPDATE affects 0 rows, status changed concurrently

**Related Processes:**
- PROC-BACKTEST-001: Run Backtest (creates backtest that can be cancelled)
- PROC-BACKTEST-010: Poll Backtest Status (shows current status including cancelled)

---


---

## PROC-BACKTEST-008: Get Backtest Quota

**Source File:** `PROC-BACKTEST-008.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-008.md`

### PROC-BACKTEST-008: Get Backtest Quota

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views backtest page or before submitting a new backtest

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Valid JWT access token provided

#### Inputs
**API Endpoint:** `GET /api/v1/backtests/quota`

**Query Parameters:**
```
GET /api/v1/backtests/quota?
  period={monthly|current}
```

**Parameter Details:**
- `period` (string, default: current): Which quota period to retrieve
  - `current`: Current billing/quota period (default)
  - `monthly`: Explicit monthly quota (same as current for Phase 1)

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service `/api/v1/backtests/quota`
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller determines current quota period**
   - Calculate period start: First day of current month at 00:00:00 UTC
   - Calculate period end: First day of next month at 00:00:00 UTC
4. **Backtesting Repository checks for existing quota record**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     id,
     user_id,
     period_start,
     period_end,
     backtests_run,
     backtests_limit
   FROM backtest_quota
   WHERE user_id = $1
     AND period_start <= NOW()
     AND period_end > NOW()
   ```
5. **If no quota record exists, create one**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   INSERT INTO backtest_quota (
     user_id, period_start, period_end, backtests_run, backtests_limit, created_at, updated_at
   ) VALUES (
     $1,
     DATE_TRUNC('month', NOW()),
     DATE_TRUNC('month', NOW()) + INTERVAL '1 month',
     0,
     100,  -- Default limit for Phase 1
     NOW(),
     NOW()
   )
   ON CONFLICT (user_id, period_start, period_end) DO NOTHING
   RETURNING *
   ```
6. **Backtesting Repository counts actual backtests run this period** (verification)
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT COUNT(*) as actual_count
   FROM backtests
   WHERE user_id = $1
     AND created_at >= DATE_TRUNC('month', NOW())
     AND created_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
   ```
7. **Backtest Controller calculates quota summary**
   - Remaining = limit - used
   - Percentage used = (used / limit) * 100
   - Days remaining in period
8. **Return quota response**

#### Outputs

**Success Response (200 OK) - ADR-032 Format:**
```json
{
  "success": true,
  "data": {
    "quota": {
      "period": {
        "start": "2024-12-01T00:00:00Z",
        "end": "2025-01-01T00:00:00Z",
        "type": "monthly"
      },
      "usage": {
        "used": 47,
        "limit": 100,
        "remaining": 53,
        "percentageUsed": 47.0
      },
      "status": "available",
      "daysRemainingInPeriod": 15
    },
    "nextReset": "2025-01-01T00:00:00Z",
    "tierInfo": {
      "currentTier": "beta_tester",
      "tierLimit": 100
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Quota Exhausted:**
```json
{
  "success": true,
  "data": {
    "quota": {
      "period": {
        "start": "2024-12-01T00:00:00Z",
        "end": "2025-01-01T00:00:00Z",
        "type": "monthly"
      },
      "usage": {
        "used": 100,
        "limit": 100,
        "remaining": 0,
        "percentageUsed": 100.0
      },
      "status": "exhausted",
      "daysRemainingInPeriod": 15
    },
    "nextReset": "2025-01-01T00:00:00Z",
    "tierInfo": {
      "currentTier": "beta_tester",
      "tierLimit": 100
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Low Quota Warning:**
```json
{
  "success": true,
  "data": {
    "quota": {
      "period": {
        "start": "2024-12-01T00:00:00Z",
        "end": "2025-01-01T00:00:00Z",
        "type": "monthly"
      },
      "usage": {
        "used": 90,
        "limit": 100,
        "remaining": 10,
        "percentageUsed": 90.0
      },
      "status": "low",
      "daysRemainingInPeriod": 15
    },
    "nextReset": "2025-01-01T00:00:00Z",
    "tierInfo": {
      "currentTier": "beta_tester",
      "tierLimit": 100
    },
    "warnings": [
      {
        "code": "LOW_QUOTA",
        "message": "You have 10 backtests remaining this month"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Quota record exists or is created
- Current usage accurately calculated
- Remaining quota calculated correctly
- Status reflects current state (available, low, exhausted)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid period parameter | 400 | Return "Invalid period. Allowed: current, monthly" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 2-3 queries (quota lookup, optional insert, verification count)
- **Cache Strategy**: Cache quota for 1 minute per user (`quota:{user_id}` TTL 60s)
- **Expected Execution Time**: < 100ms (with cache), < 200ms (without cache)
- **Freshness**: Quota may be slightly stale (up to 1 minute) due to caching

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtest_quota`, `backtests`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

**Cache:**
- Redis - quota caching: `quota:{user_id}` with 60-second TTL

#### Notes

**Quota Status Values:**
- `available`: > 10% remaining
- `low`: <= 10% remaining (1-10 backtests left for 100 limit)
- `exhausted`: 0 remaining

**Phase 1 Limits:**
- All users: 100 backtests per month
- Future phases may have tier-based limits

**Quota Counting Rules:**
- Only counts backtests created in current period
- Cancelled backtests still count against quota
- Failed backtests still count against quota

**Related Processes:**
- PROC-BACKTEST-001: Run Backtest (checks and increments quota)

---


---

## PROC-BACKTEST-009: Poll Backtest Status

**Source File:** `PROC-BACKTEST-009.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-009.md`

### PROC-BACKTEST-009: Poll Backtest Status

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
Frontend polls for status updates on a queued or running backtest

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User owns the backtest
- Backtest exists

#### Inputs
**API Endpoint:** `GET /api/v1/backtests/{backtestId}/status`

**Path Parameters:**
- `backtestId` (uuid, required): The backtest ID to check

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service `/api/v1/backtests/{backtestId}/status`
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates path parameter**
   - Validate `backtestId` is valid UUID format
   - Return 400 if invalid
4. **Backtest Controller validates ownership**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     b.id,
     b.user_id,
     b.status,
     b.created_at,
     b.started_at,
     b.completed_at,
     b.execution_duration_ms,
     b.error_message
   FROM backtests b
   WHERE b.id = $1
   ```
   - If not found → Return 404 "Backtest not found"
   - If `user_id != current_user_id` → Return 403 "Access denied"
5. **If status is 'running', fetch latest progress event**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT event_data
   FROM backtest_events
   WHERE backtest_id = $1
     AND event_type = 'progress_update'
   ORDER BY event_timestamp DESC
   LIMIT 1
   ```
6. **Backtest Controller calculates estimated completion** (if running)
   - Based on progress percentage and elapsed time
   - Or based on average execution time for similar backtests
7. **Return status response**

#### Outputs

**Success Response - Queued Status (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "status": "queued",
    "queuePosition": 3,
    "estimatedWaitTime": "< 2 minutes",
    "createdAt": "2024-12-01T10:00:00Z",
    "startedAt": null,
    "completedAt": null,
    "progress": null
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:30Z",
    "version": "v1"
  }
}
```

**Success Response - Running Status (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "status": "running",
    "queuePosition": null,
    "estimatedCompletion": "< 3 minutes",
    "createdAt": "2024-12-01T10:00:00Z",
    "startedAt": "2024-12-01T10:00:15Z",
    "completedAt": null,
    "progress": {
      "percentage": 45,
      "currentPhase": "executing_strategy",
      "processedCandles": 4500,
      "totalCandles": 10000,
      "tradesExecuted": 12
    },
    "elapsedTimeMs": 45000
  },
  "meta": {
    "timestamp": "2024-12-01T10:01:00Z",
    "version": "v1"
  }
}
```

**Success Response - Completed Status (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "status": "completed",
    "queuePosition": null,
    "estimatedCompletion": null,
    "createdAt": "2024-12-01T10:00:00Z",
    "startedAt": "2024-12-01T10:00:15Z",
    "completedAt": "2024-12-01T10:02:35Z",
    "progress": {
      "percentage": 100,
      "currentPhase": "completed",
      "processedCandles": 10000,
      "totalCandles": 10000,
      "tradesExecuted": 47
    },
    "executionDurationMs": 140000,
    "resultsSummary": {
      "totalReturn": 25.01,
      "totalTrades": 47,
      "winRate": 62.5
    },
    "resultsUrl": "/api/v1/backtests/uuid"
  },
  "meta": {
    "timestamp": "2024-12-01T10:02:40Z",
    "version": "v1"
  }
}
```

**Success Response - Failed Status (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "status": "failed",
    "queuePosition": null,
    "estimatedCompletion": null,
    "createdAt": "2024-12-01T10:00:00Z",
    "startedAt": "2024-12-01T10:00:15Z",
    "completedAt": "2024-12-01T10:01:05Z",
    "progress": {
      "percentage": 23,
      "currentPhase": "failed",
      "processedCandles": 2300,
      "totalCandles": 10000,
      "tradesExecuted": 5
    },
    "executionDurationMs": 50000,
    "error": {
      "code": "STRATEGY_EXECUTION_ERROR",
      "message": "Strategy raised an exception: Division by zero in entry_signal()",
      "recoverable": false
    }
  },
  "meta": {
    "timestamp": "2024-12-01T10:01:10Z",
    "version": "v1"
  }
}
```

**Success Response - Cancelled Status (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "status": "cancelled",
    "queuePosition": null,
    "estimatedCompletion": null,
    "createdAt": "2024-12-01T10:00:00Z",
    "startedAt": "2024-12-01T10:00:15Z",
    "completedAt": "2024-12-01T10:00:45Z",
    "progress": {
      "percentage": 15,
      "currentPhase": "cancelled",
      "processedCandles": 1500,
      "totalCandles": 10000,
      "tradesExecuted": 3
    },
    "executionDurationMs": 30000,
    "cancellation": {
      "reason": "Cancelled by user",
      "cancelledAt": "2024-12-01T10:00:45Z"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:50Z",
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
    "message": "Backtest not found",
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
- Status retrieved for valid, owned backtest
- Progress information included for running backtests
- Summary included for completed backtests
- Error details included for failed backtests
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid backtest ID format | 400 | Return "Invalid backtest ID format" |
| Backtest not found | 404 | Return "Backtest not found" |
| Not backtest owner | 403 | Return "Access denied" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 1-2 queries (backtest lookup + optional progress event)
- **Cache Strategy**: Consider short TTL cache for frequently polled backtests (5 seconds)
- **Expected Execution Time**: < 100ms
- **Polling Frequency**: Frontend should poll every 2-5 seconds for running backtests

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtests`, `backtest_events`, `backtest_results`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

**Cache:** (optional)
- Redis - status caching: `backtest:status:{backtestId}` with 5-second TTL

#### Notes

**Status Transitions:**
```
queued → running → completed
queued → running → failed
queued → running → cancelled
queued → cancelled
```

**Progress Phases:**
- `initializing`: Setting up backtest environment
- `loading_data`: Fetching historical data
- `executing_strategy`: Running strategy on candles
- `calculating_metrics`: Computing performance metrics
- `saving_results`: Persisting results to database
- `completed`: Backtest finished successfully
- `failed`: Backtest encountered an error
- `cancelled`: Backtest was cancelled by user

**Estimated Completion Calculation:**
- For queued: Based on queue position × average queue wait time
- For running: Based on (elapsed_time / progress_percentage) × 100

**Frontend Polling Recommendations:**
- Poll every 2 seconds while status is 'running'
- Poll every 5 seconds while status is 'queued'
- Stop polling when status is terminal (completed, failed, cancelled)

**Related Processes:**
- PROC-BACKTEST-001: Run Backtest (creates backtest being polled)
- PROC-BACKTEST-002: View Backtest Results (detailed results after completion)
- PROC-BACKTEST-007: Cancel Running Backtest (changes status to cancelled)

---


---

## PROC-BACKTEST-010: Get Backtest Group Status

**Source File:** `PROC-BACKTEST-010.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-010.md`

### PROC-BACKTEST-010: Get Backtest Group Status

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
Frontend polls for status updates on a multi-symbol backtest group

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User owns the backtest group
- Backtest group exists

#### Inputs
**API Endpoint:** `GET /api/v1/backtests/groups/{groupId}/status`

**Path Parameters:**
- `groupId` (uuid, required): The backtest group ID to check

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service `/api/v1/backtests/groups/{groupId}/status`
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates path parameter**
   - Validate `groupId` is valid UUID format
   - Return 400 if invalid
4. **Backtest Controller validates ownership**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     g.id,
     g.user_id,
     g.status,
     g.symbols,
     g.symbol_count,
     g.backtests_completed,
     g.backtests_failed,
     g.created_at,
     g.started_at,
     g.completed_at
   FROM backtest_groups g
   WHERE g.id = $1
   ```
   - If not found → Return 404 "Backtest group not found"
   - If `user_id != current_user_id` → Return 403 "Access denied"
5. **Backtest Controller fetches individual backtest statuses**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     b.id,
     b.symbol,
     b.status,
     b.started_at,
     b.completed_at,
     b.execution_duration_ms,
     b.error_message
   FROM backtests b
   WHERE b.group_id = $1
   ORDER BY b.symbol ASC
   ```
6. **If any backtest is 'running', fetch latest progress events**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     be.backtest_id,
     be.event_data
   FROM backtest_events be
   WHERE be.backtest_id IN (SELECT id FROM backtests WHERE group_id = $1 AND status = 'running')
     AND be.event_type = 'progress_update'
     AND be.event_timestamp = (
       SELECT MAX(event_timestamp)
       FROM backtest_events
       WHERE backtest_id = be.backtest_id
         AND event_type = 'progress_update'
     )
   ```
7. **Backtest Controller calculates group progress**
   - Overall percentage = (completed + failed) / total * 100
   - Running count = count where status = 'running'
   - Pending count = count where status = 'queued'
8. **Backtest Controller estimates completion time** (if running)
   - Based on average progress of running backtests
   - Or based on average execution time for similar backtests
9. **Return group status response**

#### Outputs

**Success Response - Group Queued (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "status": "queued",
    "symbolCount": 5,
    "progress": {
      "completed": 0,
      "running": 0,
      "queued": 5,
      "failed": 0,
      "percentageComplete": 0
    },
    "createdAt": "2024-12-01T10:00:00Z",
    "startedAt": null,
    "completedAt": null,
    "estimatedCompletion": "< 5 minutes",
    "backtests": [
      {
        "backtestId": "uuid-1",
        "symbol": "BTCUSDT",
        "status": "queued",
        "progress": null
      },
      {
        "backtestId": "uuid-2",
        "symbol": "ETHUSDT",
        "status": "queued",
        "progress": null
      },
      {
        "backtestId": "uuid-3",
        "symbol": "SOLUSDT",
        "status": "queued",
        "progress": null
      },
      {
        "backtestId": "uuid-4",
        "symbol": "BNBUSDT",
        "status": "queued",
        "progress": null
      },
      {
        "backtestId": "uuid-5",
        "symbol": "XRPUSDT",
        "status": "queued",
        "progress": null
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:30Z",
    "version": "v1"
  }
}
```

**Success Response - Group Running (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "status": "running",
    "symbolCount": 5,
    "progress": {
      "completed": 2,
      "running": 2,
      "queued": 1,
      "failed": 0,
      "percentageComplete": 40
    },
    "createdAt": "2024-12-01T10:00:00Z",
    "startedAt": "2024-12-01T10:00:15Z",
    "completedAt": null,
    "estimatedCompletion": "< 3 minutes",
    "backtests": [
      {
        "backtestId": "uuid-1",
        "symbol": "BTCUSDT",
        "status": "completed",
        "progress": {
          "percentage": 100,
          "currentPhase": "completed"
        },
        "executionDurationMs": 45000,
        "resultsSummary": {
          "totalReturn": 25.5,
          "totalTrades": 47,
          "winRate": 62.5
        }
      },
      {
        "backtestId": "uuid-2",
        "symbol": "ETHUSDT",
        "status": "completed",
        "progress": {
          "percentage": 100,
          "currentPhase": "completed"
        },
        "executionDurationMs": 42000,
        "resultsSummary": {
          "totalReturn": 18.3,
          "totalTrades": 52,
          "winRate": 57.7
        }
      },
      {
        "backtestId": "uuid-3",
        "symbol": "SOLUSDT",
        "status": "running",
        "progress": {
          "percentage": 65,
          "currentPhase": "executing_strategy",
          "processedCandles": 6500,
          "totalCandles": 10000,
          "tradesExecuted": 28
        }
      },
      {
        "backtestId": "uuid-4",
        "symbol": "BNBUSDT",
        "status": "running",
        "progress": {
          "percentage": 35,
          "currentPhase": "executing_strategy",
          "processedCandles": 3500,
          "totalCandles": 10000,
          "tradesExecuted": 15
        }
      },
      {
        "backtestId": "uuid-5",
        "symbol": "XRPUSDT",
        "status": "queued",
        "progress": null
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T10:02:00Z",
    "version": "v1"
  }
}
```

**Success Response - Group Completed (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "status": "completed",
    "symbolCount": 5,
    "progress": {
      "completed": 5,
      "running": 0,
      "queued": 0,
      "failed": 0,
      "percentageComplete": 100
    },
    "createdAt": "2024-12-01T10:00:00Z",
    "startedAt": "2024-12-01T10:00:15Z",
    "completedAt": "2024-12-01T10:04:35Z",
    "totalExecutionDurationMs": 260000,
    "backtests": [
      {
        "backtestId": "uuid-1",
        "symbol": "BTCUSDT",
        "status": "completed",
        "executionDurationMs": 45000,
        "resultsSummary": {
          "totalReturn": 25.5,
          "totalTrades": 47,
          "winRate": 62.5
        }
      },
      {
        "backtestId": "uuid-2",
        "symbol": "ETHUSDT",
        "status": "completed",
        "executionDurationMs": 42000,
        "resultsSummary": {
          "totalReturn": 18.3,
          "totalTrades": 52,
          "winRate": 57.7
        }
      },
      {
        "backtestId": "uuid-3",
        "symbol": "SOLUSDT",
        "status": "completed",
        "executionDurationMs": 48000,
        "resultsSummary": {
          "totalReturn": 45.2,
          "totalTrades": 38,
          "winRate": 68.4
        }
      },
      {
        "backtestId": "uuid-4",
        "symbol": "BNBUSDT",
        "status": "completed",
        "executionDurationMs": 41000,
        "resultsSummary": {
          "totalReturn": 12.8,
          "totalTrades": 55,
          "winRate": 54.5
        }
      },
      {
        "backtestId": "uuid-5",
        "symbol": "XRPUSDT",
        "status": "completed",
        "executionDurationMs": 52000,
        "resultsSummary": {
          "totalReturn": -5.3,
          "totalTrades": 61,
          "winRate": 45.9
        }
      }
    ],
    "groupSummary": {
      "bestPerformer": {
        "symbol": "SOLUSDT",
        "totalReturn": 45.2
      },
      "worstPerformer": {
        "symbol": "XRPUSDT",
        "totalReturn": -5.3
      },
      "averageReturn": 19.3,
      "profitableSymbols": 4,
      "unprofitableSymbols": 1
    },
    "resultsUrl": "/api/v1/backtests/groups/{groupId}/results"
  },
  "meta": {
    "timestamp": "2024-12-01T10:05:00Z",
    "version": "v1"
  }
}
```

**Success Response - Group with Partial Failures (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "status": "completed",
    "symbolCount": 5,
    "progress": {
      "completed": 4,
      "running": 0,
      "queued": 0,
      "failed": 1,
      "percentageComplete": 100
    },
    "createdAt": "2024-12-01T10:00:00Z",
    "startedAt": "2024-12-01T10:00:15Z",
    "completedAt": "2024-12-01T10:04:35Z",
    "backtests": [
      {
        "backtestId": "uuid-1",
        "symbol": "BTCUSDT",
        "status": "completed",
        "executionDurationMs": 45000,
        "resultsSummary": {
          "totalReturn": 25.5,
          "totalTrades": 47,
          "winRate": 62.5
        }
      },
      {
        "backtestId": "uuid-2",
        "symbol": "ETHUSDT",
        "status": "failed",
        "error": {
          "code": "STRATEGY_EXECUTION_ERROR",
          "message": "Division by zero in entry_signal()"
        }
      }
    ],
    "groupSummary": {
      "bestPerformer": {
        "symbol": "BTCUSDT",
        "totalReturn": 25.5
      },
      "worstPerformer": {
        "symbol": "BTCUSDT",
        "totalReturn": 25.5
      },
      "averageReturn": 25.5,
      "profitableSymbols": 1,
      "unprofitableSymbols": 0,
      "failedSymbols": 1
    },
    "warnings": [
      {
        "code": "PARTIAL_FAILURE",
        "message": "1 of 5 backtests failed. Results shown for successful backtests only."
      }
    ],
    "resultsUrl": "/api/v1/backtests/groups/{groupId}/results"
  },
  "meta": {
    "timestamp": "2024-12-01T10:05:00Z",
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
    "message": "Backtest group not found",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
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

#### Success Criteria
- Group status retrieved for valid, owned group
- Individual backtest statuses included
- Progress information included for running backtests
- Summary included when group is completed
- Error details included for failed backtests
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid group ID format | 400 | Return "Invalid group ID format" |
| Group not found | 404 | Return "Backtest group not found" |
| Not group owner | 403 | Return "Access denied" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 2-3 queries (group lookup, backtests in group, optional progress events)
- **Cache Strategy**: Consider short TTL cache for frequently polled groups (5 seconds)
- **Expected Execution Time**: < 150ms
- **Polling Frequency**: Frontend should poll every 2-5 seconds for running groups

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtest_groups`, `backtests`, `backtest_events`, `backtest_results`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

**Cache:** (optional)
- Redis - status caching: `backtest:group:status:{groupId}` with 5-second TTL

#### Notes

**Group Status Values:**
- `queued`: All backtests are queued
- `running`: At least one backtest is running
- `completed`: All backtests have finished (may include failed)
- `cancelled`: Group was cancelled by user

**Progress Calculation:**
- Overall percentage = ((completed + failed) / total) * 100
- Individual percentages come from progress_update events

**Frontend Polling Recommendations:**
- Poll every 2 seconds while status is 'running'
- Poll every 5 seconds while status is 'queued'
- Stop polling when status is 'completed' or 'cancelled'

**Related Processes:**
- PROC-BACKTEST-001: Run Backtest (creates backtest group)
- PROC-BACKTEST-009: Poll Backtest Status (individual backtest polling)
- PROC-BACKTEST-011: Get Backtest Group Results (detailed results after completion)
- PROC-BACKTEST-012: Cancel Backtest Group (cancels all backtests in group)

---


---

## PROC-BACKTEST-011: Get Backtest Group Results

**Source File:** `PROC-BACKTEST-011.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-011.md`

### PROC-BACKTEST-011: Get Backtest Group Results

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views the results page for a multi-symbol backtest group

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User owns the backtest group
- Backtest group exists
- At least one backtest in the group is completed

#### Inputs
**API Endpoint:** `GET /api/v1/backtests/groups/{groupId}/results`

**Path Parameters:**
- `groupId` (uuid, required): The backtest group ID

**Query Parameters:**
```
GET /api/v1/backtests/groups/{groupId}/results?
  sortBy={totalReturn|winRate|sharpeRatio|maxDrawdown|totalTrades}
  &sortOrder={asc|desc}
```

**Parameter Details:**
- `sortBy` (string, default: totalReturn): Field to sort symbol results by
- `sortOrder` (string, default: desc): Sort direction

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service `/api/v1/backtests/groups/{groupId}/results`
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates path parameters**
   - Validate `groupId` is valid UUID format
   - Validate sort parameters
   - Return 400 if invalid
4. **Backtest Controller validates ownership**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     g.id,
     g.user_id,
     g.strategy_id,
     g.strategy_name,
     g.timeframe,
     g.start_date,
     g.end_date,
     g.initial_capital,
     g.commission_rate,
     g.slippage_rate,
     g.symbols,
     g.symbol_count,
     g.status,
     g.backtests_completed,
     g.backtests_failed,
     g.created_at,
     g.completed_at,
     g.notes,
     g.tags
   FROM backtest_groups g
   WHERE g.id = $1
   ```
   - If not found → Return 404 "Backtest group not found"
   - If `user_id != current_user_id` → Return 403 "Access denied"
   - If `status` not in ('completed', 'running') or no completed backtests → Return 400 "No results available yet"
5. **Backtest Controller fetches all backtest results**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     b.id as backtest_id,
     b.symbol,
     b.status,
     b.execution_duration_ms,
     b.error_message,
     r.initial_capital,
     r.final_capital,
     r.net_profit,
     r.total_return,
     r.annual_return,
     r.sharpe_ratio,
     r.sortino_ratio,
     r.calmar_ratio,
     r.max_drawdown,
     r.avg_drawdown,
     r.max_drawdown_duration_hours,
     r.total_trades,
     r.winning_trades,
     r.losing_trades,
     r.win_rate,
     r.profit_factor,
     r.avg_win,
     r.avg_loss,
     r.largest_win,
     r.largest_loss,
     r.avg_trade_duration_hours,
     r.market_exposure_percent,
     r.equity_curve_url,
     r.drawdown_curve_url,
     r.detailed_report_url
   FROM backtests b
   LEFT JOIN backtest_results r ON b.id = r.backtest_id
   WHERE b.group_id = $1
   ORDER BY {sortBy} {sortOrder}
   ```
6. **Backtest Controller calculates aggregate metrics**
   - Average return across all completed backtests
   - Average Sharpe ratio
   - Average win rate
   - Best/worst performing symbols
   - Consistency score (how many symbols were profitable)
7. **Backtest Controller calculates correlation data** (optional)
   - Cross-correlation of returns between symbols
   - Useful for portfolio construction insights
8. **Return group results response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "group": {
      "groupId": "uuid",
      "strategyId": "uuid",
      "strategyName": "Golden Cross Strategy",
      "timeframe": "1h",
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-12-31T00:00:00Z",
      "initialCapitalPerSymbol": 10000,
      "commissionRate": 0.001,
      "slippageRate": 0.0005,
      "symbolCount": 5,
      "status": "completed",
      "backtestsCompleted": 5,
      "backtestsFailed": 0,
      "createdAt": "2024-12-01T10:00:00Z",
      "completedAt": "2024-12-01T10:04:35Z",
      "notes": "Testing strategy across major altcoins",
      "tags": ["multi-asset", "diversification"]
    },
    "aggregateMetrics": {
      "totalInitialCapital": 50000,
      "totalFinalCapital": 59650,
      "totalNetProfit": 9650,
      "averageReturn": 19.3,
      "medianReturn": 18.3,
      "returnStdDev": 18.2,
      "averageSharpeRatio": 1.45,
      "averageWinRate": 57.8,
      "averageMaxDrawdown": -12.5,
      "profitableSymbols": 4,
      "unprofitableSymbols": 1,
      "consistencyScore": 80,
      "bestPerformer": {
        "symbol": "SOLUSDT",
        "totalReturn": 45.2,
        "sharpeRatio": 2.1
      },
      "worstPerformer": {
        "symbol": "XRPUSDT",
        "totalReturn": -5.3,
        "sharpeRatio": -0.3
      }
    },
    "symbolResults": [
      {
        "backtestId": "uuid-3",
        "symbol": "SOLUSDT",
        "status": "completed",
        "metrics": {
          "initialCapital": 10000,
          "finalCapital": 14520,
          "netProfit": 4520,
          "totalReturn": 45.2,
          "annualReturn": 48.5,
          "sharpeRatio": 2.1,
          "sortinoRatio": 2.8,
          "calmarRatio": 3.2,
          "maxDrawdown": -14.1,
          "avgDrawdown": -5.2,
          "maxDrawdownDurationHours": 72,
          "totalTrades": 38,
          "winningTrades": 26,
          "losingTrades": 12,
          "winRate": 68.4,
          "profitFactor": 2.8,
          "avgWin": 285.50,
          "avgLoss": -142.30,
          "largestWin": 892.40,
          "largestLoss": -312.50,
          "avgTradeDurationHours": 18.5,
          "marketExposurePercent": 65.2
        },
        "executionDurationMs": 48000,
        "charts": {
          "equityCurveUrl": "https://storage.blob.core.windows.net/reports/uuid-3/equity.png",
          "drawdownCurveUrl": "https://storage.blob.core.windows.net/reports/uuid-3/drawdown.png"
        },
        "detailedReportUrl": "https://storage.blob.core.windows.net/reports/uuid-3/report.pdf",
        "tradesUrl": "/api/v1/backtests/uuid-3/trades"
      },
      {
        "backtestId": "uuid-1",
        "symbol": "BTCUSDT",
        "status": "completed",
        "metrics": {
          "initialCapital": 10000,
          "finalCapital": 12550,
          "netProfit": 2550,
          "totalReturn": 25.5,
          "annualReturn": 27.3,
          "sharpeRatio": 1.8,
          "sortinoRatio": 2.2,
          "calmarRatio": 2.1,
          "maxDrawdown": -12.1,
          "avgDrawdown": -4.8,
          "maxDrawdownDurationHours": 48,
          "totalTrades": 47,
          "winningTrades": 29,
          "losingTrades": 18,
          "winRate": 62.5,
          "profitFactor": 2.2,
          "avgWin": 185.50,
          "avgLoss": -98.30,
          "largestWin": 542.40,
          "largestLoss": -212.50,
          "avgTradeDurationHours": 14.2,
          "marketExposurePercent": 58.5
        },
        "executionDurationMs": 45000,
        "charts": {
          "equityCurveUrl": "https://storage.blob.core.windows.net/reports/uuid-1/equity.png",
          "drawdownCurveUrl": "https://storage.blob.core.windows.net/reports/uuid-1/drawdown.png"
        },
        "detailedReportUrl": "https://storage.blob.core.windows.net/reports/uuid-1/report.pdf",
        "tradesUrl": "/api/v1/backtests/uuid-1/trades"
      },
      {
        "backtestId": "uuid-2",
        "symbol": "ETHUSDT",
        "status": "completed",
        "metrics": {
          "initialCapital": 10000,
          "finalCapital": 11830,
          "netProfit": 1830,
          "totalReturn": 18.3,
          "annualReturn": 19.6,
          "sharpeRatio": 1.4,
          "sortinoRatio": 1.7,
          "calmarRatio": 1.5,
          "maxDrawdown": -12.2,
          "avgDrawdown": -5.1,
          "maxDrawdownDurationHours": 56,
          "totalTrades": 52,
          "winningTrades": 30,
          "losingTrades": 22,
          "winRate": 57.7,
          "profitFactor": 1.9,
          "avgWin": 145.20,
          "avgLoss": -85.40,
          "largestWin": 428.30,
          "largestLoss": -185.20,
          "avgTradeDurationHours": 12.8,
          "marketExposurePercent": 62.1
        },
        "executionDurationMs": 42000,
        "charts": {
          "equityCurveUrl": "https://storage.blob.core.windows.net/reports/uuid-2/equity.png",
          "drawdownCurveUrl": "https://storage.blob.core.windows.net/reports/uuid-2/drawdown.png"
        },
        "detailedReportUrl": "https://storage.blob.core.windows.net/reports/uuid-2/report.pdf",
        "tradesUrl": "/api/v1/backtests/uuid-2/trades"
      },
      {
        "backtestId": "uuid-4",
        "symbol": "BNBUSDT",
        "status": "completed",
        "metrics": {
          "initialCapital": 10000,
          "finalCapital": 11280,
          "netProfit": 1280,
          "totalReturn": 12.8,
          "annualReturn": 13.7,
          "sharpeRatio": 1.1,
          "sortinoRatio": 1.3,
          "calmarRatio": 1.0,
          "maxDrawdown": -12.8,
          "avgDrawdown": -5.8,
          "maxDrawdownDurationHours": 64,
          "totalTrades": 55,
          "winningTrades": 30,
          "losingTrades": 25,
          "winRate": 54.5,
          "profitFactor": 1.5,
          "avgWin": 112.80,
          "avgLoss": -72.50,
          "largestWin": 342.10,
          "largestLoss": -165.80,
          "avgTradeDurationHours": 11.5,
          "marketExposurePercent": 68.4
        },
        "executionDurationMs": 41000,
        "charts": {
          "equityCurveUrl": "https://storage.blob.core.windows.net/reports/uuid-4/equity.png",
          "drawdownCurveUrl": "https://storage.blob.core.windows.net/reports/uuid-4/drawdown.png"
        },
        "detailedReportUrl": "https://storage.blob.core.windows.net/reports/uuid-4/report.pdf",
        "tradesUrl": "/api/v1/backtests/uuid-4/trades"
      },
      {
        "backtestId": "uuid-5",
        "symbol": "XRPUSDT",
        "status": "completed",
        "metrics": {
          "initialCapital": 10000,
          "finalCapital": 9470,
          "netProfit": -530,
          "totalReturn": -5.3,
          "annualReturn": -5.7,
          "sharpeRatio": -0.3,
          "sortinoRatio": -0.4,
          "calmarRatio": -0.3,
          "maxDrawdown": -18.5,
          "avgDrawdown": -8.2,
          "maxDrawdownDurationHours": 120,
          "totalTrades": 61,
          "winningTrades": 28,
          "losingTrades": 33,
          "winRate": 45.9,
          "profitFactor": 0.85,
          "avgWin": 98.50,
          "avgLoss": -85.20,
          "largestWin": 285.40,
          "largestLoss": -198.30,
          "avgTradeDurationHours": 10.2,
          "marketExposurePercent": 72.8
        },
        "executionDurationMs": 52000,
        "charts": {
          "equityCurveUrl": "https://storage.blob.core.windows.net/reports/uuid-5/equity.png",
          "drawdownCurveUrl": "https://storage.blob.core.windows.net/reports/uuid-5/drawdown.png"
        },
        "detailedReportUrl": "https://storage.blob.core.windows.net/reports/uuid-5/report.pdf",
        "tradesUrl": "/api/v1/backtests/uuid-5/trades"
      }
    ],
    "comparison": {
      "byReturn": [
        {"symbol": "SOLUSDT", "value": 45.2, "rank": 1},
        {"symbol": "BTCUSDT", "value": 25.5, "rank": 2},
        {"symbol": "ETHUSDT", "value": 18.3, "rank": 3},
        {"symbol": "BNBUSDT", "value": 12.8, "rank": 4},
        {"symbol": "XRPUSDT", "value": -5.3, "rank": 5}
      ],
      "bySharpeRatio": [
        {"symbol": "SOLUSDT", "value": 2.1, "rank": 1},
        {"symbol": "BTCUSDT", "value": 1.8, "rank": 2},
        {"symbol": "ETHUSDT", "value": 1.4, "rank": 3},
        {"symbol": "BNBUSDT", "value": 1.1, "rank": 4},
        {"symbol": "XRPUSDT", "value": -0.3, "rank": 5}
      ],
      "byWinRate": [
        {"symbol": "SOLUSDT", "value": 68.4, "rank": 1},
        {"symbol": "BTCUSDT", "value": 62.5, "rank": 2},
        {"symbol": "ETHUSDT", "value": 57.7, "rank": 3},
        {"symbol": "BNBUSDT", "value": 54.5, "rank": 4},
        {"symbol": "XRPUSDT", "value": 45.9, "rank": 5}
      ],
      "byMaxDrawdown": [
        {"symbol": "BTCUSDT", "value": -12.1, "rank": 1},
        {"symbol": "ETHUSDT", "value": -12.2, "rank": 2},
        {"symbol": "BNBUSDT", "value": -12.8, "rank": 3},
        {"symbol": "SOLUSDT", "value": -14.1, "rank": 4},
        {"symbol": "XRPUSDT", "value": -18.5, "rank": 5}
      ]
    },
    "insights": [
      {
        "type": "positive",
        "message": "Strategy performed well on 4 out of 5 symbols (80% consistency)"
      },
      {
        "type": "positive",
        "message": "SOLUSDT showed exceptional performance with 45.2% return and 2.1 Sharpe ratio"
      },
      {
        "type": "warning",
        "message": "Strategy underperformed on XRPUSDT with -5.3% return. Consider excluding from live trading or adjusting parameters."
      },
      {
        "type": "info",
        "message": "Average win rate across symbols is 57.8%. Consider tighter stop-loss to improve win rate."
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Partial Results (Group Still Running) (200 OK):**
```json
{
  "success": true,
  "data": {
    "group": {
      "groupId": "uuid",
      "status": "running",
      "symbolCount": 5,
      "backtestsCompleted": 3,
      "backtestsFailed": 0
    },
    "aggregateMetrics": {
      "note": "Partial results - 3 of 5 backtests completed",
      "averageReturn": 29.7,
      "profitableSymbols": 3,
      "unprofitableSymbols": 0
    },
    "symbolResults": [
      // Only completed backtests included
    ],
    "pendingSymbols": ["BNBUSDT", "XRPUSDT"]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
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
    "message": "Backtest group not found",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (400 Bad Request - No Results Yet):**
```json
{
  "success": false,
  "error": {
    "code": "NO_RESULTS_AVAILABLE",
    "message": "No results available yet",
    "details": {
      "status": "queued",
      "backtestsCompleted": 0,
      "pollUrl": "/api/v1/backtests/groups/{groupId}/status"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Group results retrieved for valid, owned group
- All completed backtest results included
- Aggregate metrics calculated correctly
- Comparison rankings accurate
- Insights generated based on results
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid group ID format | 400 | Return "Invalid group ID format" |
| Invalid sort parameters | 400 | Return "Invalid sort field or order" |
| Group not found | 404 | Return "Backtest group not found" |
| Not group owner | 403 | Return "Access denied" |
| No completed backtests | 400 | Return "No results available yet" with poll URL |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 2-3 queries (group lookup, backtest results join)
- **Cache Strategy**: Cache completed group results for 1 hour (`group:results:{groupId}`)
- **Expected Execution Time**: < 300ms
- **Response Size**: May be large with 10 symbols; consider pagination for trade lists

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtest_groups`, `backtests`, `backtest_results`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

**Storage:**
- Azure Blob Storage - Report files, equity curve images

**Cache:**
- Redis - results caching: `group:results:{groupId}` with 1-hour TTL

#### Notes

**Aggregate Metrics Calculation:**
- Average values calculated only from successful backtests
- Failed backtests excluded from aggregate calculations
- Consistency score = (profitable symbols / total symbols) * 100

**Insights Generation:**
- Positive: > 70% consistency, Sharpe > 1.5, Return > 20%
- Warning: < 50% consistency, negative returns, Sharpe < 0
- Info: Suggestions based on metrics patterns

**Comparison Rankings:**
- Sorted by each metric independently
- Rank 1 is best (highest return, highest Sharpe, lowest drawdown)

**Related Processes:**
- PROC-BACKTEST-001: Run Backtest (creates backtest group)
- PROC-BACKTEST-010: Get Backtest Group Status (status before results)
- PROC-BACKTEST-006: Get Backtest Trades (individual backtest trades)
- PROC-BACKTEST-002: View Backtest Results (individual backtest details)

---


---

## PROC-BACKTEST-012: Cancel Backtest Group

**Source File:** `PROC-BACKTEST-012.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-012.md`

### PROC-BACKTEST-012: Cancel Backtest Group

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User clicks "Cancel" button on a running backtest group

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User owns the backtest group
- Backtest group exists
- Group status is 'queued' or 'running'

#### Inputs
**API Endpoint:** `POST /api/v1/backtests/groups/{groupId}/cancel`

**Path Parameters:**
- `groupId` (uuid, required): The backtest group ID to cancel

**Request Body:** (optional)
```json
{
  "reason": "Changed my mind about testing this strategy"
}
```

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service `/api/v1/backtests/groups/{groupId}/cancel`
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates path parameter**
   - Validate `groupId` is valid UUID format
   - Return 400 if invalid
4. **Backtest Controller validates ownership and status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     g.id,
     g.user_id,
     g.status,
     g.symbol_count,
     g.backtests_completed,
     g.backtests_failed
   FROM backtest_groups g
   WHERE g.id = $1
   ```
   - If not found → Return 404 "Backtest group not found"
   - If `user_id != current_user_id` → Return 403 "Access denied"
   - If `status` not in ('queued', 'running') → Return 400 "Group cannot be cancelled (already {status})"
5. **Backtest Controller fetches all cancellable backtests**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, status
   FROM backtests
   WHERE group_id = $1
     AND status IN ('queued', 'running')
   ```
6. **For each cancellable backtest:**
   - **If status is 'queued':**
     ```sql
     -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
     UPDATE backtests
     SET status = 'cancelled',
         completed_at = NOW()
     WHERE id = $1 AND status = 'queued'
     ```
   - **If status is 'running':**
     - Publish cancellation message to Azure Service Bus
     - Topic: `backtest.commands`
     - Message (ADR-032 format):
       ```json
       {
         "messageId": "uuid",
         "eventType": "backtest.execution.cancel",
         "timestamp": "2024-12-01T10:00:00Z",
         "version": "1.0",
         "source": {
           "service": "backtesting-service",
           "instance": "instance-id"
         },
         "payload": {
           "backtestId": "uuid",
           "groupId": "uuid",
           "reason": "User requested cancellation"
         },
         "metadata": {
           "correlationId": "uuid",
           "causationId": "uuid",
           "userId": "uuid"
         }
       }
       ```
     - Update backtest status:
       ```sql
       -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
       UPDATE backtests
       SET status = 'cancelled',
           completed_at = NOW()
       WHERE id = $1 AND status = 'running'
       ```
7. **Log cancellation events for each backtest**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   INSERT INTO backtest_events (
     backtest_id, event_type, event_timestamp, event_message, event_data
   ) VALUES (
     $1, 'cancelled', NOW(), 'Cancelled as part of group cancellation',
     '{"groupId": "uuid", "reason": "User requested cancellation"}'
   )
   ```
8. **Update group status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtest_groups
   SET status = 'cancelled',
       completed_at = NOW()
   WHERE id = $1
   ```
9. **Return cancellation response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "status": "cancelled",
    "cancelledAt": "2024-12-01T10:01:00Z",
    "summary": {
      "totalBacktests": 5,
      "alreadyCompleted": 2,
      "cancelled": 3,
      "alreadyFailed": 0
    },
    "backtests": [
      {
        "backtestId": "uuid-1",
        "symbol": "BTCUSDT",
        "previousStatus": "completed",
        "currentStatus": "completed",
        "action": "none"
      },
      {
        "backtestId": "uuid-2",
        "symbol": "ETHUSDT",
        "previousStatus": "completed",
        "currentStatus": "completed",
        "action": "none"
      },
      {
        "backtestId": "uuid-3",
        "symbol": "SOLUSDT",
        "previousStatus": "running",
        "currentStatus": "cancelled",
        "action": "cancelled"
      },
      {
        "backtestId": "uuid-4",
        "symbol": "BNBUSDT",
        "previousStatus": "running",
        "currentStatus": "cancelled",
        "action": "cancelled"
      },
      {
        "backtestId": "uuid-5",
        "symbol": "XRPUSDT",
        "previousStatus": "queued",
        "currentStatus": "cancelled",
        "action": "cancelled"
      }
    ],
    "message": "Group cancelled. 2 backtests had already completed and their results are available."
  },
  "meta": {
    "timestamp": "2024-12-01T10:01:00Z",
    "version": "v1"
  }
}
```

**Success Response - All Already Completed (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "status": "completed",
    "summary": {
      "totalBacktests": 5,
      "alreadyCompleted": 5,
      "cancelled": 0,
      "alreadyFailed": 0
    },
    "message": "No backtests were cancelled. All had already completed."
  },
  "meta": {
    "timestamp": "2024-12-01T10:01:00Z",
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
    "message": "Backtest group not found",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
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
    "message": "Group cannot be cancelled",
    "details": {
      "currentStatus": "completed",
      "allowedStatuses": ["queued", "running"]
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
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

#### Success Criteria
- All queued backtests marked as cancelled
- Cancellation messages sent for running backtests
- Running backtests marked as cancelled
- Cancellation events logged
- Group status updated to 'cancelled'
- Previously completed backtests remain unchanged
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid group ID format | 400 | Return "Invalid group ID format" |
| Group not found | 404 | Return "Backtest group not found" |
| Not group owner | 403 | Return "Access denied" |
| Group already completed | 400 | Return "Group cannot be cancelled (already completed)" |
| Group already cancelled | 400 | Return "Group cannot be cancelled (already cancelled)" |
| Database error | 500 | Log error, return generic message |
| Message queue error | 500 | Log error, continue with DB updates, return partial success |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 4-6 queries (group lookup, backtest lookup, updates, event inserts)
- **Message Publishing**: 0-10 messages (one per running backtest)
- **Expected Execution Time**: < 500ms
- **Transaction**: All database updates should be in a single transaction

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtest_groups`, `backtests`, `backtest_events`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Topic: `backtest.commands`

#### Notes

**Cancellation Behavior:**
- Completed backtests are NOT affected - results remain available
- Failed backtests are NOT affected
- Only queued and running backtests are cancelled
- Quota is NOT refunded for cancelled backtests

**Job Consumer Handling:**
- Job consumers should check for cancellation signals periodically
- If cancellation received, stop execution gracefully
- Save partial results if available (optional)

**Race Conditions:**
- A backtest may complete between status check and cancellation
- This is acceptable - the backtest completes successfully
- Response accurately reflects what actually happened

**Related Processes:**
- PROC-BACKTEST-007: Cancel Running Backtest (individual backtest cancellation)
- PROC-BACKTEST-010: Get Backtest Group Status (check status before/after cancel)
- PROC-BACKTEST-011: Get Backtest Group Results (view partial results)

---


---

## PROC-BACKTEST-013: List Backtest Groups

**Source File:** `PROC-BACKTEST-013.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-013.md`

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


---

## PROC-BACKTEST-014: Archive/Restore Individual Backtest

**Source File:** `PROC-BACKTEST-014.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-014.md`

### PROC-BACKTEST-014: Archive/Restore Individual Backtest

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-029, ADR-032

#### Trigger
User wants to archive a backtest to hide it from default list, or restore a previously archived backtest

#### Actor
Authenticated User (owner of the backtest)

#### Preconditions
- User is authenticated
- User owns the backtest
- Backtest exists and is not deleted (deleted_at IS NULL)

#### Overview

This process supports two operations:
1. **Archive** - Hide backtest from default list (can be restored)
2. **Restore** - Un-archive a previously archived backtest

**Archive vs Delete:**
- `archived_at` - User hides from default list, can restore. Still accessible via filter.
- `deleted_at` - Soft delete, not shown anywhere. Kept for audit trail only.

**Note:** Archived/deleted backtests still count toward user's quota because they were executed.

---

## 1. Archive Backtest

#### Inputs

**API Endpoint:** `POST /api/v1/backtests/{id}/archive`

**Path Parameters:**
- `{id}`: Backtest UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/{id}/archive` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates backtest exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, group_id, status, archived_at, deleted_at
   FROM backtests
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest not found" (treat deleted as not existing)
   - If archived_at IS NOT NULL → Return 409 "Backtest is already archived"
4. **Backtesting Repository archives backtest**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET archived_at = NOW()
   WHERE id = $1
   RETURNING id, archived_at;
   ```
5. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "archivedAt": "2024-12-16T12:00:00Z",
    "message": "Backtest archived successfully. You can restore it from the archived list."
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (404 - Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "BACKTEST_NOT_FOUND",
    "message": "Backtest not found",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (409 - Already Archived):**
```json
{
  "success": false,
  "error": {
    "code": "ALREADY_ARCHIVED",
    "message": "Backtest is already archived",
    "details": {
      "archivedAt": "2024-12-15T10:00:00Z"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 2. Restore Backtest

#### Inputs

**API Endpoint:** `POST /api/v1/backtests/{id}/restore`

**Path Parameters:**
- `{id}`: Backtest UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/{id}/restore` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates backtest exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, group_id, status, archived_at, deleted_at
   FROM backtests
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest not found" (cannot restore deleted)
   - If archived_at IS NULL → Return 409 "Backtest is not archived"
4. **Backtesting Repository restores backtest**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET archived_at = NULL
   WHERE id = $1
   RETURNING id;
   ```
5. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "message": "Backtest restored successfully. It is now visible in your backtest list."
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (409 - Not Archived):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_ARCHIVED",
    "message": "Backtest is not archived",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 3. Soft Delete Backtest

#### Inputs

**API Endpoint:** `DELETE /api/v1/backtests/{id}`

**Path Parameters:**
- `{id}`: Backtest UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/{id}` (DELETE)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates backtest exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, group_id, deleted_at
   FROM backtests
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest not found" (already deleted)
4. **Backtesting Repository soft deletes backtest**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET deleted_at = NOW(),
       archived_at = COALESCE(archived_at, NOW())  -- Also archive if not already
   WHERE id = $1
   RETURNING id, deleted_at;
   ```
5. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "deletedAt": "2024-12-16T12:00:00Z",
    "message": "Backtest deleted successfully. This action cannot be undone by the user."
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria

**Archive:**
- Backtest archived_at set to current timestamp
- Backtest hidden from default list queries
- HTTP 200 OK

**Restore:**
- Backtest archived_at set to NULL
- Backtest visible in default list queries
- HTTP 200 OK

**Delete:**
- Backtest deleted_at set to current timestamp
- Backtest not visible anywhere (except admin audit)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Backtest not found | 404 | Return "Backtest not found" |
| Not owner | 403 | Return "Access denied" |
| Already archived (archive) | 409 | Return "Backtest is already archived" |
| Not archived (restore) | 409 | Return "Backtest is not archived" |
| Already deleted | 404 | Return "Backtest not found" (treat as non-existent) |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Archive/Restore/Delete**: P95 < 100ms (single UPDATE query)
- **Indexes Used**:
  - `backtests.id` (primary key)
  - `(user_id, archived_at)` - for filtering archived backtests

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtests`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

#### Notes

**Quota Implications:**
- Archived backtests still count toward user's monthly quota
- Deleted backtests still count toward user's monthly quota
- Rationale: The backtest was executed and consumed compute resources

**Group Backtests:**
- Individual backtests within a group can be archived separately
- Archiving a group does NOT automatically archive its backtests (handled in PROC-BACKTEST-016)
- Restoring a group does NOT automatically restore its backtests

**Data Retention:**
- Archived backtests: Kept indefinitely (user can restore)
- Deleted backtests: Kept for audit trail (90 days recommended, then hard delete via cleanup job)

**UI Considerations:**
- Default list view: `WHERE archived_at IS NULL AND deleted_at IS NULL`
- Archived list view: `WHERE archived_at IS NOT NULL AND deleted_at IS NULL`
- Deleted items: Not shown to users (admin/audit only)

**Related Processes:**
- PROC-BACKTEST-005: List User Backtests (filter by archived status)
- PROC-BACKTEST-015: Archive/Restore Backtest Group
- PROC-BACKTEST-006: Get Backtest Details (include archived_at in response)

---


---

## PROC-BACKTEST-015: Archive/Restore Backtest Group

**Source File:** `PROC-BACKTEST-015.md`  
**Path:** `processes\backtesting-service\PROC-BACKTEST-015.md`

### PROC-BACKTEST-015: Archive/Restore Backtest Group

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-029, ADR-032

#### Trigger
User wants to archive a backtest group to hide it from default list, or restore a previously archived group

#### Actor
Authenticated User (owner of the backtest group)

#### Preconditions
- User is authenticated
- User owns the backtest group
- Group exists and is not deleted (deleted_at IS NULL)

#### Overview

This process supports two operations:
1. **Archive** - Hide backtest group from default list (can be restored)
2. **Restore** - Un-archive a previously archived backtest group

**Archive vs Delete:**
- `archived_at` - User hides from default list, can restore. Still accessible via filter.
- `deleted_at` - Soft delete, not shown anywhere. Kept for audit trail only.

**Cascade Behavior:**
- Archiving a group automatically archives all its backtests
- Restoring a group automatically restores all its backtests
- Deleting a group automatically deletes all its backtests

**Note:** Archived/deleted groups still count toward user's quota because they were executed.

---

## 1. Archive Backtest Group

#### Inputs

**API Endpoint:** `POST /api/v1/backtests/groups/{id}/archive`

**Path Parameters:**
- `{id}`: Backtest Group UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/groups/{id}/archive` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates group exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, status, symbol_count, archived_at, deleted_at
   FROM backtest_groups
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest group not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest group not found" (treat deleted as not existing)
   - If archived_at IS NOT NULL → Return 409 "Backtest group is already archived"
4. **Backtesting Repository begins transaction**
5. **Backtesting Repository archives the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtest_groups
   SET archived_at = NOW()
   WHERE id = $1
   RETURNING id, archived_at;
   ```
6. **Backtesting Repository archives all backtests in the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET archived_at = NOW()
   WHERE group_id = $1
     AND archived_at IS NULL
     AND deleted_at IS NULL
   RETURNING id;
   ```
7. **Commit transaction**
8. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "archivedAt": "2024-12-16T12:00:00Z",
    "backtestsArchived": 5,
    "message": "Backtest group and 5 backtests archived successfully. You can restore it from the archived list."
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (404 - Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "BACKTEST_GROUP_NOT_FOUND",
    "message": "Backtest group not found",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (409 - Already Archived):**
```json
{
  "success": false,
  "error": {
    "code": "ALREADY_ARCHIVED",
    "message": "Backtest group is already archived",
    "details": {
      "archivedAt": "2024-12-15T10:00:00Z"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 2. Restore Backtest Group

#### Inputs

**API Endpoint:** `POST /api/v1/backtests/groups/{id}/restore`

**Path Parameters:**
- `{id}`: Backtest Group UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/groups/{id}/restore` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates group exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, status, symbol_count, archived_at, deleted_at
   FROM backtest_groups
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest group not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest group not found" (cannot restore deleted)
   - If archived_at IS NULL → Return 409 "Backtest group is not archived"
4. **Backtesting Repository begins transaction**
5. **Backtesting Repository restores the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtest_groups
   SET archived_at = NULL
   WHERE id = $1
   RETURNING id;
   ```
6. **Backtesting Repository restores all backtests in the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   -- Only restore backtests that are not individually deleted
   UPDATE backtests
   SET archived_at = NULL
   WHERE group_id = $1
     AND deleted_at IS NULL
   RETURNING id;
   ```
7. **Commit transaction**
8. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "backtestsRestored": 5,
    "message": "Backtest group and 5 backtests restored successfully. They are now visible in your list."
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (409 - Not Archived):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_ARCHIVED",
    "message": "Backtest group is not archived",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 3. Soft Delete Backtest Group

#### Inputs

**API Endpoint:** `DELETE /api/v1/backtests/groups/{id}`

**Path Parameters:**
- `{id}`: Backtest Group UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/backtests/groups/{id}` (DELETE)
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates group exists and ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, deleted_at
   FROM backtest_groups
   WHERE id = $1;
   ```
   - If not found → Return 404 "Backtest group not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Backtest group not found" (already deleted)
4. **Backtesting Repository begins transaction**
5. **Backtesting Repository soft deletes the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtest_groups
   SET deleted_at = NOW(),
       archived_at = COALESCE(archived_at, NOW())  -- Also archive if not already
   WHERE id = $1
   RETURNING id, deleted_at;
   ```
6. **Backtesting Repository soft deletes all backtests in the group**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET deleted_at = NOW(),
       archived_at = COALESCE(archived_at, NOW())
   WHERE group_id = $1
     AND deleted_at IS NULL
   RETURNING id;
   ```
7. **Commit transaction**
8. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "deletedAt": "2024-12-16T12:00:00Z",
    "backtestsDeleted": 5,
    "message": "Backtest group and 5 backtests deleted successfully. This action cannot be undone by the user."
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria

**Archive:**
- Group archived_at set to current timestamp
- All non-deleted backtests in group archived
- Group hidden from default list queries
- HTTP 200 OK

**Restore:**
- Group archived_at set to NULL
- All non-deleted backtests in group restored
- Group visible in default list queries
- HTTP 200 OK

**Delete:**
- Group deleted_at set to current timestamp
- All backtests in group soft deleted
- Group not visible anywhere (except admin audit)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Group not found | 404 | Return "Backtest group not found" |
| Not owner | 403 | Return "Access denied" |
| Already archived (archive) | 409 | Return "Backtest group is already archived" |
| Not archived (restore) | 409 | Return "Backtest group is not archived" |
| Already deleted | 404 | Return "Backtest group not found" (treat as non-existent) |
| Database error | 500 | Rollback transaction, log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Archive/Restore/Delete**: P95 < 200ms (transaction with 2 UPDATE queries)
- **Indexes Used**:
  - `backtest_groups.id` (primary key)
  - `(user_id, archived_at)` - for filtering archived groups
  - `backtests.group_id` - for cascade operations

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtest_groups`, `backtests`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

#### Notes

**Cascade Behavior Explained:**

| Operation | Group | Backtests in Group |
|-----------|-------|-------------------|
| Archive Group | archived_at = NOW() | All non-deleted backtests archived |
| Restore Group | archived_at = NULL | All non-deleted backtests restored |
| Delete Group | deleted_at = NOW() | All non-deleted backtests deleted |

**Edge Cases:**
- If a backtest was individually deleted before the group, it stays deleted
- If a backtest was individually archived before the group archive, it gets the same archived_at timestamp
- When restoring a group, only backtests that are not individually deleted are restored

**Quota Implications:**
- Archived groups still count toward user's monthly quota
- Deleted groups still count toward user's monthly quota
- Rationale: The backtests were executed and consumed compute resources

**Data Retention:**
- Archived groups: Kept indefinitely (user can restore)
- Deleted groups: Kept for audit trail (90 days recommended, then hard delete via cleanup job)

**UI Considerations:**
- Default list view: `WHERE archived_at IS NULL AND deleted_at IS NULL`
- Archived list view: `WHERE archived_at IS NOT NULL AND deleted_at IS NULL`
- Deleted items: Not shown to users (admin/audit only)

**Running Groups:**
- Groups with status `running` or `queued` can be archived
- Archiving does NOT cancel running backtests
- Use PROC-BACKTEST-003 (Cancel Backtest) to stop running backtests first if needed

**Related Processes:**
- PROC-BACKTEST-013: List Backtest Groups (filter by archived status)
- PROC-BACKTEST-014: Archive/Restore Individual Backtest
- PROC-BACKTEST-010: Get Backtest Group Status (include archived_at in response)
- PROC-BACKTEST-003: Cancel Backtest (to stop running before archive)

---


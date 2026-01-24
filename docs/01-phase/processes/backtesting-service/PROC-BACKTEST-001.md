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

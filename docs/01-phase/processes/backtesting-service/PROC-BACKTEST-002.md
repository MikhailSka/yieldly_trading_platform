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

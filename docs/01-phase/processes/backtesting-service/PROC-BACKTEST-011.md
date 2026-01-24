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

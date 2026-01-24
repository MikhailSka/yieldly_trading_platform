### PROC-PORTFOLIO-013: Calculate Daily Risk Metrics (Scheduled)

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
Scheduled background job (daily at 06:00 UTC)

#### Actor
System (Scheduler)

#### Preconditions
- Portfolio snapshots exist for users
- At least 7 days of snapshot data recommended for meaningful metrics

#### Process Steps

1. **Scheduled Job triggers daily at 06:00 UTC**
2. **Risk Metrics Scheduler queries users with sufficient snapshot data**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT DISTINCT user_id
   FROM portfolio_snapshots
   WHERE snapshot_timestamp >= NOW() - INTERVAL '90 days'
     AND status IN ('complete', 'partial')
   GROUP BY user_id
   HAVING COUNT(*) >= 168;  -- At least 7 days of hourly snapshots
   ```
3. **For each user, calculate risk metrics (batch processing)**
4. **Risk Analyzer fetches portfolio snapshots**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     snapshot_timestamp,
     total_value_usd
   FROM portfolio_snapshots
   WHERE user_id = $1
     AND snapshot_timestamp >= NOW() - INTERVAL '90 days'
     AND status IN ('complete', 'partial')
   ORDER BY snapshot_timestamp ASC;
   ```
5. **Risk Analyzer aggregates to daily values**
   ```go
   func aggregateToDailyValues(snapshots []Snapshot) []DailyValue {
     dailyMap := make(map[string]float64)
     for _, s := range snapshots {
       dateKey := s.Timestamp.Format("2006-01-02")
       // Use end-of-day value (last snapshot of the day)
       dailyMap[dateKey] = s.TotalValueUSD
     }
     // Convert map to sorted slice
     return sortedDailyValues(dailyMap)
   }
   ```
6. **Risk Analyzer calculates daily returns**
   ```go
   func calculateDailyReturns(dailyValues []DailyValue) []float64 {
     returns := make([]float64, len(dailyValues)-1)
     for i := 1; i < len(dailyValues); i++ {
       returns[i-1] = (dailyValues[i].Value - dailyValues[i-1].Value) / dailyValues[i-1].Value
     }
     return returns
   }
   ```
7. **Risk Analyzer calculates drawdown metrics**
   ```go
   func calculateDrawdown(dailyValues []DailyValue) DrawdownResult {
     peak := dailyValues[0].Value
     peakTimestamp := dailyValues[0].Date
     maxDrawdown := 0.0
     valleyValue := dailyValues[0].Value
     valleyTimestamp := dailyValues[0].Date

     for _, dv := range dailyValues {
       if dv.Value > peak {
         peak = dv.Value
         peakTimestamp = dv.Date
       }
       drawdown := (peak - dv.Value) / peak
       if drawdown > maxDrawdown {
         maxDrawdown = drawdown
         valleyValue = dv.Value
         valleyTimestamp = dv.Date
       }
     }

     currentDrawdown := (peak - dailyValues[len(dailyValues)-1].Value) / peak

     return DrawdownResult{
       MaxDrawdown:      maxDrawdown * 100,
       CurrentDrawdown:  currentDrawdown * 100,
       PeakValue:        peak,
       PeakTimestamp:    peakTimestamp,
       ValleyValue:      valleyValue,
       ValleyTimestamp:  valleyTimestamp,
     }
   }
   ```
8. **Risk Analyzer calculates volatility**
   ```go
   func calculateVolatility(returns []float64) float64 {
     if len(returns) < 2 {
       return 0
     }
     mean := average(returns)
     variance := 0.0
     for _, r := range returns {
       variance += (r - mean) * (r - mean)
     }
     variance /= float64(len(returns) - 1)
     dailyVol := math.Sqrt(variance)
     // Annualize: multiply by sqrt(365) for crypto
     annualizedVol := dailyVol * math.Sqrt(365)
     return annualizedVol * 100
   }
   ```
9. **Risk Analyzer calculates Sharpe Ratio**
   ```go
   func calculateSharpeRatio(returns []float64, riskFreeRate float64) float64 {
     if len(returns) < 2 {
       return 0
     }
     // Annualized mean return
     meanDailyReturn := average(returns)
     annualizedReturn := meanDailyReturn * 365 * 100 // As percentage

     // Annualized volatility
     volatility := calculateVolatility(returns)

     if volatility == 0 {
       return 0
     }

     // Sharpe = (Return - RiskFreeRate) / Volatility
     sharpe := (annualizedReturn - riskFreeRate) / volatility
     return sharpe
   }
   // Using 5% annual risk-free rate
   ```
10. **Risk Analyzer finds best/worst day**
    ```go
    func findExtremes(dailyValues []DailyValue) (best DayReturn, worst DayReturn) {
      bestReturn := math.Inf(-1)
      worstReturn := math.Inf(1)

      for i := 1; i < len(dailyValues); i++ {
        dailyReturn := (dailyValues[i].Value - dailyValues[i-1].Value) / dailyValues[i-1].Value * 100
        if dailyReturn > bestReturn {
          bestReturn = dailyReturn
          best = DayReturn{Return: dailyReturn, Date: dailyValues[i].Date}
        }
        if dailyReturn < worstReturn {
          worstReturn = dailyReturn
          worst = DayReturn{Return: worstReturn, Date: dailyValues[i].Date}
        }
      }
      return best, worst
    }
    ```
11. **Store calculated metrics in cache table**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    INSERT INTO risk_metrics_cache (
      user_id,
      max_drawdown, current_drawdown,
      peak_value_usd, peak_timestamp,
      valley_value_usd, valley_timestamp,
      volatility, sharpe_ratio,
      best_day_return, best_day_timestamp,
      worst_day_return, worst_day_timestamp,
      calculated_at, calculation_period_days
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14)
    ON CONFLICT (user_id)
    DO UPDATE SET
      max_drawdown = EXCLUDED.max_drawdown,
      current_drawdown = EXCLUDED.current_drawdown,
      peak_value_usd = EXCLUDED.peak_value_usd,
      peak_timestamp = EXCLUDED.peak_timestamp,
      valley_value_usd = EXCLUDED.valley_value_usd,
      valley_timestamp = EXCLUDED.valley_timestamp,
      volatility = EXCLUDED.volatility,
      sharpe_ratio = EXCLUDED.sharpe_ratio,
      best_day_return = EXCLUDED.best_day_return,
      best_day_timestamp = EXCLUDED.best_day_timestamp,
      worst_day_return = EXCLUDED.worst_day_return,
      worst_day_timestamp = EXCLUDED.worst_day_timestamp,
      calculated_at = NOW(),
      calculation_period_days = EXCLUDED.calculation_period_days;
    ```
12. **Check alert conditions for each user**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    SELECT
      p.user_id,
      p.enable_drawdown_alerts,
      p.drawdown_alert_threshold,
      r.current_drawdown
    FROM portfolio_alert_preferences p
    JOIN risk_metrics_cache r ON p.user_id = r.user_id
    WHERE p.enable_drawdown_alerts = true
      AND r.current_drawdown >= p.drawdown_alert_threshold;
    ```
13. **Publish drawdown alerts to Service Bus**
    ```json
    {
      "messageId": "uuid",
      "eventType": "portfolio.drawdown.alert",
      "timestamp": "2024-12-17T06:00:00Z",
      "version": "1.0",
      "source": {
        "service": "portfolio-service",
        "instance": "risk-calculator-1"
      },
      "payload": {
        "userId": "uuid",
        "currentDrawdown": 12.5,
        "alertThreshold": 10.0,
        "peakValue": 250000.00,
        "currentValue": 218750.00,
        "peakDate": "2024-11-15T12:00:00Z"
      },
      "metadata": {
        "correlationId": "uuid",
        "userId": "uuid"
      }
    }
    ```
14. **Log job completion**

#### Outputs

**Job Completion Log:**
```json
{
  "jobType": "daily_risk_metrics_calculation",
  "startedAt": "2024-12-17T06:00:00Z",
  "completedAt": "2024-12-17T06:05:32Z",
  "durationMs": 332000,
  "results": {
    "usersProcessed": 1523,
    "usersSkipped": 234,
    "metricsUpdated": 1489,
    "calculationErrors": 34,
    "drawdownAlertsTriggered": 87
  },
  "nextScheduledRun": "2024-12-18T06:00:00Z"
}
```

**Service Bus Message (Drawdown Alert):**
```json
{
  "messageId": "uuid",
  "eventType": "portfolio.drawdown.alert",
  "timestamp": "2024-12-17T06:00:00Z",
  "version": "1.0",
  "source": {
    "service": "portfolio-service",
    "instance": "instance-id"
  },
  "payload": {
    "userId": "uuid",
    "alertType": "drawdown_threshold_exceeded",
    "currentDrawdown": 12.5,
    "alertThreshold": 10.0,
    "portfolioSummary": {
      "peakValue": 250000.00,
      "currentValue": 218750.00,
      "peakDate": "2024-11-15T12:00:00Z"
    }
  },
  "metadata": {
    "correlationId": "uuid",
    "userId": "uuid"
  }
}
```

#### Success Criteria
- Risk metrics calculated for all eligible users
- Metrics cached in database
- Drawdown alerts published for affected users
- Job completion logged

#### Error Scenarios

| Error | Handling |
|-------|----------|
| Insufficient snapshots for user | Skip user, log info |
| Calculation error for user | Log error, continue with other users |
| Database error (read) | Retry with backoff, alert on persistent failure |
| Database error (write) | Log error, continue with other users |
| Service Bus unavailable | Queue alerts for retry |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Target execution time: < 10 minutes for 10,000 users
- Batch processing: 100 users per batch
- Parallelization: Up to 10 concurrent calculations
- Runs daily at 06:00 UTC (off-peak hours)

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_snapshots`, `risk_metrics_cache`, `portfolio_alert_preferences`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Topic: `portfolio.drawdown.alert`

#### Notes

**Calculation Schedule:**
- Runs daily at 06:00 UTC
- Chosen time minimizes overlap with hourly snapshot creation
- Allows users to see fresh metrics each morning

**Metrics Calculation Period:**
- Default: Last 90 days of data
- Minimum: 7 days required
- Maximum: 365 days (for "all time" view, on-demand only)

**Alert Deduplication:**
- Alerts only sent once per 24-hour period
- Tracked via `last_alert_sent_at` in preferences or separate table
- Prevents spam during extended drawdown periods

**Batch Processing:**
- Users processed in batches of 100
- Each batch commits independently
- Failure in one batch doesn't affect others

**Error Resilience:**
- Individual user failures logged but don't stop job
- Critical errors (DB unavailable) trigger job pause
- Automatic retry with exponential backoff

**Monitoring:**
- Job duration tracked
- Error rate monitored
- Alerting if job fails completely

**Related Processes:**
- PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot (data source)
- PROC-PORTFOLIO-007: Get Risk Metrics (serves cached data)
- PROC-PORTFOLIO-012: Manage Portfolio Alert Preferences (alert thresholds)
- PROC-NOTIFY-XXX: Send Notification (handles alert delivery)

---

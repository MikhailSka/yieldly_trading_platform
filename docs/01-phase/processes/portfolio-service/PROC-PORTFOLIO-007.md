### PROC-PORTFOLIO-007: Get Risk Metrics

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views risk metrics on portfolio dashboard

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User has historical portfolio snapshots (minimum 7 days for meaningful metrics)

#### Inputs
**API Endpoint:** `GET /api/v1/portfolio/risk-metrics`

**Query Parameters:**
```
GET /api/v1/portfolio/risk-metrics?
  period={30d|90d|1y|all}
```

**Parameter Details:**
- `period` (string, default: `90d`): Time period for risk calculation

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/risk-metrics` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates period parameter**
   - Valid options: `30d`, `90d`, `1y`, `all`
4. **Risk Analyzer checks cache for calculated metrics**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     max_drawdown,
     current_drawdown,
     peak_value_usd,
     peak_timestamp,
     valley_value_usd,
     valley_timestamp,
     volatility,
     sharpe_ratio,
     best_day_return,
     best_day_timestamp,
     worst_day_return,
     worst_day_timestamp,
     calculated_at,
     calculation_period_days
   FROM risk_metrics_cache
   WHERE user_id = $1;
   ```
   - If cached metrics exist and are fresh (< 24 hours) → Return cached
5. **If cache miss or stale, calculate from snapshots**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     snapshot_timestamp,
     total_value_usd
   FROM portfolio_snapshots
   WHERE user_id = $1
     AND snapshot_timestamp >= $2
     AND status = 'complete'
   ORDER BY snapshot_timestamp ASC;
   ```
6. **Risk Analyzer calculates daily returns**
   ```go
   // Group hourly snapshots into daily values (using end-of-day)
   dailyValues := aggregateToDailyValues(snapshots)

   // Calculate daily returns
   returns := make([]float64, len(dailyValues)-1)
   for i := 1; i < len(dailyValues); i++ {
     returns[i-1] = (dailyValues[i] - dailyValues[i-1]) / dailyValues[i-1]
   }
   ```
7. **Risk Analyzer calculates drawdown metrics**
   ```go
   func calculateDrawdown(values []float64) DrawdownResult {
     peak := values[0]
     maxDrawdown := 0.0
     currentDrawdown := 0.0
     peakDate, valleyDate time.Time

     for i, value := range values {
       if value > peak {
         peak = value
         peakDate = dates[i]
       }
       drawdown := (peak - value) / peak
       if drawdown > maxDrawdown {
         maxDrawdown = drawdown
         valleyDate = dates[i]
       }
       currentDrawdown = drawdown
     }
     return DrawdownResult{
       MaxDrawdown:     maxDrawdown * 100,
       CurrentDrawdown: currentDrawdown * 100,
       PeakValue:       peak,
       PeakDate:        peakDate,
       ValleyValue:     valley,
       ValleyDate:      valleyDate,
     }
   }
   ```
8. **Risk Analyzer calculates volatility (standard deviation of returns)**
   ```go
   func calculateVolatility(returns []float64) float64 {
     mean := average(returns)
     variance := 0.0
     for _, r := range returns {
       variance += (r - mean) * (r - mean)
     }
     variance /= float64(len(returns) - 1)
     dailyVol := math.Sqrt(variance)
     annualizedVol := dailyVol * math.Sqrt(365) // Annualize for crypto (365 days)
     return annualizedVol * 100 // Return as percentage
   }
   ```
9. **Risk Analyzer calculates Sharpe Ratio**
   ```go
   func calculateSharpeRatio(returns []float64, riskFreeRate float64) float64 {
     meanReturn := average(returns) * 365 // Annualized
     volatility := calculateVolatility(returns)
     if volatility == 0 {
       return 0
     }
     sharpe := (meanReturn - riskFreeRate) / volatility
     return sharpe
   }
   // Using 5% annual risk-free rate as benchmark
   ```
10. **Risk Analyzer finds best/worst day returns**
    ```go
    bestDay := max(dailyReturns)
    worstDay := min(dailyReturns)
    ```
11. **Cache calculated metrics**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    INSERT INTO risk_metrics_cache (
      user_id, max_drawdown, current_drawdown,
      peak_value_usd, peak_timestamp, valley_value_usd, valley_timestamp,
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
12. **Return risk metrics**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "period": "90d",
    "calculationPeriodDays": 90,
    "drawdown": {
      "maxDrawdown": 15.25,
      "currentDrawdown": 5.50,
      "peak": {
        "value": 250000.00,
        "timestamp": "2024-11-15T12:00:00Z"
      },
      "valley": {
        "value": 212125.00,
        "timestamp": "2024-11-25T08:00:00Z"
      },
      "recoveryStatus": "recovering",
      "recoveryPercentage": 63.93
    },
    "volatility": {
      "annualized": 45.5,
      "daily": 2.38,
      "interpretation": "high"
    },
    "sharpeRatio": {
      "value": 1.25,
      "riskFreeRate": 5.0,
      "interpretation": "good"
    },
    "extremeDays": {
      "best": {
        "return": 12.5,
        "timestamp": "2024-10-15T00:00:00Z"
      },
      "worst": {
        "return": -8.75,
        "timestamp": "2024-11-25T00:00:00Z"
      }
    },
    "summary": {
      "riskLevel": "moderate-high",
      "description": "Your portfolio shows moderate-high risk with significant volatility. The Sharpe ratio indicates good risk-adjusted returns."
    },
    "calculatedAt": "2024-12-16T06:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - Insufficient Data:**
```json
{
  "success": true,
  "data": {
    "period": "90d",
    "calculationPeriodDays": 5,
    "drawdown": {
      "maxDrawdown": 3.2,
      "currentDrawdown": 1.5,
      "peak": {
        "value": 50000.00,
        "timestamp": "2024-12-14T12:00:00Z"
      }
    },
    "volatility": null,
    "sharpeRatio": null,
    "extremeDays": null,
    "summary": {
      "riskLevel": "insufficient_data",
      "description": "Not enough historical data to calculate complete risk metrics. Metrics will be available after 7+ days of portfolio tracking."
    },
    "dataQuality": {
      "snapshotsAvailable": 120,
      "daysOfData": 5,
      "minimumRequired": 7,
      "optimalRequired": 30
    },
    "calculatedAt": "2024-12-16T06:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - No Data:**
```json
{
  "success": true,
  "data": {
    "period": "90d",
    "calculationPeriodDays": 0,
    "drawdown": null,
    "volatility": null,
    "sharpeRatio": null,
    "extremeDays": null,
    "summary": {
      "riskLevel": "no_data",
      "description": "No portfolio data available. Connect a broker and wait for snapshots to be created."
    },
    "calculatedAt": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid period",
    "details": [
      {
        "field": "period",
        "message": "Must be one of: 30d, 90d, 1y, all",
        "code": "INVALID_PERIOD"
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
- Risk metrics calculated from portfolio snapshots
- Drawdown, volatility, Sharpe ratio calculated
- Results cached for performance
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid period | 400 | Return "Must be one of: 30d, 90d, 1y, all" |
| Insufficient snapshots | 200 | Return partial metrics with warning |
| No snapshots | 200 | Return null metrics with message |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1-2 queries (cache check, snapshots if needed)
- Calculation Time: < 500ms for 90 days of data
- Cache Strategy: Metrics cached for 24 hours
- Recalculated daily by PROC-PORTFOLIO-013

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_snapshots`, `risk_metrics_cache`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

#### Notes

**Risk Metric Definitions:**

| Metric | Definition | Interpretation |
|--------|------------|----------------|
| Max Drawdown | Largest peak-to-trough decline | Lower is better; < 20% is good |
| Current Drawdown | Current decline from peak | 0% = at all-time high |
| Volatility | Annualized standard deviation | < 20% = low, 20-50% = medium, > 50% = high |
| Sharpe Ratio | Risk-adjusted return | < 0 = bad, 0-1 = ok, 1-2 = good, > 2 = excellent |

**Volatility Interpretation:**
- `low`: < 20% annualized
- `medium`: 20-50% annualized
- `high`: > 50% annualized

**Sharpe Ratio Interpretation:**
- `poor`: < 0
- `ok`: 0 - 1
- `good`: 1 - 2
- `excellent`: > 2

**Data Requirements:**
- Minimum: 7 days for basic metrics
- Recommended: 30+ days for reliable volatility/Sharpe
- Optimal: 90+ days for statistically significant metrics

**Calculation Frequency:**
- On-demand: When user requests (with caching)
- Scheduled: Daily recalculation via PROC-PORTFOLIO-013

**Related Processes:**
- PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot (data source)
- PROC-PORTFOLIO-013: Calculate Daily Risk Metrics (scheduled recalculation)
- PROC-PORTFOLIO-003: Generate Portfolio Performance Charts (related visualization)

---

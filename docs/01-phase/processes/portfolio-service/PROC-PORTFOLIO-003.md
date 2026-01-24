### PROC-PORTFOLIO-003: Generate Portfolio Performance Charts

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-007
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views portfolio charts (daily, weekly, monthly)

#### Actor
Authenticated User

#### Preconditions
- Hourly snapshots exist for user

#### Inputs
**API Endpoint:** `GET /api/v1/portfolio/charts`

**Query Parameters:**
```
GET /api/v1/portfolio/charts?
  user_id={uuid}
  &period=7d
```

#### Process Steps

1. **API Gateway receives request**
2. **Portfolio Controller validates period**
   - Valid options: "24h", "7d", "30d", "3m", "1y", "all"
3. **Chart Generator queries snapshots**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT timestamp, total_value_usd
   FROM portfolio_snapshots
   WHERE user_id = $1
   AND timestamp >= NOW() - INTERVAL '{period}'
   ORDER BY timestamp ASC
   ```
4. **Chart Generator calculates data points**
   - For "24h": Use hourly snapshots
   - For "7d": Use hourly snapshots (168 points)
   - For "30d": Downsample to 4-hour intervals
   - For "3m": Downsample to daily
   - For "1y": Downsample to daily
5. **Chart Generator calculates period metrics**
   ```
   startValue = snapshots[0].value
   endValue = snapshots[last].value
   changePct = ((endValue - startValue) / startValue) * 100
   maxValue = max(snapshots.value)
   minValue = min(snapshots.value)
   ```
6. **Return chart data**

#### Outputs
**Success Response (ADR-032):**
```json
{
  "success": true,
  "data": {
    "period": "7d",
    "dataPoints": [
      {"timestamp": "2024-11-24T00:00:00Z", "value": 200000},
      {"timestamp": "2024-11-24T01:00:00Z", "value": 200500}
    ],
    "summary": {
      "startValue": 200000,
      "endValue": 205000,
      "changePct": 2.5,
      "maxValue": 206000,
      "minValue": 198000,
      "maxDrawdownPct": -3.5
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Snapshots retrieved
- Data downsampled if needed
- Summary metrics calculated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| No snapshots found | 200 | Return empty array with message |
| Invalid period | 400 | Return "Invalid period" |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Target P95 latency: < 200ms
- Downsampling reduces data points for longer periods
- Efficient SQL queries using indexed timestamp column

#### Dependencies
**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_snapshots`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

---

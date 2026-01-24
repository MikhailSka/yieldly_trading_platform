### PROC-PORTFOLIO-009: Get Portfolio History

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-007
**Related NFR:** NFR-PERF-001, NFR-PORTFOLIO-002
**Related ADR:** ADR-032

#### Trigger
User views historical portfolio values with custom date range

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User has portfolio snapshots in requested date range

#### Inputs
**API Endpoint:** `GET /api/v1/portfolio/history`

**Query Parameters:**
```
GET /api/v1/portfolio/history?
  start_date={ISO8601}&
  end_date={ISO8601}&
  interval={1h|4h|1d|1w}
```

**Parameter Details:**
- `start_date` (ISO8601, required): Start of date range
- `end_date` (ISO8601, default: now): End of date range
- `interval` (string, default: auto): Data point interval

**Interval Auto-Selection:**
- Range < 3 days → `1h` (hourly)
- Range 3-14 days → `4h` (4-hourly)
- Range 14-90 days → `1d` (daily)
- Range > 90 days → `1w` (weekly)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/history` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates parameters**
   - `start_date` is required and valid ISO8601
   - `end_date` >= `start_date`
   - `interval` is valid enum if provided
   - Return 400 if validation fails
4. **Portfolio Controller determines interval**
   ```go
   if interval == "" {
     interval = autoSelectInterval(startDate, endDate)
   }
   ```
5. **Chart Generator queries portfolio snapshots**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     snapshot_timestamp,
     total_value_usd,
     realized_pnl,
     unrealized_pnl,
     total_pnl,
     asset_count,
     exchange_count,
     status
   FROM portfolio_snapshots
   WHERE user_id = $1
     AND snapshot_timestamp >= $2
     AND snapshot_timestamp <= $3
     AND status IN ('complete', 'partial')
   ORDER BY snapshot_timestamp ASC;
   ```
6. **Chart Generator downsamples data based on interval**
   ```go
   func downsample(snapshots []Snapshot, interval string) []DataPoint {
     buckets := make(map[time.Time][]Snapshot)

     for _, s := range snapshots {
       bucketKey := truncateToInterval(s.Timestamp, interval)
       buckets[bucketKey] = append(buckets[bucketKey], s)
     }

     result := make([]DataPoint, 0, len(buckets))
     for timestamp, bucket := range buckets {
       // Use last value in bucket (end-of-period value)
       last := bucket[len(bucket)-1]
       result = append(result, DataPoint{
         Timestamp:    timestamp,
         Value:        last.TotalValueUSD,
         RealizedPnL:  last.RealizedPnL,
         UnrealizedPnL: last.UnrealizedPnL,
         AssetCount:   last.AssetCount,
       })
     }
     sort.Slice(result, func(i, j int) bool {
       return result[i].Timestamp.Before(result[j].Timestamp)
     })
     return result
   }
   ```
7. **Chart Generator calculates period statistics**
   ```go
   stats := PeriodStats{
     StartValue:      dataPoints[0].Value,
     EndValue:        dataPoints[len(dataPoints)-1].Value,
     MinValue:        min(dataPoints.Values),
     MaxValue:        max(dataPoints.Values),
     AbsoluteChange:  endValue - startValue,
     PercentChange:   ((endValue - startValue) / startValue) * 100,
     DataPointCount:  len(dataPoints),
   }
   ```
8. **Return historical data**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "dateRange": {
      "start": "2024-11-01T00:00:00Z",
      "end": "2024-12-16T12:00:00Z"
    },
    "interval": "1d",
    "dataPoints": [
      {
        "timestamp": "2024-11-01T00:00:00Z",
        "value": 150000.00,
        "realizedPnl": 2500.00,
        "unrealizedPnl": 8000.00,
        "assetCount": 5,
        "exchangeCount": 2
      },
      {
        "timestamp": "2024-11-02T00:00:00Z",
        "value": 152500.00,
        "realizedPnl": 2500.00,
        "unrealizedPnl": 10000.00,
        "assetCount": 5,
        "exchangeCount": 2
      },
      {
        "timestamp": "2024-11-03T00:00:00Z",
        "value": 148000.00,
        "realizedPnl": 2500.00,
        "unrealizedPnl": 5500.00,
        "assetCount": 5,
        "exchangeCount": 2
      }
    ],
    "statistics": {
      "startValue": 150000.00,
      "endValue": 200000.50,
      "minValue": 142000.00,
      "maxValue": 210000.00,
      "absoluteChange": 50000.50,
      "percentChange": 33.33,
      "dataPointCount": 46
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "intervalSelected": "1d",
    "intervalAutoSelected": true
  }
}
```

**Success Response (200 OK) - Hourly Granularity:**
```json
{
  "success": true,
  "data": {
    "dateRange": {
      "start": "2024-12-15T00:00:00Z",
      "end": "2024-12-16T12:00:00Z"
    },
    "interval": "1h",
    "dataPoints": [
      {
        "timestamp": "2024-12-15T00:00:00Z",
        "value": 198500.00,
        "realizedPnl": 5000.00,
        "unrealizedPnl": 12000.00
      },
      {
        "timestamp": "2024-12-15T01:00:00Z",
        "value": 199000.00,
        "realizedPnl": 5000.00,
        "unrealizedPnl": 12500.00
      }
    ],
    "statistics": {
      "startValue": 198500.00,
      "endValue": 200000.50,
      "minValue": 197000.00,
      "maxValue": 201500.00,
      "absoluteChange": 1500.50,
      "percentChange": 0.76,
      "dataPointCount": 36
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "intervalSelected": "1h",
    "intervalAutoSelected": false
  }
}
```

**Success Response (200 OK) - Partial Data:**
```json
{
  "success": true,
  "data": {
    "dateRange": {
      "start": "2024-10-01T00:00:00Z",
      "end": "2024-12-16T12:00:00Z"
    },
    "interval": "1d",
    "dataPoints": [...],
    "statistics": {
      "startValue": 150000.00,
      "endValue": 200000.50,
      "dataPointCount": 45
    },
    "gaps": [
      {
        "start": "2024-10-15T00:00:00Z",
        "end": "2024-10-18T00:00:00Z",
        "reason": "No snapshots recorded"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "hasGaps": true
  }
}
```

**Success Response (200 OK) - No Data:**
```json
{
  "success": true,
  "data": {
    "dateRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-03-01T00:00:00Z"
    },
    "interval": "1d",
    "dataPoints": [],
    "statistics": null,
    "message": "No portfolio history found for this date range. Portfolio tracking started on 2024-06-15."
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "earliestSnapshot": "2024-06-15T10:00:00Z"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid date range",
    "details": [
      {
        "field": "start_date",
        "message": "Start date is required",
        "code": "REQUIRED_FIELD"
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

**Error Response (400 Bad Request - Range Too Large):**
```json
{
  "success": false,
  "error": {
    "code": "RANGE_TOO_LARGE",
    "message": "Date range too large",
    "details": {
      "maxRangeDays": 730,
      "requestedRangeDays": 1095,
      "hint": "Maximum date range is 2 years"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Historical data retrieved for date range
- Data downsampled to requested interval
- Period statistics calculated
- Data gaps identified if present
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Missing start_date | 400 | Return "Start date is required" |
| Invalid date format | 400 | Return "Invalid date format. Use ISO8601" |
| End before start | 400 | Return "End date must be after start date" |
| Range > 2 years | 400 | Return "Maximum date range is 2 years" |
| Invalid interval | 400 | Return "Invalid interval" |
| No data in range | 200 | Return empty with earliest snapshot info |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-PORTFOLIO-002**: Portfolio Snapshot Storage and Performance

**Process-Specific Notes:**
- Database Queries: 1 query
- Target P95 latency: < 300ms (with appropriate indexing)
- Maximum data points returned: 1000 (auto-downsampled if exceeded)
- Index on `(user_id, snapshot_timestamp)` is critical

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_snapshots`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

#### Notes

**Interval Selection:**
| Date Range | Auto Interval | Max Data Points |
|------------|---------------|-----------------|
| < 3 days | 1h (hourly) | ~72 |
| 3-14 days | 4h (4-hourly) | ~84 |
| 14-90 days | 1d (daily) | ~90 |
| > 90 days | 1w (weekly) | ~104 |

**Data Point Limit:**
- Maximum 1000 data points per request
- If more, auto-downsample to stay under limit
- Frontend can request specific interval if needed

**Gap Detection:**
- Gaps occur when snapshots are missing (service downtime, etc.)
- Gaps > 4 hours at hourly interval are reported
- Gaps > 1 day at daily interval are reported

**Use Cases:**
1. User viewing equity curve chart
2. User analyzing performance over specific period
3. User comparing current value to historical highs
4. Exporting historical data

**Related Processes:**
- PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot (creates the data)
- PROC-PORTFOLIO-003: Generate Portfolio Performance Charts (uses same data, different format)
- PROC-PORTFOLIO-007: Get Risk Metrics (uses snapshot data)

---

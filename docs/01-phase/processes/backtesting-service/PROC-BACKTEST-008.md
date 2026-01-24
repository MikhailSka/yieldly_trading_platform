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

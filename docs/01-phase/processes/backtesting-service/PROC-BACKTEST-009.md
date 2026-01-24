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

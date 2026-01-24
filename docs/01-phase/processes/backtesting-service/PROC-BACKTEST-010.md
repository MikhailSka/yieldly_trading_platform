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

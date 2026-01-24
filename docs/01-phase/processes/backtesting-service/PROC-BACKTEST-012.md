### PROC-BACKTEST-012: Cancel Backtest Group

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User clicks "Cancel" button on a running backtest group

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User owns the backtest group
- Backtest group exists
- Group status is 'queued' or 'running'

#### Inputs
**API Endpoint:** `POST /api/v1/backtests/groups/{groupId}/cancel`

**Path Parameters:**
- `groupId` (uuid, required): The backtest group ID to cancel

**Request Body:** (optional)
```json
{
  "reason": "Changed my mind about testing this strategy"
}
```

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service `/api/v1/backtests/groups/{groupId}/cancel`
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates path parameter**
   - Validate `groupId` is valid UUID format
   - Return 400 if invalid
4. **Backtest Controller validates ownership and status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT
     g.id,
     g.user_id,
     g.status,
     g.symbol_count,
     g.backtests_completed,
     g.backtests_failed
   FROM backtest_groups g
   WHERE g.id = $1
   ```
   - If not found → Return 404 "Backtest group not found"
   - If `user_id != current_user_id` → Return 403 "Access denied"
   - If `status` not in ('queued', 'running') → Return 400 "Group cannot be cancelled (already {status})"
5. **Backtest Controller fetches all cancellable backtests**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, status
   FROM backtests
   WHERE group_id = $1
     AND status IN ('queued', 'running')
   ```
6. **For each cancellable backtest:**
   - **If status is 'queued':**
     ```sql
     -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
     UPDATE backtests
     SET status = 'cancelled',
         completed_at = NOW()
     WHERE id = $1 AND status = 'queued'
     ```
   - **If status is 'running':**
     - Publish cancellation message to Azure Service Bus
     - Topic: `backtest.commands`
     - Message (ADR-032 format):
       ```json
       {
         "messageId": "uuid",
         "eventType": "backtest.execution.cancel",
         "timestamp": "2024-12-01T10:00:00Z",
         "version": "1.0",
         "source": {
           "service": "backtesting-service",
           "instance": "instance-id"
         },
         "payload": {
           "backtestId": "uuid",
           "groupId": "uuid",
           "reason": "User requested cancellation"
         },
         "metadata": {
           "correlationId": "uuid",
           "causationId": "uuid",
           "userId": "uuid"
         }
       }
       ```
     - Update backtest status:
       ```sql
       -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
       UPDATE backtests
       SET status = 'cancelled',
           completed_at = NOW()
       WHERE id = $1 AND status = 'running'
       ```
7. **Log cancellation events for each backtest**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   INSERT INTO backtest_events (
     backtest_id, event_type, event_timestamp, event_message, event_data
   ) VALUES (
     $1, 'cancelled', NOW(), 'Cancelled as part of group cancellation',
     '{"groupId": "uuid", "reason": "User requested cancellation"}'
   )
   ```
8. **Update group status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtest_groups
   SET status = 'cancelled',
       completed_at = NOW()
   WHERE id = $1
   ```
9. **Return cancellation response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "status": "cancelled",
    "cancelledAt": "2024-12-01T10:01:00Z",
    "summary": {
      "totalBacktests": 5,
      "alreadyCompleted": 2,
      "cancelled": 3,
      "alreadyFailed": 0
    },
    "backtests": [
      {
        "backtestId": "uuid-1",
        "symbol": "BTCUSDT",
        "previousStatus": "completed",
        "currentStatus": "completed",
        "action": "none"
      },
      {
        "backtestId": "uuid-2",
        "symbol": "ETHUSDT",
        "previousStatus": "completed",
        "currentStatus": "completed",
        "action": "none"
      },
      {
        "backtestId": "uuid-3",
        "symbol": "SOLUSDT",
        "previousStatus": "running",
        "currentStatus": "cancelled",
        "action": "cancelled"
      },
      {
        "backtestId": "uuid-4",
        "symbol": "BNBUSDT",
        "previousStatus": "running",
        "currentStatus": "cancelled",
        "action": "cancelled"
      },
      {
        "backtestId": "uuid-5",
        "symbol": "XRPUSDT",
        "previousStatus": "queued",
        "currentStatus": "cancelled",
        "action": "cancelled"
      }
    ],
    "message": "Group cancelled. 2 backtests had already completed and their results are available."
  },
  "meta": {
    "timestamp": "2024-12-01T10:01:00Z",
    "version": "v1"
  }
}
```

**Success Response - All Already Completed (200 OK):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "status": "completed",
    "summary": {
      "totalBacktests": 5,
      "alreadyCompleted": 5,
      "cancelled": 0,
      "alreadyFailed": 0
    },
    "message": "No backtests were cancelled. All had already completed."
  },
  "meta": {
    "timestamp": "2024-12-01T10:01:00Z",
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

**Error Response (400 Bad Request - Already Terminal):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "Group cannot be cancelled",
    "details": {
      "currentStatus": "completed",
      "allowedStatuses": ["queued", "running"]
    }
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
- All queued backtests marked as cancelled
- Cancellation messages sent for running backtests
- Running backtests marked as cancelled
- Cancellation events logged
- Group status updated to 'cancelled'
- Previously completed backtests remain unchanged
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid group ID format | 400 | Return "Invalid group ID format" |
| Group not found | 404 | Return "Backtest group not found" |
| Not group owner | 403 | Return "Access denied" |
| Group already completed | 400 | Return "Group cannot be cancelled (already completed)" |
| Group already cancelled | 400 | Return "Group cannot be cancelled (already cancelled)" |
| Database error | 500 | Log error, return generic message |
| Message queue error | 500 | Log error, continue with DB updates, return partial success |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 4-6 queries (group lookup, backtest lookup, updates, event inserts)
- **Message Publishing**: 0-10 messages (one per running backtest)
- **Expected Execution Time**: < 500ms
- **Transaction**: All database updates should be in a single transaction

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtest_groups`, `backtests`, `backtest_events`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Topic: `backtest.commands`

#### Notes

**Cancellation Behavior:**
- Completed backtests are NOT affected - results remain available
- Failed backtests are NOT affected
- Only queued and running backtests are cancelled
- Quota is NOT refunded for cancelled backtests

**Job Consumer Handling:**
- Job consumers should check for cancellation signals periodically
- If cancellation received, stop execution gracefully
- Save partial results if available (optional)

**Race Conditions:**
- A backtest may complete between status check and cancellation
- This is acceptable - the backtest completes successfully
- Response accurately reflects what actually happened

**Related Processes:**
- PROC-BACKTEST-007: Cancel Running Backtest (individual backtest cancellation)
- PROC-BACKTEST-010: Get Backtest Group Status (check status before/after cancel)
- PROC-BACKTEST-011: Get Backtest Group Results (view partial results)

---

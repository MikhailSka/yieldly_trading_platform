### PROC-BACKTEST-007: Cancel Running Backtest

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-019, ADR-032

#### Trigger
User clicks "Cancel" button on a queued or running backtest

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User owns the backtest
- Backtest status is 'queued' or 'running'

#### Inputs
**API Endpoint:** `POST /api/v1/backtests/{backtestId}/cancel`

**Path Parameters:**
- `backtestId` (uuid, required): The backtest ID to cancel

**Request Body:**
```json
{
  "reason": "string (optional, max 500 chars, user-provided cancellation reason)"
}
```

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service `/api/v1/backtests/{backtestId}/cancel`
2. **API Gateway validates JWT** → Extracts user_id
3. **Backtest Controller validates path parameter**
   - Validate `backtestId` is valid UUID format
   - Return 400 if invalid
4. **Backtest Controller validates ownership and status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   SELECT id, user_id, status
   FROM backtests
   WHERE id = $1
   ```
   - If not found → Return 404 "Backtest not found"
   - If `user_id != current_user_id` → Return 403 "Access denied"
   - If `status NOT IN ('queued', 'running')` → Return 400 "Backtest cannot be cancelled"
5. **Backtest Controller updates backtest status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   UPDATE backtests
   SET status = 'cancelled',
       completed_at = NOW(),
       error_message = COALESCE($2, 'Cancelled by user')
   WHERE id = $1
     AND status IN ('queued', 'running')
   RETURNING id, status
   ```
   - If no rows updated → Status changed concurrently, return 409
6. **Backtest Controller records cancellation event**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/backtest_db_schema.dbml
   INSERT INTO backtest_events (
     backtest_id, event_type, event_timestamp, event_message, event_data
   ) VALUES (
     $1, 'cancelled', NOW(), 'Backtest cancelled by user',
     '{"cancelledBy": "user_id", "reason": "optional_reason"}'::jsonb
   )
   ```
7. **Backtest Controller publishes cancellation message to Service Bus**
   - Topic: `backtest.jobs.cancel`
   - Message (ADR-032 format):
   ```json
   {
     "messageId": "uuid",
     "eventType": "backtest.execution.cancelled",
     "timestamp": "2024-12-01T12:00:00Z",
     "version": "1.0",
     "source": {
       "service": "backtesting-service",
       "instance": "instance-id"
     },
     "payload": {
       "backtestId": "uuid",
       "userId": "uuid",
       "reason": "Cancelled by user",
       "previousStatus": "running"
     },
     "metadata": {
       "correlationId": "uuid",
       "causationId": "uuid",
       "userId": "uuid"
     }
   }
   ```
8. **Job Consumer receives cancellation message** (async)
   - If job is currently processing, interrupt execution
   - Clean up any partial results
   - Release resources
9. **Return success response**

#### Outputs

**Success Response (200 OK) - ADR-032 Format:**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "status": "cancelled",
    "message": "Backtest cancelled successfully",
    "cancelledAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request - Cannot Cancel):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "Backtest cannot be cancelled",
    "details": [
      {
        "field": "status",
        "message": "Only queued or running backtests can be cancelled. Current status: completed",
        "code": "INVALID_STATUS_TRANSITION"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (409 Conflict - Concurrent Modification):**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Backtest status changed during cancellation",
    "details": [
      {
        "field": "status",
        "message": "The backtest status was modified by another process. Please refresh and try again.",
        "code": "CONCURRENT_MODIFICATION"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Backtest status updated to 'cancelled'
- Cancellation event recorded in backtest_events
- Cancellation message published to Service Bus
- Running job interrupted (if applicable)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid backtest ID format | 400 | Return "Invalid backtest ID format" |
| Backtest not found | 404 | Return "Backtest not found" |
| Not backtest owner | 403 | Return "Access denied" |
| Backtest already completed | 400 | Return "Backtest cannot be cancelled. Status: completed" |
| Backtest already failed | 400 | Return "Backtest cannot be cancelled. Status: failed" |
| Backtest already cancelled | 400 | Return "Backtest is already cancelled" |
| Concurrent status change | 409 | Return "Backtest status changed during cancellation" |
| Service Bus publish error | 200 | Log warning, status still updated (eventual consistency) |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 3 queries (SELECT for validation, UPDATE status, INSERT event)
- **Cache Strategy**: None
- **Expected Execution Time**: < 200ms (excluding async job termination)
- **Async Operations**: Job termination happens asynchronously via Service Bus
- **Idempotency**: Multiple cancel requests for same backtest return success if already cancelled

#### Dependencies

**Database:**
- `backtest_db` (PostgreSQL)
- Tables: `backtests`, `backtest_events`
- Verify schema: docs/01-phase/database-schemas/backtest_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Topic: `backtest.jobs.cancel`

#### Notes

**Cancellation Behavior by Status:**
- **queued**: Remove from queue, mark as cancelled, no partial results
- **running**: Interrupt execution, clean up partial data, mark as cancelled

**Race Condition Handling:**
- Use optimistic locking via WHERE clause in UPDATE
- If UPDATE affects 0 rows, status changed concurrently

**Related Processes:**
- PROC-BACKTEST-001: Run Backtest (creates backtest that can be cancelled)
- PROC-BACKTEST-010: Poll Backtest Status (shows current status including cancelled)

---

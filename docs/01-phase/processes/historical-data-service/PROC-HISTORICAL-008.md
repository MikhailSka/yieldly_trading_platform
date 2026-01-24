### PROC-HISTORICAL-008: Cancel Download Job (Admin)

**Service Owner:** Historical Data Service
**Related FR:** FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-025, ADR-032

#### Trigger
Admin wants to cancel a pending or in-progress download job

#### Actor
Admin User

#### Preconditions
- User is authenticated with admin role
- Valid JWT access token with admin permissions
- Download job exists and is in cancellable state (pending or in_progress)

#### Inputs
**API Endpoint:** `POST /api/v1/admin/historical/jobs/{jobId}/cancel`

**Path Parameters:**
- `{jobId}`: Download Job UUID

**Request Body:** (optional)
```json
{
  "reason": "No longer needed - symbol will be delisted"
}
```

#### Process Steps

1. **API Gateway receives request** → Routes to Historical Data Service `/api/v1/admin/historical/jobs/{jobId}/cancel`
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Historical Data Controller validates job exists and is cancellable**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     dsj.id,
     dsj.broker_connection_id,
     bc.exchange,
     dsj.symbol,
     dsj.timeframe,
     dsj.status,
     dsj.progress_percentage,
     dsj.completed_batches,
     dsj.total_batches,
     dsj.total_records_downloaded,
     dsj.total_records_inserted
   FROM data_sync_jobs dsj
   JOIN broker_connections bc ON dsj.broker_connection_id = bc.id
   WHERE dsj.id = $1;
   ```
   - If not found → Return 404 "Download job not found"
   - If status NOT IN ('pending', 'in_progress') → Return 400 "Job cannot be cancelled (already {status})"
5. **Update job status to cancelled**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   UPDATE data_sync_jobs
   SET status = 'cancelled',
       error_message = COALESCE($2, 'Cancelled by admin'),
       completed_at = NOW(),
       updated_at = NOW()
   WHERE id = $1
   RETURNING *;
   ```
6. **Cancel any pending batches**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   UPDATE data_sync_job_batches
   SET status = 'cancelled',
       error_message = 'Parent job cancelled',
       completed_at = NOW()
   WHERE data_sync_job_id = $1
     AND status IN ('pending', 'in_progress');
   ```
7. **If job was in_progress, send cancellation signal**
   - Publish cancellation message to Azure Service Bus
   - Topic: `historical.download.commands`
   - Message:
     ```json
     {
       "messageId": "uuid",
       "eventType": "download.job.cancel",
       "timestamp": "2024-12-16T12:00:00Z",
       "version": "1.0",
       "source": {
         "service": "historical-data-service",
         "instance": "instance-id"
       },
       "payload": {
         "jobId": "uuid",
         "reason": "Cancelled by admin"
       },
       "metadata": {
         "correlationId": "uuid",
         "causationId": "uuid",
         "userId": "admin-user-id"
       }
     }
     ```
8. **Log admin action** (audit trail)
9. **Return cancellation result**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "exchange": "bybit",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "previousStatus": "in_progress",
    "currentStatus": "cancelled",
    "progressAtCancellation": {
      "percentage": 45.5,
      "completedBatches": 5,
      "totalBatches": 11,
      "recordsDownloaded": 3980,
      "recordsInserted": 3980
    },
    "partialDataInfo": {
      "hasPartialData": true,
      "message": "3980 candles were downloaded before cancellation. This data is available for use.",
      "dateRange": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-05-15T12:00:00Z"
      }
    },
    "cancelledAt": "2024-12-16T12:00:00Z",
    "cancelledBy": "admin-user-id",
    "reason": "No longer needed - symbol will be delisted"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Pending Job (200 OK):**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "exchange": "binance",
    "symbol": "ETHUSDT",
    "timeframe": "4h",
    "previousStatus": "pending",
    "currentStatus": "cancelled",
    "progressAtCancellation": {
      "percentage": 0,
      "completedBatches": 0,
      "totalBatches": 8,
      "recordsDownloaded": 0,
      "recordsInserted": 0
    },
    "partialDataInfo": {
      "hasPartialData": false,
      "message": "Job was cancelled before any data was downloaded."
    },
    "cancelledAt": "2024-12-16T12:00:00Z",
    "cancelledBy": "admin-user-id",
    "reason": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
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
    "message": "Download job not found",
    "details": {
      "jobId": "invalid-uuid"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
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
    "message": "Job cannot be cancelled",
    "details": {
      "currentStatus": "completed",
      "allowedStatuses": ["pending", "in_progress"]
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
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
    "message": "Admin access required",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Job status updated to 'cancelled'
- Pending batches marked as cancelled
- Cancellation signal sent for in-progress jobs
- Admin action logged
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin access required" |
| Job not found | 404 | Return "Download job not found" |
| Already completed | 400 | Return "Job cannot be cancelled (already completed)" |
| Already failed | 400 | Return "Job cannot be cancelled (already failed)" |
| Already cancelled | 400 | Return "Job cannot be cancelled (already cancelled)" |
| Database error | 500 | Log error, return generic message |
| Message queue error | 500 | Log error, continue (job status already updated) |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Expected Execution Time**: < 200ms
- **Message Publishing**: Async - don't wait for consumer acknowledgment
- **Graceful Stop**: Running download workers should check for cancellation periodically

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `data_sync_jobs`, `data_sync_job_batches`, `broker_connections`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Topic: `historical.download.commands`

#### Notes

**Partial Data Handling:**
- When a job is cancelled mid-download, partial data remains in the database
- Partial data is valid and usable for backtesting
- Response includes information about what data was downloaded before cancellation
- Admin can choose to keep partial data or delete it using PROC-HISTORICAL-005

**Worker Cancellation:**
- Download workers poll for cancellation signals periodically
- Worker should stop gracefully after completing current batch
- Data integrity is maintained - no partial batches

**Race Conditions:**
- Job may complete between status check and cancellation
- If job completes during cancellation, status becomes 'completed' not 'cancelled'
- Response accurately reflects final status

**Cancellation vs Retry:**
- Cancelled jobs are NOT automatically retried
- Admin must create a new job to resume downloading
- Consider adding a "resume" feature in future

**Audit Trail:**
- Cancellation reason is stored in `error_message` field
- Admin user ID recorded for accountability
- Timestamp of cancellation recorded

**Use Cases:**
1. Stop unnecessary download (wrong parameters)
2. Free up resources for higher priority downloads
3. Cancel jobs for symbols being delisted
4. Stop downloads during exchange maintenance

**Related Processes:**
- PROC-HISTORICAL-001: Ingest Historical Data (create new download)
- PROC-HISTORICAL-005: Delete Historical Data (Admin) (clean up partial data)
- PROC-HISTORICAL-007: List Download Jobs (Admin) (view job status)
- PROC-BROKER-005: Download Historical Data

---

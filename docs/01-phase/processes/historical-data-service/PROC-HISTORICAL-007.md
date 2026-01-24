### PROC-HISTORICAL-007: List Download Jobs (Admin)

**Service Owner:** Historical Data Service
**Related FR:** FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-025, ADR-032

#### Trigger
Admin navigates to download jobs page to view status of historical data download jobs

#### Actor
Admin User

#### Preconditions
- User is authenticated with admin role
- Valid JWT access token with admin permissions

#### Inputs
**API Endpoint:** `GET /api/v1/admin/historical/jobs`

**Query Parameters:**
```
GET /api/v1/admin/historical/jobs?
  page={number}&
  page_size={number}&
  sort_by={field}&
  sort_order={asc|desc}&
  status={status}&
  exchange={exchange}&
  symbol={symbol}&
  date_from={ISO8601}&
  date_to={ISO8601}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 20, max: 100): Items per page
- `sort_by` (string, default: created_at): Field to sort by
  - Allowed: `created_at`, `started_at`, `completed_at`, `status`, `symbol`, `progress_percentage`
- `sort_order` (string, default: desc): Sort direction (`asc` or `desc`)
- `status` (string, optional): Filter by status (`pending`, `in_progress`, `completed`, `failed`, `cancelled`)
- `exchange` (string, optional): Filter by exchange (`bybit`, `binance`)
- `symbol` (string, optional): Filter by symbol (exact match or partial)
- `date_from` (ISO8601, optional): Filter jobs created after this date
- `date_to` (ISO8601, optional): Filter jobs created before this date

#### Process Steps

1. **API Gateway receives request** → Routes to Historical Data Service `/api/v1/admin/historical/jobs`
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Historical Data Controller validates query parameters**
   - Validate `page` >= 1
   - Validate `page_size` between 1 and 100
   - Validate `sort_by` is in allowed fields list
   - Validate `sort_order` is `asc` or `desc`
   - Validate `status` is valid enum value if provided
   - Validate `exchange` is valid enum value if provided
   - Return 400 if any validation fails
5. **Query counts total matching records**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT COUNT(*)
   FROM data_sync_jobs dsj
   JOIN broker_connections bc ON dsj.broker_connection_id = bc.id
   WHERE ($1::sync_status IS NULL OR dsj.status = $1)
     AND ($2::exchange_type IS NULL OR bc.exchange = $2)
     AND ($3::varchar IS NULL OR dsj.symbol ILIKE '%' || $3 || '%')
     AND ($4::timestamptz IS NULL OR dsj.created_at >= $4)
     AND ($5::timestamptz IS NULL OR dsj.created_at <= $5);
   ```
6. **Fetch paginated download jobs**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     dsj.id,
     dsj.broker_connection_id,
     bc.exchange,
     dsj.data_type,
     dsj.symbol,
     dsj.timeframe,
     dsj.start_date,
     dsj.end_date,
     dsj.status,
     dsj.progress_percentage,
     dsj.total_batches,
     dsj.completed_batches,
     dsj.total_records_expected,
     dsj.total_records_downloaded,
     dsj.total_records_inserted,
     dsj.retry_count,
     dsj.max_retries,
     dsj.error_message,
     dsj.started_at,
     dsj.completed_at,
     dsj.duration_seconds,
     dsj.created_at,
     dsj.updated_at
   FROM data_sync_jobs dsj
   JOIN broker_connections bc ON dsj.broker_connection_id = bc.id
   WHERE ($1::sync_status IS NULL OR dsj.status = $1)
     AND ($2::exchange_type IS NULL OR bc.exchange = $2)
     AND ($3::varchar IS NULL OR dsj.symbol ILIKE '%' || $3 || '%')
     AND ($4::timestamptz IS NULL OR dsj.created_at >= $4)
     AND ($5::timestamptz IS NULL OR dsj.created_at <= $5)
   ORDER BY {sort_by} {sort_order}
   LIMIT $6 OFFSET $7;
   ```
7. **Calculate aggregate statistics**
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
     COUNT(*) FILTER (WHERE status = 'in_progress') as running_count,
     COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
     COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
     COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
     SUM(total_records_inserted) as total_records_inserted
   FROM data_sync_jobs
   WHERE created_at >= NOW() - INTERVAL '7 days';
   ```
8. **Historical Data Controller formats response**
9. **Return paginated response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "jobId": "uuid-1",
        "exchange": "bybit",
        "dataType": "ohlcv",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "dateRange": {
          "start": "2024-01-01T00:00:00Z",
          "end": "2024-12-31T23:59:59Z"
        },
        "status": "completed",
        "progress": {
          "percentage": 100.0,
          "completedBatches": 12,
          "totalBatches": 12
        },
        "records": {
          "expected": 8760,
          "downloaded": 8760,
          "inserted": 8755
        },
        "timing": {
          "createdAt": "2024-12-15T10:00:00Z",
          "startedAt": "2024-12-15T10:00:05Z",
          "completedAt": "2024-12-15T10:03:45Z",
          "durationSeconds": 220
        },
        "retries": {
          "count": 0,
          "maxRetries": 3
        },
        "error": null
      },
      {
        "jobId": "uuid-2",
        "exchange": "binance",
        "dataType": "ohlcv",
        "symbol": "ETHUSDT",
        "timeframe": "4h",
        "dateRange": {
          "start": "2024-06-01T00:00:00Z",
          "end": "2024-12-31T23:59:59Z"
        },
        "status": "in_progress",
        "progress": {
          "percentage": 45.5,
          "completedBatches": 5,
          "totalBatches": 11
        },
        "records": {
          "expected": 1540,
          "downloaded": 700,
          "inserted": 700
        },
        "timing": {
          "createdAt": "2024-12-16T11:30:00Z",
          "startedAt": "2024-12-16T11:30:05Z",
          "completedAt": null,
          "durationSeconds": null
        },
        "retries": {
          "count": 0,
          "maxRetries": 3
        },
        "error": null
      },
      {
        "jobId": "uuid-3",
        "exchange": "bybit",
        "dataType": "ohlcv",
        "symbol": "SOLUSDT",
        "timeframe": "1h",
        "dateRange": {
          "start": "2024-01-01T00:00:00Z",
          "end": "2024-06-30T23:59:59Z"
        },
        "status": "failed",
        "progress": {
          "percentage": 75.0,
          "completedBatches": 6,
          "totalBatches": 8
        },
        "records": {
          "expected": 4380,
          "downloaded": 3285,
          "inserted": 3285
        },
        "timing": {
          "createdAt": "2024-12-14T09:00:00Z",
          "startedAt": "2024-12-14T09:00:05Z",
          "completedAt": "2024-12-14T09:15:30Z",
          "durationSeconds": 925
        },
        "retries": {
          "count": 3,
          "maxRetries": 3
        },
        "error": "Exchange API rate limit exceeded. Max retries reached."
      }
    ],
    "aggregateStats": {
      "last7Days": {
        "pending": 2,
        "running": 1,
        "completed": 45,
        "failed": 3,
        "cancelled": 1,
        "totalRecordsInserted": 523400
      }
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 52,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Empty List (200 OK):**
```json
{
  "success": true,
  "data": {
    "jobs": [],
    "aggregateStats": {
      "last7Days": {
        "pending": 0,
        "running": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
        "totalRecordsInserted": 0
      }
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
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

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid status filter",
    "details": [
      {
        "field": "status",
        "message": "Invalid status. Allowed: pending, in_progress, completed, failed, cancelled",
        "code": "INVALID_STATUS"
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
- Download jobs retrieved with full status information
- Pagination metadata calculated correctly
- Filters applied correctly
- Aggregate statistics calculated
- Admin access verified
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin access required" |
| Invalid page number | 400 | Return "Page number must be >= 1" |
| Invalid page size | 400 | Return "Page size must be between 1 and 100" |
| Invalid sort field | 400 | Return "Invalid sort field. Allowed: {fields}" |
| Invalid status filter | 400 | Return "Invalid status. Allowed: pending, in_progress, completed, failed, cancelled" |
| Invalid exchange filter | 400 | Return "Invalid exchange. Allowed: bybit, binance" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 3 queries (COUNT, jobs, aggregate stats)
- **Expected Execution Time**: < 300ms
- **Indexes Required**:
  - `data_sync_jobs(status)` - for status filtering
  - `data_sync_jobs(created_at)` - for date filtering and sorting
  - `data_sync_jobs(symbol)` - for symbol filtering

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `data_sync_jobs`, `broker_connections`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

#### Notes

**Cross-Service Consideration:**
- Download jobs are stored in `broker_db`, not `historical_db`
- This endpoint may be served by Historical Data Service or Broker Service
- Recommendation: Serve from Historical Data Service for unified admin experience

**Job Status Values:**
- `pending` - Job queued, waiting to start
- `in_progress` - Currently downloading data
- `completed` - Successfully finished
- `failed` - Failed after all retries exhausted
- `cancelled` - Cancelled by admin

**Monitoring Use Cases:**
1. View active downloads in progress
2. Identify failed jobs that need attention
3. Review download history
4. Monitor overall download throughput

**Related Processes:**
- PROC-HISTORICAL-001: Ingest Historical Data
- PROC-HISTORICAL-004: Get Symbol Data Details (Admin)
- PROC-HISTORICAL-008: Cancel Download Job (Admin)
- PROC-BROKER-005: Download Historical Data

---

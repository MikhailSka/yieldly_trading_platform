### PROC-BROKER-008: List Broker Connections

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-BROKER-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User navigates to broker connections page or settings to view their connected exchanges

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Valid JWT access token provided

#### Inputs
**API Endpoint:** `GET /api/v1/broker/connections`

**Query Parameters:**
```
GET /api/v1/broker/connections?
  exchange={exchange}&
  status={status}&
  include_health={boolean}&
  page={number}&
  page_size={number}&
  sort_by={field}&
  sort_order={asc|desc}
```

**Parameter Details:**
- `exchange` (string, optional): Filter by exchange (`bybit`, `binance`)
- `status` (string, optional): Filter by status (`active`, `inactive`, `error`, `pending`)
- `include_health` (boolean, default: true): Include recent health check data
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 10, max: 50): Items per page
- `sort_by` (string, default: `created_at`): Sort field (`created_at`, `exchange`, `status`, `connection_name`)
- `sort_order` (string, default: `desc`): Sort direction (`asc`, `desc`)

#### Process Steps

1. **API Gateway receives request** → Routes to Broker Connectivity Service `/api/v1/broker/connections`
2. **API Gateway validates JWT** → Extracts user_id
3. **Broker Controller validates query parameters**
   - Validate `exchange` is valid enum value if provided
   - Validate `status` is valid enum value if provided
   - Return 400 if any validation fails
4. **Broker Controller validates pagination parameters**
   - Validate `page` is positive integer
   - Validate `page_size` is between 1 and 50
   - Validate `sort_by` is valid field
   - Return 400 if any validation fails
5. **Broker Repository fetches user's connections**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     bc.id,
     bc.user_id,
     bc.exchange,
     bc.exchange_account_id,
     bc.connection_name,
     bc.api_key_masked,
     bc.api_permission_type,
     bc.status,
     bc.health_status,
     bc.last_health_check_at,
     bc.last_validated_at,
     bc.validation_error,
     bc.detected_capabilities,
     bc.capabilities_detected_at,
     bc.total_api_calls,
     bc.last_api_call_at,
     bc.created_at,
     bc.updated_at
   FROM broker_connections bc
   WHERE bc.user_id = $1
     AND bc.deleted_at IS NULL
     AND ($2::exchange_type IS NULL OR bc.exchange = $2)
     AND ($3::connection_status IS NULL OR bc.status = $3)
   ORDER BY
     CASE WHEN $4 = 'created_at' AND $5 = 'asc' THEN bc.created_at END ASC,
     CASE WHEN $4 = 'created_at' AND $5 = 'desc' THEN bc.created_at END DESC,
     CASE WHEN $4 = 'exchange' AND $5 = 'asc' THEN bc.exchange END ASC,
     CASE WHEN $4 = 'exchange' AND $5 = 'desc' THEN bc.exchange END DESC,
     CASE WHEN $4 = 'status' AND $5 = 'asc' THEN bc.status END ASC,
     CASE WHEN $4 = 'status' AND $5 = 'desc' THEN bc.status END DESC,
     CASE WHEN $4 = 'connection_name' AND $5 = 'asc' THEN bc.connection_name END ASC,
     CASE WHEN $4 = 'connection_name' AND $5 = 'desc' THEN bc.connection_name END DESC
   LIMIT $6 OFFSET $7;
   ```
6. **Broker Repository counts total matching records**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT COUNT(*)
   FROM broker_connections bc
   WHERE bc.user_id = $1
     AND bc.deleted_at IS NULL
     AND ($2::exchange_type IS NULL OR bc.exchange = $2)
     AND ($3::connection_status IS NULL OR bc.status = $3);
   ```
7. **If include_health = true, fetch latest health check for each connection**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT DISTINCT ON (broker_connection_id)
     broker_connection_id,
     status,
     response_time_ms,
     error_message,
     checked_at
   FROM connection_health_checks
   WHERE broker_connection_id IN ($1, $2, ...)
   ORDER BY broker_connection_id, checked_at DESC;
   ```
8. **Broker Controller formats response**
   - Mask API key (show only first 4 and last 4 characters)
   - Transform database rows to response DTOs
   - Build pagination metadata
9. **Return paginated connections list**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "connectionId": "uuid-1",
      "exchange": "bybit",
      "exchangeAccountId": "12345678",
      "connectionName": "My Bybit Account",
      "apiKeyMasked": "5Lkj****Xb3B",
      "apiPermissionType": "read_only",
      "status": "active",
      "healthStatus": "healthy",
      "lastHealthCheck": {
        "status": "healthy",
        "responseTimeMs": 142,
        "checkedAt": "2024-12-16T11:55:00Z"
      },
      "capabilities": {
        "portfolioRead": true,
        "marketDataRead": true,
        "historicalDataRead": true,
        "trading": false,
        "withdrawal": false
      },
      "stats": {
        "totalApiCalls": 1523,
        "lastApiCallAt": "2024-12-16T11:58:32Z"
      },
      "createdAt": "2024-12-01T10:00:00Z",
      "updatedAt": "2024-12-16T11:58:32Z"
    },
    {
      "connectionId": "uuid-2",
      "exchange": "binance",
      "exchangeAccountId": "87654321",
      "connectionName": "Binance Main",
      "apiKeyMasked": "Ab12****Xy9Z",
      "apiPermissionType": "read_write",
      "status": "error",
      "healthStatus": "unhealthy",
      "lastHealthCheck": {
        "status": "unhealthy",
        "responseTimeMs": 156,
        "error": "Invalid API credentials",
        "checkedAt": "2024-12-16T11:55:00Z"
      },
      "capabilities": {
        "portfolioRead": true,
        "marketDataRead": true,
        "historicalDataRead": true,
        "trading": true,
        "withdrawal": false
      },
      "stats": {
        "totalApiCalls": 847,
        "lastApiCallAt": "2024-12-15T09:30:00Z"
      },
      "createdAt": "2024-11-15T14:00:00Z",
      "updatedAt": "2024-12-16T11:55:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 2,
    "totalPages": 1,
    "hasNextPage": false,
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
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 10,
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

**Error Response (400 Bad Request - Invalid Filter):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid exchange filter",
    "details": [
      {
        "field": "exchange",
        "message": "Invalid exchange. Allowed: bybit, binance",
        "code": "INVALID_EXCHANGE"
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
- Connections retrieved for authenticated user only
- Deleted connections excluded
- Filters applied correctly
- Health check data included if requested
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid exchange filter | 400 | Return "Invalid exchange. Allowed: bybit, binance" |
| Invalid status filter | 400 | Return "Invalid status. Allowed: active, inactive, error, pending" |
| Invalid page number | 400 | Return "Page must be a positive integer" |
| Invalid page_size | 400 | Return "Page size must be between 1 and 50" |
| Invalid sort_by field | 400 | Return "Invalid sort field" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 2-3 queries (connections, count, optional health checks)
- **Cache Strategy**: None (data changes frequently)
- **Expected Execution Time**: < 200ms
- **Maximum Connections per User**: 10 total (5 per exchange)
- **Default Page Size**: 10 items
- **Maximum Page Size**: 50 items

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `broker_connections`, `connection_health_checks`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

#### Notes

**Connection Limits:**
- Maximum 5 connections per exchange
- Maximum 10 total connections per user
- Limits enforced during add, not during list

**Health Check Data:**
- Latest health check included by default (include_health=true)
- Set include_health=false for faster response if health details not needed
- Health checks run every 5 minutes via scheduled job

**Status Values:**
- `active` - Connection working, credentials valid
- `inactive` - User disabled the connection
- `error` - Connection has errors (invalid credentials, etc.)
- `pending` - Awaiting initial verification

**Security Notes:**
- Full API keys are NEVER returned in response
- Only masked API key shown (first 4 + last 4 characters, e.g., "5Lkj****Xb3B")
- Full credentials are stored in Azure Key Vault, not in database
- Database only stores the Key Vault reference name and masked key for display

**UI Considerations:**
- Display connection status with appropriate indicators (green/yellow/red)
- Show last successful API call time
- Provide quick actions: Test, Edit, Remove

**Related Processes:**
- PROC-BROKER-001: Add Broker Connection
- PROC-BROKER-006: Test Broker Connection
- PROC-BROKER-007: Remove Broker Connection

---

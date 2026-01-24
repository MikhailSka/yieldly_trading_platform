### PROC-BROKER-013: Get Connection Details (Single)

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-BROKER-004
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views detailed information about a specific broker connection

#### Actor
Authenticated User (owner of the connection)

#### Preconditions
- User is authenticated
- User owns the broker connection
- Connection exists (not deleted)

#### Inputs
**API Endpoint:** `GET /api/v1/broker/connections/{id}`

**Path Parameters:**
- `{id}`: Broker Connection UUID

**Query Parameters:**
```
GET /api/v1/broker/connections/{id}?
  include_health_history={boolean}&
  include_api_logs={boolean}&
  health_history_limit={number}&
  api_logs_limit={number}
```

**Parameter Details:**
- `include_health_history` (boolean, default: false): Include recent health check history
- `include_api_logs` (boolean, default: false): Include recent API call logs
- `health_history_limit` (integer, default: 10, max: 50): Number of health checks to include
- `api_logs_limit` (integer, default: 20, max: 100): Number of API logs to include

#### Process Steps

1. **API Gateway receives request** → `/api/v1/broker/connections/{id}` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Broker Controller validates query parameters**
   - Validate limits are within bounds
   - Return 400 if validation fails
4. **Broker Repository fetches connection details**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     bc.id,
     bc.user_id,
     bc.exchange,
     bc.exchange_account_id,
     bc.connection_name,
     bc.status,
     bc.api_permission_type,
     bc.last_validated_at,
     bc.validation_error,
     bc.last_health_check_at,
     bc.health_status,
     bc.consecutive_failures,
     bc.uses_custom_rate_limits,
     bc.detected_capabilities,
     bc.capabilities_detected_at,
     bc.total_api_calls,
     bc.last_api_call_at,
     bc.created_at,
     bc.updated_at
   FROM broker_connections bc
   WHERE bc.id = $1
     AND bc.deleted_at IS NULL;
   ```
   - If not found → Return 404 "Broker connection not found"
   - If user_id doesn't match → Return 403 "Access denied"
5. **If include_health_history = true, fetch health check history**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     id,
     status,
     response_time_ms,
     check_details,
     error_message,
     checked_at
   FROM connection_health_checks
   WHERE broker_connection_id = $1
   ORDER BY checked_at DESC
   LIMIT $2;
   ```
6. **If include_api_logs = true, fetch recent API call logs**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     id,
     endpoint,
     http_method,
     response_status_code,
     response_time_ms,
     is_successful,
     error_message,
     error_code,
     rate_limit_remaining,
     called_at
   FROM api_call_logs
   WHERE broker_connection_id = $1
   ORDER BY called_at DESC
   LIMIT $2;
   ```
7. **If uses_custom_rate_limits = true, fetch custom rate limits**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     id,
     limit_type,
     max_requests,
     current_usage,
     window_start_at,
     is_active
   FROM connection_rate_limits
   WHERE broker_connection_id = $1
     AND is_active = true;
   ```
8. **Broker Controller formats response**
   - Transform database rows to response DTOs
   - Include all requested optional data
9. **Return connection details**

#### Outputs

**Success Response (200 OK) - Basic:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "bybit",
    "exchangeAccountId": "12345678",
    "connectionName": "My Bybit Account",
    "status": "active",
    "apiPermissionType": "read_only",
    "healthStatus": "healthy",
    "consecutiveFailures": 0,
    "validation": {
      "lastValidatedAt": "2024-12-16T10:00:00Z",
      "validationError": null
    },
    "healthCheck": {
      "lastHealthCheckAt": "2024-12-16T11:55:00Z",
      "status": "healthy"
    },
    "capabilities": {
      "portfolioRead": true,
      "marketDataRead": true,
      "historicalDataRead": true,
      "trading": false,
      "withdrawal": false,
      "detectedAt": "2024-12-01T10:00:00Z"
    },
    "rateLimits": {
      "usesCustomLimits": false,
      "customLimits": null
    },
    "stats": {
      "totalApiCalls": 15423,
      "lastApiCallAt": "2024-12-16T11:58:32Z"
    },
    "createdAt": "2024-12-01T10:00:00Z",
    "updatedAt": "2024-12-16T11:58:32Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - With Health History:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "binance",
    "connectionName": "Binance Main",
    "status": "active",
    "healthStatus": "healthy",
    "capabilities": {
      "portfolioRead": true,
      "marketDataRead": true,
      "historicalDataRead": true,
      "trading": false,
      "withdrawal": false
    },
    "healthHistory": [
      {
        "id": "uuid-1",
        "status": "healthy",
        "responseTimeMs": 142,
        "errorMessage": null,
        "checkedAt": "2024-12-16T11:55:00Z"
      },
      {
        "id": "uuid-2",
        "status": "healthy",
        "responseTimeMs": 138,
        "errorMessage": null,
        "checkedAt": "2024-12-16T11:50:00Z"
      },
      {
        "id": "uuid-3",
        "status": "degraded",
        "responseTimeMs": 2500,
        "errorMessage": "High latency detected",
        "checkedAt": "2024-12-16T11:45:00Z"
      }
    ],
    "stats": {
      "totalApiCalls": 8547,
      "lastApiCallAt": "2024-12-16T11:58:00Z"
    },
    "createdAt": "2024-11-15T14:00:00Z",
    "updatedAt": "2024-12-16T11:55:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "includesHealthHistory": true,
    "healthHistoryCount": 3
  }
}
```

**Success Response (200 OK) - With API Logs:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "bybit",
    "connectionName": "My Bybit Account",
    "status": "active",
    "healthStatus": "healthy",
    "apiLogs": [
      {
        "id": "uuid-1",
        "endpoint": "/v5/account/wallet-balance",
        "httpMethod": "GET",
        "responseStatusCode": 200,
        "responseTimeMs": 145,
        "isSuccessful": true,
        "errorMessage": null,
        "rateLimitRemaining": 118,
        "calledAt": "2024-12-16T11:58:32Z"
      },
      {
        "id": "uuid-2",
        "endpoint": "/v5/market/tickers",
        "httpMethod": "GET",
        "responseStatusCode": 200,
        "responseTimeMs": 82,
        "isSuccessful": true,
        "errorMessage": null,
        "rateLimitRemaining": 117,
        "calledAt": "2024-12-16T11:58:30Z"
      },
      {
        "id": "uuid-3",
        "endpoint": "/v5/account/wallet-balance",
        "httpMethod": "GET",
        "responseStatusCode": 429,
        "responseTimeMs": 45,
        "isSuccessful": false,
        "errorMessage": "Rate limit exceeded",
        "errorCode": "10006",
        "rateLimitRemaining": 0,
        "calledAt": "2024-12-16T11:45:00Z"
      }
    ],
    "stats": {
      "totalApiCalls": 15423,
      "lastApiCallAt": "2024-12-16T11:58:32Z"
    },
    "createdAt": "2024-12-01T10:00:00Z",
    "updatedAt": "2024-12-16T11:58:32Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "includesApiLogs": true,
    "apiLogsCount": 3
  }
}
```

**Success Response (200 OK) - With Custom Rate Limits:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "binance",
    "connectionName": "Binance Pro",
    "status": "active",
    "healthStatus": "healthy",
    "rateLimits": {
      "usesCustomLimits": true,
      "customLimits": [
        {
          "id": "uuid-1",
          "limitType": "per_minute",
          "maxRequests": 1200,
          "currentUsage": 45,
          "windowStartAt": "2024-12-16T11:58:00Z",
          "isActive": true
        },
        {
          "id": "uuid-2",
          "limitType": "per_day",
          "maxRequests": 100000,
          "currentUsage": 8547,
          "windowStartAt": "2024-12-16T00:00:00Z",
          "isActive": true
        }
      ]
    },
    "stats": {
      "totalApiCalls": 8547,
      "lastApiCallAt": "2024-12-16T11:58:00Z"
    },
    "createdAt": "2024-11-15T14:00:00Z",
    "updatedAt": "2024-12-16T11:55:00Z"
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
    "message": "Broker connection not found",
    "details": null
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
    "message": "Access denied",
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
- Connection details retrieved for authenticated user
- Optional health history included if requested
- Optional API logs included if requested
- Custom rate limits included if configured
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Connection not found | 404 | Return "Broker connection not found" |
| Not connection owner | 403 | Return "Access denied" |
| Invalid health_history_limit | 400 | Return "Health history limit must be between 1 and 50" |
| Invalid api_logs_limit | 400 | Return "API logs limit must be between 1 and 100" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1-4 queries depending on options
- Basic request: 1 query, < 50ms
- With health history: +1 query, < 100ms total
- With API logs: +1 query, < 150ms total
- With rate limits: +1 query, < 100ms total
- All options enabled: < 200ms total

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `broker_connections`, `connection_health_checks`, `api_call_logs`, `connection_rate_limits`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

#### Notes

**Difference from PROC-BROKER-008 (List):**
- PROC-BROKER-008 returns all connections with basic info
- This process returns detailed info for a single connection
- Includes optional health history, API logs, and rate limit details

**Use Cases:**
1. User viewing connection detail page
2. Troubleshooting connection issues
3. Monitoring API usage and rate limits
4. Reviewing health check history

**Security Notes:**
- API key is NEVER returned in response
- Only connection owner can access details
- Soft-deleted connections return 404

**Optional Data:**
- Health history: Useful for diagnosing intermittent issues
- API logs: Useful for debugging API errors
- Rate limits: Useful for monitoring usage against limits

**Related Processes:**
- PROC-BROKER-008: List Broker Connections (returns all connections, basic info)
- PROC-BROKER-006: Test Broker Connection (creates health check entries)
- PROC-BROKER-002: Health Check for Broker Connections (scheduled health checks)

---

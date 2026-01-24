### PROC-BROKER-014: Manage Connection Rate Limits

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-BROKER-004
**Related NFR:** NFR-PERF-001, NFR-INT-001
**Related ADR:** ADR-032

#### Trigger
Admin configures custom rate limits for a broker connection (e.g., for premium API keys with higher limits)

#### Actor
Admin User

#### Preconditions
- User is authenticated with admin role
- Broker connection exists
- Valid rate limit configuration

#### Inputs

**API Endpoint (View):** `GET /api/v1/admin/broker/connections/{id}/rate-limits`

**API Endpoint (Update):** `PUT /api/v1/admin/broker/connections/{id}/rate-limits`

**Path Parameters:**
- `{id}`: Broker Connection UUID

**Request Body (for PUT):**
```json
{
  "usesCustomRateLimits": true,
  "rateLimits": [
    {
      "limitType": "per_second",
      "maxRequests": 10
    },
    {
      "limitType": "per_minute",
      "maxRequests": 600
    },
    {
      "limitType": "per_hour",
      "maxRequests": 10000
    },
    {
      "limitType": "per_day",
      "maxRequests": 100000
    }
  ]
}
```

**Validation Rules:**
- `limitType` must be one of: `per_second`, `per_minute`, `per_hour`, `per_day`
- `maxRequests` must be a positive integer
- Each `limitType` can only appear once
- To disable custom limits, set `usesCustomRateLimits: false`

#### Process Steps

**For GET (View Rate Limits):**

1. **API Gateway receives request** → `/api/v1/admin/broker/connections/{id}/rate-limits` (GET)
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Broker Controller validates connection exists**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT id, exchange, uses_custom_rate_limits
   FROM broker_connections
   WHERE id = $1 AND deleted_at IS NULL;
   ```
   - If not found → Return 404 "Broker connection not found"
5. **Broker Repository fetches rate limits**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     id,
     limit_type,
     max_requests,
     current_usage,
     window_start_at,
     is_active,
     created_at,
     updated_at
   FROM connection_rate_limits
   WHERE broker_connection_id = $1
   ORDER BY
     CASE limit_type
       WHEN 'per_second' THEN 1
       WHEN 'per_minute' THEN 2
       WHEN 'per_hour' THEN 3
       WHEN 'per_day' THEN 4
     END;
   ```
6. **Fetch exchange default limits for comparison**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     default_rate_limit_per_second,
     default_rate_limit_per_minute,
     default_rate_limit_per_hour,
     default_rate_limit_per_day
   FROM exchange_configurations
   WHERE exchange = $1;
   ```
7. **Return rate limits configuration**

**For PUT (Update Rate Limits):**

1. **API Gateway receives request** → `/api/v1/admin/broker/connections/{id}/rate-limits` (PUT)
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
4. **Broker Controller validates request body**
   - Validate `limitType` values are valid enums
   - Validate `maxRequests` are positive integers
   - Validate no duplicate `limitType` entries
   - Return 400 if validation fails
5. **Broker Controller validates connection exists**
   ```sql
   -- Same as GET step 4
   ```
6. **If usesCustomRateLimits = false, disable custom limits:**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   UPDATE connection_rate_limits
   SET is_active = false,
       updated_at = NOW()
   WHERE broker_connection_id = $1;

   UPDATE broker_connections
   SET uses_custom_rate_limits = false,
       updated_at = NOW()
   WHERE id = $1;
   ```
7. **If usesCustomRateLimits = true, upsert rate limits:**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   -- First, deactivate existing limits
   UPDATE connection_rate_limits
   SET is_active = false,
       updated_at = NOW()
   WHERE broker_connection_id = $1;

   -- Then, upsert each limit
   INSERT INTO connection_rate_limits (
     broker_connection_id, limit_type, max_requests, current_usage, window_start_at, is_active, created_at, updated_at
   ) VALUES ($1, $2, $3, 0, NOW(), true, NOW(), NOW())
   ON CONFLICT (broker_connection_id, limit_type)
   DO UPDATE SET
     max_requests = EXCLUDED.max_requests,
     is_active = true,
     updated_at = NOW();

   UPDATE broker_connections
   SET uses_custom_rate_limits = true,
       updated_at = NOW()
   WHERE id = $1;
   ```
8. **Update Redis rate limit keys**
   ```
   DEL rate_limit:{connectionId}:*
   ```
9. **Log rate limit configuration event**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   INSERT INTO connection_events (
     broker_connection_id, event_type, event_description,
     triggered_by_user_id, metadata, occurred_at
   ) VALUES (
     $1, 'rate_limits_configured', 'Custom rate limits configured by admin',
     $2, $3, NOW()
   );
   ```
10. **Return updated rate limits configuration**

#### Outputs

**Success Response - GET (200 OK):**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "bybit",
    "usesCustomRateLimits": true,
    "customLimits": [
      {
        "id": "uuid-1",
        "limitType": "per_second",
        "maxRequests": 10,
        "currentUsage": 2,
        "windowStartAt": "2024-12-16T11:59:58Z",
        "isActive": true
      },
      {
        "id": "uuid-2",
        "limitType": "per_minute",
        "maxRequests": 600,
        "currentUsage": 45,
        "windowStartAt": "2024-12-16T11:59:00Z",
        "isActive": true
      },
      {
        "id": "uuid-3",
        "limitType": "per_hour",
        "maxRequests": 10000,
        "currentUsage": 1523,
        "windowStartAt": "2024-12-16T11:00:00Z",
        "isActive": true
      },
      {
        "id": "uuid-4",
        "limitType": "per_day",
        "maxRequests": 100000,
        "currentUsage": 15423,
        "windowStartAt": "2024-12-16T00:00:00Z",
        "isActive": true
      }
    ],
    "exchangeDefaults": {
      "perSecond": 5,
      "perMinute": 120,
      "perHour": null,
      "perDay": null
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - GET with Default Limits (200 OK):**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "binance",
    "usesCustomRateLimits": false,
    "customLimits": [],
    "exchangeDefaults": {
      "perSecond": 10,
      "perMinute": 1200,
      "perHour": null,
      "perDay": 100000
    },
    "effectiveLimits": {
      "perSecond": 10,
      "perMinute": 1200,
      "perHour": null,
      "perDay": 100000,
      "source": "exchange_defaults"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - PUT (200 OK):**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "bybit",
    "usesCustomRateLimits": true,
    "customLimits": [
      {
        "limitType": "per_second",
        "maxRequests": 10,
        "isActive": true
      },
      {
        "limitType": "per_minute",
        "maxRequests": 600,
        "isActive": true
      }
    ],
    "message": "Custom rate limits configured successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - PUT Disable Custom Limits (200 OK):**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "binance",
    "usesCustomRateLimits": false,
    "customLimits": [],
    "message": "Custom rate limits disabled. Exchange defaults will be used."
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
    "message": "Invalid rate limit configuration",
    "details": [
      {
        "field": "rateLimits[0].limitType",
        "message": "Invalid limit type. Allowed: per_second, per_minute, per_hour, per_day",
        "code": "INVALID_LIMIT_TYPE"
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

#### Success Criteria
- GET: Rate limits retrieved with current usage
- PUT: Rate limits updated in database
- PUT: Redis cache cleared for connection
- PUT: Event logged for audit
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin access required" |
| Connection not found | 404 | Return "Broker connection not found" |
| Invalid limitType | 400 | Return "Invalid limit type" |
| Negative maxRequests | 400 | Return "Max requests must be positive" |
| Duplicate limitType | 400 | Return "Duplicate limit type in request" |
| Database error | 500 | Log error, return generic message |
| Redis error | N/A | Log warning, continue (limits will work on next window) |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-INT-001**: Exchange API Integration

**Process-Specific Notes:**
- GET: < 100ms (2 queries)
- PUT: < 200ms (multiple queries + Redis update)
- Rate limit checks at runtime use Redis (< 5ms)

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `broker_connections`, `connection_rate_limits`, `exchange_configurations`, `connection_events`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Cache:**
- Redis - Rate limit counters (cleared on configuration change)

#### Notes

**Rate Limit Hierarchy:**
1. Custom limits (if `uses_custom_rate_limits = true`)
2. Exchange defaults (from `exchange_configurations` table)
3. System defaults (hardcoded fallback)

**Use Cases:**
1. Admin configures higher limits for users with premium exchange API keys
2. Admin reduces limits for users experiencing issues
3. Admin disables custom limits to revert to defaults

**Runtime Rate Limiting:**
- Rate limits are enforced in Redis for performance
- Database stores configuration, Redis stores counters
- Counters reset automatically based on window type

**Audit Trail:**
- All rate limit changes are logged in `connection_events`
- Includes admin user who made the change
- Includes before/after configuration in metadata

**Related Processes:**
- PROC-BROKER-003: Fetch Real-Time Market Data (uses rate limits)
- PROC-BROKER-004: Fetch Portfolio Data (uses rate limits)
- PROC-BROKER-013: Get Connection Details (includes rate limit info)

---

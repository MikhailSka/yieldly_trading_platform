### PROC-BROKER-011: Manage Exchange API Configuration

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-BROKER-002, FR-MARKET-001
**Related NFR:** NFR-PERF-001, NFR-SEC-006
**Related ADR:** ADR-032

#### Trigger
Admin configures or retrieves exchange-specific API settings (rate limits, max candles, supported intervals, etc.)

#### Actor
Admin User (for write operations), System or User (for read operations)

#### Preconditions
- Admin is authenticated with admin role (for write operations)
- Exchange is supported (bybit, binance)

---

## Part A: Get Exchange Configuration

#### Inputs
**API Endpoint:** `GET /api/v1/broker/exchanges/{exchange}/configuration`

**Path Parameters:**
- `{exchange}`: Exchange identifier (`bybit`, `binance`)

#### Process Steps (Get Configuration)

1. **API Gateway receives request** → Routes to Broker Connectivity Service
2. **API Gateway validates JWT** → Extracts user_id
3. **Broker Controller validates exchange**
   - If exchange not in (`bybit`, `binance`) → Return 400 "Invalid exchange"
4. **Broker Repository fetches exchange configuration**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     id,
     exchange,
     rest_api_base_url,
     websocket_base_url,
     max_klines_per_request,
     max_symbols_per_websocket,
     supported_intervals,
     rate_limit_requests_per_minute,
     rate_limit_orders_per_second,
     rate_limit_weight_per_minute,
     connection_timeout_ms,
     request_timeout_ms,
     websocket_ping_interval_ms,
     maintenance_windows,
     api_version,
     is_active,
     last_updated_at,
     updated_by_user_id
   FROM exchange_configurations
   WHERE exchange = $1;
   ```
5. **If no configuration found, return defaults**
   ```go
   defaultConfig := ExchangeConfiguration{
     Exchange:                  exchange,
     MaxKlinesPerRequest:       1000,
     MaxSymbolsPerWebSocket:    50,
     SupportedIntervals:        []string{"1m", "5m", "15m", "1h", "4h", "1d"},
     RateLimitRequestsPerMin:   120,
     ConnectionTimeoutMs:       5000,
     RequestTimeoutMs:          10000,
     WebSocketPingIntervalMs:   30000,
     IsActive:                  true,
   }
   ```
6. **Return configuration**

#### Outputs (Get Configuration)

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "apiInfo": {
      "restBaseUrl": "https://api.bybit.com",
      "websocketBaseUrl": "wss://stream.bybit.com/v5/public/spot",
      "apiVersion": "v5"
    },
    "limits": {
      "maxKlinesPerRequest": 1000,
      "maxSymbolsPerWebSocket": 50,
      "supportedIntervals": ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "1w", "1M"],
      "supportedKlineIntervals": {
        "1m": { "maxCandles": 1000, "description": "1 minute" },
        "5m": { "maxCandles": 1000, "description": "5 minutes" },
        "15m": { "maxCandles": 1000, "description": "15 minutes" },
        "1h": { "maxCandles": 1000, "description": "1 hour" },
        "4h": { "maxCandles": 1000, "description": "4 hours" },
        "1d": { "maxCandles": 1000, "description": "1 day" }
      }
    },
    "rateLimits": {
      "requestsPerMinute": 120,
      "ordersPerSecond": 10,
      "weightPerMinute": 1200,
      "description": "Bybit uses IP-based rate limiting for public endpoints"
    },
    "timeouts": {
      "connectionTimeoutMs": 5000,
      "requestTimeoutMs": 10000,
      "websocketPingIntervalMs": 20000
    },
    "maintenance": {
      "scheduledWindows": [
        {
          "dayOfWeek": "sunday",
          "startTimeUtc": "16:00",
          "durationMinutes": 30,
          "description": "Weekly maintenance window"
        }
      ],
      "lastMaintenanceAt": "2024-12-15T16:00:00Z"
    },
    "status": {
      "isActive": true,
      "lastUpdatedAt": "2024-12-01T10:00:00Z",
      "updatedBy": "admin@yieldly.io"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Binance (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "binance",
    "apiInfo": {
      "restBaseUrl": "https://api.binance.com",
      "websocketBaseUrl": "wss://stream.binance.com:9443/ws",
      "apiVersion": "v3"
    },
    "limits": {
      "maxKlinesPerRequest": 1000,
      "maxSymbolsPerWebSocket": 1024,
      "supportedIntervals": ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"],
      "supportedKlineIntervals": {
        "1m": { "maxCandles": 1000, "description": "1 minute" },
        "5m": { "maxCandles": 1000, "description": "5 minutes" },
        "15m": { "maxCandles": 1000, "description": "15 minutes" },
        "1h": { "maxCandles": 1000, "description": "1 hour" },
        "4h": { "maxCandles": 1000, "description": "4 hours" },
        "1d": { "maxCandles": 1000, "description": "1 day" }
      }
    },
    "rateLimits": {
      "requestsPerMinute": 1200,
      "ordersPerSecond": 10,
      "weightPerMinute": 1200,
      "description": "Binance uses request weight system"
    },
    "timeouts": {
      "connectionTimeoutMs": 5000,
      "requestTimeoutMs": 10000,
      "websocketPingIntervalMs": 180000
    },
    "status": {
      "isActive": true,
      "lastUpdatedAt": "2024-12-01T10:00:00Z",
      "updatedBy": "admin@yieldly.io"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## Part B: Update Exchange Configuration (Admin Only)

#### Inputs
**API Endpoint:** `PUT /api/v1/admin/broker/exchanges/{exchange}/configuration`

**Path Parameters:**
- `{exchange}`: Exchange identifier (`bybit`, `binance`)

**Request Body:**
```json
{
  "apiInfo": {
    "restBaseUrl": "https://api.bybit.com",
    "websocketBaseUrl": "wss://stream.bybit.com/v5/public/spot",
    "apiVersion": "v5"
  },
  "limits": {
    "maxKlinesPerRequest": 1000,
    "maxSymbolsPerWebSocket": 50,
    "supportedIntervals": ["1m", "5m", "15m", "1h", "4h", "1d"]
  },
  "rateLimits": {
    "requestsPerMinute": 120,
    "ordersPerSecond": 10,
    "weightPerMinute": 1200
  },
  "timeouts": {
    "connectionTimeoutMs": 5000,
    "requestTimeoutMs": 10000,
    "websocketPingIntervalMs": 20000
  },
  "maintenance": {
    "scheduledWindows": [
      {
        "dayOfWeek": "sunday",
        "startTimeUtc": "16:00",
        "durationMinutes": 30,
        "description": "Weekly maintenance window"
      }
    ]
  },
  "isActive": true
}
```

**Validation Rules:**
- `maxKlinesPerRequest` must be between 100 and 10000
- `maxSymbolsPerWebSocket` must be between 1 and 2000
- `requestsPerMinute` must be between 1 and 10000
- `connectionTimeoutMs` must be between 1000 and 30000
- `requestTimeoutMs` must be between 1000 and 60000
- `supportedIntervals` must contain valid interval values

#### Process Steps (Update Configuration)

1. **API Gateway receives request** → Routes to Broker Connectivity Service
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Broker Controller validates exchange**
   - If exchange not supported → Return 400 "Unsupported exchange"
5. **Broker Controller validates request body**
   - Validate all numeric fields are within allowed ranges
   - Validate URLs are properly formatted
   - Validate intervals are valid values
   - Return 400 if any validation fails
6. **Broker Repository upserts configuration**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   INSERT INTO exchange_configurations (
     exchange,
     rest_api_base_url,
     websocket_base_url,
     max_klines_per_request,
     max_symbols_per_websocket,
     supported_intervals,
     rate_limit_requests_per_minute,
     rate_limit_orders_per_second,
     rate_limit_weight_per_minute,
     connection_timeout_ms,
     request_timeout_ms,
     websocket_ping_interval_ms,
     maintenance_windows,
     api_version,
     is_active,
     updated_by_user_id,
     last_updated_at
   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
   ON CONFLICT (exchange)
   DO UPDATE SET
     rest_api_base_url = EXCLUDED.rest_api_base_url,
     websocket_base_url = EXCLUDED.websocket_base_url,
     max_klines_per_request = EXCLUDED.max_klines_per_request,
     max_symbols_per_websocket = EXCLUDED.max_symbols_per_websocket,
     supported_intervals = EXCLUDED.supported_intervals,
     rate_limit_requests_per_minute = EXCLUDED.rate_limit_requests_per_minute,
     rate_limit_orders_per_second = EXCLUDED.rate_limit_orders_per_second,
     rate_limit_weight_per_minute = EXCLUDED.rate_limit_weight_per_minute,
     connection_timeout_ms = EXCLUDED.connection_timeout_ms,
     request_timeout_ms = EXCLUDED.request_timeout_ms,
     websocket_ping_interval_ms = EXCLUDED.websocket_ping_interval_ms,
     maintenance_windows = EXCLUDED.maintenance_windows,
     api_version = EXCLUDED.api_version,
     is_active = EXCLUDED.is_active,
     updated_by_user_id = EXCLUDED.updated_by_user_id,
     last_updated_at = NOW()
   RETURNING *;
   ```
7. **Invalidate cached configuration**
   ```
   DEL exchange:{exchange}:configuration
   ```
8. **Log configuration change**
   ```sql
   INSERT INTO admin_audit_log (
     admin_user_id, action, resource_type, resource_id,
     old_value, new_value, ip_address, occurred_at
   ) VALUES (
     $1, 'update_exchange_config', 'exchange_configuration', $2,
     $3, $4, $5, NOW()
   );
   ```
9. **Return updated configuration**

#### Outputs (Update Configuration)

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "apiInfo": {
      "restBaseUrl": "https://api.bybit.com",
      "websocketBaseUrl": "wss://stream.bybit.com/v5/public/spot",
      "apiVersion": "v5"
    },
    "limits": {
      "maxKlinesPerRequest": 1000,
      "maxSymbolsPerWebSocket": 50,
      "supportedIntervals": ["1m", "5m", "15m", "1h", "4h", "1d"]
    },
    "rateLimits": {
      "requestsPerMinute": 120,
      "ordersPerSecond": 10,
      "weightPerMinute": 1200
    },
    "timeouts": {
      "connectionTimeoutMs": 5000,
      "requestTimeoutMs": 10000,
      "websocketPingIntervalMs": 20000
    },
    "status": {
      "isActive": true,
      "lastUpdatedAt": "2024-12-16T12:00:00Z",
      "updatedBy": "admin@yieldly.io"
    },
    "message": "Exchange configuration updated successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid configuration values",
    "details": [
      {
        "field": "limits.maxKlinesPerRequest",
        "message": "Value must be between 100 and 10000",
        "code": "OUT_OF_RANGE"
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

---

## Part C: List All Exchange Configurations (Admin Only)

#### Inputs
**API Endpoint:** `GET /api/v1/admin/broker/exchanges/configurations`

#### Process Steps

1. **API Gateway receives request** → Routes to Broker Connectivity Service
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
4. **Broker Repository fetches all configurations**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     exchange,
     max_klines_per_request,
     max_symbols_per_websocket,
     rate_limit_requests_per_minute,
     is_active,
     last_updated_at,
     updated_by_user_id
   FROM exchange_configurations
   ORDER BY exchange;
   ```
5. **Return configurations list**

#### Outputs (List Configurations)

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "exchange": "binance",
      "maxKlinesPerRequest": 1000,
      "maxSymbolsPerWebSocket": 1024,
      "requestsPerMinute": 1200,
      "isActive": true,
      "lastUpdatedAt": "2024-12-01T10:00:00Z"
    },
    {
      "exchange": "bybit",
      "maxKlinesPerRequest": 1000,
      "maxSymbolsPerWebSocket": 50,
      "requestsPerMinute": 120,
      "isActive": true,
      "lastUpdatedAt": "2024-12-01T10:00:00Z"
    }
  ],
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "totalExchanges": 2
  }
}
```

---

#### Success Criteria
- GET: Configuration retrieved for specified exchange
- PUT (Admin): Configuration validated and stored
- PUT (Admin): Cache invalidated
- PUT (Admin): Audit log created
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid exchange | 400 | Return "Exchange must be one of: bybit, binance" |
| Not admin (admin endpoint) | 403 | Return "Admin access required" |
| Invalid maxKlinesPerRequest | 400 | Return "Value must be between 100 and 10000" |
| Invalid URL format | 400 | Return "Invalid URL format" |
| Invalid interval | 400 | Return "Invalid interval. Allowed: 1m, 5m, 15m, 1h, 4h, 1d, 1w" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-006**: Secrets Management (for API configuration)

**Process-Specific Notes:**
- GET: < 50ms (simple query, cached)
- PUT: < 100ms (upsert + cache invalidation)
- Cache Strategy: Configuration cached for 1 hour
- Cache invalidated on update

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `exchange_configurations`, `admin_audit_log`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Cache:**
- Redis - Exchange configuration cache (TTL: 1 hour)

#### Notes

**Configuration Usage:**
This configuration is used by:
1. **PROC-BROKER-003**: Fetch Real-Time Market Data - uses `max_klines_per_request` to validate limit parameter
2. **PROC-BROKER-014**: Manage Connection Rate Limits - uses rate limit configuration
3. **PROC-HISTORICAL-001**: Query Historical Data - uses `supported_intervals`
4. **WebSocket Manager**: Uses `max_symbols_per_websocket` and `websocket_ping_interval_ms`

**Default Values:**
| Exchange | Max Klines | Max WS Symbols | Requests/Min |
|----------|------------|----------------|--------------|
| Bybit    | 1000       | 50             | 120          |
| Binance  | 1000       | 1024           | 1200         |

**Interval Mapping:**
Different exchanges use different interval formats:
| Standard | Bybit | Binance |
|----------|-------|---------|
| 1m       | 1     | 1m      |
| 5m       | 5     | 5m      |
| 15m      | 15    | 15m     |
| 1h       | 60    | 1h      |
| 4h       | 240   | 4h      |
| 1d       | D     | 1d      |

The configuration stores the standardized format, and exchange adapters translate to exchange-specific format.

**Maintenance Windows:**
Used to:
- Pause scheduled jobs during known maintenance
- Display warnings to users before maintenance
- Auto-recover after maintenance ends

**Related Processes:**
- PROC-BROKER-003: Fetch Real-Time Market Data (uses kline limits)
- PROC-BROKER-014: Manage Connection Rate Limits (uses rate limit config)
- PROC-HISTORICAL-001: Query Historical Data (uses supported intervals)

---

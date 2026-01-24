### PROC-BROKER-006: Test Broker Connection

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-BROKER-004
**Related NFR:** NFR-PERF-001, NFR-SEC-002
**Related ADR:** ADR-007, ADR-021, ADR-032

#### Trigger
User clicks "Test Connection" button on a broker connection, or system needs to verify connection before operations

#### Actor
Authenticated User (owner of the connection)

#### Preconditions
- User is authenticated
- User owns the broker connection
- Connection exists (not deleted)

#### Inputs
**API Endpoint:** `POST /api/v1/broker/connections/{id}/test`

**Path Parameters:**
- `{id}`: Broker Connection UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/broker/connections/{id}/test` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Broker Controller validates connection exists and ownership**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT id, user_id, exchange, key_vault_secret_name, status, deleted_at
   FROM broker_connections
   WHERE id = $1;
   ```
   - If not found → Return 404 "Broker connection not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Broker connection not found"
4. **Credential Manager retrieves API credentials from Key Vault**
   ```go
   secretName := connection.KeyVaultSecretName
   credentials := keyVaultClient.GetSecret(ctx, secretName)
   apiKey, apiSecret := parseCredentials(credentials)
   ```
5. **Connection Manager selects appropriate adapter**
   - If exchange = "bybit" → Use Bybit Adapter
   - If exchange = "binance" → Use Binance Adapter
6. **Exchange Adapter tests connection**
   - Bybit: `GET /v5/market/time` (lightweight public endpoint)
   - Binance: `GET /api/v3/time` (lightweight public endpoint)
   - Record response time
7. **Exchange Adapter tests authenticated endpoint**
   - Bybit: `GET /v5/account/wallet-balance`
   - Binance: `GET /api/v3/account`
   - Check if credentials are still valid
8. **Connection Manager updates connection health status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   UPDATE broker_connections
   SET last_health_check_at = NOW(),
       health_status = $1,
       validation_error = $2,
       consecutive_failures = CASE WHEN $1 = 'healthy' THEN 0 ELSE consecutive_failures + 1 END,
       updated_at = NOW()
   WHERE id = $3;
   ```
9. **Log health check result**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   INSERT INTO connection_health_checks (
     broker_connection_id, status, response_time_ms,
     check_details, error_message, checked_at
   ) VALUES ($1, $2, $3, $4, $5, NOW());
   ```
10. **Return test result**

#### Outputs

**Success Response (200 OK) - Connection Healthy:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "bybit",
    "status": "healthy",
    "testResults": {
      "publicEndpoint": {
        "endpoint": "/v5/market/time",
        "success": true,
        "responseTimeMs": 85,
        "statusCode": 200
      },
      "authenticatedEndpoint": {
        "endpoint": "/v5/account/wallet-balance",
        "success": true,
        "responseTimeMs": 142,
        "statusCode": 200
      }
    },
    "testedAt": "2024-12-16T12:00:00Z",
    "message": "Connection is healthy and credentials are valid"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - Connection Unhealthy:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "binance",
    "status": "unhealthy",
    "testResults": {
      "publicEndpoint": {
        "endpoint": "/api/v3/time",
        "success": true,
        "responseTimeMs": 92,
        "statusCode": 200
      },
      "authenticatedEndpoint": {
        "endpoint": "/api/v3/account",
        "success": false,
        "responseTimeMs": 156,
        "statusCode": 401,
        "error": "Invalid API credentials"
      }
    },
    "testedAt": "2024-12-16T12:00:00Z",
    "message": "API credentials are invalid or have been revoked"
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
- Public endpoint tested successfully
- Authenticated endpoint tested
- Health status updated in database
- Health check logged
- HTTP 200 OK (even if connection is unhealthy)

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Connection not found | 404 | Return "Broker connection not found" |
| Not connection owner | 403 | Return "Access denied" |
| Key Vault error | 500 | Log error, return "Unable to retrieve credentials" |
| Exchange timeout | 200 | Return unhealthy status with timeout error |
| Rate limited | 200 | Return degraded status with rate limit message |
| Exchange API error | 200 | Return unhealthy status with error details |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-002**: Data Encryption and Secure Storage

**Process-Specific Notes:**
- Target P95 latency: < 1.5 seconds (includes external API calls)
- Timeout for exchange calls: 5 seconds per endpoint
- Always returns 200 OK - health status in response body

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `broker_connections`, `connection_health_checks`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Secrets/Key Vault:**
- Azure Key Vault - Retrieves API credentials

**External Services:**
- Bybit API: `/v5/market/time`, `/v5/account/wallet-balance`
- Binance API: `/api/v3/time`, `/api/v3/account`

#### Notes

**Health Status Values:**
- `healthy` - All tests passed
- `degraded` - Public endpoint works, authenticated has issues (rate limit, slow)
- `unhealthy` - Critical failure (invalid credentials, connection refused)

**Rate Limiting:**
- This endpoint is rate limited to 6 requests per minute per user
- Prevents abuse and excessive API calls to exchanges

**Use Cases:**
1. User manually tests connection after adding
2. User verifies connection after changing API keys on exchange
3. System pre-checks connection before portfolio sync

**Related Processes:**
- PROC-BROKER-001: Add Broker Connection (initial test after adding)
- PROC-BROKER-002: Health Check for Broker Connections (scheduled background test)
- PROC-BROKER-004: Fetch Portfolio Data (requires healthy connection)

---

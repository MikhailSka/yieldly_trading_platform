### PROC-BROKER-010: Validate and Detect API Capabilities

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-BROKER-001, FR-BROKER-002, FR-BROKER-004
**Related NFR:** NFR-PERF-001, NFR-SEC-002, NFR-INT-001
**Related ADR:** ADR-007, ADR-021, ADR-032

#### Trigger
User requests capability detection for an existing broker connection, OR system performs automatic detection after adding a new connection

#### Actor
Authenticated User (owner of the connection) OR System (after PROC-BROKER-001)

#### Preconditions
- User is authenticated
- User owns the broker connection
- Connection exists and is not deleted
- API credentials are valid and stored in Key Vault

#### Inputs
**API Endpoint:** `POST /api/v1/broker/connections/{id}/detect-capabilities`

**Path Parameters:**
- `{id}`: Broker Connection UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/broker/connections/{id}/detect-capabilities` (POST)
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
6. **Capability Detector tests each capability endpoint**

   **6a. Test Portfolio Read Access:**
   - Bybit: `GET /v5/account/wallet-balance`
   - Binance: `GET /api/v3/account`
   - Record success/failure and response time

   **6b. Test Market Data Read Access:**
   - Bybit: `GET /v5/market/tickers?symbol=BTCUSDT`
   - Binance: `GET /api/v3/ticker/24hr?symbol=BTCUSDT`
   - Record success/failure and response time

   **6c. Test Historical Data Read Access:**
   - Bybit: `GET /v5/market/kline?symbol=BTCUSDT&interval=60&limit=1`
   - Binance: `GET /api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1`
   - Record success/failure and response time

   **6d. Test Trading Permission (detect if enabled - warn user):**
   - Bybit: Check response headers or account info for trading permission
   - Binance: Check `permissions` array in account response
   - If trading enabled → Flag as warning (read-only recommended)

   **6e. Test Withdrawal Permission (detect if enabled - critical warning):**
   - Check account permissions for withdrawal capability
   - If withdrawal enabled → Flag as critical security warning

7. **Capability Detector builds capabilities result**
   ```go
   capabilities := APICapabilities{
     PortfolioRead:       portfolioTestResult.Success,
     MarketDataRead:      marketDataTestResult.Success,
     HistoricalDataRead:  historicalTestResult.Success,
     Trading:             tradingDetected,
     Withdrawal:          withdrawalDetected,
     DetectedAt:          time.Now(),
     TestResults:         allTestResults,
   }
   ```
8. **Broker Repository saves detected capabilities**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   UPDATE broker_connections
   SET detected_capabilities = $1,
       capabilities_detected_at = NOW(),
       updated_at = NOW()
   WHERE id = $2;
   ```
9. **Log capability detection event**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   INSERT INTO connection_events (
     broker_connection_id, event_type, event_description,
     triggered_by_user_id, metadata, occurred_at
   ) VALUES (
     $1, 'capabilities_detected', 'API capabilities detected',
     $2, $3, NOW()
   );
   ```
10. **Return capabilities with warnings if dangerous permissions detected**

#### Outputs

**Success Response (200 OK) - Read-Only Key (Recommended):**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "bybit",
    "capabilities": {
      "portfolioRead": true,
      "marketDataRead": true,
      "historicalDataRead": true,
      "trading": false,
      "withdrawal": false
    },
    "testResults": {
      "portfolioRead": {
        "endpoint": "/v5/account/wallet-balance",
        "success": true,
        "responseTimeMs": 142,
        "statusCode": 200
      },
      "marketDataRead": {
        "endpoint": "/v5/market/tickers",
        "success": true,
        "responseTimeMs": 85,
        "statusCode": 200
      },
      "historicalDataRead": {
        "endpoint": "/v5/market/kline",
        "success": true,
        "responseTimeMs": 92,
        "statusCode": 200
      },
      "trading": {
        "detected": false,
        "message": "Trading permission not detected"
      },
      "withdrawal": {
        "detected": false,
        "message": "Withdrawal permission not detected"
      }
    },
    "warnings": [],
    "detectedAt": "2024-12-16T12:00:00Z",
    "message": "API key has read-only permissions (recommended)"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - Dangerous Permissions Detected:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "binance",
    "capabilities": {
      "portfolioRead": true,
      "marketDataRead": true,
      "historicalDataRead": true,
      "trading": true,
      "withdrawal": false
    },
    "testResults": {
      "portfolioRead": {
        "endpoint": "/api/v3/account",
        "success": true,
        "responseTimeMs": 156,
        "statusCode": 200
      },
      "marketDataRead": {
        "endpoint": "/api/v3/ticker/24hr",
        "success": true,
        "responseTimeMs": 78,
        "statusCode": 200
      },
      "historicalDataRead": {
        "endpoint": "/api/v3/klines",
        "success": true,
        "responseTimeMs": 95,
        "statusCode": 200
      },
      "trading": {
        "detected": true,
        "message": "Trading permission detected on API key"
      },
      "withdrawal": {
        "detected": false,
        "message": "Withdrawal permission not detected"
      }
    },
    "warnings": [
      {
        "level": "warning",
        "code": "TRADING_PERMISSION_DETECTED",
        "message": "Your API key has trading permissions. We recommend using read-only keys for security.",
        "recommendation": "Create a new API key with only read permissions on your exchange."
      }
    ],
    "detectedAt": "2024-12-16T12:00:00Z",
    "message": "API key has write permissions - read-only recommended"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - Critical Warning (Withdrawal Enabled):**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "bybit",
    "capabilities": {
      "portfolioRead": true,
      "marketDataRead": true,
      "historicalDataRead": true,
      "trading": true,
      "withdrawal": true
    },
    "warnings": [
      {
        "level": "critical",
        "code": "WITHDRAWAL_PERMISSION_DETECTED",
        "message": "CRITICAL: Your API key has withdrawal permissions. This is a security risk.",
        "recommendation": "Immediately create a new API key with only read permissions. Delete this key from your exchange."
      },
      {
        "level": "warning",
        "code": "TRADING_PERMISSION_DETECTED",
        "message": "Your API key has trading permissions. We recommend using read-only keys for security.",
        "recommendation": "Create a new API key with only read permissions on your exchange."
      }
    ],
    "detectedAt": "2024-12-16T12:00:00Z",
    "message": "API key has dangerous permissions - immediate action required"
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
- All capability endpoints tested
- Capabilities stored in database
- Warnings returned for dangerous permissions
- Connection event logged
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Connection not found | 404 | Return "Broker connection not found" |
| Not connection owner | 403 | Return "Access denied" |
| Key Vault error | 500 | Log error, return "Unable to retrieve credentials" |
| Exchange timeout | 200 | Return partial results with failed tests marked |
| Rate limited | 429 | Return "Rate limit exceeded, try again later" |
| Invalid credentials | 200 | Return all tests as failed with error message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-002**: Data Encryption and Secure Storage
- **NFR-INT-001**: Exchange API Integration

**Process-Specific Notes:**
- Target P95 latency: < 3 seconds (includes 5 external API calls)
- Timeout for each exchange call: 5 seconds
- Tests are run sequentially to avoid rate limiting
- Results cached in database for subsequent reads

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `broker_connections`, `connection_events`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Secrets/Key Vault:**
- Azure Key Vault - Retrieves API credentials

**External Services:**
- Bybit API: Multiple endpoints for capability testing
- Binance API: Multiple endpoints for capability testing

#### Notes

**Capability Detection Logic:**
- Portfolio Read: Can access wallet balance/account info
- Market Data Read: Can access public market data (usually always available)
- Historical Data Read: Can access OHLCV data (usually always available)
- Trading: Can place/cancel orders (detected via permissions, NOT tested)
- Withdrawal: Can withdraw funds (detected via permissions, NOT tested)

**Security Warnings:**
- `warning` level: Trading permission detected - recommend read-only
- `critical` level: Withdrawal permission detected - immediate action needed

**When Capabilities are Detected:**
1. Automatically after PROC-BROKER-001 (Add Connection)
2. Manually via this endpoint
3. Periodically via background job (optional)

**Related Processes:**
- PROC-BROKER-001: Add Broker Connection (triggers auto-detection)
- PROC-BROKER-006: Test Broker Connection
- PROC-BROKER-008: List Broker Connections (returns capabilities)

---

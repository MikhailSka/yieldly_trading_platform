### PROC-BROKER-001: Add Broker Connection (Bybit/Binance)

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-BROKER-001, FR-BROKER-002
**Related NFR:** NFR-PERF-001, NFR-SEC-002, NFR-SEC-006
**Related ADR:** ADR-007, ADR-021, ADR-032

#### Trigger
User submits broker connection form with API credentials

#### Actor
Authenticated User

#### Preconditions
- User has created read-only API keys on exchange
- User has not exceeded connection limit (max 5 connections per exchange)

#### Inputs
**API Endpoint:** `POST /api/v1/broker/connections`

**Request Body:**
```json
{
  "exchange": "bybit",
  "apiKey": "string",
  "apiSecret": "string",
  "connectionName": "My Bybit Account (optional)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/broker/connections` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Broker Controller validates exchange type**
   - Must be "bybit" or "binance"
4. **Broker Controller checks connection limit**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT COUNT(*) FROM broker_connections
   WHERE user_id = $1 AND exchange = $2 AND deleted_at IS NULL;
   ```
   - If count >= 5 → Return 429 "Maximum 5 connections per exchange"
5. **Broker Controller selects appropriate adapter**
   - If exchange = "bybit" → Use Bybit Adapter
   - If exchange = "binance" → Use Binance Adapter
6. **Exchange Adapter tests API credentials**
   - Make test API call: `GET /v5/account/wallet-balance` (Bybit)
   - Or `GET /api/v3/account` (Binance)
   - If call fails → Return 400 "Invalid API credentials"
7. **Exchange Adapter extracts account info**
   - Extract exchange account ID from response (for identification)
   - Bybit: `result.list[0].accountType` and account identifier
   - Binance: `accountType` from account response
8. **Exchange Adapter detects API key permissions**
   - Check API key permissions from response
   - Detect capabilities: portfolio_read, market_data, trading, withdrawal
   - If withdrawal enabled → Return warning (security risk)
   - Note: Trading permissions are allowed but logged with warning
9. **Generate unique connection ID**
   ```go
   connectionId := uuid.New()
   ```
10. **Credential Manager stores credentials in Azure Key Vault**
    ```go
    // Store API Key
    apiKeySecretName := fmt.Sprintf("broker-%s-%s-apikey", connectionId, timestamp)
    keyVaultClient.SetSecret(ctx, apiKeySecretName, apiKey)

    // Store API Secret (encrypted)
    apiSecretSecretName := fmt.Sprintf("broker-%s-%s-secret", connectionId, timestamp)
    keyVaultClient.SetSecret(ctx, apiSecretSecretName, apiSecret)
    ```
    - **IMPORTANT**: API keys are NEVER stored in the database
    - Only the Key Vault secret reference names are stored
11. **Broker Repository creates connection record with Key Vault reference**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
    INSERT INTO broker_connections (
      id, user_id, exchange, exchange_account_id, connection_name,
      key_vault_secret_name, api_key_masked, api_permission_type,
      status, detected_capabilities, capabilities_detected_at,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      'active', $9, NOW(),
      NOW(), NOW()
    ) RETURNING id;
    ```
    - `key_vault_secret_name`: Reference to Key Vault (e.g., "broker-{uuid}-{timestamp}")
    - `api_key_masked`: Only first 4 and last 4 characters (e.g., "5Lkj****Xb3B")
    - `api_permission_type`: 'read_only' or 'read_write'
    - `detected_capabilities`: JSON with detected permissions
12. **Log connection creation event**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
    INSERT INTO connection_events (
      broker_connection_id, event_type, event_description,
      triggered_by_user_id, ip_address, occurred_at
    ) VALUES (
      $1, 'connection_created', 'Broker connection created',
      $2, $3, NOW()
    );
    ```
13. **Connection Manager schedules health check**
    - First health check runs immediately
    - Ongoing health checks every 5 minutes
14. **Trigger capability detection** (async)
    - Run PROC-BROKER-010 to detect full API capabilities
15. **Return connection details**

#### Outputs

**Success Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "bybit",
    "exchangeAccountId": "12345678",
    "connectionName": "My Bybit Account",
    "status": "active",
    "apiKeyMasked": "5Lkj****Xb3B",
    "apiPermissionType": "read_only",
    "capabilities": {
      "portfolioRead": true,
      "marketDataRead": true,
      "historicalDataRead": true,
      "trading": false,
      "withdrawal": false
    },
    "warnings": [],
    "createdAt": "2024-12-01T10:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:00Z",
    "version": "v1"
  }
}
```

**Success Response with Warnings (201 Created):**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "binance",
    "exchangeAccountId": "87654321",
    "connectionName": "Binance Trading",
    "status": "active",
    "apiKeyMasked": "Ab12****Xy9Z",
    "apiPermissionType": "read_write",
    "capabilities": {
      "portfolioRead": true,
      "marketDataRead": true,
      "historicalDataRead": true,
      "trading": true,
      "withdrawal": false
    },
    "warnings": [
      {
        "level": "warning",
        "code": "TRADING_PERMISSION_DETECTED",
        "message": "Your API key has trading permissions. We recommend using read-only keys for security."
      }
    ],
    "createdAt": "2024-12-01T10:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid API credentials",
    "details": {
      "exchange": "bybit",
      "reason": "API key authentication failed"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (429 Too Many Requests):**
```json
{
  "success": false,
  "error": {
    "code": "CONNECTION_LIMIT_EXCEEDED",
    "message": "Maximum 5 connections per exchange",
    "details": {
      "exchange": "bybit",
      "currentConnections": 5,
      "maxConnections": 5
    }
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- API credentials validated against exchange
- Credentials stored securely in Azure Key Vault (NOT in database)
- Only Key Vault reference stored in database
- API key masked for display purposes
- Health check scheduled
- HTTP 201 Created

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid credentials | 400 | Return "Invalid API credentials" |
| Connection limit exceeded | 429 | Return "Maximum 5 connections per exchange" |
| Exchange API error | 502 | Return "Unable to connect to exchange" |
| Key Vault error | 500 | Log error, rollback, return "Unable to store credentials securely" |
| Invalid exchange | 400 | Return "Exchange must be one of: bybit, binance" |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-002**: Data Encryption and Secure Storage
- **NFR-SEC-006**: Secrets Management

**Process-Specific Notes:**
- Target P95 latency: < 2 seconds (includes external API validation + Key Vault storage)
- API credentials NEVER stored in database - only Key Vault references
- Key Vault uses Azure managed encryption (AES-256)

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `broker_connections`, `connection_events`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Secrets/Key Vault:**
- Azure Key Vault - Stores API keys and secrets
- Secret naming convention: `broker-{connectionId}-{timestamp}-{type}`

**External Services:**
- Bybit API: `/v5/account/wallet-balance`
- Binance API: `/api/v3/account`

**Cache:**
- Redis (rate limiting)

#### Notes

**Security Architecture:**
- API keys and secrets are stored ONLY in Azure Key Vault
- Database stores only:
  - `key_vault_secret_name`: Reference to retrieve credentials from Key Vault
  - `api_key_masked`: First 4 + last 4 characters for user identification (e.g., "5Lkj****Xb3B")
- When making API calls, credentials are retrieved from Key Vault on-demand
- Key Vault access is logged for audit purposes

**API Key Masking:**
```go
func maskApiKey(apiKey string) string {
  if len(apiKey) <= 8 {
    return "****"
  }
  return apiKey[:4] + "****" + apiKey[len(apiKey)-4:]
}
```

**Related Processes:**
- PROC-BROKER-010: Validate and Detect API Capabilities (called after creation)
- PROC-BROKER-012: Update Broker Connection (credential rotation)
- PROC-BROKER-007: Remove Broker Connection (cleanup Key Vault)

---

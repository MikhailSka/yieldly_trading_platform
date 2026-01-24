# Broker Connectivity Service Processes - Consolidated

This document contains all process documentation for the Broker Connectivity Service.

**Total Documents:** 16  
**Last Generated:** 2025-11-30T23:58:38.361Z  
**Source Directory:** `processes/broker-connectivity-service`


---

## Table of Contents

1. [PROC-BROKER-001](#proc-broker-001)
2. [PROC-BROKER-002](#proc-broker-002)
3. [PROC-BROKER-003](#proc-broker-003)
4. [PROC-BROKER-004](#proc-broker-004)
5. [PROC-BROKER-005](#proc-broker-005)
6. [PROC-BROKER-006](#proc-broker-006)
7. [PROC-BROKER-007](#proc-broker-007)
8. [PROC-BROKER-008](#proc-broker-008)
9. [PROC-BROKER-009](#proc-broker-009)
10. [PROC-BROKER-010](#proc-broker-010)
11. [PROC-BROKER-011](#proc-broker-011)
12. [PROC-BROKER-012](#proc-broker-012)
13. [PROC-BROKER-013](#proc-broker-013)
14. [PROC-BROKER-014](#proc-broker-014)
15. [PROC-BROKER-015](#proc-broker-015)
16. [PROC-BROKER-016](#proc-broker-016)

---

## PROC-BROKER-001: Add Broker Connection (Bybit/Binance)

**Source File:** `PROC-BROKER-001.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-001.md`

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


---

## PROC-BROKER-002: Health Check for Broker Connections

**Source File:** `PROC-BROKER-002.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-002.md`

### PROC-BROKER-002: Health Check for Broker Connections

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-BROKER-004
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
Scheduled background job (every 5 minutes)

#### Actor
System (Scheduler)

#### Preconditions
- Broker connections exist

#### Process Steps

1. **Scheduled Job triggers health check**
2. **Connection Manager queries active connections**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/broker_db_schema.dbml
   SELECT connection_id, user_id, broker, api_key
   FROM broker_connections
   WHERE status != 'disconnected'
   ```
3. **For each connection:**
4. **Connection Manager selects adapter**
5. **Exchange Adapter makes test API call**
   - Lightweight endpoint: `/v5/market/time` (Bybit) or `/api/v3/time` (Binance)
6. **Exchange Adapter checks response**
   - HTTP 200 → Connection healthy
   - HTTP 401/403 → Invalid credentials
   - HTTP 429 → Rate limited (temporary)
   - Timeout → Connection issue
7. **Connection Manager updates connection status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_db_schema.dbml
   UPDATE broker_connections
   SET status = $1,
       last_health_check = NOW(),
       health_check_error = $2
   WHERE connection_id = $3
   ```
8. **If status changed to "unhealthy":**
   - Publish notification event to Service Bus
   - Event type: `broker.connection.unhealthy`
   - Message format per ADR-032
   - User receives in-app and email notification

#### Outputs
**Service Bus Message (ADR-032):**
```json
{
  "messageId": "uuid",
  "eventType": "broker.connection.unhealthy",
  "timestamp": "2024-12-01T10:00:00Z",
  "version": "1.0",
  "source": {
    "service": "broker-connectivity-service",
    "instance": "instance-id"
  },
  "payload": {
    "connectionId": "uuid",
    "userId": "uuid",
    "broker": "bybit",
    "status": "unhealthy",
    "error": "Invalid API credentials"
  },
  "metadata": {
    "correlationId": "uuid",
    "causationId": "uuid",
    "userId": "uuid"
  }
}
```

#### Success Criteria
- All connections checked
- Status updated accurately
- Users notified of issues

#### Error Scenarios

| Error | Handling |
|-------|----------|
| Exchange API error | Mark as "unhealthy", log error |
| Timeout | Mark as "unhealthy", retry next cycle |
| Rate limit hit | Skip check, retry next cycle |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Execution time: < 5 seconds per connection
- Runs every 5 minutes in background

#### Dependencies
**Database:**
- `broker_db` (PostgreSQL) - Tables: `broker_connections`
- Verify schema: docs/01-phase/database-schemas/broker_db_schema.dbml

**External Services:**
- Bybit API: `/v5/market/time`
- Binance API: `/api/v3/time`

**Message Queue:**
- Azure Service Bus - Topic: `broker.connection.unhealthy`

---


---

## PROC-BROKER-003: Fetch Real-Time Market Data

**Source File:** `PROC-BROKER-003.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-003.md`

### PROC-BROKER-003: Fetch Real-Time Market Data

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-MARKET-001, FR-MARKET-002, FR-MARKET-003, FR-MARKET-005
**Related NFR:** NFR-PERF-001, NFR-PERF-002, NFR-SCALE-004
**Related ADR:** ADR-032

#### Trigger
Portfolio Service or frontend requests market data (REST or WebSocket)

#### Actor
System (Portfolio Service) or User (via frontend)

#### Preconditions
- Exchange API is available
- For authenticated endpoints: Valid broker connection (if using user's connection)

---

## Part A: REST API for Initial Data Load

#### Inputs
**API Endpoint:** `GET /api/v1/broker/market-data`

**Query Parameters:**
```
GET /api/v1/broker/market-data?
  exchange=bybit&
  symbol=BTCUSDT&
  type={ticker|klines}&
  interval={1m|5m|15m|1h|4h|1d}&
  limit={number}
```

**Parameter Details:**
- `exchange` (string, required): Exchange identifier (`bybit`, `binance`)
- `symbol` (string, required): Trading pair symbol (e.g., `BTCUSDT`)
- `type` (string, default: `ticker`): Data type (`ticker` for current price, `klines` for candlestick data)
- `interval` (string, required for klines): Candlestick interval
- `limit` (integer, default: 200, max: per exchange config): Number of candles to fetch

#### Process Steps (REST)

1. **API Gateway receives request** → `/api/v1/broker/market-data` (GET)
2. **API Gateway validates JWT** → Extracts user_id (optional for public data)
3. **Broker Controller validates parameters**
   - Check exchange is valid ("bybit", "binance")
   - Check symbol format
   - Validate interval if type=klines
   - Validate limit against exchange configuration (PROC-BROKER-011)
4. **Broker Controller fetches exchange API configuration**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     max_klines_per_request,
     supported_intervals,
     rest_api_base_url
   FROM exchange_configurations
   WHERE exchange = $1;
   ```
   - Ensure requested limit doesn't exceed `max_klines_per_request`
5. **Rate Limiter checks limit**
   ```
   INCR rate_limit:broker:{exchange}:{userId}:minute
   EXPIRE rate_limit:broker:{exchange}:{userId}:minute 60
   GET rate_limit:broker:{exchange}:{userId}:minute
   ```
   - Bybit: 120 requests/minute (default)
   - Binance: 1200 requests/minute (default)
   - If exceeded → Return 429 "Rate limit exceeded"
6. **Broker Controller selects appropriate adapter**
7. **Exchange Adapter makes API call**

   **For Ticker (type=ticker):**
   - Bybit: `GET /v5/market/tickers?category=spot&symbol=BTCUSDT`
   - Binance: `GET /api/v3/ticker/24hr?symbol=BTCUSDT`

   **For Klines (type=klines):**
   - Bybit: `GET /v5/market/kline?category=spot&symbol=BTCUSDT&interval=60&limit=1000`
   - Binance: `GET /api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000`

8. **Exchange Adapter normalizes response** (different formats between exchanges)
9. **Return market data**

#### Outputs (REST)

**Success Response - Ticker (200 OK):**
```json
{
  "success": true,
  "data": {
    "type": "ticker",
    "symbol": "BTCUSDT",
    "exchange": "bybit",
    "lastPrice": 45250.50,
    "bidPrice": 45249.00,
    "askPrice": 45251.00,
    "volume24h": 12345.67,
    "quoteVolume24h": 558432156.78,
    "priceChange24h": 1035.50,
    "priceChange24hPct": 2.34,
    "high24h": 46000.00,
    "low24h": 44000.00,
    "timestamp": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Klines (200 OK):**
```json
{
  "success": true,
  "data": {
    "type": "klines",
    "symbol": "BTCUSDT",
    "exchange": "bybit",
    "interval": "1h",
    "candles": [
      {
        "openTime": "2024-12-01T00:00:00Z",
        "closeTime": "2024-12-01T00:59:59Z",
        "open": 44500.00,
        "high": 44750.00,
        "low": 44400.00,
        "close": 44700.00,
        "volume": 125.5,
        "quoteVolume": 5593875.00
      },
      {
        "openTime": "2024-12-01T01:00:00Z",
        "closeTime": "2024-12-01T01:59:59Z",
        "open": 44700.00,
        "high": 45000.00,
        "low": 44650.00,
        "close": 44950.00,
        "volume": 145.2,
        "quoteVolume": 6524460.00
      }
    ],
    "count": 1000,
    "earliestTimestamp": "2024-11-20T00:00:00Z",
    "latestTimestamp": "2024-12-01T11:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "limit": 1000,
    "exchangeMaxLimit": 1000
  }
}
```

---

## Part B: WebSocket for Real-Time Updates

#### Inputs
**WebSocket Endpoint:** `wss://api.yieldly.io/ws/market-data`

**Connection Parameters:**
```
wss://api.yieldly.io/ws/market-data?token={jwt}
```

**Subscription Message:**
```json
{
  "action": "subscribe",
  "channel": "ticker",
  "exchange": "bybit",
  "symbols": ["BTCUSDT", "ETHUSDT"]
}
```

**Subscription Types:**
- `ticker`: Real-time price updates
- `kline`: Real-time candlestick updates (specify interval)
- `trade`: Recent trades (optional)

#### Process Steps (WebSocket)

1. **Client connects to WebSocket endpoint**
   ```
   wss://api.yieldly.io/ws/market-data?token={jwt}
   ```
2. **WebSocket Gateway validates JWT**
   - If invalid → Close connection with 4001 "Invalid token"
3. **WebSocket Gateway registers connection**
   ```
   SET ws:connection:{connectionId} {userId}
   EXPIRE ws:connection:{connectionId} 3600
   ```
4. **Client sends subscription request**
   ```json
   {
     "action": "subscribe",
     "channel": "ticker",
     "exchange": "bybit",
     "symbols": ["BTCUSDT", "ETHUSDT"]
   }
   ```
5. **WebSocket Manager validates subscription**
   - Check exchange is valid
   - Check symbols exist
   - Limit: Max 50 symbols per connection
6. **WebSocket Manager registers subscription**
   ```
   SADD ws:subscriptions:{exchange}:{symbol} {connectionId}
   SADD ws:user:{connectionId}:subscriptions {exchange}:{symbol}
   ```
7. **WebSocket Manager establishes exchange connection (if not exists)**
   - Connect to exchange WebSocket if not already connected
   - Bybit: `wss://stream.bybit.com/v5/public/spot`
   - Binance: `wss://stream.binance.com:9443/ws`
8. **Exchange stream receives data**
   - Parse and normalize incoming data
9. **WebSocket Manager broadcasts to subscribed clients**
   ```go
   func broadcastToSubscribers(exchange, symbol string, data MarketData) {
     connectionIds := redis.SMembers(fmt.Sprintf("ws:subscriptions:%s:%s", exchange, symbol))
     for _, connId := range connectionIds {
       wsConn := getConnection(connId)
       wsConn.WriteJSON(data)
     }
   }
   ```
10. **Client receives real-time updates**

#### WebSocket Messages

**Subscribe Confirmation:**
```json
{
  "type": "subscribed",
  "channel": "ticker",
  "exchange": "bybit",
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "timestamp": "2024-12-01T12:00:00Z"
}
```

**Ticker Update:**
```json
{
  "type": "ticker",
  "exchange": "bybit",
  "symbol": "BTCUSDT",
  "data": {
    "lastPrice": 45250.50,
    "bidPrice": 45249.00,
    "askPrice": 45251.00,
    "volume24h": 12345.67,
    "priceChange24hPct": 2.34,
    "timestamp": "2024-12-01T12:00:01.234Z"
  }
}
```

**Kline Update:**
```json
{
  "type": "kline",
  "exchange": "bybit",
  "symbol": "BTCUSDT",
  "interval": "1h",
  "data": {
    "openTime": "2024-12-01T11:00:00Z",
    "open": 45100.00,
    "high": 45300.00,
    "low": 45050.00,
    "close": 45250.50,
    "volume": 85.2,
    "isClosed": false
  }
}
```

**Unsubscribe:**
```json
{
  "action": "unsubscribe",
  "channel": "ticker",
  "exchange": "bybit",
  "symbols": ["ETHUSDT"]
}
```

**Error Message:**
```json
{
  "type": "error",
  "code": "INVALID_SYMBOL",
  "message": "Symbol INVALIDUSDT not found on bybit",
  "timestamp": "2024-12-01T12:00:00Z"
}
```

**Heartbeat (every 30 seconds):**
```json
{
  "type": "ping"
}
```

**Heartbeat Response:**
```json
{
  "type": "pong"
}
```

---

## Recommended Usage Pattern

**Initial Chart Load (REST + WebSocket):**

1. **Frontend requests initial chart data via REST:**
   ```
   GET /api/v1/broker/market-data?exchange=bybit&symbol=BTCUSDT&type=klines&interval=1h&limit=1000
   ```
   - Gets last 1000 candles for full chart display

2. **Frontend establishes WebSocket connection:**
   ```
   wss://api.yieldly.io/ws/market-data?token={jwt}
   ```

3. **Frontend subscribes to real-time updates:**
   ```json
   {
     "action": "subscribe",
     "channel": "kline",
     "exchange": "bybit",
     "symbols": ["BTCUSDT"],
     "interval": "1h"
   }
   ```

4. **Frontend receives real-time kline updates and appends to chart**

---

#### Success Criteria
- REST: Market data retrieved from exchange, normalized
- WebSocket: Real-time updates streaming to subscribed clients
- Both: Response normalized across exchanges
- HTTP 200 OK / WebSocket messages delivered

#### Error Scenarios

| Error | Code | Handling |
|-------|------|----------|
| Rate limit exceeded (REST) | 429 | Return "Rate limit exceeded, try again in X seconds" |
| Invalid symbol | 400 | Return "Invalid symbol" |
| Exchange API error | 502 | Return "Exchange temporarily unavailable" |
| Timeout | 504 | Return "Request timeout" |
| Limit exceeds max (REST) | 400 | Return "Limit exceeds exchange maximum of {max}" |
| WebSocket auth failed | 4001 | Close connection "Invalid token" |
| WebSocket subscription limit | 4002 | Error message "Max 50 symbols per connection" |
| WebSocket exchange disconnected | N/A | Auto-reconnect, buffer messages |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for REST)
- **NFR-PERF-002**: Real-time Data Latency (< 100ms from exchange to client)
- **NFR-SCALE-004**: WebSocket Connections (10,000+ concurrent per instance)

**Process-Specific Notes:**
- REST P95 latency: < 500ms (includes external API call)
- WebSocket latency: < 100ms from exchange to client
- WebSocket heartbeat: Every 30 seconds
- Connection timeout: 5 minutes of inactivity
- Auto-reconnect: 3 retries with exponential backoff

#### Dependencies

**Cache:**
- Redis (rate limiting, WebSocket connection registry, subscription management)

**External Services:**
- Bybit REST API: `/v5/market/tickers`, `/v5/market/kline`
- Binance REST API: `/api/v3/ticker/24hr`, `/api/v3/klines`
- Bybit WebSocket: `wss://stream.bybit.com/v5/public/spot`
- Binance WebSocket: `wss://stream.binance.com:9443/ws`

**Database:**
- `broker_db` (PostgreSQL) - Tables: `exchange_configurations`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

#### Notes

**Kline Limit Configuration:**
- Maximum candles per request is configured per exchange in `exchange_configurations`
- Default Bybit: 1000 candles max
- Default Binance: 1000 candles max
- Configured via PROC-BROKER-011 (Manage Exchange API Configuration)

**WebSocket Connection Lifecycle:**
1. Client connects with JWT
2. Client subscribes to channels/symbols
3. Server streams real-time updates
4. Heartbeat every 30 seconds
5. Client unsubscribes or disconnects
6. Server cleans up subscriptions

**Exchange WebSocket Management:**
- Single shared connection per exchange for all users
- Messages multiplexed to subscribed clients
- Auto-reconnect with exponential backoff
- Message buffering during reconnection

**Related Processes:**
- PROC-BROKER-011: Manage Exchange API Configuration (kline limits)
- PROC-BROKER-016: Get Batch Asset Prices (for portfolio pricing)
- PROC-HISTORICAL-001: Query Historical Data (for historical klines)

---


---

## PROC-BROKER-004: Fetch Portfolio Data

**Source File:** `PROC-BROKER-004.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-004.md`

### PROC-BROKER-004: Fetch Portfolio Data

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-PORTFOLIO-001
**Related NFR:** NFR-PERF-001, NFR-SEC-002
**Related ADR:** ADR-032

#### Trigger
Portfolio Service requests portfolio data

#### Actor
System (Portfolio Service)

#### Preconditions
- User has active broker connection
- Connection is healthy

#### Inputs
**API Endpoint:** `GET /api/v1/broker/portfolio`

**Query Parameters:**
```
GET /api/v1/broker/portfolio?
  broker=bybit
  &user_id={uuid}
```

#### Process Steps

1. **Portfolio Service makes request** (internal service-to-service)
2. **Broker Controller retrieves user's connection**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/broker_db_schema.dbml
   SELECT connection_id, api_key
   FROM broker_connections
   WHERE user_id = $1 AND broker = $2 AND status = 'active'
   ```
3. **Credential Manager retrieves API secret from Key Vault**
   ```go
   secretName := fmt.Sprintf("broker-%s-%s-secret", userId, connectionId)
   secret := keyVaultClient.GetSecret(ctx, secretName)
   decrypted := decrypt(secret)
   ```
4. **Exchange Adapter makes authenticated API call**
   - Bybit: `GET /v5/account/wallet-balance`
   - Binance: `GET /api/v3/account`
5. **Exchange Adapter normalizes portfolio data**
6. **Return portfolio data**

#### Outputs
**Success Response (ADR-032):**
```json
{
  "success": true,
  "data": {
    "broker": "bybit",
    "totalValueUsd": 125000.50,
    "assets": [
      {
        "symbol": "BTC",
        "quantity": 2.5,
        "available": 2.5,
        "locked": 0,
        "valueUsd": 112500,
        "percentage": 90
      },
      {
        "symbol": "USDT",
        "quantity": 12500.50,
        "available": 12500.50,
        "locked": 0,
        "valueUsd": 12500.50,
        "percentage": 10
      }
    ],
    "lastUpdated": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Portfolio data retrieved
- Data normalized across exchanges
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Connection not found | 404 | Return "No active connection found" |
| Invalid credentials | 401 | Mark connection unhealthy, notify user |
| Exchange API error | 502 | Return "Unable to fetch portfolio" |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-002**: Data Encryption and Secure Storage

**Process-Specific Notes:**
- Target P95 latency: < 800ms
- Includes Key Vault retrieval and external API call

#### Dependencies
**Database:**
- `broker_db` (PostgreSQL) - Tables: `broker_connections`
- Verify schema: docs/01-phase/database-schemas/broker_db_schema.dbml

**Secrets/Key Vault:**
- Azure Key Vault - Retrieves API secrets

**External Services:**
- Bybit API: `/v5/account/wallet-balance`
- Binance API: `/api/v3/account`

**Cache:**
- Redis (rate limiting)

---


---

## PROC-BROKER-005: Download Historical Data

**Source File:** `PROC-BROKER-005.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-005.md`

### PROC-BROKER-005: Download Historical Data

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-021, ADR-025, ADR-032

#### Trigger
Historical Data Service requests data download OR Admin triggers manual download

#### Actor
System (Historical Data Service) or Admin

#### Preconditions
- Exchange API supports historical data endpoint
- Rate limits allow bulk download

#### Inputs
**API Endpoint:** `POST /api/v1/broker/historical/download`

**Request Body:**
```json
{
  "broker": "bybit",
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

#### Process Steps

1. **Historical Data Service makes request** → `/api/v1/broker/historical/download` (POST)
2. **Broker Controller validates date range**
   - Maximum 2 years per request
   - `endDate >= startDate`
3. **Broker Controller calculates number of candles**
   - 1h timeframe, 365 days = 8,760 candles
4. **Broker Controller selects adapter**
5. **Exchange Adapter implements paginated download**
   - Exchanges limit candles per request (typically 1000-1500)
   - Multiple API calls required
6. **For each page:**
7. **Rate Limiter checks limit** (same as PROC-BROKER-003 step 3)
8. **Exchange Adapter makes API call**
   - Bybit: `GET /v5/market/kline?symbol=BTCUSDT&interval=60&start=...&limit=1000`
   - Binance: `GET /api/v3/klines?symbol=BTCUSDT&interval=1h&startTime=...&limit=1000`
9. **Exchange Adapter normalizes OHLCV data**
10. **Broker Controller yields data back to Historical Data Service**
    - Streaming response to avoid memory issues
11. **Historical Data Service saves to TimescaleDB** (separate process)

#### Outputs
**Success Response (ADR-032):**
```json
{
  "success": true,
  "data": {
    "downloadId": "uuid",
    "symbol": "BTCUSDT",
    "broker": "bybit",
    "timeframe": "1h",
    "totalCandles": 8760,
    "status": "in_progress"
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:00Z",
    "version": "v1"
  }
}
```

**Streamed OHLCV Data (camelCase):**
```json
[
  {
    "timestamp": "2024-01-01T00:00:00Z",
    "open": 45000.0,
    "high": 45250.0,
    "low": 44800.0,
    "close": 45100.0,
    "volume": 123.45
  }
]
```

#### Success Criteria
- All historical data downloaded
- Data normalized
- Streamed to Historical Data Service
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Rate limit exceeded | 429 | Pause download, resume after cooldown |
| Invalid date range | 400 | Return "Invalid date range" |
| Exchange API error | 502 | Retry with exponential backoff |
| Timeout | 504 | Resume from last successful timestamp |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Download speed: ~1000 candles/second
- 1 year of 1h data: ~10 seconds
- Uses streaming to avoid memory issues

#### Dependencies
**Cache:**
- Redis (rate limiting)

**External Services:**
- Bybit API: `/v5/market/kline`
- Binance API: `/api/v3/klines`

---


---

## PROC-BROKER-006: Test Broker Connection

**Source File:** `PROC-BROKER-006.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-006.md`

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


---

## PROC-BROKER-007: Remove Broker Connection

**Source File:** `PROC-BROKER-007.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-007.md`

### PROC-BROKER-007: Remove Broker Connection

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-BROKER-001
**Related NFR:** NFR-PERF-001, NFR-SEC-002
**Related ADR:** ADR-007, ADR-021, ADR-032

#### Trigger
User clicks "Remove Connection" or "Disconnect" button on a broker connection

#### Actor
Authenticated User (owner of the connection)

#### Preconditions
- User is authenticated
- User owns the broker connection
- Connection exists (not already deleted)

#### Inputs
**API Endpoint:** `DELETE /api/v1/broker/connections/{id}`

**Path Parameters:**
- `{id}`: Broker Connection UUID

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/broker/connections/{id}` (DELETE)
2. **API Gateway validates JWT** → Extracts user_id
3. **Broker Controller validates connection exists and ownership**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT id, user_id, exchange, key_vault_secret_name, connection_name, status, deleted_at
   FROM broker_connections
   WHERE id = $1;
   ```
   - If not found → Return 404 "Broker connection not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Broker connection not found"
4. **Check for active dependencies** (optional - based on business rules)
   - Check if connection is used by any active portfolio sync
   - If active dependencies exist → Return 409 with details (or proceed with warning)
5. **Credential Manager deletes API credentials from Key Vault**
   ```go
   secretName := connection.KeyVaultSecretName
   err := keyVaultClient.DeleteSecret(ctx, secretName)
   if err != nil {
     log.Error("Failed to delete secret from Key Vault", "secretName", secretName, "error", err)
     // Continue with soft delete - credential will be orphaned but inaccessible
   }
   ```
6. **Broker Repository soft deletes connection**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   UPDATE broker_connections
   SET deleted_at = NOW(),
       status = 'inactive',
       updated_at = NOW()
   WHERE id = $1;
   ```
7. **Log connection removal event**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   INSERT INTO connection_events (
     broker_connection_id, event_type, event_description,
     triggered_by_user_id, ip_address, occurred_at
   ) VALUES (
     $1, 'deleted', 'Connection removed by user',
     $2, $3, NOW()
   );
   ```
8. **Cancel any pending/running data sync jobs for this connection**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   UPDATE data_sync_jobs
   SET status = 'cancelled',
       error_message = 'Connection removed by user',
       updated_at = NOW()
   WHERE broker_connection_id = $1
     AND status IN ('pending', 'in_progress');
   ```
9. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "bybit",
    "connectionName": "My Bybit Account",
    "deletedAt": "2024-12-16T12:00:00Z",
    "message": "Broker connection removed successfully. API credentials have been deleted."
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

**Error Response (409 Conflict - Active Dependencies):**
```json
{
  "success": false,
  "error": {
    "code": "HAS_ACTIVE_DEPENDENCIES",
    "message": "Cannot remove connection with active dependencies",
    "details": {
      "activeSyncJobs": 2,
      "hint": "Cancel active sync jobs before removing the connection"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Connection soft deleted (deleted_at set)
- API credentials removed from Key Vault
- Connection event logged
- Pending sync jobs cancelled
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Connection not found | 404 | Return "Broker connection not found" |
| Not connection owner | 403 | Return "Access denied" |
| Already deleted | 404 | Return "Broker connection not found" |
| Key Vault delete error | 200 | Log warning, continue with soft delete |
| Active sync jobs (optional) | 409 | Return "Cannot remove connection with active dependencies" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-002**: Data Encryption and Secure Storage

**Process-Specific Notes:**
- Target P95 latency: < 500ms
- Key Vault delete is async - don't wait for confirmation
- Soft delete ensures audit trail is preserved

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `broker_connections`, `connection_events`, `data_sync_jobs`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Secrets/Key Vault:**
- Azure Key Vault - Deletes stored API credentials

#### Notes

**Soft Delete vs Hard Delete:**
- This process performs soft delete (sets deleted_at)
- Hard delete may be performed by a background cleanup job after retention period (e.g., 90 days)
- Soft delete preserves audit trail and allows recovery if needed

**Key Vault Credential Deletion:**
- Credentials are deleted immediately for security
- If Key Vault delete fails, log error but proceed with soft delete
- Orphaned credentials in Key Vault can be cleaned up by maintenance job

**Portfolio Service Impact:**
- After connection removal, Portfolio Service will no longer include this exchange
- Historical portfolio snapshots remain unchanged
- User's aggregated portfolio will be recalculated on next sync

**Data Sync Jobs:**
- Pending and in-progress jobs are cancelled
- Completed jobs and their data remain in Historical Data Service
- Downloaded historical data is NOT deleted (belongs to system, not connection)

**Re-adding Connection:**
- User can add a new connection for the same exchange
- Previous connection data is not restored - creates fresh connection
- Old connection remains soft-deleted for audit purposes

**Related Processes:**
- PROC-BROKER-001: Add Broker Connection
- PROC-BROKER-006: Test Broker Connection
- PROC-BROKER-008: List Broker Connections

---


---

## PROC-BROKER-008: List Broker Connections

**Source File:** `PROC-BROKER-008.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-008.md`

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


---

## PROC-BROKER-009: Get Available Trading Pairs

**Source File:** `PROC-BROKER-009.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-009.md`

### PROC-BROKER-009: Get Available Trading Pairs

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-MARKET-004, FR-BROKER-002
**Related NFR:** NFR-PERF-001, NFR-API-001
**Related ADR:** ADR-032

#### Trigger
User or admin browses available trading pairs for a specific exchange

#### Actor
Authenticated User or Admin User

#### Preconditions
- User is authenticated
- Exchange is supported (bybit, binance)

---

## Part A: User Access (Cached Data)

#### Inputs
**API Endpoint:** `GET /api/v1/broker/exchanges/{exchange}/trading-pairs`

**Path Parameters:**
- `{exchange}`: Exchange identifier (`bybit`, `binance`)

**Query Parameters:**
```
GET /api/v1/broker/exchanges/{exchange}/trading-pairs?
  page={number}&
  page_size={number}&
  search={term}&
  quote_asset={asset}&
  base_asset={asset}&
  is_active={boolean}&
  trending={boolean}&
  min_volume_24h={number}&
  sort_by={field}&
  sort_order={asc|desc}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 50, max: 200): Items per page
- `search` (string, optional, max 20 chars): Search in symbol name
- `quote_asset` (string, optional): Filter by quote asset (e.g., `USDT`, `BTC`)
- `base_asset` (string, optional): Filter by base asset (e.g., `BTC`, `ETH`)
- `is_active` (boolean, default: true): Filter by active trading status
- `trending` (boolean, optional): Filter to show only trending pairs (high volume, high volatility)
- `min_volume_24h` (number, optional): Minimum 24h trading volume in USD
- `sort_by` (string, default: `symbol`): Sort field (`symbol`, `volume_24h`, `base_asset`, `quote_asset`, `price_change_24h`)
- `sort_order` (string, default: `asc`): Sort direction (`asc`, `desc`)

#### Process Steps (User Access)

1. **API Gateway receives request** → Routes to Broker Connectivity Service
2. **API Gateway validates JWT** → Extracts user_id
3. **Broker Controller validates exchange**
   - If exchange not in (`bybit`, `binance`) → Return 400 "Invalid exchange"
4. **Broker Controller validates query parameters**
   - Validate `page` is positive integer
   - Validate `page_size` is between 1 and 200
   - Validate `sort_by` is valid field
   - Return 400 if any validation fails
5. **Broker Controller checks cache for trading pairs**
   ```
   GET exchange:{exchange}:trading_pairs:list
   ```
   - If cache exists and fresh (< 1 hour) → Use cached data
   - If cache miss → Fetch from database
6. **Broker Repository fetches trading pairs from database**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     id,
     exchange,
     symbol,
     base_currency,
     quote_currency,
     is_active,
     is_trading,
     min_order_size,
     max_order_size,
     price_precision,
     quantity_precision,
     maker_fee,
     taker_fee,
     market_type,
     volume_24h_usd,
     price_change_24h_pct,
     is_trending,
     last_synced_at
   FROM exchange_markets
   WHERE exchange = $1
     AND ($2::boolean IS NULL OR is_active = $2)
     AND ($3::varchar IS NULL OR symbol ILIKE '%' || $3 || '%')
     AND ($4::varchar IS NULL OR quote_currency = $4)
     AND ($5::varchar IS NULL OR base_currency = $5)
     AND ($6::boolean IS NULL OR is_trending = $6)
     AND ($7::numeric IS NULL OR volume_24h_usd >= $7)
   ORDER BY
     CASE WHEN $8 = 'symbol' AND $9 = 'asc' THEN symbol END ASC,
     CASE WHEN $8 = 'symbol' AND $9 = 'desc' THEN symbol END DESC,
     CASE WHEN $8 = 'volume_24h' AND $9 = 'asc' THEN volume_24h_usd END ASC,
     CASE WHEN $8 = 'volume_24h' AND $9 = 'desc' THEN volume_24h_usd END DESC,
     CASE WHEN $8 = 'price_change_24h' AND $9 = 'asc' THEN price_change_24h_pct END ASC,
     CASE WHEN $8 = 'price_change_24h' AND $9 = 'desc' THEN price_change_24h_pct END DESC,
     CASE WHEN $8 = 'base_asset' AND $9 = 'asc' THEN base_currency END ASC,
     CASE WHEN $8 = 'base_asset' AND $9 = 'desc' THEN base_currency END DESC,
     CASE WHEN $8 = 'quote_asset' AND $9 = 'asc' THEN quote_currency END ASC,
     CASE WHEN $8 = 'quote_asset' AND $9 = 'desc' THEN quote_currency END DESC
   LIMIT $10 OFFSET $11;
   ```
7. **Broker Repository counts total matching records**
8. **Broker Controller formats response with pagination**
9. **Return paginated trading pairs list**

#### Outputs (User Access)

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTCUSDT",
      "baseAsset": "BTC",
      "quoteAsset": "USDT",
      "exchange": "bybit",
      "isActive": true,
      "isTrading": true,
      "minOrderSize": 0.001,
      "maxOrderSize": 100.0,
      "pricePrecision": 2,
      "quantityPrecision": 3,
      "makerFee": 0.0001,
      "takerFee": 0.0006,
      "marketType": "spot",
      "volume24hUsd": 2500000000.00,
      "priceChange24hPct": 2.45,
      "isTrending": true,
      "lastSyncedAt": "2024-12-16T11:00:00Z"
    },
    {
      "symbol": "ETHUSDT",
      "baseAsset": "ETH",
      "quoteAsset": "USDT",
      "exchange": "bybit",
      "isActive": true,
      "isTrading": true,
      "minOrderSize": 0.01,
      "maxOrderSize": 1000.0,
      "pricePrecision": 2,
      "quantityPrecision": 2,
      "makerFee": 0.0001,
      "takerFee": 0.0006,
      "marketType": "spot",
      "volume24hUsd": 1200000000.00,
      "priceChange24hPct": 3.12,
      "isTrending": true,
      "lastSyncedAt": "2024-12-16T11:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 432,
    "totalPages": 9,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "exchange": "bybit",
    "lastSyncedAt": "2024-12-16T11:00:00Z"
  }
}
```

**Success Response - Trending Filter:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTCUSDT",
      "baseAsset": "BTC",
      "quoteAsset": "USDT",
      "exchange": "binance",
      "isActive": true,
      "isTrading": true,
      "volume24hUsd": 2500000000.00,
      "priceChange24hPct": 5.67,
      "isTrending": true,
      "trendingReason": "high_volume",
      "lastSyncedAt": "2024-12-16T11:00:00Z"
    },
    {
      "symbol": "SOLUSDT",
      "baseAsset": "SOL",
      "quoteAsset": "USDT",
      "exchange": "binance",
      "isActive": true,
      "isTrading": true,
      "volume24hUsd": 890000000.00,
      "priceChange24hPct": 12.34,
      "isTrending": true,
      "trendingReason": "high_volatility",
      "lastSyncedAt": "2024-12-16T11:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 25,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "exchange": "binance",
    "filter": "trending",
    "lastSyncedAt": "2024-12-16T11:00:00Z"
  }
}
```

---

## Part B: Admin Access (Live Data with Comparison)

#### Inputs
**API Endpoint:** `GET /api/v1/admin/broker/exchanges/{exchange}/symbols`

**Path Parameters:**
- `{exchange}`: Exchange identifier (`bybit`, `binance`)

**Query Parameters:**
```
GET /api/v1/admin/broker/exchanges/{exchange}/symbols?
  page={number}&
  page_size={number}&
  search={term}&
  quote_asset={asset}&
  status={status}&
  compare_downloaded={boolean}&
  refresh={boolean}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 100, max: 500): Items per page
- `search` (string, optional, max 50 chars): Search in symbol name
- `quote_asset` (string, optional): Filter by quote asset (e.g., `USDT`, `BTC`, `ETH`)
- `status` (string, optional): Filter by trading status (`trading`, `settling`, `closed`)
- `compare_downloaded` (boolean, default: false): Compare against Historical Data Service
- `refresh` (boolean, default: false): Force refresh from exchange API (bypass cache)

#### Process Steps (Admin Access)

1. **API Gateway receives request** → Routes to Broker Connectivity Service
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Broker Controller validates exchange**
   - If exchange not supported → Return 400 "Unsupported exchange"
5. **Check cache (unless refresh=true)**
   ```
   GET exchange:{exchange}:symbols:admin
   ```
   - If cache exists and fresh (< 1 hour) and refresh=false → Use cached data
6. **If cache miss or refresh=true, fetch from exchange API**

   **For Bybit:**
   ```
   GET https://api.bybit.com/v5/market/instruments-info?category=spot
   ```

   **For Binance:**
   ```
   GET https://api.binance.com/api/v3/exchangeInfo
   ```
7. **Cache exchange response**
   - Cache key: `exchange:{exchange}:symbols:admin`
   - Cache TTL: 1 hour
8. **If compare_downloaded = true, fetch downloaded symbols from Historical Data Service**
   ```sql
   -- Query historical_db for comparison
   SELECT exchange, symbol, available_timeframes, earliest_data_timestamp, latest_data_timestamp
   FROM symbols_metadata
   WHERE exchange = $1 AND total_candles_count > 0;
   ```
9. **Apply filters and pagination**
10. **Return paginated response with comparison data**

#### Outputs (Admin Access)

**Success Response (200 OK) - With Comparison:**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "symbols": [
      {
        "symbol": "BTCUSDT",
        "baseAsset": "BTC",
        "quoteAsset": "USDT",
        "status": "trading",
        "contractType": "spot",
        "launchTime": "2020-03-30T00:00:00Z",
        "priceScale": 2,
        "quantityScale": 3,
        "downloadStatus": "downloaded",
        "downloadedData": {
          "timeframes": ["1h", "4h", "1d"],
          "earliestData": "2020-03-30T00:00:00Z",
          "latestData": "2024-12-16T11:00:00Z",
          "coverage": "full"
        }
      },
      {
        "symbol": "NEWCOINUSDT",
        "baseAsset": "NEWCOIN",
        "quoteAsset": "USDT",
        "status": "trading",
        "contractType": "spot",
        "launchTime": "2024-11-01T00:00:00Z",
        "downloadStatus": "not_downloaded",
        "downloadedData": null
      }
    ],
    "summary": {
      "totalExchangeSymbols": 456,
      "downloadedSymbols": 89,
      "partialSymbols": 23,
      "notDownloadedSymbols": 344
    },
    "exchangeInfo": {
      "totalSymbols": 456,
      "tradingSymbols": 432,
      "lastUpdated": "2024-12-16T11:00:00Z",
      "cacheHit": false
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 100,
    "totalItems": 456,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria
- User access: Trading pairs retrieved from database cache
- Admin access: Symbols retrieved from exchange API (cached)
- Filters applied correctly (including trending, volume)
- Pagination working
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid exchange | 400 | Return "Exchange must be one of: bybit, binance" |
| Invalid page number | 400 | Return "Page must be a positive integer" |
| Invalid page_size | 400 | Return "Page size must be between 1 and 200" |
| Invalid sort_by field | 400 | Return "Invalid sort field" |
| Not admin (admin endpoint) | 403 | Return "Admin access required" |
| Exchange API error | 502 | Return "Exchange API temporarily unavailable" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-API-001**: Pagination and List Optimization

**Process-Specific Notes:**
- **User Access**: < 100ms (cached), < 300ms (database)
- **Admin Access**: < 200ms (cached), 1-2 seconds (exchange API call)
- **Cache Strategy**: Trading pairs list cached for 1 hour in Redis
- **Indexes**: `exchange`, `symbol`, `base_currency`, `quote_currency`, `is_trending`, `volume_24h_usd`

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `exchange_markets`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Cache:**
- Redis - Trading pairs cache (TTL: 1 hour)

**External Services (Admin Only):**
- Bybit API: `GET /v5/market/instruments-info`
- Binance API: `GET /api/v3/exchangeInfo`
- Historical Data Service: `GET /api/v1/admin/historical/symbols` (for comparison)

#### Notes

**Trending Criteria:**
Trading pairs are marked as "trending" based on:
1. **High Volume**: 24h volume in top 10% for the exchange
2. **High Volatility**: Price change > 5% in 24h
3. **Volume Spike**: Current volume > 2x average volume

Trending status is updated by PROC-BROKER-015 (Sync Exchange Markets Cache).

**User vs Admin Access:**
| Feature | User Endpoint | Admin Endpoint |
|---------|---------------|----------------|
| Data Source | Database cache | Exchange API (cached) |
| Trending Filter | ✓ | - |
| Volume Filter | ✓ | - |
| Download Comparison | - | ✓ |
| Force Refresh | - | ✓ |
| Rate Limits | Standard | Higher |

**Use Cases:**
1. **User**: Browse trending pairs for trading ideas
2. **User**: Search for specific symbol to add to watchlist
3. **User**: Filter high-volume pairs for liquidity
4. **Admin**: Discover new symbols available on exchange
5. **Admin**: Identify symbols not yet downloaded for historical data
6. **Admin**: Plan bulk download of missing symbols

**Related Processes:**
- PROC-BROKER-015: Sync Exchange Markets Cache - populates trading pairs and trending data
- PROC-BROKER-005: Download Historical Data (Admin) - queue symbol downloads
- PROC-HISTORICAL-003: List Available Symbols - view downloaded symbols

---


---

## PROC-BROKER-010: Validate and Detect API Capabilities

**Source File:** `PROC-BROKER-010.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-010.md`

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


---

## PROC-BROKER-011: Manage Exchange API Configuration

**Source File:** `PROC-BROKER-011.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-011.md`

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


---

## PROC-BROKER-012: Update Broker Connection

**Source File:** `PROC-BROKER-012.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-012.md`

### PROC-BROKER-012: Update Broker Connection

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-BROKER-001, FR-BROKER-002
**Related NFR:** NFR-PERF-001, NFR-SEC-002, NFR-SEC-006
**Related ADR:** ADR-007, ADR-021, ADR-032

#### Trigger
User updates broker connection details (connection name or API credentials)

#### Actor
Authenticated User (owner of the connection)

#### Preconditions
- User is authenticated
- User owns the broker connection
- Connection exists and is not deleted

#### Inputs
**API Endpoint:** `PATCH /api/v1/broker/connections/{id}`

**Path Parameters:**
- `{id}`: Broker Connection UUID

**Request Body:**
```json
{
  "connectionName": "string (optional, 1-100 chars)",
  "apiKey": "string (optional, required with apiSecret)",
  "apiSecret": "string (optional, required with apiKey)"
}
```

**Validation Rules:**
- At least one field must be provided
- If `apiKey` is provided, `apiSecret` must also be provided (and vice versa)
- `connectionName` must be 1-100 characters if provided
- `apiKey` and `apiSecret` must not be empty strings if provided

#### Process Steps

1. **API Gateway receives request** → `/api/v1/broker/connections/{id}` (PATCH)
2. **API Gateway validates JWT** → Extracts user_id
3. **Broker Controller validates request body**
   - At least one field must be present
   - If credentials provided, both apiKey and apiSecret required
   - Return 400 if validation fails
4. **Broker Controller validates connection exists and ownership**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT id, user_id, exchange, key_vault_secret_name, connection_name, status, deleted_at
   FROM broker_connections
   WHERE id = $1;
   ```
   - If not found → Return 404 "Broker connection not found"
   - If user_id doesn't match → Return 403 "Access denied"
   - If deleted_at IS NOT NULL → Return 404 "Broker connection not found"
5. **If credentials are being updated:**

   **5a. Connection Manager selects appropriate adapter**
   - If exchange = "bybit" → Use Bybit Adapter
   - If exchange = "binance" → Use Binance Adapter

   **5b. Exchange Adapter tests new API credentials**
   - Make test API call: `GET /v5/account/wallet-balance` (Bybit)
   - Or `GET /api/v3/account` (Binance)
   - If call fails → Return 400 "Invalid API credentials"

   **5c. Exchange Adapter verifies read-only permissions**
   - Check API key permissions from response
   - If write permissions detected → Return warning (but allow update)

   **5d. Credential Manager deletes old secret from Key Vault**
   ```go
   oldSecretName := connection.KeyVaultSecretName
   err := keyVaultClient.DeleteSecret(ctx, oldSecretName)
   // Log error but continue - old secret will be orphaned
   ```

   **5e. Credential Manager stores new credentials in Key Vault**
   ```go
   newSecretName := fmt.Sprintf("broker-%s-%s-secret-%d", userId, connectionId, time.Now().Unix())
   encrypted := encrypt(apiSecret)
   keyVaultClient.SetSecret(ctx, newSecretName, encrypted)
   ```

   **5f. Trigger capability detection**
   - Run PROC-BROKER-010 to detect capabilities of new API key

6. **Broker Repository updates connection record**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   UPDATE broker_connections
   SET connection_name = COALESCE($1, connection_name),
       key_vault_secret_name = COALESCE($2, key_vault_secret_name),
       status = CASE WHEN $2 IS NOT NULL THEN 'active' ELSE status END,
       last_validated_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE last_validated_at END,
       validation_error = CASE WHEN $2 IS NOT NULL THEN NULL ELSE validation_error END,
       detected_capabilities = CASE WHEN $2 IS NOT NULL THEN $3 ELSE detected_capabilities END,
       capabilities_detected_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE capabilities_detected_at END,
       updated_at = NOW()
   WHERE id = $4
   RETURNING *;
   ```
7. **Log connection update event**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   INSERT INTO connection_events (
     broker_connection_id, event_type, event_description,
     triggered_by_user_id, ip_address, metadata, occurred_at
   ) VALUES (
     $1,
     CASE WHEN $2 THEN 'credentials_rotated' ELSE 'connection_updated' END,
     CASE WHEN $2 THEN 'API credentials rotated' ELSE 'Connection details updated' END,
     $3, $4, $5, NOW()
   );
   ```
8. **Return updated connection details**

#### Outputs

**Success Response (200 OK) - Name Updated:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "bybit",
    "connectionName": "My Updated Bybit Account",
    "status": "active",
    "healthStatus": "healthy",
    "capabilities": {
      "portfolioRead": true,
      "marketDataRead": true,
      "historicalDataRead": true,
      "trading": false,
      "withdrawal": false
    },
    "updatedAt": "2024-12-16T12:00:00Z",
    "message": "Connection name updated successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - Credentials Rotated:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "binance",
    "connectionName": "My Binance Account",
    "status": "active",
    "healthStatus": "healthy",
    "capabilities": {
      "portfolioRead": true,
      "marketDataRead": true,
      "historicalDataRead": true,
      "trading": false,
      "withdrawal": false
    },
    "credentialsRotated": true,
    "lastValidatedAt": "2024-12-16T12:00:00Z",
    "updatedAt": "2024-12-16T12:00:00Z",
    "message": "API credentials rotated successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - With Credential Warning:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "exchange": "bybit",
    "connectionName": "My Bybit Account",
    "status": "active",
    "healthStatus": "healthy",
    "capabilities": {
      "portfolioRead": true,
      "marketDataRead": true,
      "historicalDataRead": true,
      "trading": true,
      "withdrawal": false
    },
    "credentialsRotated": true,
    "lastValidatedAt": "2024-12-16T12:00:00Z",
    "updatedAt": "2024-12-16T12:00:00Z",
    "warnings": [
      {
        "level": "warning",
        "code": "TRADING_PERMISSION_DETECTED",
        "message": "Your API key has trading permissions. We recommend using read-only keys for security."
      }
    ],
    "message": "API credentials rotated with warnings"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request - Validation):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "apiSecret",
        "message": "API secret is required when updating API key",
        "code": "MISSING_API_SECRET"
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

**Error Response (400 Bad Request - Invalid Credentials):**
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
- Connection details updated in database
- If credentials rotated: new credentials validated and stored
- Old credentials deleted from Key Vault (if rotated)
- Connection event logged
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Connection not found | 404 | Return "Broker connection not found" |
| Not connection owner | 403 | Return "Access denied" |
| No fields provided | 400 | Return "At least one field must be provided" |
| API key without secret | 400 | Return "API secret is required when updating API key" |
| Invalid new credentials | 400 | Return "Invalid API credentials" |
| Key Vault error (store) | 500 | Log error, rollback, return "Unable to store credentials" |
| Key Vault error (delete) | N/A | Log warning, continue (orphan old secret) |
| Exchange API error | 502 | Return "Unable to validate credentials with exchange" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-002**: Data Encryption and Secure Storage
- **NFR-SEC-006**: Secrets Management

**Process-Specific Notes:**
- Name-only update: < 200ms
- Credential rotation: < 2 seconds (includes external API validation)
- Old Key Vault secret deletion is async - don't wait for confirmation

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `broker_connections`, `connection_events`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Secrets/Key Vault:**
- Azure Key Vault - Store new credentials, delete old credentials

**External Services:**
- Bybit API: `/v5/account/wallet-balance` (credential validation)
- Binance API: `/api/v3/account` (credential validation)

#### Notes

**Credential Rotation Best Practices:**
1. User creates new API key on exchange
2. User updates connection with new credentials via this endpoint
3. System validates new credentials before accepting
4. Old credentials are deleted from Key Vault
5. User should delete old API key on exchange

**Partial Updates:**
- This endpoint supports partial updates (PATCH semantics)
- Only provided fields are updated
- Omitted fields retain their current values

**Event Types:**
- `connection_updated`: Name or other metadata changed
- `credentials_rotated`: API credentials were replaced

**Security Audit:**
- All updates are logged with IP address and timestamp
- Credential rotations are flagged separately for security review

**Related Processes:**
- PROC-BROKER-001: Add Broker Connection (initial creation)
- PROC-BROKER-007: Remove Broker Connection (deletion)
- PROC-BROKER-010: Validate and Detect API Capabilities (called after credential rotation)

---


---

## PROC-BROKER-013: Get Connection Details (Single)

**Source File:** `PROC-BROKER-013.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-013.md`

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


---

## PROC-BROKER-014: Manage Connection Rate Limits

**Source File:** `PROC-BROKER-014.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-014.md`

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


---

## PROC-BROKER-015: Sync Exchange Markets Cache

**Source File:** `PROC-BROKER-015.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-015.md`

### PROC-BROKER-015: Sync Exchange Markets Cache

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-MARKET-004, FR-ADMIN-007
**Related NFR:** NFR-PERF-001, NFR-INT-001
**Related ADR:** ADR-032

#### Trigger
Scheduled daily job OR Admin triggers manual sync

#### Actor
System (Scheduler) OR Admin User

#### Preconditions
- Exchange API is available
- Admin connection exists for the exchange (if fetching from exchange API)

#### Inputs

**API Endpoint (Manual Trigger):** `POST /api/v1/admin/broker/exchanges/{exchange}/sync-markets`

**Path Parameters:**
- `{exchange}`: Exchange identifier (`bybit`, `binance`)

**Request Body (optional):**
```json
{
  "forceRefresh": true
}
```

**Parameter Details:**
- `forceRefresh` (boolean, default: false): Skip cache check and fetch fresh data

#### Process Steps

**For Scheduled Job:**

1. **Scheduled Job triggers daily at 00:00 UTC**
2. **Sync Scheduler iterates through enabled exchanges**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT exchange, rest_api_base_url, api_version
   FROM exchange_configurations
   WHERE is_enabled = true;
   ```
3. **For each exchange, proceed with steps 4-12**

**For Manual Trigger:**

1. **API Gateway receives request** → `/api/v1/admin/broker/exchanges/{exchange}/sync-markets` (POST)
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"

**Common Steps (both triggers):**

4. **Broker Controller validates exchange**
   - If exchange not supported → Return 400 "Unsupported exchange"
5. **Check last sync time (skip if forceRefresh = true)**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT MAX(last_synced_at) as last_sync
   FROM exchange_markets
   WHERE exchange = $1;
   ```
   - If last_sync < 1 hour ago AND forceRefresh = false → Skip (return cached)
6. **Exchange Adapter fetches market info from exchange API**

   **For Bybit:**
   ```
   GET https://api.bybit.com/v5/market/instruments-info?category=spot
   GET https://api.bybit.com/v5/market/instruments-info?category=linear
   ```

   **For Binance:**
   ```
   GET https://api.binance.com/api/v3/exchangeInfo
   ```

7. **Parse and normalize exchange response**
   ```go
   type NormalizedMarket struct {
     Symbol           string
     BaseCurrency     string
     QuoteCurrency    string
     IsActive         bool
     IsTrading        bool
     MinOrderSize     decimal.Decimal
     MaxOrderSize     decimal.Decimal
     PricePrecision   int
     QuantityPrecision int
     MakerFee         decimal.Decimal
     TakerFee         decimal.Decimal
     MarketType       string
     Metadata         json.RawMessage
   }
   ```
8. **Begin database transaction**
9. **Upsert market data**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   INSERT INTO exchange_markets (
     exchange, symbol, base_currency, quote_currency,
     is_active, is_trading, min_order_size, max_order_size,
     price_precision, quantity_precision, maker_fee, taker_fee,
     market_type, metadata, last_synced_at
   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
   ON CONFLICT (exchange, symbol)
   DO UPDATE SET
     base_currency = EXCLUDED.base_currency,
     quote_currency = EXCLUDED.quote_currency,
     is_active = EXCLUDED.is_active,
     is_trading = EXCLUDED.is_trading,
     min_order_size = EXCLUDED.min_order_size,
     max_order_size = EXCLUDED.max_order_size,
     price_precision = EXCLUDED.price_precision,
     quantity_precision = EXCLUDED.quantity_precision,
     maker_fee = EXCLUDED.maker_fee,
     taker_fee = EXCLUDED.taker_fee,
     market_type = EXCLUDED.market_type,
     metadata = EXCLUDED.metadata,
     last_synced_at = NOW();
   ```
10. **Mark removed symbols as inactive**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
    UPDATE exchange_markets
    SET is_active = false,
        is_trading = false,
        last_synced_at = NOW()
    WHERE exchange = $1
      AND symbol NOT IN (SELECT unnest($2::varchar[]))
      AND is_active = true;
    ```
11. **Commit transaction**
12. **Update Redis cache**
    ```
    DEL exchange:{exchange}:trading_pairs:list
    ```
13. **Log sync completion**
    ```sql
    -- Log to exchange_status_history
    INSERT INTO exchange_status_history (
      exchange, is_operational, rest_api_available,
      avg_response_time_ms, checked_at
    ) VALUES ($1, true, true, $2, NOW());
    ```
14. **Return sync results**

#### Outputs

**Success Response - Manual Trigger (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "syncResult": {
      "totalSymbols": 456,
      "newSymbols": 12,
      "updatedSymbols": 432,
      "deactivatedSymbols": 3,
      "unchangedSymbols": 9
    },
    "timing": {
      "fetchDurationMs": 1245,
      "processDurationMs": 523,
      "totalDurationMs": 1768
    },
    "syncedAt": "2024-12-16T00:00:00Z",
    "nextScheduledSync": "2024-12-17T00:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T00:00:02Z",
    "version": "v1"
  }
}
```

**Success Response - Skipped (Already Fresh):**
```json
{
  "success": true,
  "data": {
    "exchange": "binance",
    "syncResult": {
      "skipped": true,
      "reason": "Data is fresh (last synced 45 minutes ago)"
    },
    "lastSyncedAt": "2024-12-15T23:15:00Z",
    "nextScheduledSync": "2024-12-17T00:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T00:00:00Z",
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
    "timestamp": "2024-12-16T00:00:00Z",
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
    "message": "Unsupported exchange",
    "details": {
      "exchange": "kraken",
      "supportedExchanges": ["bybit", "binance"]
    }
  },
  "meta": {
    "timestamp": "2024-12-16T00:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (502 Bad Gateway):**
```json
{
  "success": false,
  "error": {
    "code": "EXCHANGE_API_ERROR",
    "message": "Failed to fetch market data from exchange",
    "details": {
      "exchange": "bybit",
      "errorCode": "10001",
      "errorMessage": "Service temporarily unavailable"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T00:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Market data fetched from exchange API
- Database updated with new/changed markets
- Inactive symbols marked appropriately
- Redis cache invalidated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin (manual) | 403 | Return "Admin access required" |
| Unsupported exchange | 400 | Return "Unsupported exchange" |
| Exchange API timeout | 502 | Log error, return "Exchange API timeout" |
| Exchange API error | 502 | Log error, return "Failed to fetch market data" |
| Database error | 500 | Rollback transaction, log error, return generic message |
| Rate limited by exchange | 429 | Log warning, retry with backoff |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-INT-001**: Exchange API Integration

**Process-Specific Notes:**
- Exchange API fetch: 1-3 seconds
- Database upsert (batch): 500ms - 2 seconds for 500 symbols
- Total sync time: < 5 seconds per exchange
- Runs daily at off-peak hours (00:00 UTC)

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `exchange_markets`, `exchange_configurations`, `exchange_status_history`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Cache:**
- Redis - Trading pairs cache (invalidated on sync)

**External Services:**
- Bybit API: `/v5/market/instruments-info`
- Binance API: `/api/v3/exchangeInfo`

#### Notes

**Sync Schedule:**
- Automated sync runs daily at 00:00 UTC
- Manual sync available for admins
- Skip threshold: 1 hour (won't re-sync if data is fresh)

**Data Normalization:**
Each exchange returns data in different formats:
- Bybit: `baseCoin`, `quoteCoin`, `status`
- Binance: `baseAsset`, `quoteAsset`, `status`

The adapter normalizes these to a common format.

**Symbol Lifecycle:**
1. New symbol on exchange → Added as `is_active = true`
2. Symbol removed from exchange → Marked as `is_active = false`
3. Symbol trading halted → `is_trading = false`, `is_active = true`

**Market Types:**
- `spot`: Spot trading pairs
- `linear`: Linear perpetual futures (USDT-margined)
- `inverse`: Inverse perpetual futures (coin-margined)

**Use Cases:**
1. Daily automated refresh of trading pairs
2. Admin manually triggers sync after exchange announces new listings
3. System initialization (first-time data population)

**Related Processes:**
- PROC-BROKER-009: List Available Symbols from Exchange (Admin) - fetches live data with comparison
- PROC-BROKER-011: Get Trading Pairs (User-facing) - uses cached data from this sync

---


---

## PROC-BROKER-016: Get Batch Asset Prices

**Source File:** `PROC-BROKER-016.md`  
**Path:** `processes\broker-connectivity-service\PROC-BROKER-016.md`

### PROC-BROKER-016: Get Batch Asset Prices

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-PORTFOLIO-002, FR-MARKET-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
Portfolio Service or frontend requests current prices for multiple assets to calculate portfolio value

#### Actor
System (Portfolio Service) or Authenticated User (via frontend)

#### Preconditions
- User is authenticated
- At least one valid symbol provided
- Exchange is supported (bybit, binance)

#### Overview

This endpoint provides batch pricing for multiple symbols in a single request. It is primarily used by:
1. **Portfolio Service**: Calculate total portfolio value for manually added assets
2. **Frontend**: Display current prices for watchlist or portfolio holdings
3. **Risk Calculations**: Get latest prices for P&L calculations

The endpoint returns a dictionary mapping each symbol to its current price, making it efficient to price multiple assets without multiple API calls.

---

#### Inputs
**API Endpoint:** `POST /api/v1/broker/prices/batch`

**Request Body:**
```json
{
  "exchange": "bybit",
  "symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"],
  "includeMetadata": false
}
```

**Parameter Details:**
- `exchange` (string, required): Exchange identifier (`bybit`, `binance`)
- `symbols` (array of strings, required): List of trading pair symbols (max 100)
- `includeMetadata` (boolean, default: false): Include additional price metadata (24h change, volume)

**Alternative GET Endpoint (for simpler queries):**
```
GET /api/v1/broker/prices/batch?
  exchange=bybit&
  symbols=BTCUSDT,ETHUSDT,SOLUSDT
```

#### Process Steps

1. **API Gateway receives request** → Routes to Broker Connectivity Service
2. **API Gateway validates JWT** → Extracts user_id
3. **Broker Controller validates request**
   - Validate exchange is supported (`bybit`, `binance`)
   - Validate symbols array is not empty
   - Validate symbols array length <= 100
   - Validate each symbol format (alphanumeric, max 20 chars)
   - Return 400 if any validation fails
4. **Check Redis cache for recent prices**
   ```
   MGET price:{exchange}:BTCUSDT price:{exchange}:ETHUSDT price:{exchange}:SOLUSDT ...
   ```
   - Cache TTL: 5 seconds (prices update frequently)
5. **For cache misses, batch fetch from exchange API**

   **For Bybit:**
   ```
   GET /v5/market/tickers?category=spot&symbol=BTCUSDT,ETHUSDT,SOLUSDT
   ```

   **For Binance:**
   ```
   GET /api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","SOLUSDT"]
   ```
6. **Exchange Adapter normalizes response**
   ```go
   type PriceData struct {
     Symbol      string    `json:"symbol"`
     Price       float64   `json:"price"`
     Timestamp   time.Time `json:"timestamp"`
     // Optional metadata
     Change24h   *float64  `json:"change24h,omitempty"`
     Volume24h   *float64  `json:"volume24h,omitempty"`
   }
   ```
7. **Update Redis cache with fresh prices**
   ```
   MSET price:{exchange}:BTCUSDT {priceData} price:{exchange}:ETHUSDT {priceData} ...
   EXPIRE price:{exchange}:BTCUSDT 5
   EXPIRE price:{exchange}:ETHUSDT 5
   ...
   ```
8. **Build response dictionary**
   ```go
   func buildPriceResponse(prices []PriceData) map[string]interface{} {
     result := make(map[string]interface{})
     for _, p := range prices {
       result[p.Symbol] = map[string]interface{}{
         "price":     p.Price,
         "timestamp": p.Timestamp,
       }
     }
     return result
   }
   ```
9. **Return batch price response**

#### Outputs

**Success Response (200 OK) - Basic:**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "prices": {
      "BTCUSDT": {
        "price": 45250.50,
        "timestamp": "2024-12-16T12:00:01Z"
      },
      "ETHUSDT": {
        "price": 2350.75,
        "timestamp": "2024-12-16T12:00:01Z"
      },
      "SOLUSDT": {
        "price": 98.45,
        "timestamp": "2024-12-16T12:00:01Z"
      },
      "BNBUSDT": {
        "price": 315.20,
        "timestamp": "2024-12-16T12:00:01Z"
      }
    },
    "summary": {
      "requested": 4,
      "found": 4,
      "notFound": 0
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:01Z",
    "version": "v1",
    "cacheHit": true
  }
}
```

**Success Response (200 OK) - With Metadata:**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "prices": {
      "BTCUSDT": {
        "price": 45250.50,
        "timestamp": "2024-12-16T12:00:01Z",
        "change24h": 2.45,
        "change24hPct": 5.42,
        "volume24h": 2500000000.00,
        "high24h": 46000.00,
        "low24h": 44000.00
      },
      "ETHUSDT": {
        "price": 2350.75,
        "timestamp": "2024-12-16T12:00:01Z",
        "change24h": 45.25,
        "change24hPct": 1.96,
        "volume24h": 1200000000.00,
        "high24h": 2400.00,
        "low24h": 2280.00
      },
      "SOLUSDT": {
        "price": 98.45,
        "timestamp": "2024-12-16T12:00:01Z",
        "change24h": 8.50,
        "change24hPct": 9.45,
        "volume24h": 890000000.00,
        "high24h": 102.00,
        "low24h": 89.00
      }
    },
    "summary": {
      "requested": 3,
      "found": 3,
      "notFound": 0
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:01Z",
    "version": "v1",
    "cacheHit": false
  }
}
```

**Success Response (200 OK) - Partial Results:**
```json
{
  "success": true,
  "data": {
    "exchange": "binance",
    "prices": {
      "BTCUSDT": {
        "price": 45250.50,
        "timestamp": "2024-12-16T12:00:01Z"
      },
      "ETHUSDT": {
        "price": 2350.75,
        "timestamp": "2024-12-16T12:00:01Z"
      }
    },
    "notFound": ["INVALIDUSDT", "FAKECOIN"],
    "summary": {
      "requested": 4,
      "found": 2,
      "notFound": 2
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:01Z",
    "version": "v1",
    "cacheHit": false,
    "warning": "Some symbols were not found on the exchange"
  }
}
```

**Error Response (400 Bad Request - Too Many Symbols):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Too many symbols requested",
    "details": [
      {
        "field": "symbols",
        "message": "Maximum 100 symbols per request",
        "code": "MAX_SYMBOLS_EXCEEDED",
        "provided": 150,
        "maximum": 100
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

**Error Response (400 Bad Request - Empty Symbols):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Symbols array is required",
    "details": [
      {
        "field": "symbols",
        "message": "At least one symbol is required",
        "code": "EMPTY_SYMBOLS"
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

#### Success Criteria
- Prices retrieved for all valid symbols
- Invalid symbols reported in `notFound` array
- Response cached for subsequent requests
- HTTP 200 OK (even for partial results)

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid exchange | 400 | Return "Exchange must be one of: bybit, binance" |
| Empty symbols array | 400 | Return "At least one symbol is required" |
| Too many symbols | 400 | Return "Maximum 100 symbols per request" |
| Invalid symbol format | 400 | Return "Invalid symbol format" |
| Exchange API error | 502 | Return "Exchange temporarily unavailable" |
| Rate limit exceeded | 429 | Return "Rate limit exceeded, try again in X seconds" |
| All symbols not found | 404 | Return "No valid symbols found on exchange" |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Cache Strategy**: Prices cached for 5 seconds in Redis
- **Cache Hit**: < 50ms response time
- **Cache Miss**: < 300ms response time (single exchange API call)
- **Batch Size**: Max 100 symbols per request
- **Exchange API Calls**: Single call per request (batch endpoint)

#### Dependencies

**Cache:**
- Redis - Price cache (TTL: 5 seconds)
- Cache key format: `price:{exchange}:{symbol}`

**External Services:**
- Bybit API: `GET /v5/market/tickers`
- Binance API: `GET /api/v3/ticker/price`

**Database:**
- None (prices are not stored, only cached)

#### Notes

**Use Cases:**

1. **Portfolio Value Calculation:**
   ```go
   // Portfolio Service calls this to price manual assets
   func calculatePortfolioValue(assets []Asset) (float64, error) {
     symbols := extractSymbols(assets)
     prices, err := brokerService.GetBatchPrices("bybit", symbols)
     if err != nil {
       return 0, err
     }

     total := 0.0
     for _, asset := range assets {
       price := prices[asset.Symbol]
       total += asset.Quantity * price
     }
     return total, nil
   }
   ```

2. **Watchlist Display:**
   ```javascript
   // Frontend fetches prices for watchlist
   const response = await fetch('/api/v1/broker/prices/batch', {
     method: 'POST',
     body: JSON.stringify({
       exchange: 'binance',
       symbols: watchlistSymbols,
       includeMetadata: true
     })
   });
   ```

3. **P&L Calculation:**
   ```go
   // Calculate unrealized P&L for positions
   func calculateUnrealizedPnL(positions []Position) map[string]float64 {
     symbols := extractSymbols(positions)
     prices, _ := brokerService.GetBatchPrices(exchange, symbols)

     pnl := make(map[string]float64)
     for _, pos := range positions {
       currentValue := pos.Quantity * prices[pos.Symbol]
       pnl[pos.Symbol] = currentValue - pos.CostBasis
     }
     return pnl
   }
   ```

**Caching Strategy:**

| Scenario | Cache TTL | Reason |
|----------|-----------|--------|
| Standard request | 5 seconds | Balance freshness vs API limits |
| High-frequency user | 5 seconds | Prevent API abuse |
| Portfolio calculation | 5 seconds | Acceptable staleness for aggregation |

**Rate Limiting:**
- Counted against user's broker rate limit
- Weight: 1 per request (regardless of symbol count)
- Bybit: 120 requests/minute
- Binance: 1200 requests/minute

**Symbol Validation:**
Symbols are validated against the exchange_markets cache before making API calls. If a symbol doesn't exist in the cache:
1. First check: Query exchange_markets table
2. If not found: Still attempt API call (symbol might be new)
3. If API returns no price: Add to `notFound` array

**Related Processes:**
- PROC-BROKER-003: Fetch Real-Time Market Data (for single symbol, real-time)
- PROC-PORTFOLIO-001: Get Portfolio Dashboard (uses batch prices for valuation)
- PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot (uses batch prices)
- PROC-BROKER-009: Get Available Trading Pairs (symbol validation)

---


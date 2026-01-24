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

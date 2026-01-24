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

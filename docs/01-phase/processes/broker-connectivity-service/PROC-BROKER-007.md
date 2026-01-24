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

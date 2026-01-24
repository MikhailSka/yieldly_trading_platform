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

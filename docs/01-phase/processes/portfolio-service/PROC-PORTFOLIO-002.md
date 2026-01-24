### PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-022, ADR-032

#### Trigger
Scheduled background job (every hour during market hours)

#### Actor
System (Scheduler)

#### Preconditions
- Market is open (crypto: 24/7)

#### Process Steps

1. **Scheduled Job triggers snapshot creation**
2. **Snapshot Scheduler queries active users**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/broker_db_schema.dbml
   SELECT DISTINCT user_id
   FROM broker_connections
   WHERE status = 'active'
   ```
3. **For each user:**
4. **Snapshot Scheduler calls Portfolio Aggregator**
   - Same as PROC-PORTFOLIO-001 steps 3-7
5. **Snapshot Scheduler saves snapshot to database**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   INSERT INTO portfolio_snapshots (
     user_id, timestamp, total_value_usd,
     exchange_breakdown, asset_breakdown,
     created_at
   ) VALUES (
     $1, NOW(), $2,
     $3, $4,
     NOW()
   )
   ```
6. **Snapshot Scheduler checks for significant changes**
   - If portfolio value changed > 10% in 1 hour → Publish notification event
   - Event type: `portfolio.value.changed`
   - Message format per ADR-032

#### Outputs
**Service Bus Message (if significant change, ADR-032):**
```json
{
  "messageId": "uuid",
  "eventType": "portfolio.value.changed",
  "timestamp": "2024-12-01T12:00:00Z",
  "version": "1.0",
  "source": {
    "service": "portfolio-service",
    "instance": "instance-id"
  },
  "payload": {
    "userId": "uuid",
    "changePct": 12.5,
    "oldValue": 200000,
    "newValue": 225000
  },
  "metadata": {
    "correlationId": "uuid",
    "causationId": "uuid",
    "userId": "uuid"
  }
}
```

#### Success Criteria
- Snapshots created for all active users
- Data saved to database

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Execution time: < 5 minutes for 1000 users
- Runs hourly in background
- Processes users in batches for efficiency

#### Dependencies
**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_snapshots`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**External Services:**
- Broker Service (for fetching portfolio data)

**Message Queue:**
- Azure Service Bus - Topic: `portfolio.value.changed`

---

### PROC-NOTIFY-001: Send In-App Notification

**Service Owner:** Notification Service
**Related FR:** FR-NOTIFY-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-023, ADR-032

#### Trigger
Event published to Azure Service Bus

#### Actor
System (Event Publisher)

#### Preconditions
- User has notification preferences configured

#### Inputs
**Service Bus Message (ADR-032 format):**
```json
{
  "messageId": "uuid",
  "eventType": "backtest.execution.completed",
  "timestamp": "2024-12-01T12:00:00Z",
  "version": "1.0",
  "source": {
    "service": "backtesting-service",
    "instance": "instance-id"
  },
  "payload": {
    "userId": "uuid",
    "title": "Backtest Completed",
    "message": "Your backtest for 'My Strategy' has completed successfully.",
    "data": {
      "backtestId": "uuid",
      "strategyName": "My Strategy"
    },
    "priority": "medium"
  },
  "metadata": {
    "correlationId": "uuid",
    "causationId": "uuid",
    "userId": "uuid"
  }
}
```

#### Process Steps

1. **Service Bus delivers message to Notification Service**
2. **Job Consumer receives message**
3. **Job Consumer checks user preferences**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/notification_db_schema.dbml
   SELECT in_app_enabled, email_enabled, notification_types
   FROM notification_preferences
   WHERE user_id = $1
   ```
   - If `in_app_enabled = false` → Skip in-app notification
   - Check if event type is in `notification_types` array
4. **Notification Repository saves notification**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/notification_db_schema.dbml
   INSERT INTO notifications (
     user_id, type, title, message,
     data, priority, is_read, created_at
   ) VALUES (
     $1, $2, $3, $4,
     $5, $6, false, NOW()
   ) RETURNING notification_id
   ```
5. **Notification Service pushes to WebSocket** (if user online)
   - Real-time notification to active browser sessions
6. **Return (async, no direct response)**

#### Outputs
- Notification record in database
- Real-time push to user's browser (if online)

#### Success Criteria
- Notification saved to database
- User sees notification in UI

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Processing time: < 100ms per notification
- WebSocket push is real-time (< 10ms latency)

#### Dependencies
**Database:**
- `notification_db` (PostgreSQL) - Tables: `notifications`, `notification_preferences`
- Verify schema: docs/01-phase/database-schemas/notification_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Subscribes to all notification events

**WebSocket:**
- For real-time push to connected clients

---

### PROC-NOTIFY-002: Send Email Notification

**Service Owner:** Notification Service
**Related FR:** FR-NOTIFY-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-023, ADR-032

#### Trigger
Event published to Azure Service Bus requiring email

#### Actor
System (Event Publisher)

#### Preconditions
- User has verified email address
- User has email notifications enabled

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
    "template": "backtest_completed",
    "data": {
      "userName": "John",
      "strategyName": "My SMA Strategy",
      "backtestId": "uuid",
      "summary": {
        "totalReturn": 25.5,
        "winRate": 65.2
      }
    }
  },
  "metadata": {
    "correlationId": "uuid",
    "causationId": "uuid",
    "userId": "uuid"
  }
}
```

#### Process Steps

1. **Service Bus delivers message**
2. **Job Consumer receives message**
3. **Job Consumer checks email preferences**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/notification_db_schema.dbml
   SELECT email_enabled, email_types
   FROM notification_preferences
   WHERE user_id = $1
   ```
   - If `email_enabled = false` → Skip
4. **Job Consumer retrieves user email**
   - Call User Service: `GET /api/v1/users/{userId}/email`
5. **Job Consumer loads email template**
   - Templates stored in database or file system
   - Example: `templates/backtest_completed.html`
6. **Job Consumer renders template with data**
   ```html
   Hi {{userName}},

   Your backtest for "{{strategyName}}" has completed!

   Results Summary:
   - Total Return: {{summary.totalReturn}}%
   - Win Rate: {{summary.winRate}}%

   View full results: https://app.yieldly.com/backtests/{{backtestId}}
   ```
7. **Job Consumer sends via SendGrid**
   ```go
   message := mail.NewSingleEmail(
     from,
     subject,
     to,
     plainTextContent,
     htmlContent,
   )
   response, err := sendGridClient.Send(message)
   ```
8. **Notification Repository logs email sent**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/notification_db_schema.dbml
   INSERT INTO notification_log (
     user_id, type, channel, status,
     sent_at, external_id
   ) VALUES (
     $1, $2, 'email', 'sent',
     NOW(), $3
   )
   ```

#### Outputs
- Email delivered to user's inbox
- Email log record created

#### Success Criteria
- Email sent successfully
- Delivery logged

#### Error Scenarios

| Error | Handling |
|-------|----------|
| SendGrid API error | Retry 3 times with exponential backoff |
| Invalid email address | Mark as failed, log error |
| Template rendering error | Log error, skip email |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Email delivery: < 5 seconds
- Retry strategy: 3 attempts with exponential backoff

#### Dependencies
**Database:**
- `notification_db` (PostgreSQL) - Tables: `notification_log`, `notification_preferences`
- Verify schema: docs/01-phase/database-schemas/notification_db_schema.dbml

**External Services:**
- SendGrid API (email delivery)
- User Service: `GET /api/v1/users/{userId}/email`

**Message Queue:**
- Azure Service Bus - Subscribes to email notification events

---

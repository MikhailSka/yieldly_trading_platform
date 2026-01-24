### PROC-USER-009: GDPR Data Export

**Service Owner:** User Service
**Related FR:** FR-PROFILE-005
**Related NFR:** NFR-PERF-001, NFR-COMP-001
**Related ADR:** ADR-027, ADR-032

#### Trigger
User requests data export from account settings

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- No active export in progress (rate limit: 1 per 24 hours)

#### Inputs

**API Endpoint:** `POST /api/v1/users/data-export`

**Request Body:**
```json
{
  "format": "json (required, currently only json supported)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/users/data-export` (POST)
2. **Profile Controller checks rate limit**
   ```
   GET rate_limit:export:{user_id}
   ```
   - If exists → Return 429 "Export request already in progress"
3. **Profile Controller sets rate limit**
   ```
   SET rate_limit:export:{user_id} 1
   EXPIRE rate_limit:export:{user_id} 86400
   ```
4. **Profile Controller publishes async job**
   - Publish to Service Bus topic: `user.export`
   - Event message format (ADR-032):
   ```json
   {
     "messageId": "uuid",
     "eventType": "user.export.requested",
     "timestamp": "2024-12-01T12:00:00Z",
     "version": "1.0",
     "source": {
       "service": "user-service",
       "instance": "instance-id"
     },
     "payload": {
       "userId": "uuid",
       "format": "json",
       "requestedAt": "2024-12-01T12:00:00Z"
     },
     "metadata": {
       "correlationId": "uuid",
       "causationId": "uuid",
       "userId": "uuid"
     }
   }
   ```
5. **Return immediate response** (async processing)
6. **Background Worker consumes job**
7. **Worker collects data from all services**:
   - **User Service**: User profile, preferences, sessions
   - **Strategy Service**: User strategies (code, descriptions)
   - **Backtesting Service**: Backtest results, trades
   - **Broker Service**: Connection metadata (no API keys)
   - **Portfolio Service**: Portfolio snapshots
   - **Notification Service**: Notification history
8. **Worker aggregates data into JSON structure**
   ```json
   {
     "user_data": { ... },
     "strategies": [ ... ],
     "backtests": [ ... ],
     "portfolio_history": [ ... ],
     "notifications": [ ... ],
     "export_date": "timestamp"
   }
   ```
9. **Worker uploads to Azure Blob Storage**
   - Blob name: `gdpr-exports/{user_id}/{timestamp}.json`
   - TTL: 7 days (auto-delete)
10. **Worker generates secure download link**
    - Azure Blob SAS token with 7-day expiration
11. **Notification Service emails user**
    - Subject: "Your data export is ready"
    - Body: Download link + expiration warning
12. **Worker marks export complete**
    ```sql
    INSERT INTO gdpr_exports (user_id, export_url, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '7 days')
    ```

#### Outputs

**Immediate Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "estimatedCompletion": "< 30 minutes",
    "message": "Data export request received. You will receive an email with download link within 30 minutes."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (429 Too Many Requests - Rate Limit):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Export in progress or recently completed. Please wait 24 hours between export requests.",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Email to User (After Export Completes):**
```
Subject: Your Yieldly data export is ready

Your data export has been prepared and is available for download for the next 7 days.

Download link: https://yieldlystorage.blob.core.windows.net/gdpr-exports/user_id/export.json?sas_token

This link expires on: 2025-11-30 12:00:00 UTC

If you did not request this export, please contact support immediately.
```

#### Success Criteria
- Export job created
- Rate limit applied
- User receives download link via email
- Export file available for 7 days

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Rate limit exceeded | 429 | Return "Export in progress or recently completed" |
| Service unavailable | 503 | Retry job 3 times with backoff |
| Database error | 500 | Log error, retry |
| Email delivery failure | 200 | Log warning, allow manual download from UI |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-COMP-001**: GDPR Compliance (data export within 30 days, typically < 30 minutes)

**Process-Specific Notes:**
- **Immediate Response Time**: < 200ms (job queuing)
- **Export Generation Time**: < 30 minutes (background job)
- **File Size**: Typically 1-50 MB (depends on user data volume)
- **Email Delivery**: < 5 minutes after export ready
- **Rate Limit**: 1 export per 24 hours per user

#### Dependencies
**Database:**
- All service databases (read-only access for data collection)
- `user_db`, `strategy_db`, `backtest_db`, `portfolio_db`, `notification_db`
- Tables: `gdpr_exports`

**Cache:**
- Redis - rate limiting: `rate_limit:export:{user_id}`

**Message Queue:**
- Azure Service Bus - topics: `user.export`

**External Services:**
- SendGrid (via Notification Service) - email delivery

**Storage:**
- Azure Blob Storage - GDPR exports storage: `gdpr-exports/{user_id}/{timestamp}.json` (7-day TTL)

---

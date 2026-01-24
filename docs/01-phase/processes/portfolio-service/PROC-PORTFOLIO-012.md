### PROC-PORTFOLIO-012: Manage Portfolio Alert Preferences

**Service Owner:** Portfolio Service
**Related FR:** FR-NOTIFY-003
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User configures alert preferences in portfolio settings

#### Actor
Authenticated User

#### Preconditions
- User is authenticated

#### Inputs

**API Endpoint (Get):** `GET /api/v1/portfolio/alert-preferences`

**API Endpoint (Update):** `PUT /api/v1/portfolio/alert-preferences`

**Request Body (for PUT):**
```json
{
  "drawdownAlerts": {
    "enabled": true,
    "thresholdPercent": 10.0
  },
  "valueChangeAlerts": {
    "enabled": true,
    "thresholdPercent": 10.0,
    "period": "24h"
  },
  "valueAlerts": {
    "enabled": false,
    "thresholdUsd": null
  },
  "dailySummary": {
    "enabled": true,
    "time": "09:00"
  },
  "alertChannels": {
    "email": true,
    "inApp": true,
    "push": false
  },
  "cooldownHours": 24
}
```

**Validation Rules:**
- `drawdownAlerts.thresholdPercent` must be between 1 and 50 if enabled
- `valueChangeAlerts.thresholdPercent` must be between 1 and 50 if enabled
- `valueChangeAlerts.period` must be '1h', '24h', or '7d'
- `valueAlerts.thresholdUsd` must be positive if enabled
- `dailySummary.time` must be valid 24h format (HH:mm)
- `cooldownHours` must be between 1 and 168 (1 week)

#### Process Steps

**For GET (View Preferences):**

1. **API Gateway receives request** → `/api/v1/portfolio/alert-preferences` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Repository fetches alert preferences**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     user_id,
     enable_drawdown_alerts,
     drawdown_alert_threshold,
     enable_value_change_alerts,
     value_change_threshold_percent,
     value_change_period,
     enable_value_alerts,
     value_alert_threshold_usd,
     enable_daily_summary,
     daily_summary_time,
     alert_via_email,
     alert_via_in_app,
     alert_via_push,
     alert_cooldown_hours,
     last_drawdown_alert_at,
     last_value_change_alert_at,
     last_value_alert_at,
     created_at,
     updated_at
   FROM portfolio_alert_preferences
   WHERE user_id = $1;
   ```
4. **If no preferences exist, return defaults**
   ```go
   defaultPrefs := AlertPreferences{
     EnableDrawdownAlerts:          true,
     DrawdownAlertThreshold:        10.0,
     EnableValueChangeAlerts:       true,
     ValueChangeThresholdPercent:   10.0,
     ValueChangePeriod:             "24h",
     EnableValueAlerts:             false,
     ValueAlertThresholdUSD:        nil,
     EnableDailySummary:            false,
     DailySummaryTime:              "09:00",
     AlertViaEmail:                 true,
     AlertViaInApp:                 true,
     AlertViaPush:                  false,
     AlertCooldownHours:            24,
   }
   ```
5. **Return preferences**

**For PUT (Update Preferences):**

1. **API Gateway receives request** → `/api/v1/portfolio/alert-preferences` (PUT)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates request body**
   - Validate drawdown thresholdPercent is in range [1, 50]
   - Validate valueChange thresholdPercent is in range [1, 50]
   - Validate valueChange period is '1h', '24h', or '7d'
   - Validate thresholdUsd is positive if provided
   - Validate time format is HH:mm
   - Validate cooldownHours is in range [1, 168]
   - Return 400 if validation fails
4. **Portfolio Repository upserts preferences**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   INSERT INTO portfolio_alert_preferences (
     user_id,
     enable_drawdown_alerts, drawdown_alert_threshold,
     enable_value_change_alerts, value_change_threshold_percent, value_change_period,
     enable_value_alerts, value_alert_threshold_usd,
     enable_daily_summary, daily_summary_time,
     alert_via_email, alert_via_in_app, alert_via_push,
     alert_cooldown_hours,
     created_at, updated_at
   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
   ON CONFLICT (user_id)
   DO UPDATE SET
     enable_drawdown_alerts = EXCLUDED.enable_drawdown_alerts,
     drawdown_alert_threshold = EXCLUDED.drawdown_alert_threshold,
     enable_value_change_alerts = EXCLUDED.enable_value_change_alerts,
     value_change_threshold_percent = EXCLUDED.value_change_threshold_percent,
     value_change_period = EXCLUDED.value_change_period,
     enable_value_alerts = EXCLUDED.enable_value_alerts,
     value_alert_threshold_usd = EXCLUDED.value_alert_threshold_usd,
     enable_daily_summary = EXCLUDED.enable_daily_summary,
     daily_summary_time = EXCLUDED.daily_summary_time,
     alert_via_email = EXCLUDED.alert_via_email,
     alert_via_in_app = EXCLUDED.alert_via_in_app,
     alert_via_push = EXCLUDED.alert_via_push,
     alert_cooldown_hours = EXCLUDED.alert_cooldown_hours,
     updated_at = NOW()
   RETURNING *;
   ```
5. **If daily summary enabled/changed, update scheduler**
   - Register/update user in daily summary job
6. **Return updated preferences**

#### Outputs

**Success Response - GET (200 OK):**
```json
{
  "success": true,
  "data": {
    "drawdownAlerts": {
      "enabled": true,
      "thresholdPercent": 10.0,
      "description": "Alert when portfolio drops 10% from peak"
    },
    "valueChangeAlerts": {
      "enabled": true,
      "thresholdPercent": 10.0,
      "period": "24h",
      "description": "Alert when portfolio value changes by 10% in 24 hours"
    },
    "valueAlerts": {
      "enabled": false,
      "thresholdUsd": null,
      "description": "Alert when portfolio value drops below threshold"
    },
    "dailySummary": {
      "enabled": true,
      "time": "09:00",
      "timezone": "UTC",
      "description": "Daily portfolio summary at 09:00 UTC"
    },
    "alertChannels": {
      "email": true,
      "inApp": true,
      "push": false
    },
    "cooldownHours": 24,
    "lastAlerts": {
      "lastDrawdownAlertAt": null,
      "lastValueChangeAlertAt": "2024-12-15T08:00:00Z",
      "lastValueAlertAt": null
    },
    "lastUpdatedAt": "2024-12-15T10:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - GET (200 OK) - Defaults:**
```json
{
  "success": true,
  "data": {
    "drawdownAlerts": {
      "enabled": true,
      "thresholdPercent": 10.0,
      "description": "Alert when portfolio drops 10% from peak"
    },
    "valueChangeAlerts": {
      "enabled": true,
      "thresholdPercent": 10.0,
      "period": "24h",
      "description": "Alert when portfolio value changes by 10% in 24 hours"
    },
    "valueAlerts": {
      "enabled": false,
      "thresholdUsd": null,
      "description": "Alert when portfolio value drops below threshold"
    },
    "dailySummary": {
      "enabled": false,
      "time": "09:00",
      "timezone": "UTC",
      "description": "Daily portfolio summary at 09:00 UTC"
    },
    "alertChannels": {
      "email": true,
      "inApp": true,
      "push": false
    },
    "cooldownHours": 24,
    "isDefault": true,
    "lastUpdatedAt": null
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
    "drawdownAlerts": {
      "enabled": true,
      "thresholdPercent": 15.0,
      "description": "Alert when portfolio drops 15% from peak"
    },
    "valueChangeAlerts": {
      "enabled": true,
      "thresholdPercent": 10.0,
      "period": "24h",
      "description": "Alert when portfolio value changes by 10% in 24 hours"
    },
    "valueAlerts": {
      "enabled": true,
      "thresholdUsd": 100000.00,
      "description": "Alert when portfolio value drops below $100,000"
    },
    "dailySummary": {
      "enabled": true,
      "time": "08:00",
      "timezone": "UTC",
      "description": "Daily portfolio summary at 08:00 UTC"
    },
    "alertChannels": {
      "email": true,
      "inApp": true,
      "push": true
    },
    "cooldownHours": 12,
    "lastUpdatedAt": "2024-12-16T12:00:00Z",
    "message": "Alert preferences updated successfully"
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
    "message": "Invalid alert configuration",
    "details": [
      {
        "field": "drawdownAlerts.thresholdPercent",
        "message": "Threshold must be between 1% and 50%",
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

#### Success Criteria
- GET: Preferences retrieved (or defaults returned)
- PUT: Preferences validated and stored
- PUT: Scheduler updated if daily summary changed
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid threshold range | 400 | Return "Threshold must be between 1% and 50%" |
| Invalid value threshold | 400 | Return "Value threshold must be positive" |
| Invalid time format | 400 | Return "Time must be in HH:mm format" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- GET: < 50ms (simple query)
- PUT: < 100ms (upsert + scheduler update)
- No caching needed (settings accessed infrequently)

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_alert_preferences`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Daily summary scheduler registration

#### Notes

**Alert Types:**

| Alert Type | Trigger | Check Frequency |
|------------|---------|-----------------|
| Drawdown Alert | Portfolio drops X% from peak | Every snapshot (hourly) |
| Value Change Alert | Portfolio changes by X% in period | Every snapshot (hourly) |
| Value Alert | Portfolio drops below $X | Every snapshot (hourly) |
| Daily Summary | Scheduled time | Daily |

**Value Change Periods:**
- `1h`: Compare to 1 hour ago
- `24h`: Compare to 24 hours ago (default)
- `7d`: Compare to 7 days ago

**Alert Channels:**
- **Email**: Sent via Notification Service
- **In-App**: Real-time in-app notification
- **Push**: Browser push notifications (future)

**Threshold Limits:**
- Drawdown: 1% - 50% (prevents spammy alerts)
- Value Change: 1% - 50% (prevents spammy alerts)
- Value: Any positive amount (user's choice)

**Daily Summary Content:**
- Current portfolio value
- 24h change (value and %)
- Top gainers/losers
- Current drawdown status

**Alert Cooldown:**
- Configurable: 1 - 168 hours (default: 24 hours)
- Same cooldown applies to all alert types
- Tracks last alert time per alert type
- Prevents spam during volatile markets

**Related Processes:**
- PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot (checks alert conditions)
- PROC-PORTFOLIO-007: Get Risk Metrics (drawdown calculation)
- PROC-PORTFOLIO-017: Manage Price Alerts (user price alerts)
- PROC-PORTFOLIO-018: Check Price Alerts (scheduled)
- PROC-NOTIFY-001: Send In-App Notification
- PROC-NOTIFY-002: Send Email Notification

---

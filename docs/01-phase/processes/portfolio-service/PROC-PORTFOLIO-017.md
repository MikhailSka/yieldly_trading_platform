### PROC-PORTFOLIO-017: Manage Price Alerts (CRUD)

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-010
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-023

#### Trigger
User creates, updates, or deletes a price alert

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User has verified email (for email alerts)

---

## 17.1 Create Price Alert

#### Inputs

**API Endpoint:** `POST /api/v1/portfolio/alerts/price`

**Request Body - Crosses Above/Below:**
```json
{
  "asset": "BTC",
  "alertType": "crosses_above",
  "targetValue": 50000.00,
  "isRecurring": false,
  "cooldownHours": 24,
  "notifyEmail": true,
  "notifyInApp": true,
  "notifyPush": false,
  "expiresAt": null,
  "notes": "Buy signal if BTC breaks 50k"
}
```

**Request Body - Percent Change:**
```json
{
  "asset": "ETH",
  "alertType": "change_percent",
  "targetValue": 10.0,
  "comparisonPeriod": "24h",
  "isRecurring": true,
  "cooldownHours": 12,
  "notifyEmail": true,
  "notifyInApp": true,
  "notifyPush": false,
  "expiresAt": "2025-01-01T00:00:00Z",
  "notes": "Monitor ETH volatility"
}
```

**Parameter Details:**
- `asset` (string, required): Asset symbol (BTC, ETH, SOL, etc.)
- `alertType` (enum, required): 'crosses_above', 'crosses_below', 'change_percent'
- `targetValue` (decimal, required): Target price (USD) or percentage
- `comparisonPeriod` (string, conditional): Required for 'change_percent': '1h', '24h', '7d'
- `isRecurring` (boolean, optional): Alert resets after triggering (default: false)
- `cooldownHours` (int, optional): Hours before alert can trigger again (default: 24)
- `notifyEmail` (boolean, optional): Send email notification (default: true)
- `notifyInApp` (boolean, optional): Create in-app notification (default: true)
- `notifyPush` (boolean, optional): Send push notification (default: false)
- `expiresAt` (ISO8601, optional): Alert expiration time
- `notes` (string, optional): User notes (max 500 chars)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/alerts/price` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates request**
   - Asset must be a valid supported asset
   - Alert type must be valid enum
   - Target value must be positive
   - Comparison period required for 'change_percent'
   - Expiration must be in future
4. **Check user alert limits**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT COUNT(*) as alert_count
   FROM price_alerts
   WHERE user_id = $1
     AND status IN ('active', 'paused');
   ```
   - If count >= 50 → Return 400 "Maximum alert limit reached"
5. **Validate asset against current price**
   - Fetch current price from Market Data Service
   - For 'crosses_above': warn if target < current price (already above)
   - For 'crosses_below': warn if target > current price (already below)
6. **Alert Repository creates price alert**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   INSERT INTO price_alerts (
     user_id, asset,
     alert_type, target_value, comparison_period,
     status, is_recurring,
     cooldown_hours,
     notify_email, notify_in_app, notify_push,
     expires_at, notes
   ) VALUES (
     $1, $2,
     $3, $4, $5,
     'active', $6,
     $7,
     $8, $9, $10,
     $11, $12
   ) RETURNING *;
   ```
7. **Return created alert with current price context**

#### Outputs

**Success Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "asset": "BTC",
      "alertType": "crosses_above",
      "targetValue": 50000.00,
      "comparisonPeriod": null,
      "status": "active",
      "isRecurring": false,
      "triggeredCount": 0,
      "lastTriggeredAt": null,
      "cooldownHours": 24,
      "notifications": {
        "email": true,
        "inApp": true,
        "push": false
      },
      "expiresAt": null,
      "notes": "Buy signal if BTC breaks 50k",
      "createdAt": "2024-12-16T12:00:00Z"
    },
    "context": {
      "currentPrice": 43500.00,
      "percentToTarget": 14.94,
      "priceDirection": "above"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Warning Response (201 Created with warning):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "asset": "BTC",
      "alertType": "crosses_above",
      "targetValue": 40000.00,
      "status": "active"
    },
    "context": {
      "currentPrice": 43500.00,
      "percentToTarget": -8.05
    },
    "warnings": [
      {
        "code": "ALREADY_ABOVE_TARGET",
        "message": "BTC is currently above your target price. Alert will trigger when price drops below and then crosses above again."
      }
    ]
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
    "code": "ALERT_LIMIT_EXCEEDED",
    "message": "Maximum alert limit reached",
    "details": {
      "currentAlerts": 50,
      "maxAllowed": 50
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 17.2 List Price Alerts

#### Inputs

**API Endpoint:** `GET /api/v1/portfolio/alerts/price`

**Query Parameters:**
- `asset` (string, optional): Filter by asset symbol
- `status` (string, optional): Filter by status (active, triggered, paused, expired)
- `alertType` (string, optional): Filter by alert type
- `page` (int, optional): Page number (default: 1)
- `limit` (int, optional): Items per page (default: 20, max: 50)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/alerts/price` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Alert Repository queries user's alerts**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT *
   FROM price_alerts
   WHERE user_id = $1
     AND ($2::varchar IS NULL OR asset = $2)
     AND ($3::varchar IS NULL OR status = $3)
     AND ($4::varchar IS NULL OR alert_type = $4)
   ORDER BY
     CASE status
       WHEN 'active' THEN 1
       WHEN 'triggered' THEN 2
       WHEN 'paused' THEN 3
       ELSE 4
     END,
     created_at DESC
   LIMIT $5 OFFSET $6;
   ```
4. **Enrich with current prices**
   - Fetch current prices for all unique assets
   - Calculate percent to target for each alert
5. **Return alert list**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "uuid-1",
        "asset": "BTC",
        "alertType": "crosses_above",
        "targetValue": 50000.00,
        "status": "active",
        "isRecurring": false,
        "triggeredCount": 0,
        "currentPrice": 43500.00,
        "percentToTarget": 14.94,
        "notifications": {
          "email": true,
          "inApp": true,
          "push": false
        },
        "createdAt": "2024-12-16T12:00:00Z"
      },
      {
        "id": "uuid-2",
        "asset": "ETH",
        "alertType": "change_percent",
        "targetValue": 10.0,
        "comparisonPeriod": "24h",
        "status": "active",
        "isRecurring": true,
        "triggeredCount": 3,
        "lastTriggeredAt": "2024-12-15T08:30:00Z",
        "currentPrice": 2250.00,
        "currentChange24h": 5.2,
        "createdAt": "2024-12-10T10:00:00Z"
      }
    ],
    "summary": {
      "totalAlerts": 12,
      "activeAlerts": 8,
      "triggeredAlerts": 2,
      "pausedAlerts": 2
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 12,
      "totalPages": 1
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 17.3 Get Price Alert Details

#### Inputs

**API Endpoint:** `GET /api/v1/portfolio/alerts/price/{alertId}`

**Path Parameters:**
- `alertId` (uuid, required): Alert ID

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/alerts/price/{alertId}` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Alert Repository fetches alert**
   ```sql
   SELECT * FROM price_alerts
   WHERE id = $1 AND user_id = $2;
   ```
   - If not found → Return 404
4. **Fetch alert trigger history**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT *
   FROM price_alert_history
   WHERE alert_id = $1
   ORDER BY triggered_at DESC
   LIMIT 10;
   ```
5. **Enrich with current price**
6. **Return alert with history**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "asset": "BTC",
      "alertType": "crosses_above",
      "targetValue": 50000.00,
      "comparisonPeriod": null,
      "status": "triggered",
      "isRecurring": false,
      "triggeredCount": 1,
      "lastTriggeredAt": "2024-12-15T14:30:00Z",
      "lastTriggeredPrice": 50150.00,
      "cooldownHours": 24,
      "notifications": {
        "email": true,
        "inApp": true,
        "push": false
      },
      "expiresAt": null,
      "notes": "Buy signal if BTC breaks 50k",
      "createdAt": "2024-12-10T12:00:00Z",
      "updatedAt": "2024-12-15T14:30:00Z"
    },
    "currentContext": {
      "currentPrice": 50800.00,
      "percentFromTarget": 1.6
    },
    "history": [
      {
        "id": "uuid",
        "triggeredAt": "2024-12-15T14:30:00Z",
        "triggerPrice": 50150.00,
        "emailSent": true,
        "inAppSent": true,
        "pushSent": false
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 17.4 Update Price Alert

#### Inputs

**API Endpoint:** `PUT /api/v1/portfolio/alerts/price/{alertId}`

**Request Body:**
```json
{
  "targetValue": 55000.00,
  "isRecurring": true,
  "cooldownHours": 12,
  "notifyEmail": true,
  "notifyInApp": true,
  "expiresAt": "2025-02-01T00:00:00Z",
  "notes": "Updated target"
}
```

**Note:** `asset` and `alertType` cannot be changed. Create a new alert instead.

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/alerts/price/{alertId}` (PUT)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates request**
4. **Alert Repository fetches existing alert**
   ```sql
   SELECT * FROM price_alerts
   WHERE id = $1 AND user_id = $2;
   ```
   - If not found → Return 404
5. **Update alert**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   UPDATE price_alerts
   SET
     target_value = COALESCE($2, target_value),
     comparison_period = COALESCE($3, comparison_period),
     is_recurring = COALESCE($4, is_recurring),
     cooldown_hours = COALESCE($5, cooldown_hours),
     notify_email = COALESCE($6, notify_email),
     notify_in_app = COALESCE($7, notify_in_app),
     notify_push = COALESCE($8, notify_push),
     expires_at = COALESCE($9, expires_at),
     notes = COALESCE($10, notes),
     updated_at = NOW()
   WHERE id = $1 AND user_id = $11
   RETURNING *;
   ```
6. **Return updated alert**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "asset": "BTC",
      "alertType": "crosses_above",
      "targetValue": 55000.00,
      "status": "active",
      "isRecurring": true,
      "updatedAt": "2024-12-16T12:00:00Z"
    },
    "message": "Alert updated successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 17.5 Pause/Resume Price Alert

#### Inputs

**API Endpoint:** `POST /api/v1/portfolio/alerts/price/{alertId}/pause`
**API Endpoint:** `POST /api/v1/portfolio/alerts/price/{alertId}/resume`

#### Process Steps

1. **API Gateway receives request**
2. **API Gateway validates JWT** → Extracts user_id
3. **Alert Repository updates status**
   ```sql
   -- For pause
   UPDATE price_alerts
   SET status = 'paused', updated_at = NOW()
   WHERE id = $1 AND user_id = $2 AND status = 'active'
   RETURNING *;

   -- For resume
   UPDATE price_alerts
   SET status = 'active', updated_at = NOW()
   WHERE id = $1 AND user_id = $2 AND status = 'paused'
   RETURNING *;
   ```
4. **Return updated alert**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "status": "paused"
    },
    "message": "Alert paused successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 17.6 Delete Price Alert

#### Inputs

**API Endpoint:** `DELETE /api/v1/portfolio/alerts/price/{alertId}`

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/alerts/price/{alertId}` (DELETE)
2. **API Gateway validates JWT** → Extracts user_id
3. **Alert Repository deletes alert**
   ```sql
   DELETE FROM price_alerts
   WHERE id = $1 AND user_id = $2
   RETURNING id;
   ```
   - If not found → Return 404
4. **Return success**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "deletedAlertId": "uuid",
    "message": "Alert deleted successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 17.7 Reset Triggered Alert

#### Inputs

**API Endpoint:** `POST /api/v1/portfolio/alerts/price/{alertId}/reset`

**Note:** Only available for non-recurring alerts that have been triggered.

#### Process Steps

1. **API Gateway receives request**
2. **API Gateway validates JWT** → Extracts user_id
3. **Alert Repository resets alert**
   ```sql
   UPDATE price_alerts
   SET status = 'active', updated_at = NOW()
   WHERE id = $1
     AND user_id = $2
     AND status = 'triggered'
     AND is_recurring = false
   RETURNING *;
   ```
4. **Return reset alert**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "status": "active"
    },
    "message": "Alert reset and reactivated"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria
- Alert created and active
- Alert list returns all user alerts with current prices
- Alert updates reflect immediately
- Pause/resume toggles monitoring
- Delete removes alert permanently

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid asset | 400 | Return "Invalid asset symbol" |
| Invalid alert type | 400 | Return "Invalid alert type" |
| Missing comparison period | 400 | Return "Comparison period required for change_percent alerts" |
| Alert limit exceeded | 400 | Return "Maximum alert limit reached (50)" |
| Alert not found | 404 | Return "Alert not found" |
| Cannot reset recurring | 400 | Return "Cannot reset recurring alert" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Create alert: < 100ms
- List alerts with prices: < 300ms
- Price enrichment batched for efficiency
- Max 50 alerts per user

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `price_alerts`, `price_alert_history`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**External Services:**
- Market Data Service: Current asset prices

#### Notes

**Supported Assets:**
Initial support for top 50 cryptocurrencies by market cap. Asset list maintained in configuration.

**Alert Checking:**
Price alerts are checked by a scheduled job (PROC-PORTFOLIO-018) every minute during market hours.

**Related Processes:**
- PROC-PORTFOLIO-018: Check Price Alerts (Scheduled)
- PROC-NOTIFY-001: Send In-App Notification
- PROC-NOTIFY-002: Send Email Notification

---

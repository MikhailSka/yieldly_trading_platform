### PROC-PORTFOLIO-018: Check Price Alerts (Scheduled)

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-010
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-023, ADR-032

#### Trigger
Scheduled job runs every minute

#### Actor
System (Scheduler)

#### Preconditions
- Market Data Service is available
- Notification Service is available

---

#### Inputs

**No external inputs - scheduled job**

---

#### Process Steps

1. **Scheduled job triggers every minute**

2. **Alert Scheduler fetches all active alerts grouped by asset**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     asset,
     json_agg(
       json_build_object(
         'id', id,
         'user_id', user_id,
         'alert_type', alert_type,
         'target_value', target_value,
         'comparison_period', comparison_period,
         'is_recurring', is_recurring,
         'cooldown_hours', cooldown_hours,
         'last_triggered_at', last_triggered_at,
         'notify_email', notify_email,
         'notify_in_app', notify_in_app,
         'notify_push', notify_push
       )
     ) as alerts
   FROM price_alerts
   WHERE status = 'active'
     AND (expires_at IS NULL OR expires_at > NOW())
   GROUP BY asset;
   ```

3. **Fetch current prices for all monitored assets**
   - Call Market Data Service batch price endpoint
   ```
   GET /api/v1/market/prices?assets=BTC,ETH,SOL,...
   ```
   - Response includes current price and 1h/24h/7d change percentages

4. **For each asset with alerts:**

   **4.1 Check "crosses_above" alerts:**
   ```go
   for _, alert := range alerts {
     if alert.AlertType != "crosses_above" {
       continue
     }

     // Check if price has crossed above target
     if currentPrice >= alert.TargetValue {
       // Verify it wasn't already above (prevent double-trigger)
       previousPrice := getPreviousPrice(asset, 1) // 1 minute ago
       if previousPrice < alert.TargetValue {
         triggerAlert(alert, currentPrice)
       }
     }
   }
   ```

   **4.2 Check "crosses_below" alerts:**
   ```go
   for _, alert := range alerts {
     if alert.AlertType != "crosses_below" {
       continue
     }

     if currentPrice <= alert.TargetValue {
       previousPrice := getPreviousPrice(asset, 1)
       if previousPrice > alert.TargetValue {
         triggerAlert(alert, currentPrice)
       }
     }
   }
   ```

   **4.3 Check "change_percent" alerts:**
   ```go
   for _, alert := range alerts {
     if alert.AlertType != "change_percent" {
       continue
     }

     // Get price from comparison period ago
     var comparisonPrice decimal.Decimal
     switch alert.ComparisonPeriod {
     case "1h":
       comparisonPrice = prices.Change1h
     case "24h":
       comparisonPrice = prices.Change24h
     case "7d":
       comparisonPrice = prices.Change7d
     }

     // Calculate actual percent change
     percentChange := ((currentPrice - comparisonPrice) / comparisonPrice) * 100

     // Check if change exceeds threshold (either direction)
     if math.Abs(percentChange) >= alert.TargetValue {
       triggerAlert(alert, currentPrice, comparisonPrice, percentChange)
     }
   }
   ```

5. **For each triggered alert:**

   **5.1 Check cooldown period**
   ```go
   if alert.LastTriggeredAt != nil {
     cooldownEnd := alert.LastTriggeredAt.Add(
       time.Hour * time.Duration(alert.CooldownHours)
     )
     if time.Now().Before(cooldownEnd) {
       continue // Still in cooldown
     }
   }
   ```

   **5.2 Update alert status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   UPDATE price_alerts
   SET
     status = CASE WHEN is_recurring THEN 'active' ELSE 'triggered' END,
     triggered_count = triggered_count + 1,
     last_triggered_at = NOW(),
     last_triggered_price = $2,
     updated_at = NOW()
   WHERE id = $1
   RETURNING *;
   ```

   **5.3 Record trigger in history**
   ```sql
   INSERT INTO price_alert_history (
     alert_id, user_id, triggered_at,
     trigger_price, comparison_price, actual_change_percent,
     email_sent, in_app_sent, push_sent
   ) VALUES (
     $1, $2, NOW(),
     $3, $4, $5,
     false, false, false
   ) RETURNING id;
   ```

   **5.4 Send notifications via Service Bus**
   ```json
   {
     "messageId": "uuid",
     "eventType": "price_alert.triggered",
     "timestamp": "2024-12-16T12:00:00Z",
     "version": "1.0",
     "source": {
       "service": "portfolio-service",
       "instance": "instance-id"
     },
     "payload": {
       "userId": "user-uuid",
       "alertId": "alert-uuid",
       "asset": "BTC",
       "alertType": "crosses_above",
       "targetValue": 50000.00,
       "triggerPrice": 50150.00,
       "comparisonPrice": null,
       "actualChangePercent": null,
       "notifyEmail": true,
       "notifyInApp": true,
       "notifyPush": false
     },
     "metadata": {
       "correlationId": "uuid",
       "userId": "user-uuid"
     }
   }
   ```

6. **Notification Service processes event:**
   - Creates in-app notification (PROC-NOTIFY-001)
   - Sends email notification (PROC-NOTIFY-002)
   - Uses template for price_alert notification type

7. **Update history with delivery status**
   ```sql
   UPDATE price_alert_history
   SET
     email_sent = $2,
     in_app_sent = $3,
     push_sent = $4
   WHERE id = $1;
   ```

8. **Check for expired alerts**
   ```sql
   UPDATE price_alerts
   SET status = 'expired', updated_at = NOW()
   WHERE status = 'active'
     AND expires_at IS NOT NULL
     AND expires_at <= NOW();
   ```

9. **Log job completion**

---

#### Outputs

**No direct output - async job**

**Service Bus Events Published:**
- `price_alert.triggered` for each triggered alert

**Database Updates:**
- `price_alerts` status and trigger tracking
- `price_alert_history` records

---

#### Notification Content

**In-App Notification:**
```json
{
  "type": "price_alert",
  "priority": "high",
  "title": "Price Alert: BTC",
  "message": "BTC has crossed above $50,000. Current price: $50,150",
  "data": {
    "alert_id": "uuid",
    "asset": "BTC",
    "alert_type": "crosses_above",
    "target_price": 50000.00,
    "current_price": 50150.00
  },
  "action_url": "/portfolio/alerts/uuid",
  "action_label": "View Alert"
}
```

**Email Subject:**
```
Price Alert: BTC crossed above $50,000
```

**Email Body Variables:**
```json
{
  "user_name": "John",
  "asset": "BTC",
  "alert_type_description": "crossed above",
  "target_price": "$50,000.00",
  "current_price": "$50,150.00",
  "change_percent": null,
  "comparison_period": null,
  "alert_notes": "Buy signal if BTC breaks 50k",
  "action_url": "https://app.yieldly.io/portfolio/alerts/uuid"
}
```

---

#### Success Criteria
- All active alerts checked every minute
- Triggered alerts updated correctly
- Notifications sent via appropriate channels
- Cooldown periods respected
- Recurring alerts reset properly
- Expired alerts marked as expired

#### Error Scenarios

| Error | Handling |
|-------|----------|
| Market Data Service unavailable | Skip this run, log warning, retry next minute |
| Notification Service unavailable | Log trigger, queue for retry |
| Database error | Log error, continue with other alerts |
| Individual alert processing fails | Log error, continue with other alerts |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: Job completion < 30 seconds

**Process-Specific Notes:**
- Job runs every 60 seconds
- Must complete before next run starts
- Batch processing: Check up to 10,000 alerts per run
- Market data fetch: Single batch request for all assets
- Notifications queued async (non-blocking)

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `price_alerts`, `price_alert_history`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**External Services:**
- Market Data Service: Current and historical prices
- Notification Service: Alert delivery

**Message Queue:**
- Azure Service Bus: price_alert.triggered events

#### Notes

**Alert Checking Logic:**

For "crosses_above" and "crosses_below" alerts:
- Compare current price vs 1-minute-ago price
- Only trigger if price actually *crossed* the threshold (not just above/below)
- Prevents duplicate triggers for prices that stay above/below target

For "change_percent" alerts:
- Compare current price vs price from comparison period ago
- Trigger if absolute change exceeds threshold (either direction)
- User can create separate alerts for up/down moves if needed

**Cooldown Behavior:**
- Non-recurring: Status changes to 'triggered', stays there
- Recurring: Status stays 'active' but won't trigger until cooldown expires

**Rate Limiting:**
- Max 3 notifications per asset per user per hour
- Prevents spam if price oscillates around target

**Job Locking:**
- Uses distributed lock to prevent multiple instances running simultaneously
- Lock key: `price_alert_check_job`
- Lock TTL: 55 seconds

**Related Processes:**
- PROC-PORTFOLIO-017: Manage Price Alerts (CRUD)
- PROC-NOTIFY-001: Send In-App Notification
- PROC-NOTIFY-002: Send Email Notification

---

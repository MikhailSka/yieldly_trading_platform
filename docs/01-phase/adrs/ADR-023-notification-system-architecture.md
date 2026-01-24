## ADR-023: Notification System Architecture

### Context
Platform needs to send email notifications for various events: backtesting completion, strategy errors, system maintenance, portfolio alerts. Need simple, cost-effective solution that can scale as platform grows.

### Decision
Use SendGrid via Azure Marketplace for email delivery and implement dedicated Notification Microservice that consumes events from Azure Service Bus.

### Rationale
SendGrid Selection

Free Tier: 25,000 emails/month (sufficient for Phase 1)
Cost-Effective: ~$15/month for 40,000 emails after free tier
Proven Solution: Well-documented, easy to integrate
Simple Setup: Via Azure Marketplace
Reliable: Industry-standard email service

Dedicated Microservice Approach

Centralized Logic: All notification handling in one place
Decoupling: Other services don't need SendGrid credentials
Template Management: Centralized email templates
Easy Extension: Can add SMS/push notifications later
Service Bus Integration: Leverages existing infrastructure (ADR-019)

Alternative Azure Communication Services rejected because:

More expensive for email
More complex setup
SendGrid simpler for email-only Phase 1
Can migrate later if need SMS

Alternative Embedded Notifications rejected because:

Duplicate code across services
Each service needs SendGrid credentials
Harder to maintain templates
Doesn't align with microservices architecture

Architecture
┌──────────────────────────────────────────────┐
│  Other Services                              │
│  (Backtesting, Portfolio, Strategy, etc.)   │
└─────────────┬────────────────────────────────┘
              │ Publish notification events
              ↓
┌──────────────────────────────────────────────┐
│  Azure Service Bus                           │
│  Topic: notifications                        │
└─────────────┬────────────────────────────────┘
              │ Subscribe to events
              ↓
┌──────────────────────────────────────────────┐
│  Notification Service                        │
├──────────────────────────────────────────────┤
│  - Listen to Service Bus                    │
│  - Process notification events               │
│  - Render email templates                    │
│  - Send via SendGrid                         │
│  - Track delivery status                     │
│  - Retry failed notifications                │
└──────────────────────────────────────────────┘
              │ Email delivery
              ↓
┌──────────────────────────────────────────────┐
│  SendGrid                                    │
│  - SMTP relay                                │
│  - Delivery tracking                         │
│  - Bounce handling                           │
└──────────────────────────────────────────────┘
              │
              ↓
         User's Email
Notification Types (Phase 1)
Backtesting Notifications

Backtesting started
Backtesting completed (with results summary)
Backtesting failed (with error details)

Strategy Notifications

Strategy validation errors
Strategy saved successfully

System Notifications

Scheduled maintenance announcements
System updates
Service disruptions

Security Notifications

Failed login attempts
Password changed
New device login
API key created/revoked

Future (Phase 2)

Trade execution confirmations
Portfolio threshold alerts (significant gains/losses)
Broker connection failures
Daily/weekly portfolio summaries

Event Message Format
Service Bus Message Schema:
```json
{
  "notification_id": "uuid",
  "type": "backtest_complete",
  "user_id": "user_uuid",
  "priority": "normal",
  "timestamp": "ISO8601",
  "data": {
    "backtest_id": "uuid",
    "strategy_name": "SMA Crossover",
    "result_summary": {
      "total_return": "15.3%",
      "win_rate": "62%",
      "max_drawdown": "8.2%"
    }
  },
  "template": "backtest_complete",
  "recipient": {
    "email": "user@example.com",
    "name": "User Name"
  }
}
```
Email Template Management
Template Storage:

HTML templates stored in Azure Blob Storage
Or: Embedded in Notification Service (simpler for Phase 1)
Or: Use SendGrid's template feature

Template Variables:

Dynamic content injection
User name, data from event
Conditional sections

Template Examples:

backtest_complete.html
backtest_failed.html
security_alert.html
system_maintenance.html

User Notification Preferences
Stored in User Profile Service:
- email_enabled (boolean)
- notification_types_enabled (array)
  - backtesting
  - security_alerts
  - system_updates
  - marketing (future)
- preferred_email
- notification_frequency (immediate, digest)
Preference Check:

Notification Service checks user preferences before sending
Respects opt-out settings
Compliance with email regulations

Retry and Error Handling
Retry Strategy:

Failed sends automatically retried
Exponential backoff (1min, 5min, 15min, 1hr)
Max 3 retry attempts
Move to dead-letter queue after max retries

Error Tracking:

Log all send attempts
Track delivery status from SendGrid webhooks
Alert on high failure rates
Monitor bounce rates

Dead Letter Queue Processing:

Manual review of failed notifications
Identify systemic issues (invalid emails, template errors)
User notification of permanent failures

SendGrid Integration
Configuration:

API key stored in Azure Key Vault
SendGrid account linked via Azure Marketplace
Configure sender domain (SPF, DKIM)
Set up webhooks for delivery tracking

Delivery Tracking:

SendGrid provides webhooks for:

Delivered
Opened (if tracking enabled)
Clicked (if tracking enabled)
Bounced
Spam reported


Store delivery status in database

Rate Limiting:

SendGrid handles rate limiting
Notification Service respects SendGrid limits
Queue messages if needed

Monitoring and Alerting
Metrics to Track:

Notifications sent per hour/day
Delivery success rate
Average send time
Queue depth
Failed notifications count

Alerts:

High failure rate (>5%)
SendGrid quota approaching
Queue backing up
Service Bus connection issues

Cost Management
Free Tier (25,000 emails/month):

Sufficient for Phase 1
~800 emails/day average
Supports initial user base

Paid Tier (~$15/month for 40,000):

Needed as user base grows
Still very affordable
Scales linearly

Cost Optimization:

Only send necessary notifications
Respect user preferences (reduce opt-outs)
Use digests for non-urgent notifications (future)
Monitor usage via Azure Cost Management


### Security Considerations
Email Content:

Never include sensitive data (passwords, full API keys)
Use links to platform for detailed information
Implement click-through authentication

Sender Authentication:

Configure SPF records
Configure DKIM signing
Use verified sender domain
Avoid spam triggers

User Privacy:

Allow users to opt out
Honor unsubscribe requests immediately
Comply with GDPR/CAN-SPAM

Implementation Phases
Phase 1A - Basic Email:

SendGrid integration
Service Bus subscription
Simple text templates
Core notification types

Phase 1B - Enhanced Email:

HTML templates with branding
Template variables
User preferences
Delivery tracking

Phase 2 - Extended Channels:

SMS via Azure Communication Services
Push notifications (web/mobile)
In-app notifications
Slack/Discord webhooks

Testing Strategy
Development:

Use SendGrid sandbox mode
Test with personal email accounts
Validate template rendering
Test all notification types

Production:

Monitor first 100 notifications closely
Verify delivery rates
Check spam scores
Validate user preferences respected


### Alternative Considered
Azure Communication Services:

Pros: Native Azure, supports email + SMS
Cons: More expensive, more complex, newer service
Decision: Start with SendGrid, can migrate later

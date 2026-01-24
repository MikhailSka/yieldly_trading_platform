### FR-NOTIFY-002: Receive Email Notifications
**Priority:** Medium
**User Story:** As a user, I want to receive email notifications so that I'm alerted even when not using the platform.

**Acceptance Criteria:**
- User receives email notifications for:
  - Backtest completion (if backtest duration > 5 minutes)
  - Backtest failure
  - Broker connection failed (health check)
  - System maintenance scheduled (24h advance notice)
  - Account security alerts
  - Password reset requests
  - GDPR data export ready
- Emails sent via SendGrid
- Emails branded with Yieldly logo and styling
- Emails include relevant links back to platform
- User can control email frequency in settings

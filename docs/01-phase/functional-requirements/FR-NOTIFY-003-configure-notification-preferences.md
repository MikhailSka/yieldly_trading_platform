### FR-NOTIFY-003: Configure Notification Preferences
**Priority:** Low
**User Story:** As a user, I want to configure my notification preferences so that I only receive relevant notifications.

**Acceptance Criteria:**
- User can enable/disable notifications per category:
  - Backtest notifications (in-app, email)
  - Strategy notifications (in-app, email)
  - System notifications (in-app, email)
  - Security notifications (in-app, email - cannot be disabled)
- User can set email notification frequency:
  - Real-time (immediate)
  - Daily digest
  - Weekly digest
  - Disabled (except security)
- Preferences saved to Notification Service database
- Preferences apply immediately
- Security notifications always enabled (cannot be disabled)

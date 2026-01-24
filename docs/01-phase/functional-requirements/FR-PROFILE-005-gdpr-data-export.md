### FR-PROFILE-005: GDPR Data Export
**Priority:** Medium
**User Story:** As a user, I want to export all my data so that I can comply with GDPR data portability rights.

**Acceptance Criteria:**
- User can request data export from account settings
- System generates ZIP archive containing:
  - Profile information (JSON)
  - All strategies (JSON)
  - Portfolio history (JSON)
  - Backtest results and history (JSON, from `backtesting_db`)
  - Notification preferences (JSON)
  - Broker connections list (WITHOUT API keys)
- ZIP file available for download for 7 days
- User receives email notification when export is ready
- Export process takes up to 24 hours
- Only one export request allowed per 30 days

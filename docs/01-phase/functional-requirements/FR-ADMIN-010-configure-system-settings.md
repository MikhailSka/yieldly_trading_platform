### FR-ADMIN-010: Configure System Settings
**Priority:** Medium
**User Story:** As an admin, I want to configure system-wide settings so that I can control platform behavior.

**Acceptance Criteria:**
- Admin can configure:
  - Feature flags (enable/disable features per role)
  - Default user quotas per role
  - Backtest timeout limits
  - Maximum file upload sizes
  - Session timeout duration
  - Rate limiting thresholds
- Settings stored in Azure App Configuration
- Changes apply immediately (no deployment needed)
- System logs all configuration changes
- Admin can revert to previous configuration

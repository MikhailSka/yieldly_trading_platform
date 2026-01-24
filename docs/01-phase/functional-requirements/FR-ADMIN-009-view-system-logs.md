### FR-ADMIN-009: View System Logs
**Priority:** Medium
**User Story:** As an admin, I want to view system logs so that I can troubleshoot issues.

**Acceptance Criteria:**
- Admin can view centralized logs from Azure Monitor
- Admin can filter logs by:
  - Severity (Debug, Info, Warning, Error, Critical)
  - Service name
  - Time range
  - User ID
  - Request ID
- Logs displayed in chronological order (newest first)
- Admin can search logs by keyword
- Admin can view full log entry details
- Logs retained for 30 days
- Admin can export filtered logs to JSON or CSV

### FR-ADMIN-003: Suspend User Account
**Priority:** High
**User Story:** As an admin, I want to suspend user accounts so that I can handle policy violations.

**Acceptance Criteria:**
- Admin can suspend user from user detail page
- Admin must provide suspension reason
- System marks account as suspended
- Suspended user cannot log in (receives "Account suspended" message)
- Existing sessions immediately invalidated
- Broker connections automatically disconnected
- Running backtests cancelled
- Admin can view suspension history per user
- Admin can unsuspend account at any time

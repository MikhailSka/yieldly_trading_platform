### FR-PROFILE-006: GDPR Account Deletion
**Priority:** Medium
**User Story:** As a user, I want to delete my account and all associated data so that I can comply with GDPR right to be forgotten.

**Acceptance Criteria:**
- User can request account deletion from account settings
- System displays warning about permanent data loss
- User must confirm deletion via email link
- Account marked as "pending deletion" for 30 days (grace period)
- User can cancel deletion during grace period
- After 30 days, system permanently deletes:
  - User profile
  - All strategies
  - Portfolio data
  - Broker connections and API keys
  - Notification preferences
  - Media files
  - Auth credentials
- Backtesting results are anonymized (user_id removed) rather than deleted
- Deletion confirmation email sent after completion
- Account cannot be recovered after deletion

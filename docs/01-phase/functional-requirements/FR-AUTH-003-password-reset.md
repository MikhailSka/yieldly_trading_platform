### FR-AUTH-003: Password Reset
**Priority:** Medium
**User Story:** As a user who forgot my password, I want to reset it so that I can regain access to my account.

**Acceptance Criteria:**
- User can request password reset via email
- System generates secure reset token with 1-hour expiration
- System sends password reset email with link containing token
- User can set new password using valid reset token
- System validates new password meets security requirements
- Token can only be used once
- All active sessions must be invalidated after password reset

### FR-AUTH-004: Email Verification
**Priority:** High
**User Story:** As a new user, I want to verify my email address so that I can fully activate my account.

**Acceptance Criteria:**
- System sends verification email immediately after registration
- Verification email contains unique verification link
- Verification token expires after 24 hours
- User can request new verification email if token expired
- System activates account upon successful email verification
- User cannot log in until email is verified

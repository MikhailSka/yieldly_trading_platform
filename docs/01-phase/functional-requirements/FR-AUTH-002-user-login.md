### FR-AUTH-002: User Login
**Priority:** High
**User Story:** As a registered user, I want to log in to access my account.

**Acceptance Criteria:**
- User can log in with email/password
- User can log in with Google OAuth
- System must validate credentials against Auth Service database
- System must return JWT token upon successful authentication
- JWT must include user ID, role, and permissions as claims
- Invalid credentials must return clear error message
- System must implement rate limiting (5 failed attempts = 15-minute lockout)
- Session timeout set to 24 hours
- User can have multiple active sessions

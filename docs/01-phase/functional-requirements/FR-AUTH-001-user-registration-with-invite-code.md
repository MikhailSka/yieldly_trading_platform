### FR-AUTH-001: User Registration with Invite Code
**Priority:** High
**User Story:** As a new user, I want to register using an invite code so that I can create an account on the platform.

**Acceptance Criteria:**
- System must validate invite code before allowing registration
- System must check invite code is active, not expired, and within usage limits
- User must provide valid email address
- User must create password meeting security requirements (min 8 chars, uppercase, lowercase, number, special char)
- System must send email verification link after registration
- Account remains inactive until email is verified
- System must mark invite code as used after successful registration
- System must support Google OAuth as alternative registration method
- CAPTCHA must be presented during registration to prevent bots

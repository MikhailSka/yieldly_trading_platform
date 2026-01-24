### FR-AUTH-005: Session Management
**Priority:** Medium
**User Story:** As a user, I want my sessions to be managed securely so that my account remains protected.

**Acceptance Criteria:**
- System tracks active sessions per user
- Session automatically expires after 24 hours of inactivity
- User can view active sessions in account settings
- User can manually invalidate specific sessions
- JWT tokens must be validated on every API request at gateway level
- Invalid or expired tokens return 401 Unauthorized

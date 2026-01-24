### NFR-SEC-001: Authentication Security
**Priority:** Critical
**Requirement:** All authentication must use industry-standard security practices.

**Specifications:**
- Password hashing: bcrypt with cost factor 12
- JWT tokens: RS256 algorithm with 24-hour expiration
- Refresh tokens: Securely stored, 7-day expiration
- OAuth: Auth0 with PKCE flow
- Session timeout: 24 hours of inactivity

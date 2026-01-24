### NFR-SEC-003: API Security
**Priority:** High
**Requirement:** All APIs must be protected against common vulnerabilities.

**Specifications:**
- JWT validation at API Gateway (Nginx)
- Rate limiting per user role (prevent abuse)
- Input validation and sanitization
- CORS configured restrictively
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding)
- CSRF protection for state-changing operations

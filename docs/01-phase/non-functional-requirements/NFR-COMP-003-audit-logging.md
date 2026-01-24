### NFR-COMP-003: Audit Logging
**Priority:** Medium
**Requirement:** All privileged operations must be logged for audit purposes.

**Specifications:**
- Log admin actions (user suspension, data access)
- Log authentication events (login, logout, failed attempts)
- Log data modifications (create, update, delete)
- Log data exports and deletion requests
- Audit logs immutable and retained for 1 year
- Audit logs not accessible to regular users

### NFR-SEC-005: Access Control
**Priority:** High
**Requirement:** All resources must be protected with role-based access control.

**Specifications:**
- Roles: Admin, Beta Tester, Free User, Subscriber
- Permissions checked at API Gateway and service level
- Users can only access own resources (data isolation)
- Admin bypass only for moderation purposes
- Audit logging for all privileged operations

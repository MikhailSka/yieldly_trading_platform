### PROC-USER-018: Admin - Revoke Invite Code

**Service Owner:** User Service
**Related FR:** FR-ADMIN-003
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-032

#### Trigger
Admin revokes an invite code from admin panel

#### Actor
Admin

#### Preconditions
- User has admin role
- Invite code exists
- Invite code is not already revoked

#### Inputs

**API Endpoint:** `DELETE /api/v1/admin/invite-codes/{code_id}`

**Path Parameters:**
- `code_id`: UUID (required)

**Request Body:**
```json
{
  "reason": "string (optional, max 500 chars, reason for revocation)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/invite-codes/{code_id}` (DELETE)
2. **API Gateway validates JWT** → Extracts admin user_id and role
3. **Admin Controller validates admin permissions**
   - Check if requesting user has `role = 'admin'`
   - Return 403 if not admin
4. **Admin Controller validates input**
   - Validate reason length (max 500 chars) if provided
5. **Invite Code Repository retrieves invite code**
   ```sql
   SELECT id, code, is_active, current_uses, max_uses
   FROM invite_codes
   WHERE id = $1;
   ```
6. **Admin Controller validates revocation**
   - If code not found → Return 404
   - If already `is_active = false` → Return 409 "Code already revoked"
7. **Invite Code Repository revokes code**
   ```sql
   UPDATE invite_codes
   SET is_active = false,
       notes = CASE
         WHEN notes IS NULL THEN CONCAT('Revoked by admin: ', COALESCE($1, 'No reason provided'))
         ELSE CONCAT(notes, ' | Revoked by admin: ', COALESCE($1, 'No reason provided'))
       END,
       updated_at = NOW()
   WHERE id = $2
   RETURNING code, current_uses, max_uses;
   ```
8. **User Activity Logger records revocation** (optional)
   ```sql
   INSERT INTO user_activity_logs (
     user_id, activity_type, activity_description, metadata, created_at
   ) VALUES (
     $1, 'invite_code_revoked',
     CONCAT('Admin revoked invite code: ', $2),
     jsonb_build_object(
       'invite_code_id', $3,
       'invite_code', $2,
       'reason', $4
     ),
     NOW()
   );
   ```
9. **Return success response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "code": "BETA-A3F9-K2L8",
    "isActive": false,
    "currentUses": 0,
    "maxUses": 1,
    "message": "Invite code successfully revoked"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (403 Forbidden - Not Admin):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin permissions required",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Invite code not found",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (409 Conflict - Already Revoked):**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Invite code is already revoked",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Invite code `is_active` set to `false`
- Revocation reason appended to notes
- Activity logged
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Code not found | 404 | Return "Invite code not found" |
| Already revoked | 409 | Return "Invite code is already revoked" |
| Reason too long | 400 | Return "Reason exceeds maximum length of 500 characters" |
| Database error | 500 | Log error, rollback, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards (admin role verification)

**Process-Specific Notes:**
- **Database Queries**: 3 queries (code lookup, revoke UPDATE, activity log INSERT)
- **Expected Execution Time**: < 200ms
- **Audit Trail**: Revocation reason stored in notes field with timestamp
- **Soft Delete**: Code remains in database (is_active = false) for audit purposes

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `invite_codes`, `user_activity_logs` (optional)

#### Notes
- **Soft Revocation**: Code is not deleted, just marked as inactive
- **Audit Trail**: Revocation reason appended to existing notes
- **Already Used Codes**: Can still be revoked (prevents future uses if max_uses not reached)
- **No Cascade**: Existing users who registered with this code remain unaffected

---

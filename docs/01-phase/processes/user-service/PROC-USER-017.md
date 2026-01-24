### PROC-USER-017: Admin - List Invite Codes

**Service Owner:** User Service
**Related FR:** FR-ADMIN-003
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-029, ADR-032

#### Trigger
Admin opens invite code management panel

#### Actor
Admin

#### Preconditions
- User has admin role

#### Inputs

**API Endpoint:** `GET /api/v1/admin/invite-codes`

**Query Parameters:**
```
GET /api/v1/admin/invite-codes?
  status=active|expired|exhausted
  &search={code_or_notes}
  &page={number}
  &page_size={number}
  &sort_by=created_at|code|current_uses|valid_until
  &sort_order=asc|desc
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/invite-codes` (GET)
2. **API Gateway validates JWT** → Extracts admin user_id and role
3. **Admin Controller validates admin permissions**
   - Check if requesting user has `role = 'admin'`
   - Return 403 if not admin
4. **Admin Controller validates pagination parameters**
   - Default: `page=1`, `page_size=50`
   - Max `page_size=100`
5. **Admin Controller validates sorting parameters**
   - Default: `sort_by=created_at`, `sort_order=desc`
   - Allowed `sort_by`: created_at, code, current_uses, valid_until
6. **Invite Code Repository queries total count** (for pagination metadata)
   ```sql
   SELECT COUNT(*)
   FROM invite_codes
   WHERE ($1 IS NULL OR code ILIKE '%' || $1 || '%' OR notes ILIKE '%' || $1 || '%')
     AND (
       CASE
         WHEN $2 = 'active' THEN is_active = true AND (valid_until IS NULL OR valid_until > NOW()) AND current_uses < max_uses
         WHEN $2 = 'expired' THEN valid_until IS NOT NULL AND valid_until <= NOW()
         WHEN $2 = 'exhausted' THEN current_uses >= max_uses
         ELSE true
       END
     );
   ```
7. **Invite Code Repository queries invite codes with filters, sorting, and pagination**
   ```sql
   SELECT
     ic.id, ic.code, ic.generated_by_user_id,
     ic.max_uses, ic.current_uses,
     ic.valid_from, ic.valid_until, ic.is_active, ic.notes,
     ic.created_at, ic.updated_at,
     u.email as generated_by_email,
     CONCAT(p.first_name, ' ', p.last_name) as generated_by_name
   FROM invite_codes ic
   LEFT JOIN users u ON ic.generated_by_user_id = u.id
   LEFT JOIN user_profiles p ON u.id = p.user_id
   WHERE ($1 IS NULL OR ic.code ILIKE '%' || $1 || '%' OR ic.notes ILIKE '%' || $1 || '%')
     AND (
       CASE
         WHEN $2 = 'active' THEN ic.is_active = true AND (ic.valid_until IS NULL OR ic.valid_until > NOW()) AND ic.current_uses < ic.max_uses
         WHEN $2 = 'expired' THEN ic.valid_until IS NOT NULL AND ic.valid_until <= NOW()
         WHEN $2 = 'exhausted' THEN ic.current_uses >= ic.max_uses
         ELSE true
       END
     )
   ORDER BY
     CASE WHEN $3 = 'created_at' AND $4 = 'desc' THEN ic.created_at END DESC,
     CASE WHEN $3 = 'created_at' AND $4 = 'asc' THEN ic.created_at END ASC,
     CASE WHEN $3 = 'code' AND $4 = 'asc' THEN ic.code END ASC,
     CASE WHEN $3 = 'code' AND $4 = 'desc' THEN ic.code END DESC,
     CASE WHEN $3 = 'current_uses' AND $4 = 'desc' THEN ic.current_uses END DESC,
     CASE WHEN $3 = 'current_uses' AND $4 = 'asc' THEN ic.current_uses END ASC,
     CASE WHEN $3 = 'valid_until' AND $4 = 'desc' THEN ic.valid_until END DESC,
     CASE WHEN $3 = 'valid_until' AND $4 = 'asc' THEN ic.valid_until END ASC
   LIMIT $5 OFFSET $6;
   ```
   **Parameters:**
   - `$1` = search query
   - `$2` = status filter
   - `$3` = sort_by
   - `$4` = sort_order
   - `$5` = page_size (limit)
   - `$6` = offset (calculated as `(page - 1) * page_size`)
8. **Calculate pagination metadata**
   - `total_pages = CEIL(total_count / page_size)`
9. **Return paginated invite codes list with metadata**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "code": "BETA-A3F9-K2L8",
      "generatedBy": {
        "userId": "uuid",
        "email": "admin@yieldly.com",
        "name": "Admin User"
      },
      "maxUses": 1,
      "currentUses": 0,
      "validFrom": "2024-12-01T00:00:00Z",
      "validUntil": "2025-01-01T00:00:00Z",
      "isActive": true,
      "status": "active",
      "notes": "Beta tester batch #1",
      "createdAt": "2024-12-01T12:00:00Z",
      "updatedAt": "2024-12-01T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 150,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
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

#### Success Criteria
- Invite codes retrieved with filters applied
- Pagination works correctly
- Status computed correctly (active, expired, exhausted)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Invalid filter value | 400 | Return "Invalid filter value" |
| Invalid sort field | 400 | Return "Invalid sort field" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards (admin role verification)

**Process-Specific Notes:**
- **Database Queries**: 2 queries (1 count, 1 codes with JOINs)
- **Expected Execution Time**: < 250ms
- **Pagination**: Default page_size=50, max page_size=100
- **Search**: Searches both `code` and `notes` fields with ILIKE
- **Status Calculation**: Computed based on is_active, valid_until, and usage limits

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `invite_codes`, `users`, `user_profiles`

---

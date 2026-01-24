### PROC-USER-013: Admin - List All Users

**Service Owner:** User Service
**Related FR:** FR-ADMIN-002
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-029, ADR-032

#### Trigger
Admin opens user management panel to view all users

#### Actor
Admin

#### Preconditions
- User has admin role

#### Inputs

**API Endpoint:** `GET /api/v1/admin/users`

**Query Parameters:**
```
GET /api/v1/admin/users?
  search={keyword}
  &status=active|pending_verification|suspended|pending_deletion
  &role=trader|admin
  &page={number}
  &page_size={number}
  &sort_by=created_at|last_login|email
  &sort_order=asc|desc
```

#### Process Steps
1. **API Gateway receives request** → `/api/v1/admin/users` (GET)
2. **Admin Controller validates admin permissions**
3. **Admin Controller validates pagination parameters**
   - Default: `page=1`, `page_size=50`
   - Max `page_size=100`
4. **Admin Controller validates sorting parameters**
   - Default: `sort_by=created_at`, `sort_order=desc`
   - Allowed `sort_by`: created_at, last_login, email
5. **User Repository queries total count** (for pagination metadata)
   ```sql
   SELECT COUNT(DISTINCT u.id)
   FROM users u
   LEFT JOIN user_profiles p ON u.id = p.user_id
   WHERE ($1 IS NULL OR u.email ILIKE '%' || $1 || '%' OR p.display_name ILIKE '%' || $1 || '%')
     AND ($2 IS NULL OR u.status = $2)
     AND ($3 IS NULL OR u.role = $3);
   ```
6. **User Repository queries users with filters, sorting, and pagination**
   ```sql
   SELECT
     u.id, u.email, u.role, u.status, u.email_verified,
     u.created_at, u.last_login, u.invited_by_code,
     p.first_name, p.last_name, p.display_name, p.avatar_url
   FROM users u
   LEFT JOIN user_profiles p ON u.id = p.user_id
   WHERE ($1 IS NULL OR u.email ILIKE '%' || $1 || '%' OR p.display_name ILIKE '%' || $1 || '%')
     AND ($2 IS NULL OR u.status = $2)
     AND ($3 IS NULL OR u.role = $3)
   ORDER BY
     CASE WHEN $4 = 'created_at' AND $5 = 'desc' THEN u.created_at END DESC,
     CASE WHEN $4 = 'created_at' AND $5 = 'asc' THEN u.created_at END ASC,
     CASE WHEN $4 = 'last_login' AND $5 = 'desc' THEN u.last_login END DESC,
     CASE WHEN $4 = 'last_login' AND $5 = 'asc' THEN u.last_login END ASC,
     CASE WHEN $4 = 'email' AND $5 = 'asc' THEN u.email END ASC,
     CASE WHEN $4 = 'email' AND $5 = 'desc' THEN u.email END DESC
   LIMIT $6 OFFSET $7;
   ```
   **Parameters:**
   - `$1` = search keyword
   - `$2` = status filter
   - `$3` = role filter
   - `$4` = sort_by
   - `$5` = sort_order
   - `$6` = page_size (limit)
   - `$7` = offset (calculated as `(page - 1) * page_size`)
7. **For each user, fetch strategy and backtest counts** (separate optimized queries)
   ```sql
   SELECT user_id, COUNT(*) as strategy_count
   FROM strategies
   WHERE user_id = ANY($1) AND deleted_at IS NULL
   GROUP BY user_id;

   SELECT user_id, COUNT(*) as backtest_count
   FROM backtest_runs
   WHERE user_id = ANY($1)
   GROUP BY user_id;
   ```
8. **Merge counts with user data**
9. **Calculate pagination metadata**
   - `total_pages = CEIL(total_count / page_size)`
10. **Return paginated user list with metadata**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "userId": "uuid",
      "email": "string",
      "displayName": "string",
      "avatarUrl": "string",
      "role": "trader",
      "status": "active",
      "emailVerified": true,
      "createdAt": "2024-12-01T12:00:00Z",
      "lastLogin": "2024-12-01T12:00:00Z",
      "invitedByCode": "string",
      "strategyCount": 5,
      "backtestCount": 12
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 1250,
    "totalPages": 25,
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
- Users retrieved with filters applied
- Pagination works correctly
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Invalid filter value | 400 | Return "Invalid filter value" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards (admin role verification)

**Process-Specific Notes:**
- **Database Queries**: 3 queries (1 count, 1 users, 2 for counts aggregation)
- **Expected Execution Time**: < 300ms
- **Pagination**: Default page_size=50, max page_size=100
- **Search Optimization**: Uses ILIKE for email and display_name search
- **Sorting**: Supports multiple sort options (created_at, last_login, email)

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`, `user_profiles`
- `strategy_db` (PostgreSQL) - for strategy count
- `backtest_db` (PostgreSQL) - for backtest count

---

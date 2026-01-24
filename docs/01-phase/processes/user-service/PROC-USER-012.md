### PROC-USER-012: Admin - Generate Invite Codes

**Service Owner:** User Service
**Related FR:** FR-ADMIN-003
**Related NFR:** NFR-PERF-001, NFR-SEC-001
**Related ADR:** ADR-032

#### Trigger
Admin generates new invite codes for beta users

#### Actor
Admin

#### Preconditions
- User has admin role
- Count is within allowed limits (max 100 per request)

#### Inputs

**API Endpoint:** `POST /api/v1/admin/invite-codes/generate`

**Request Body:**
```json
{
  "count": "integer (required, min 1, max 100)",
  "maxUses": "integer (optional, default 1, null for unlimited)",
  "validUntil": "ISO 8601 timestamp (optional, null for no expiration)",
  "notes": "string (optional, max 500 chars)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/invite-codes/generate` (POST)
2. **API Gateway validates JWT** → Extracts admin user_id and role
3. **Admin Controller validates admin permissions**
   - Check if requesting user has `role = 'admin'`
   - Return 403 if not admin
4. **Admin Controller validates input**
   - Check `count >= 1` and `count <= 100`
   - If `maxUses` provided, check `maxUses >= 1`
   - If `validUntil` provided, check it's in the future
   - Validate notes length (max 500 chars)
5. **Invite Code Manager generates codes**
   - Generate random alphanumeric codes (8-10 chars)
   - Ensure uniqueness by checking against existing codes
   - Format: `BETA-XXXX-XXXX` (e.g., `BETA-A3F9-K2L8`)
6. **Invite Code Repository bulk inserts**
   ```sql
   INSERT INTO invite_codes (
     code, generated_by_user_id, max_uses, valid_from, valid_until,
     is_active, notes, created_at, updated_at
   )
   VALUES ($1, $2, $3, NOW(), $4, true, $5, NOW(), NOW())
   RETURNING code, max_uses, valid_until;
   ```
7. **Return generated codes list**

#### Outputs

**Success Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "codes": [
      {
        "code": "BETA-A3F9-K2L8",
        "maxUses": 1,
        "validFrom": "2024-12-01T12:00:00Z",
        "validUntil": "2025-01-01T00:00:00Z",
        "isActive": true
      },
      {
        "code": "BETA-B7C2-M5N9",
        "maxUses": 1,
        "validFrom": "2024-12-01T12:00:00Z",
        "validUntil": "2025-01-01T00:00:00Z",
        "isActive": true
      }
    ],
    "totalGenerated": 2,
    "generatedBy": "admin_user_id",
    "message": "Successfully generated 2 invite codes"
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

**Error Response (400 Bad Request - Invalid Count):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "count",
        "message": "Count must be between 1 and 100",
        "code": "INVALID_COUNT"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Invite codes generated successfully
- Codes are unique
- Codes inserted into database
- List of generated codes returned
- HTTP 201 Created

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Invalid count | 400 | Return "Count must be between 1 and 100" |
| Invalid maxUses | 400 | Return "maxUses must be a positive integer" |
| Invalid validUntil | 400 | Return "validUntil must be in the future" |
| Notes too long | 400 | Return "Notes exceed maximum length of 500 characters" |
| Database error | 500 | Log error, rollback, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-001**: Security and Authentication Standards (admin role verification)

**Process-Specific Notes:**
- **Database Queries**: 1 bulk INSERT (all codes inserted in single transaction)
- **Expected Execution Time**: < 300ms (for 100 codes)
- **Code Generation**: Random alphanumeric with uniqueness check
- **Max Batch Size**: 100 codes per request to prevent performance degradation

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `invite_codes`

---

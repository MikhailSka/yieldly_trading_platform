### PROC-INDICATOR-006: Admin - Activate/Deactivate Indicator

**Service Owner:** Strategy Service
**Related FR:** FR-ADMIN-005
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Admin

#### Trigger
Admin activates or deactivates an indicator

#### Preconditions
- User has admin role
- Indicator exists

#### Inputs

**API Endpoint:** `PATCH /api/v1/admin/indicators/{id}/status`

**Request Body:**
```json
{
  "isActive": "boolean"
}
```

#### Process Steps
1. **API Gateway receives request** → `/api/v1/admin/indicators/{id}/status` (PATCH)
2. **Admin Controller validates admin permissions**
3. **Indicator Repository updates status**
   ```sql
   UPDATE indicators
   SET is_active = $1, updated_at = NOW()
   WHERE id = $2;
   ```
4. **Cache Manager invalidates indicator cache**
5. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "indicatorId": "uuid",
    "name": "SMA",
    "isActive": true,
    "updatedAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Forbidden):**
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
- Indicator status updated successfully
- Cache invalidated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Indicator not found | 404 | Return "Indicator not found" |
| Database error | 500 | Log error, rollback transaction |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1 query (UPDATE)
- Expected Execution Time: P95 < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `indicators`

**Cache:**
- Redis - Indicator list cache

#### Notes
- Deactivating an indicator does NOT affect existing strategies that use it
- Deactivated indicators are hidden from indicator picker for new strategies
- Admin can see inactive indicators in PROC-INDICATOR-001 with `is_active=false` filter

---

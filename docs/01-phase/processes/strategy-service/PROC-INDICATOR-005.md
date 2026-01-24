### PROC-INDICATOR-005: Admin - Edit Indicator

**Service Owner:** Strategy Service
**Related FR:** FR-ADMIN-005
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Admin

#### Trigger
Admin updates indicator metadata or technical specification

#### Preconditions
- User has admin role
- Indicator exists

#### Inputs

**API Endpoint:** `PUT /api/v1/admin/indicators/{id}`

**Request Body:**
```json
{
  "displayName": "string (optional)",
  "fullName": "string (optional)",
  "description": "text (optional)",
  "usageExample": "text (optional)",
  "commonUseCases": "text (optional)",
  "technicalSpec": "object (optional)",
  "popularPeriods": "array (optional)",
  "typicalThresholds": "object (optional)"
}
```

#### Process Steps
1. **API Gateway receives request** → `/api/v1/admin/indicators/{id}` (PUT)
2. **Admin Controller validates admin permissions**
3. **Indicator Repository retrieves current indicator**
4. **Indicator Manager merges updates**
5. **Indicator Repository updates indicator**
   ```sql
   UPDATE indicators
   SET display_name = COALESCE($1, display_name),
       full_name = COALESCE($2, full_name),
       description = COALESCE($3, description),
       usage_example = COALESCE($4, usage_example),
       common_use_cases = COALESCE($5, common_use_cases),
       technical_spec = COALESCE($6, technical_spec),
       popular_periods = COALESCE($7, popular_periods),
       typical_thresholds = COALESCE($8, typical_thresholds),
       updated_at = NOW()
   WHERE id = $9
   RETURNING *;
   ```
6. **Cache Manager invalidates indicator cache**
7. **Return updated indicator**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "SMA",
    "displayName": "Simple Moving Average",
    "fullName": "Simple Moving Average",
    "description": "Calculates average price over specified period",
    "usageExample": "sma = SMA(close, timeperiod=20)",
    "commonUseCases": "Trend identification, Support/resistance",
    "technicalSpec": {
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 30,
          "min": 2,
          "max": 100000
        }
      ],
      "inputs": ["close"],
      "outputs": ["sma"]
    },
    "popularPeriods": [20, 50, 200],
    "typicalThresholds": null,
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
- Indicator metadata updated successfully
- Admin customizations preserved
- Cache invalidated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Indicator not found | 404 | Return "Indicator not found" |
| Invalid technical spec | 400 | Return validation errors |
| Database error | 500 | Log error, rollback transaction |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 2 queries (fetch current, update)
- Expected Execution Time: P95 < 200ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `indicators`

**Cache:**
- Redis - Indicator list cache

#### Notes
- Cannot change `name` field (used as identifier in code)
- Cannot change `library` field (would break existing strategies)
- Cannot change `category_id` (would break categorization)
- Admin can customize `display_name` to make it more user-friendly (e.g., "bollinger_bands" → "Bollinger Bands ®")

---

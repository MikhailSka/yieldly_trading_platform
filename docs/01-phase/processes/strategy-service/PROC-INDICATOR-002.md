### PROC-INDICATOR-002: Add Indicator to Favorites

**Service Owner:** Strategy Service
**Related FR:** FR-INDICATOR-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Authenticated User

#### Trigger
User clicks "Add to Favorites" (star icon) on an indicator

#### Preconditions
- User is authenticated
- Indicator exists and is active

#### Inputs

**API Endpoint:** `POST /api/v1/indicators/{id}/favorite`

#### Process Steps
1. **API Gateway receives request** → `/api/v1/indicators/{id}/favorite` (POST)
2. **Indicator Repository adds favorite**
   ```sql
   INSERT INTO indicator_favorites (user_id, indicator_id, favorited_at)
   VALUES ($1, $2, NOW())
   ON CONFLICT (user_id, indicator_id) DO NOTHING;
   ```
3. **Return success response**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "indicatorId": "uuid",
    "favorited": true,
    "favoritedAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Favorite added to database
- Idempotent operation (no error if already favorited)
- HTTP 201 Created

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Indicator not found | 404 | Return "Indicator not found" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1 query (INSERT with ON CONFLICT)
- Expected Execution Time: P95 < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `indicator_favorites`

---

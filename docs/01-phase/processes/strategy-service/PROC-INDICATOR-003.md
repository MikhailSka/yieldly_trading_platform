### PROC-INDICATOR-003: Remove Indicator from Favorites

**Service Owner:** Strategy Service
**Related FR:** FR-INDICATOR-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Authenticated User

#### Trigger
User removes indicator from favorites

#### Preconditions
- User is authenticated

#### Inputs

**API Endpoint:** `DELETE /api/v1/indicators/{id}/favorite`

#### Process Steps
1. **API Gateway receives request** → `/api/v1/indicators/{id}/favorite` (DELETE)
2. **Indicator Favorites Repository removes favorite**
   ```sql
   DELETE FROM indicator_favorites
   WHERE user_id = $1 AND indicator_id = $2;
   ```
3. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "indicatorId": "uuid",
    "favorited": false,
    "message": "Indicator removed from favorites"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Favorite removed from database
- Idempotent operation (no error if not favorited)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1 query (DELETE)
- Expected Execution Time: P95 < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `indicator_favorites`

---

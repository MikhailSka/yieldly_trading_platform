### PROC-STRATEGY-009: Add Strategy to Favorites

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-009
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Authenticated User

#### Trigger
User clicks "Add to Favorites" on a strategy

#### Preconditions
- User is authenticated
- Strategy exists and is accessible to user

#### Inputs

**API Endpoint:** `POST /api/v1/strategies/{id}/favorite`

#### Process Steps
1. **API Gateway receives request** → `/api/v1/strategies/{id}/favorite` (POST)
2. **Strategy Repository adds favorite**
   ```sql
   INSERT INTO strategy_favorites (user_id, strategy_id, favorited_at)
   VALUES ($1, $2, NOW())
   ON CONFLICT (user_id, strategy_id) DO NOTHING;
   ```
3. **Return success response**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
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
| Strategy not found | 404 | Return "Strategy not found" |
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
- Tables: `strategy_favorites`

---

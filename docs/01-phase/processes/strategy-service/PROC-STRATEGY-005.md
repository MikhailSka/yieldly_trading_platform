### PROC-STRATEGY-005: Delete Strategy

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-003
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032  

#### Trigger
User deletes strategy from strategy list

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User owns the strategy
- Strategy is not currently being used in active backtest

#### Inputs

**API Endpoint:** `DELETE /api/v1/strategies/{strategyId}`

#### Process Steps

1. **API Gateway receives request**
2. **Strategy Controller validates ownership**
   ```sql
   SELECT user_id, is_template FROM strategies WHERE strategy_id = $1
   ```
   - If `user_id != current_user_id` → Return 403 Forbidden
   - If `is_template = true` → Return 403 "Cannot delete templates"
3. **Strategy Controller checks for active backtests**
   - Call Backtesting Service: `GET /api/v1/backtests/active?strategy_id={id}`
   - If active backtest exists → Return 409 "Cannot delete strategy with active backtest"
4. **Strategy Repository soft-deletes strategy**
   ```sql
   UPDATE strategies
   SET deleted = true,
       deleted_at = NOW()
   WHERE strategy_id = $1
   RETURNING strategy_id
   ```
5. **Note:** Historical backtest results are preserved even after strategy deletion
6. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "message": "Strategy deleted successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 409 - Conflict):**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Cannot delete strategy with active backtest",
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
- Strategy marked as deleted
- Strategy no longer visible in user's list
- Historical backtest results preserved
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Active backtest exists | 409 | Return "Cannot delete strategy with active backtest" |
| Strategy not found | 404 | Return "Strategy not found" |
| Cannot delete template | 403 | Return "Templates cannot be deleted" |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 2 queries (ownership check, soft delete)
- External Service Call: 1 (Backtesting Service check)
- Expected Execution Time: P95 < 150ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`

**External Services:**
- Backtesting Service - Check for active backtests

---

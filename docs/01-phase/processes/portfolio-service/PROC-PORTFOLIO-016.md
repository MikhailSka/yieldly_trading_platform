### PROC-PORTFOLIO-016: Delete Manual Asset

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-001, FR-PORTFOLIO-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User deletes a manually tracked asset from their portfolio

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Manual asset exists and belongs to user

#### Inputs
**API Endpoint:** `DELETE /api/v1/portfolio/assets/manual/{id}`

**Path Parameters:**
- `{id}`: Manual asset UUID

**Query Parameters:**
```
DELETE /api/v1/portfolio/assets/manual/{id}?
  confirm={boolean}
```

**Parameter Details:**
- `confirm` (boolean, optional, default: false): Confirmation flag for deletion
  - If false or missing → Return confirmation prompt with asset details
  - If true → Proceed with deletion

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/assets/manual/{id}` (DELETE)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates asset ID format**
   - If not valid UUID → Return 400 "Invalid asset ID"
4. **Portfolio Repository fetches existing asset**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT *
   FROM manual_assets
   WHERE id = $1 AND user_id = $2;
   ```
   - If not found → Return 404 "Manual asset not found"
5. **Portfolio Controller checks confirmation flag**
   - If `confirm` is false or missing:
     - Fetch current price for value display
     - Return asset details with confirmation prompt (200 OK)
6. **Portfolio Repository deletes value history records**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   DELETE FROM manual_asset_value_history
   WHERE manual_asset_id = $1;
   ```
7. **Portfolio Repository deletes manual asset**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   DELETE FROM manual_assets
   WHERE id = $1 AND user_id = $2
   RETURNING *;
   ```
8. **Invalidate portfolio cache**
   ```
   DEL portfolio:{userId}:current
   DEL portfolio:{userId}:manual_assets
   ```
9. **Return deletion confirmation**

#### Outputs

**Confirmation Prompt Response (200 OK - confirm=false):**
```json
{
  "success": true,
  "data": {
    "requiresConfirmation": true,
    "asset": {
      "id": "uuid",
      "asset": "BTC",
      "assetName": "Bitcoin on Ledger",
      "amount": 1.5,
      "currentValueUsd": 67500.00,
      "storageType": "hardware_wallet",
      "storageLocation": "Ledger Nano X - Personal",
      "createdAt": "2024-12-01T10:00:00Z"
    },
    "message": "Are you sure you want to delete this asset? This action cannot be undone.",
    "confirmUrl": "/api/v1/portfolio/assets/manual/{id}?confirm=true"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK - confirm=true):**
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "deletedAsset": {
      "id": "uuid",
      "asset": "BTC",
      "assetName": "Bitcoin on Ledger",
      "amount": 1.5,
      "storageType": "hardware_wallet",
      "storageLocation": "Ledger Nano X - Personal"
    },
    "message": "Manual asset deleted successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Manual asset not found",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid asset ID",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Manual asset deleted from database
- Value history records deleted (cascade)
- Portfolio cache invalidated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid asset ID format | 400 | Return "Invalid asset ID" |
| Asset not found | 404 | Return "Manual asset not found" |
| Asset belongs to different user | 404 | Return "Manual asset not found" (security) |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Target P95 latency: < 200ms
- Confirmation step adds one round-trip
- Cache invalidation: Immediate

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `manual_assets`, `manual_asset_value_history`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Cache:**
- Redis - Portfolio cache invalidation

#### Notes

**Confirmation Flow:**
The two-step deletion process protects against accidental deletions:
1. First request (without confirm) returns asset details for user review
2. Second request (with confirm=true) performs actual deletion

Frontend can bypass confirmation by sending `confirm=true` directly if it implements its own confirmation dialog.

**Cascade Deletion:**
When a manual asset is deleted:
- All `manual_asset_value_history` records for that asset are deleted
- This is handled in the application layer (not database cascade) for explicit control

**Data Loss Warning:**
- Deletion is permanent - no soft delete
- Historical value snapshots for this asset are lost
- P&L history related to this asset cannot be recovered
- Consider suggesting user export data before deletion (future feature)

**Related Processes:**
- PROC-PORTFOLIO-001: Fetch Real-Time Portfolio Value
- PROC-PORTFOLIO-014: Add Manual Asset
- PROC-PORTFOLIO-015: Update Manual Asset
- PROC-PORTFOLIO-017: List Manual Assets

---

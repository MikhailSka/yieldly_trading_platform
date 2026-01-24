### PROC-PORTFOLIO-015: Update Manual Asset

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-001, FR-PORTFOLIO-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User updates a manually tracked asset (amount, purchase price, storage location, notes, etc.)

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Manual asset exists and belongs to user

#### Inputs
**API Endpoint:** `PUT /api/v1/portfolio/assets/manual/{id}`

**Path Parameters:**
- `{id}`: Manual asset UUID

**Request Body:**
```json
{
  "assetName": "Bitcoin on Ledger - Updated",
  "amount": 2.0,
  "purchasePriceUsd": 32000.00,
  "purchaseDate": "2023-05-20",
  "storageType": "hardware_wallet",
  "storageLocation": "Ledger Nano X - Main Wallet",
  "walletAddress": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  "notes": "Bought in May 2023, added more in June"
}
```

**Parameter Details:**
All fields are optional - only provided fields will be updated:
- `assetName` (string, optional, max 100 chars): User-friendly display name
- `amount` (decimal, optional, > 0): Updated quantity
- `purchasePriceUsd` (decimal, optional): Updated price per unit (for P&L)
- `purchaseDate` (date, optional): Updated acquisition date
- `storageType` (enum, optional): Updated storage type
- `storageLocation` (string, optional, max 200 chars): Updated storage description
- `walletAddress` (string, optional, max 255 chars): Updated wallet address
- `notes` (string, optional): Updated notes

**Note:** The `asset` symbol cannot be changed. To change the asset type, delete and create a new entry.

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/assets/manual/{id}` (PUT)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates asset ID format**
   - If not valid UUID → Return 400 "Invalid asset ID"
4. **Portfolio Controller validates request body**
   - Validate `amount` is positive if provided
   - Validate `storageType` is valid enum if provided
   - Validate `purchasePriceUsd` is non-negative if provided
   - Validate `purchaseDate` is not in the future if provided
   - Return 400 if any validation fails
5. **Portfolio Repository fetches existing asset**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT *
   FROM manual_assets
   WHERE id = $1 AND user_id = $2;
   ```
   - If not found → Return 404 "Manual asset not found"
6. **Portfolio Repository builds update statement**
   ```go
   // Only update fields that were provided
   updateFields := map[string]interface{}{}
   if request.AssetName != nil {
     updateFields["asset_name"] = *request.AssetName
   }
   if request.Amount != nil {
     updateFields["amount"] = *request.Amount
   }
   if request.PurchasePriceUsd != nil {
     updateFields["purchase_price_usd"] = *request.PurchasePriceUsd
   }
   // ... etc
   ```
7. **Portfolio Repository recalculates total cost if needed**
   ```go
   // Recalculate if amount or purchase price changed
   if amountChanged || purchasePriceChanged {
     amount := newAmount ?? existingAmount
     price := newPurchasePrice ?? existingPurchasePrice
     if price != nil {
       totalCostUsd = amount * price
     }
   }
   ```
8. **Portfolio Repository updates manual asset**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   UPDATE manual_assets
   SET
     asset_name = COALESCE($3, asset_name),
     amount = COALESCE($4, amount),
     purchase_price_usd = COALESCE($5, purchase_price_usd),
     purchase_date = COALESCE($6, purchase_date),
     total_cost_usd = $7,
     storage_type = COALESCE($8, storage_type),
     storage_location = COALESCE($9, storage_location),
     wallet_address = COALESCE($10, wallet_address),
     notes = COALESCE($11, notes),
     updated_at = NOW()
   WHERE id = $1 AND user_id = $2
   RETURNING *;
   ```
9. **Portfolio Controller fetches current price**
   - Call Broker Service: `POST /api/v1/broker/prices/batch`
   - Calculate updated current value
10. **Invalidate portfolio cache**
    ```
    DEL portfolio:{userId}:current
    DEL portfolio:{userId}:manual_assets
    ```
11. **Return updated asset with current value**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "asset": "BTC",
    "assetName": "Bitcoin on Ledger - Updated",
    "amount": 2.0,
    "currentPriceUsd": 45000.00,
    "currentValueUsd": 90000.00,
    "purchasePriceUsd": 32000.00,
    "purchaseDate": "2023-05-20",
    "totalCostUsd": 64000.00,
    "unrealizedPnL": 26000.00,
    "unrealizedPnLPct": 40.63,
    "storageType": "hardware_wallet",
    "storageLocation": "Ledger Nano X - Main Wallet",
    "walletAddress": "bc1qxy2...0wlh",
    "notes": "Bought in May 2023, added more in June",
    "createdAt": "2024-12-01T10:00:00Z",
    "updatedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Partial Update (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "asset": "BTC",
    "assetName": "Bitcoin on Ledger",
    "amount": 1.5,
    "currentPriceUsd": 45000.00,
    "currentValueUsd": 67500.00,
    "purchasePriceUsd": 35000.00,
    "purchaseDate": "2023-06-15",
    "totalCostUsd": 52500.00,
    "unrealizedPnL": 15000.00,
    "unrealizedPnLPct": 28.57,
    "storageType": "hardware_wallet",
    "storageLocation": "Ledger Nano X - Personal",
    "walletAddress": "bc1qxy2...0wlh",
    "notes": "Updated note - now with security backup",
    "createdAt": "2024-12-01T10:00:00Z",
    "updatedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "fieldsUpdated": ["notes"]
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
    "message": "Invalid request",
    "details": [
      {
        "field": "amount",
        "message": "Amount must be greater than 0",
        "code": "INVALID_AMOUNT"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Manual asset updated in database
- Total cost recalculated if amount or purchase price changed
- Current price fetched for value calculation
- Portfolio cache invalidated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid asset ID format | 400 | Return "Invalid asset ID" |
| Asset not found | 404 | Return "Manual asset not found" |
| Asset belongs to different user | 404 | Return "Manual asset not found" (security) |
| Invalid amount (zero or negative) | 400 | Return "Amount must be greater than 0" |
| Invalid storage type | 400 | Return "Invalid storage type" |
| Purchase date in future | 400 | Return "Purchase date cannot be in the future" |
| No fields provided | 400 | Return "At least one field must be provided" |
| Price fetch fails | 200 | Update asset, return with warning |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Target P95 latency: < 300ms
- Partial updates supported (only send changed fields)
- Cache invalidation: Immediate

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `manual_assets`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Cache:**
- Redis - Portfolio cache invalidation

**External Services:**
- Broker Service: `POST /api/v1/broker/prices/batch` (for current price)

#### Notes

**Partial Updates:**
Only the fields provided in the request body will be updated. This allows:
- Updating just the notes without touching amount
- Adding purchase price to an asset that was created without one
- Changing storage location if asset was moved

**Asset Symbol Immutability:**
The `asset` symbol cannot be changed via update. This is because:
- Historical value tracking is tied to the symbol
- Changing symbol would affect P&L calculations
- User should delete and create new entry instead

**Cost Basis Recalculation:**
If `amount` or `purchasePriceUsd` is updated:
- `totalCostUsd` is automatically recalculated
- P&L figures in response reflect new cost basis

**Related Processes:**
- PROC-PORTFOLIO-001: Fetch Real-Time Portfolio Value
- PROC-PORTFOLIO-014: Add Manual Asset
- PROC-PORTFOLIO-016: Delete Manual Asset
- PROC-PORTFOLIO-017: List Manual Assets

---

### PROC-PORTFOLIO-014: Add Manual Asset

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-001, FR-PORTFOLIO-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User adds a manually tracked asset (e.g., crypto on hardware wallet, paper wallet, or unsupported exchange)

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Valid asset symbol provided

#### Inputs
**API Endpoint:** `POST /api/v1/portfolio/assets/manual`

**Request Body:**
```json
{
  "asset": "BTC",
  "assetName": "Bitcoin on Ledger",
  "amount": 1.5,
  "purchasePriceUsd": 35000.00,
  "purchaseDate": "2023-06-15",
  "storageType": "hardware_wallet",
  "storageLocation": "Ledger Nano X - Personal",
  "walletAddress": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  "notes": "Bought during the dip in June 2023"
}
```

**Parameter Details:**
- `asset` (string, required, max 50 chars): Asset symbol (BTC, ETH, SOL, etc.)
- `assetName` (string, optional, max 100 chars): User-friendly display name
- `amount` (decimal, required, > 0): Quantity of asset held
- `purchasePriceUsd` (decimal, optional): Price per unit at time of purchase (for P&L)
- `purchaseDate` (date, optional): When the asset was acquired
- `storageType` (enum, required): Type of storage
  - `hardware_wallet`: Ledger, Trezor, etc.
  - `software_wallet`: MetaMask, Trust Wallet, etc.
  - `paper_wallet`: Paper wallet
  - `cold_storage`: USB drive, offline storage
  - `other_exchange`: Exchange not connected to platform
  - `custodial`: Third-party custodian
  - `other`: Other storage type
- `storageLocation` (string, optional, max 200 chars): Description of storage location
- `walletAddress` (string, optional, max 255 chars): Wallet address for reference
- `notes` (string, optional): Additional notes

**Validation Rules:**
- `asset`: Required, alphanumeric, max 50 chars
- `amount`: Required, positive number, max 30 digits
- `purchasePriceUsd`: Optional, non-negative, max 20 digits
- `storageType`: Required, must be valid enum value
- `storageLocation`: Max 200 chars
- User can have up to 100 manual assets total

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/assets/manual` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates request body**
   - Validate `asset` is not empty and valid format
   - Validate `amount` is positive
   - Validate `storageType` is valid enum
   - Validate `purchasePriceUsd` is non-negative if provided
   - Validate `purchaseDate` is not in the future
   - Return 400 if any validation fails
4. **Portfolio Controller validates asset symbol**
   - Check if symbol exists in known assets list (optional validation)
   - If unknown symbol, allow but log for review
5. **Portfolio Controller checks user's manual asset count**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT COUNT(*)
   FROM manual_assets
   WHERE user_id = $1;
   ```
   - If count >= 100 → Return 400 "Maximum manual assets limit reached"
6. **Portfolio Repository calculates total cost**
   ```go
   totalCostUsd := amount * purchasePriceUsd  // nil if purchasePriceUsd not provided
   ```
7. **Portfolio Repository inserts manual asset**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   INSERT INTO manual_assets (
     user_id,
     asset,
     asset_name,
     amount,
     purchase_price_usd,
     purchase_date,
     total_cost_usd,
     storage_type,
     storage_location,
     wallet_address,
     notes,
     created_at,
     updated_at
   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
   RETURNING *;
   ```
8. **Portfolio Controller fetches current price for the asset**
   - Call Broker Service: `POST /api/v1/broker/prices/batch` with `[asset]`
   - Calculate current value
9. **Invalidate portfolio cache**
   ```
   DEL portfolio:{userId}:current
   DEL portfolio:{userId}:manual_assets
   ```
10. **Return created asset with current value**

#### Outputs

**Success Response (201 Created):**
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
    "notes": "Bought during the dip in June 2023",
    "createdAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Without Purchase Price (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "asset": "ETH",
    "assetName": "Ethereum on MetaMask",
    "amount": 5.0,
    "currentPriceUsd": 2500.00,
    "currentValueUsd": 12500.00,
    "purchasePriceUsd": null,
    "purchaseDate": null,
    "totalCostUsd": null,
    "unrealizedPnL": null,
    "unrealizedPnLPct": null,
    "storageType": "software_wallet",
    "storageLocation": "MetaMask - Chrome Extension",
    "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f4ba2c",
    "notes": null,
    "createdAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "warning": "No purchase price provided. P&L cannot be calculated for this asset."
  }
}
```

**Error Response (400 Bad Request - Validation):**
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

**Error Response (400 Bad Request - Limit Reached):**
```json
{
  "success": false,
  "error": {
    "code": "LIMIT_EXCEEDED",
    "message": "Maximum manual assets limit reached",
    "details": {
      "currentCount": 100,
      "maxAllowed": 100
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Manual asset created in database
- Current price fetched for value calculation
- Portfolio cache invalidated
- HTTP 201 Created

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Missing required fields | 400 | Return validation error with details |
| Invalid amount (zero or negative) | 400 | Return "Amount must be greater than 0" |
| Invalid storage type | 400 | Return "Invalid storage type" |
| Purchase date in future | 400 | Return "Purchase date cannot be in the future" |
| Maximum assets limit | 400 | Return "Maximum manual assets limit reached" |
| Price fetch fails | 201 | Create asset, return with warning about missing price |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Target P95 latency: < 500ms (includes price fetch)
- Maximum manual assets per user: 100
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

**Storage Types:**
| Type | Description | Examples |
|------|-------------|----------|
| hardware_wallet | Physical hardware device | Ledger Nano X, Trezor Model T |
| software_wallet | Software-based wallet | MetaMask, Trust Wallet, Exodus |
| paper_wallet | Printed keys on paper | Paper wallet with QR code |
| cold_storage | Offline storage | USB drive, air-gapped computer |
| other_exchange | Exchange not connected | Kraken, Coinbase (if not connected) |
| custodial | Third-party custody | Institutional custodian |
| other | Any other type | Custom storage solution |

**P&L Calculation:**
- If `purchasePriceUsd` is provided:
  - `totalCostUsd` = `amount` × `purchasePriceUsd`
  - `unrealizedPnL` = `currentValueUsd` - `totalCostUsd`
  - `unrealizedPnLPct` = (`unrealizedPnL` / `totalCostUsd`) × 100
- If `purchasePriceUsd` is not provided:
  - P&L fields will be `null`
  - User can add purchase price later via update

**Multiple Assets Same Symbol:**
Users can add the same asset multiple times with different storage locations:
- 1 BTC on Ledger Nano X
- 0.5 BTC on paper wallet
- 2 BTC on unsupported exchange

Each entry is tracked separately for accurate location tracking.

**Related Processes:**
- PROC-PORTFOLIO-001: Fetch Real-Time Portfolio Value (includes manual assets)
- PROC-PORTFOLIO-015: Update Manual Asset
- PROC-PORTFOLIO-016: Delete Manual Asset
- PROC-PORTFOLIO-017: List Manual Assets

---

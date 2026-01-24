### PROC-PORTFOLIO-011: Calculate/Update Cost Basis

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-005
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
After transaction sync completes OR Manual recalculation request OR New deposit detected

#### Actor
System (triggered by PROC-PORTFOLIO-010) OR Admin (manual recalculation)

#### Preconditions
- User has transaction history
- Transactions are synced and stored

#### Inputs

**Internal API (System):** Called programmatically after transaction sync

**Admin API (Manual):** `POST /api/v1/admin/portfolio/{userId}/recalculate-cost-basis`

**Request Body (optional):**
```json
{
  "assets": ["BTC", "ETH"],
  "exchanges": ["bybit"],
  "forceRecalculate": false
}
```

**Parameter Details:**
- `assets` (array, optional): Recalculate only specific assets (default: all)
- `exchanges` (array, optional): Recalculate only specific exchanges (default: all)
- `forceRecalculate` (boolean, default: false): Force full recalculation from scratch

#### Process Steps

1. **Determine scope of recalculation**
   - If triggered by sync: Calculate for newly synced assets only
   - If manual with filters: Calculate for specified assets/exchanges
   - If forceRecalculate: Clear existing cost basis and recalculate all
2. **Fetch all relevant transactions for user (ordered by timestamp)**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     t.id,
     t.exchange,
     t.transaction_type,
     t.asset,
     t.amount,
     t.price_usd,
     t.value_usd,
     t.side,
     t.transaction_timestamp
   FROM transactions t
   WHERE t.user_id = $1
     AND ($2::varchar[] IS NULL OR t.asset = ANY($2))
     AND ($3::varchar[] IS NULL OR t.exchange = ANY($3))
     AND t.transaction_type IN ('trade', 'deposit')
   ORDER BY t.transaction_timestamp ASC, t.id ASC;
   ```
3. **Group transactions by asset and exchange**
   ```go
   type AssetLots struct {
     Asset    string
     Exchange string
     Lots     []CostLot
   }

   type CostLot struct {
     Amount        decimal.Decimal
     CostPerUnit   decimal.Decimal
     TotalCost     decimal.Decimal
     AcquiredAt    time.Time
     TransactionID uuid.UUID
   }
   ```
4. **Apply FIFO cost basis calculation for each asset**
   ```go
   func calculateFIFOCostBasis(transactions []Transaction) CostBasisResult {
     lots := []CostLot{}
     realizedPnL := decimal.Zero

     for _, tx := range transactions {
       switch tx.TransactionType {
       case "deposit":
         // Deposits establish cost basis (use deposit value or market price)
         lots = append(lots, CostLot{
           Amount:      tx.Amount,
           CostPerUnit: tx.PriceUSD,
           TotalCost:   tx.ValueUSD,
           AcquiredAt:  tx.Timestamp,
         })

       case "trade":
         if tx.Side == "buy" {
           // Buy adds to lots
           lots = append(lots, CostLot{
             Amount:      tx.Amount,
             CostPerUnit: tx.PriceUSD,
             TotalCost:   tx.ValueUSD,
             AcquiredAt:  tx.Timestamp,
           })
         } else if tx.Side == "sell" {
           // Sell consumes lots (FIFO)
           remaining := tx.Amount
           for i := 0; i < len(lots) && remaining.GreaterThan(decimal.Zero); i++ {
             lot := &lots[i]
             if lot.Amount.IsZero() {
               continue
             }

             consumed := decimal.Min(lot.Amount, remaining)
             costBasisConsumed := consumed.Mul(lot.CostPerUnit)
             proceedsFromSale := consumed.Mul(tx.PriceUSD)

             realizedPnL = realizedPnL.Add(proceedsFromSale.Sub(costBasisConsumed))

             lot.Amount = lot.Amount.Sub(consumed)
             lot.TotalCost = lot.Amount.Mul(lot.CostPerUnit)
             remaining = remaining.Sub(consumed)
           }
         }
       }
     }

     // Calculate remaining position
     totalAmount := decimal.Zero
     totalCost := decimal.Zero
     for _, lot := range lots {
       totalAmount = totalAmount.Add(lot.Amount)
       totalCost = totalCost.Add(lot.TotalCost)
     }

     averageCostBasis := decimal.Zero
     if totalAmount.GreaterThan(decimal.Zero) {
       averageCostBasis = totalCost.Div(totalAmount)
     }

     return CostBasisResult{
       TotalAmount:      totalAmount,
       AverageCostBasis: averageCostBasis,
       TotalCostUSD:     totalCost,
       RealizedPnL:      realizedPnL,
       Lots:             lots,
     }
   }
   ```
5. **Store calculated cost basis**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   INSERT INTO asset_cost_basis (
     user_id, exchange, asset, total_amount, average_cost_basis,
     total_cost_usd, realized_pnl, last_transaction_at, updated_at
   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
   ON CONFLICT (user_id, exchange, asset)
   DO UPDATE SET
     total_amount = EXCLUDED.total_amount,
     average_cost_basis = EXCLUDED.average_cost_basis,
     total_cost_usd = EXCLUDED.total_cost_usd,
     realized_pnl = EXCLUDED.realized_pnl,
     last_transaction_at = EXCLUDED.last_transaction_at,
     updated_at = NOW();
   ```
6. **Update portfolio current state with new P&L**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   UPDATE portfolio_current_state
   SET realized_pnl = (
         SELECT SUM(realized_pnl)
         FROM asset_cost_basis
         WHERE user_id = $1
       ),
       updated_at = NOW()
   WHERE user_id = $1;
   ```
7. **Invalidate P&L caches**
   ```
   DEL portfolio:{userId}:pnl:*
   DEL portfolio:{userId}:assets:*
   ```
8. **Return calculation results** (for admin endpoint)

#### Outputs

**Success Response - Admin Endpoint (200 OK):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "calculationScope": {
      "assets": ["BTC", "ETH"],
      "exchanges": ["bybit", "binance"],
      "forceRecalculate": false
    },
    "results": [
      {
        "asset": "BTC",
        "exchange": "bybit",
        "totalAmount": 2.5,
        "averageCostBasis": 35000.00,
        "totalCostUsd": 87500.00,
        "realizedPnl": 5000.00,
        "lotsCount": 5,
        "lastTransactionAt": "2024-12-15T10:00:00Z"
      },
      {
        "asset": "BTC",
        "exchange": "binance",
        "totalAmount": 1.5,
        "averageCostBasis": 38000.00,
        "totalCostUsd": 57000.00,
        "realizedPnl": 2500.00,
        "lotsCount": 3,
        "lastTransactionAt": "2024-12-14T15:00:00Z"
      },
      {
        "asset": "ETH",
        "exchange": "bybit",
        "totalAmount": 5.0,
        "averageCostBasis": 2200.00,
        "totalCostUsd": 11000.00,
        "realizedPnl": 1500.00,
        "lotsCount": 2,
        "lastTransactionAt": "2024-12-10T08:00:00Z"
      }
    ],
    "summary": {
      "totalRealizedPnl": 9000.00,
      "assetsCalculated": 3,
      "transactionsProcessed": 125,
      "calculationDurationMs": 245
    },
    "calculatedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Internal Response (System Call):**
```go
type CostBasisCalculationResult struct {
  UserID             uuid.UUID
  AssetsUpdated      int
  TotalRealizedPnL   decimal.Decimal
  CalculationTimeMs  int64
  Errors             []error
}
```

**Error Response (404 Not Found - Admin):**
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "User not found",
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
- Cost basis calculated using FIFO method
- Realized P&L calculated from sales
- Results stored in database
- Caches invalidated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| User not found (admin) | 404 | Return "User not found" |
| No transactions | 200 | Return zero cost basis |
| Invalid asset filter | 400 | Return "Invalid asset" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Calculation time: O(n) where n = number of transactions
- Target: < 1 second for 1000 transactions
- Runs async when triggered by sync
- Full recalculation: May take longer for users with extensive history

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `transactions`, `asset_cost_basis`, `portfolio_current_state`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Cache:**
- Redis - P&L cache invalidation

#### Notes

**Cost Basis Methods:**
- **FIFO (First In, First Out)**: Default method used
- Oldest purchases are sold first
- Required for accurate tax reporting in most jurisdictions

**Transaction Handling:**

| Type | Effect on Cost Basis |
|------|---------------------|
| Deposit | Establishes new lot at deposit price |
| Buy Trade | Adds new lot at purchase price |
| Sell Trade | Consumes lots (FIFO), realizes P&L |
| Withdrawal | Reduces position (no P&L impact) |
| Fee | Typically increases cost basis |

**Edge Cases:**
- **Short selling**: Not supported in Phase 1 (read-only keys)
- **Negative balance**: Log warning, may indicate missing transactions
- **Missing price data**: Use estimated price from market data

**Lot Tracking:**
- Individual lots are tracked for accurate FIFO
- Lot details are not exposed to users (only aggregates)
- Lots can be reconstructed from transaction history

**Recalculation Triggers:**
1. After transaction sync (incremental)
2. Manual admin request (full or filtered)
3. If discrepancy detected (force full)

**Related Processes:**
- PROC-PORTFOLIO-010: Sync Transactions from Exchange (triggers this)
- PROC-PORTFOLIO-006: Get P&L Report (uses cost basis data)
- PROC-PORTFOLIO-004: Get Asset Breakdown (may include unrealized P&L)

---

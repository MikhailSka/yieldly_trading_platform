### PROC-PORTFOLIO-006: Get P&L Report

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-005
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views Profit & Loss report on portfolio dashboard

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User has transaction history and/or cost basis data

#### Inputs
**API Endpoint:** `GET /api/v1/portfolio/pnl`

**Query Parameters:**
```
GET /api/v1/portfolio/pnl?
  period={24h|7d|30d|90d|1y|all}&
  group_by={asset|exchange|none}&
  include_unrealized={boolean}
```

**Parameter Details:**
- `period` (string, default: `30d`): Time period for P&L calculation
- `group_by` (string, default: `asset`): Group P&L by `asset`, `exchange`, or `none`
- `include_unrealized` (boolean, default: true): Include unrealized P&L

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/pnl` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates parameters**
   - Validate `period` is valid enum
   - Validate `group_by` is valid enum
4. **P&L Calculator determines date range**
   ```go
   startDate := calculateStartDate(period)
   // 24h: now - 24 hours
   // 7d: now - 7 days
   // 30d: now - 30 days
   // 90d: now - 90 days
   // 1y: now - 365 days
   // all: earliest transaction date
   ```
5. **P&L Calculator fetches realized P&L from transactions**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   -- Get trades within period grouped by asset
   SELECT
     t.asset,
     t.exchange,
     SUM(CASE WHEN t.side = 'sell' THEN t.value_usd ELSE 0 END) as total_sold,
     SUM(CASE WHEN t.side = 'buy' THEN t.value_usd ELSE 0 END) as total_bought,
     SUM(COALESCE(t.fee_usd, 0)) as total_fees
   FROM transactions t
   WHERE t.user_id = $1
     AND t.transaction_type = 'trade'
     AND t.transaction_timestamp >= $2
   GROUP BY t.asset, t.exchange;
   ```
6. **P&L Calculator fetches cost basis data**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     acb.exchange,
     acb.asset,
     acb.total_amount,
     acb.average_cost_basis,
     acb.total_cost_usd,
     acb.realized_pnl,
     acb.last_transaction_at
   FROM asset_cost_basis acb
   WHERE acb.user_id = $1;
   ```
7. **If include_unrealized = true, fetch current prices and holdings**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT holdings_data
   FROM portfolio_current_state
   WHERE user_id = $1;
   ```
8. **P&L Calculator calculates unrealized P&L per asset**
   ```go
   for _, holding := range holdings {
     costBasis := getCostBasis(holding.Asset, holding.Exchange)
     unrealizedPnL := (holding.CurrentPrice - costBasis.AverageCostBasis) * holding.Amount
     unrealizedPnLPct := ((holding.CurrentPrice - costBasis.AverageCostBasis) / costBasis.AverageCostBasis) * 100
   }
   ```
9. **P&L Calculator aggregates results based on group_by**
10. **P&L Calculator calculates summary metrics**
    ```go
    summary := PnLSummary{
      TotalRealizedPnL:    sumRealizedPnL,
      TotalUnrealizedPnL:  sumUnrealizedPnL,
      TotalPnL:            sumRealizedPnL + sumUnrealizedPnL,
      TotalFees:           sumFees,
      NetPnL:              sumRealizedPnL + sumUnrealizedPnL - sumFees,
      ROI:                 (totalPnL / totalInvested) * 100,
    }
    ```
11. **Return P&L report**

#### Outputs

**Success Response (200 OK) - Grouped by Asset:**
```json
{
  "success": true,
  "data": {
    "period": "30d",
    "periodStart": "2024-11-16T00:00:00Z",
    "periodEnd": "2024-12-16T12:00:00Z",
    "summary": {
      "totalRealizedPnL": 5250.00,
      "totalUnrealizedPnL": 12500.00,
      "totalPnL": 17750.00,
      "totalFees": 125.50,
      "netPnL": 17624.50,
      "totalInvested": 150000.00,
      "currentValue": 167624.50,
      "roi": 11.75,
      "roiAnnualized": 143.08
    },
    "groupedBy": "asset",
    "breakdown": [
      {
        "asset": "BTC",
        "realized": {
          "pnl": 3500.00,
          "trades": 12,
          "bought": 45000.00,
          "sold": 48500.00,
          "fees": 85.00
        },
        "unrealized": {
          "pnl": 10000.00,
          "pnlPercentage": 12.5,
          "holdingAmount": 2.0,
          "averageCostBasis": 40000.00,
          "currentPrice": 45000.00,
          "currentValue": 90000.00
        },
        "totalPnL": 13500.00
      },
      {
        "asset": "ETH",
        "realized": {
          "pnl": 1750.00,
          "trades": 8,
          "bought": 15000.00,
          "sold": 16750.00,
          "fees": 40.50
        },
        "unrealized": {
          "pnl": 2500.00,
          "pnlPercentage": 16.67,
          "holdingAmount": 5.0,
          "averageCostBasis": 2500.00,
          "currentPrice": 3000.00,
          "currentValue": 15000.00
        },
        "totalPnL": 4250.00
      }
    ],
    "lastCalculatedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - Grouped by Exchange:**
```json
{
  "success": true,
  "data": {
    "period": "30d",
    "periodStart": "2024-11-16T00:00:00Z",
    "periodEnd": "2024-12-16T12:00:00Z",
    "summary": {
      "totalRealizedPnL": 5250.00,
      "totalUnrealizedPnL": 12500.00,
      "totalPnL": 17750.00,
      "totalFees": 125.50,
      "netPnL": 17624.50,
      "roi": 11.75
    },
    "groupedBy": "exchange",
    "breakdown": [
      {
        "exchange": "bybit",
        "realized": {
          "pnl": 3000.00,
          "trades": 15,
          "fees": 75.00
        },
        "unrealized": {
          "pnl": 8000.00,
          "currentValue": 95000.00
        },
        "totalPnL": 11000.00,
        "assets": ["BTC", "ETH", "USDT"]
      },
      {
        "exchange": "binance",
        "realized": {
          "pnl": 2250.00,
          "trades": 5,
          "fees": 50.50
        },
        "unrealized": {
          "pnl": 4500.00,
          "currentValue": 55000.00
        },
        "totalPnL": 6750.00,
        "assets": ["BTC", "ETH"]
      }
    ],
    "lastCalculatedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - No Grouping (Summary Only):**
```json
{
  "success": true,
  "data": {
    "period": "all",
    "periodStart": "2024-01-15T10:00:00Z",
    "periodEnd": "2024-12-16T12:00:00Z",
    "summary": {
      "totalRealizedPnL": 25000.00,
      "totalUnrealizedPnL": 45000.00,
      "totalPnL": 70000.00,
      "totalFees": 850.00,
      "netPnL": 69150.00,
      "totalInvested": 100000.00,
      "currentValue": 169150.00,
      "roi": 69.15,
      "roiAnnualized": 76.52
    },
    "groupedBy": "none",
    "breakdown": null,
    "lastCalculatedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - No Data:**
```json
{
  "success": true,
  "data": {
    "period": "30d",
    "periodStart": "2024-11-16T00:00:00Z",
    "periodEnd": "2024-12-16T12:00:00Z",
    "summary": {
      "totalRealizedPnL": 0,
      "totalUnrealizedPnL": 0,
      "totalPnL": 0,
      "totalFees": 0,
      "netPnL": 0,
      "roi": 0
    },
    "groupedBy": "asset",
    "breakdown": [],
    "message": "No trading activity in selected period. P&L will appear after you make trades.",
    "lastCalculatedAt": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid period",
    "details": [
      {
        "field": "period",
        "message": "Must be one of: 24h, 7d, 30d, 90d, 1y, all",
        "code": "INVALID_PERIOD"
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
- Realized P&L calculated from transactions
- Unrealized P&L calculated from cost basis and current prices
- Grouping applied correctly
- ROI calculated accurately
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid period | 400 | Return "Must be one of: 24h, 7d, 30d, 90d, 1y, all" |
| Invalid group_by | 400 | Return "Must be one of: asset, exchange, none" |
| No transactions | 200 | Return zero values with helpful message |
| Missing cost basis | 200 | Calculate with estimated basis or warn user |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 3-4 queries
- Target P95 latency: < 400ms
- Complex calculations done in application layer
- Consider caching P&L results for expensive "all time" queries

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `transactions`, `asset_cost_basis`, `portfolio_current_state`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Cache:**
- Redis - P&L cache for expensive calculations (optional, 5-minute TTL)

#### Notes

**P&L Calculation Method:**
- **Realized P&L**: Calculated from actual sell transactions using FIFO cost basis
- **Unrealized P&L**: Current value minus cost basis for held assets
- **Fees**: Deducted from net P&L

**Cost Basis Methods:**
- Currently using FIFO (First In, First Out)
- Average cost basis is calculated for UI display
- Per-lot cost basis stored for accurate FIFO calculations

**ROI Calculation:**
```
ROI = (Net P&L / Total Invested) × 100
Annualized ROI = ((1 + ROI)^(365/days)) - 1) × 100
```

**Limitations:**
- P&L accuracy depends on transaction sync completeness
- Missing historical transactions may affect cost basis accuracy
- Transfers between exchanges may need manual reconciliation

**Use Cases:**
1. User viewing overall portfolio profitability
2. User analyzing performance by asset
3. User comparing exchange performance
4. Tax reporting preparation

**Related Processes:**
- PROC-PORTFOLIO-005: Get Transactions History (transaction data)
- PROC-PORTFOLIO-011: Calculate/Update Cost Basis (cost basis calculation)
- PROC-PORTFOLIO-010: Sync Transactions from Exchange (data source)

---

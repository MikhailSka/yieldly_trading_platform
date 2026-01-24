### PROC-PORTFOLIO-004: Get Assets (Unified)

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-001, FR-PORTFOLIO-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views the Assets tab on portfolio dashboard

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User has at least one active broker connection OR at least one manual asset

#### Inputs
**API Endpoint:** `GET /api/v1/portfolio/assets`

**Query Parameters:**
```
GET /api/v1/portfolio/assets?
  source={all|exchange|manual}&
  exchange={string}&
  storage_type={enum}&
  asset={string}&
  group_by={none|asset|source}&
  include_small_balances={boolean}&
  small_balance_threshold={number}&
  sort_by={field}&
  sort_order={asc|desc}&
  page={number}&
  page_size={number}
```

**Parameter Details:**
- `source` (enum, default: `all`): Filter by asset source
  - `all`: Both exchange and manual assets
  - `exchange`: Only assets from connected exchanges
  - `manual`: Only manually entered assets
- `exchange` (string, optional): Filter by specific exchange (e.g., "bybit", "binance")
  - Only applies when `source=all` or `source=exchange`
- `storage_type` (enum, optional): Filter manual assets by storage type
  - Values: `hardware_wallet`, `software_wallet`, `paper_wallet`, `cold_storage`, `other_exchange`, `custodial`, `other`
  - Only applies when `source=all` or `source=manual`
- `asset` (string, optional): Filter by asset symbol (e.g., "BTC", "ETH")
- `group_by` (enum, default: `none`): How to group results
  - `none`: Return flat list of all holdings (each exchange/location separately)
  - `asset`: Aggregate same assets across all sources
  - `source`: Group by exchange or storage type
- `include_small_balances` (boolean, default: true): Include assets with small USD value
- `small_balance_threshold` (number, default: 1.0): USD threshold for "small" balances
- `sort_by` (string, default: `value`): Sort field
  - Values: `value`, `asset`, `amount`, `source`, `created_at`
- `sort_order` (string, default: `desc`): Sort direction
- `page` (number, default: 1): Page number for pagination
- `page_size` (number, default: 50, max: 100): Items per page

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/assets` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates query parameters**
   - Validate `source` is valid enum
   - Validate `group_by` is valid enum
   - Validate `storage_type` is valid enum if provided
   - Validate `exchange` exists if provided
   - Validate `sort_by` is valid field
   - Validate pagination parameters
   - Return 400 if any validation fails
4. **Portfolio Controller checks cache** (for default queries only)
   ```
   GET portfolio:{userId}:assets:unified
   ```
   - If found and fresh (< 60 seconds) and no filters → Return cached data
5. **Portfolio Aggregator fetches exchange assets** (if source=all or source=exchange)
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT holdings_data, last_updated_at
   FROM portfolio_current_state
   WHERE user_id = $1;
   ```
   - If not found or stale (> 5 minutes) → Trigger background refresh
6. **Portfolio Repository fetches manual assets** (if source=all or source=manual)
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     id, asset, asset_name, amount,
     purchase_price_usd, purchase_date, total_cost_usd,
     storage_type, storage_location, wallet_address, notes,
     created_at, updated_at
   FROM manual_assets
   WHERE user_id = $1
     AND ($2::storage_type IS NULL OR storage_type = $2)
     AND ($3::varchar IS NULL OR asset = $3);
   ```
7. **Portfolio Controller fetches current prices**
   - Collect unique asset symbols from both sources
   - Call Broker Service: `POST /api/v1/broker/prices/batch` with symbols list
   - Calculate current value for each holding
8. **Portfolio Aggregator normalizes all holdings**
   ```go
   type UnifiedHolding struct {
     ID              string          // UUID for manual, generated for exchange
     Asset           string          // Symbol
     AssetName       string          // Display name
     Amount          float64
     CurrentPriceUSD float64
     CurrentValueUSD float64
     Source          AssetSource     // "exchange" or "manual"
     Location        string          // Exchange name or storage location
     StorageType     StorageType     // For manual assets
     Exchange        string          // For exchange assets
     PurchasePriceUSD float64        // For P&L (manual or cost basis)
     TotalCostUSD    float64
     UnrealizedPnL   float64
     UnrealizedPnLPct float64
     WalletAddress   string          // For manual assets
     Notes           string          // For manual assets
     CreatedAt       Time
     UpdatedAt       Time
   }
   ```
9. **Apply filters**
   - Filter by exchange (if provided)
   - Filter by asset symbol (if provided)
   - Filter small balances (if !include_small_balances)
10. **Apply grouping** (if group_by != none)

    **If group_by = 'asset':**
    ```go
    // Aggregate same assets across all sources
    grouped := map[string]AggregatedAsset{}
    for _, holding := range holdings {
      if existing, ok := grouped[holding.Asset]; ok {
        existing.TotalAmount += holding.Amount
        existing.TotalValueUSD += holding.CurrentValueUSD
        existing.Holdings = append(existing.Holdings, holding)
      } else {
        grouped[holding.Asset] = AggregatedAsset{
          Asset: holding.Asset,
          TotalAmount: holding.Amount,
          TotalValueUSD: holding.CurrentValueUSD,
          Holdings: []UnifiedHolding{holding},
        }
      }
    }
    ```

    **If group_by = 'source':**
    ```go
    // Group by exchange or storage type
    grouped := map[string]SourceGroup{}
    for _, holding := range holdings {
      key := holding.Location // exchange name or storage location
      if existing, ok := grouped[key]; ok {
        existing.Holdings = append(existing.Holdings, holding)
        existing.TotalValueUSD += holding.CurrentValueUSD
      } else {
        grouped[key] = SourceGroup{...}
      }
    }
    ```

11. **Calculate summary statistics**
    ```go
    summary := AssetSummary{
      TotalAssets:        countUniqueAssets(holdings),
      TotalHoldings:      len(holdings),
      TotalValueUSD:      sumValues(holdings),
      TotalCostBasis:     sumCostBasis(holdings),
      TotalUnrealizedPnL: totalValue - totalCost,

      ExchangeAssetsValue: sumExchangeValues(holdings),
      ExchangeAssetsCount: countExchangeHoldings(holdings),
      ManualAssetsValue:   sumManualValues(holdings),
      ManualAssetsCount:   countManualHoldings(holdings),

      BySource: []SourceBreakdown{...},
      ByAsset:  []AssetBreakdown{...},
    }
    ```

12. **Apply sorting and pagination**
    ```go
    sort(holdings, sortBy, sortOrder)
    paginatedHoldings := holdings[offset:offset+pageSize]
    ```

13. **Cache result** (for default queries only)
    ```
    SET portfolio:{userId}:assets:unified {jsonData}
    EXPIRE portfolio:{userId}:assets:unified 60
    ```

14. **Return unified asset response**

#### Outputs

**Success Response (200 OK) - Default View (All Assets, No Grouping):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalAssets": 3,
      "totalHoldings": 6,
      "totalValueUsd": 315000.00,
      "totalCostBasis": 240000.00,
      "totalUnrealizedPnL": 75000.00,
      "totalUnrealizedPnLPct": 31.25,
      "exchangeAssetsValue": 200000.00,
      "exchangeAssetsCount": 4,
      "manualAssetsValue": 115000.00,
      "manualAssetsCount": 2,
      "bySource": [
        {
          "source": "exchange",
          "location": "bybit",
          "valueUsd": 125000.00,
          "percentage": 39.68,
          "holdingCount": 2
        },
        {
          "source": "exchange",
          "location": "binance",
          "valueUsd": 75000.00,
          "percentage": 23.81,
          "holdingCount": 2
        },
        {
          "source": "manual",
          "storageType": "hardware_wallet",
          "location": "Ledger Nano X",
          "valueUsd": 90000.00,
          "percentage": 28.57,
          "holdingCount": 1
        },
        {
          "source": "manual",
          "storageType": "paper_wallet",
          "location": "Bank safe",
          "valueUsd": 25000.00,
          "percentage": 7.94,
          "holdingCount": 1
        }
      ],
      "byAsset": [
        {
          "asset": "BTC",
          "totalAmount": 6.0,
          "totalValueUsd": 270000.00,
          "percentage": 85.71
        },
        {
          "asset": "ETH",
          "totalAmount": 15.0,
          "totalValueUsd": 45000.00,
          "percentage": 14.29
        }
      ]
    },
    "holdings": [
      {
        "id": "holding-1",
        "asset": "BTC",
        "assetName": "Bitcoin",
        "amount": 2.5,
        "currentPriceUsd": 45000.00,
        "currentValueUsd": 112500.00,
        "source": "exchange",
        "exchange": "bybit",
        "location": "bybit",
        "avgCostBasis": 40000.00,
        "totalCostUsd": 100000.00,
        "unrealizedPnL": 12500.00,
        "unrealizedPnLPct": 12.50,
        "percentage": 35.71
      },
      {
        "id": "holding-2",
        "asset": "BTC",
        "assetName": "Bitcoin",
        "amount": 1.5,
        "currentPriceUsd": 45000.00,
        "currentValueUsd": 67500.00,
        "source": "exchange",
        "exchange": "binance",
        "location": "binance",
        "avgCostBasis": 38000.00,
        "totalCostUsd": 57000.00,
        "unrealizedPnL": 10500.00,
        "unrealizedPnLPct": 18.42,
        "percentage": 21.43
      },
      {
        "id": "manual-uuid-1",
        "asset": "BTC",
        "assetName": "Bitcoin on Ledger",
        "amount": 2.0,
        "currentPriceUsd": 45000.00,
        "currentValueUsd": 90000.00,
        "source": "manual",
        "storageType": "hardware_wallet",
        "location": "Ledger Nano X - Personal",
        "walletAddress": "bc1qxy2...0wlh",
        "purchasePriceUsd": 35000.00,
        "purchaseDate": "2023-06-15",
        "totalCostUsd": 70000.00,
        "unrealizedPnL": 20000.00,
        "unrealizedPnLPct": 28.57,
        "notes": "Bought during the dip",
        "percentage": 28.57,
        "createdAt": "2024-01-15T10:00:00Z",
        "updatedAt": "2024-12-01T14:30:00Z"
      },
      {
        "id": "holding-3",
        "asset": "ETH",
        "assetName": "Ethereum",
        "amount": 5.0,
        "currentPriceUsd": 3000.00,
        "currentValueUsd": 15000.00,
        "source": "exchange",
        "exchange": "bybit",
        "location": "bybit",
        "percentage": 4.76
      },
      {
        "id": "holding-4",
        "asset": "ETH",
        "assetName": "Ethereum",
        "amount": 10.0,
        "currentPriceUsd": 3000.00,
        "currentValueUsd": 30000.00,
        "source": "exchange",
        "exchange": "binance",
        "location": "binance",
        "percentage": 9.52
      }
    ],
    "lastUpdatedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "filters": {
      "source": "all",
      "exchange": null,
      "storageType": null,
      "asset": null
    },
    "groupBy": "none",
    "sort": {
      "field": "value",
      "order": "desc"
    },
    "pagination": {
      "page": 1,
      "pageSize": 50,
      "totalItems": 5,
      "totalPages": 1
    },
    "cacheHit": false
  }
}
```

**Success Response (200 OK) - Grouped by Asset:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalAssets": 2,
      "totalHoldings": 5,
      "totalValueUsd": 315000.00,
      "totalCostBasis": 240000.00,
      "totalUnrealizedPnL": 75000.00,
      "totalUnrealizedPnLPct": 31.25
    },
    "assets": [
      {
        "asset": "BTC",
        "assetName": "Bitcoin",
        "totalAmount": 6.0,
        "currentPriceUsd": 45000.00,
        "totalValueUsd": 270000.00,
        "percentage": 85.71,
        "avgCostBasis": 37833.33,
        "totalCostUsd": 227000.00,
        "unrealizedPnL": 43000.00,
        "unrealizedPnLPct": 18.94,
        "holdings": [
          {
            "source": "exchange",
            "location": "bybit",
            "amount": 2.5,
            "valueUsd": 112500.00
          },
          {
            "source": "exchange",
            "location": "binance",
            "amount": 1.5,
            "valueUsd": 67500.00
          },
          {
            "source": "manual",
            "storageType": "hardware_wallet",
            "location": "Ledger Nano X - Personal",
            "amount": 2.0,
            "valueUsd": 90000.00,
            "purchasePriceUsd": 35000.00,
            "notes": "Bought during the dip"
          }
        ]
      },
      {
        "asset": "ETH",
        "assetName": "Ethereum",
        "totalAmount": 15.0,
        "currentPriceUsd": 3000.00,
        "totalValueUsd": 45000.00,
        "percentage": 14.29,
        "holdings": [
          {
            "source": "exchange",
            "location": "bybit",
            "amount": 5.0,
            "valueUsd": 15000.00
          },
          {
            "source": "exchange",
            "location": "binance",
            "amount": 10.0,
            "valueUsd": 30000.00
          }
        ]
      }
    ],
    "lastUpdatedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "groupBy": "asset"
  }
}
```

**Success Response (200 OK) - Filtered by Source (Manual Only):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalAssets": 1,
      "totalHoldings": 2,
      "totalValueUsd": 115000.00,
      "totalCostBasis": 72500.00,
      "totalUnrealizedPnL": 42500.00,
      "totalUnrealizedPnLPct": 58.62,
      "byStorageType": [
        {
          "storageType": "hardware_wallet",
          "count": 1,
          "totalValueUsd": 90000.00,
          "percentage": 78.26
        },
        {
          "storageType": "paper_wallet",
          "count": 1,
          "totalValueUsd": 25000.00,
          "percentage": 21.74
        }
      ]
    },
    "holdings": [
      {
        "id": "manual-uuid-1",
        "asset": "BTC",
        "assetName": "Bitcoin on Ledger",
        "amount": 2.0,
        "currentPriceUsd": 45000.00,
        "currentValueUsd": 90000.00,
        "source": "manual",
        "storageType": "hardware_wallet",
        "location": "Ledger Nano X - Personal",
        "walletAddress": "bc1qxy2...0wlh",
        "purchasePriceUsd": 35000.00,
        "purchaseDate": "2023-06-15",
        "totalCostUsd": 70000.00,
        "unrealizedPnL": 20000.00,
        "unrealizedPnLPct": 28.57,
        "notes": "Bought during the dip",
        "percentage": 78.26,
        "createdAt": "2024-01-15T10:00:00Z",
        "updatedAt": "2024-12-01T14:30:00Z"
      },
      {
        "id": "manual-uuid-2",
        "asset": "ETH",
        "assetName": "ETH Paper Wallet",
        "amount": 10.0,
        "currentPriceUsd": 2500.00,
        "currentValueUsd": 25000.00,
        "source": "manual",
        "storageType": "paper_wallet",
        "location": "Bank safe deposit box",
        "purchasePriceUsd": 250.00,
        "purchaseDate": "2020-01-10",
        "totalCostUsd": 2500.00,
        "unrealizedPnL": 22500.00,
        "unrealizedPnLPct": 900.00,
        "percentage": 21.74,
        "createdAt": "2024-02-01T08:00:00Z",
        "updatedAt": "2024-02-01T08:00:00Z"
      }
    ],
    "lastUpdatedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "filters": {
      "source": "manual"
    }
  }
}
```

**Success Response (200 OK) - Filtered by Exchange:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalAssets": 2,
      "totalHoldings": 2,
      "totalValueUsd": 127500.00,
      "exchangeAssetsValue": 127500.00,
      "exchangeAssetsCount": 2
    },
    "holdings": [
      {
        "id": "holding-1",
        "asset": "BTC",
        "assetName": "Bitcoin",
        "amount": 2.5,
        "currentPriceUsd": 45000.00,
        "currentValueUsd": 112500.00,
        "source": "exchange",
        "exchange": "bybit",
        "location": "bybit",
        "percentage": 88.24
      },
      {
        "id": "holding-3",
        "asset": "ETH",
        "assetName": "Ethereum",
        "amount": 5.0,
        "currentPriceUsd": 3000.00,
        "currentValueUsd": 15000.00,
        "source": "exchange",
        "exchange": "bybit",
        "location": "bybit",
        "percentage": 11.76
      }
    ],
    "lastUpdatedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "filters": {
      "source": "exchange",
      "exchange": "bybit"
    }
  }
}
```

**Success Response (200 OK) - Small Balances Filtered:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalAssets": 2,
      "totalHoldings": 5,
      "totalValueUsd": 315000.00
    },
    "holdings": [
      "..."
    ],
    "filteredOut": {
      "count": 8,
      "totalValueUsd": 3.45,
      "message": "8 holdings with value < $1.00 not shown"
    },
    "lastUpdatedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "smallBalanceThreshold": 1.0
  }
}
```

**Success Response (200 OK) - Empty Portfolio:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalAssets": 0,
      "totalHoldings": 0,
      "totalValueUsd": 0,
      "exchangeAssetsValue": 0,
      "exchangeAssetsCount": 0,
      "manualAssetsValue": 0,
      "manualAssetsCount": 0
    },
    "holdings": [],
    "message": "No assets found. Connect an exchange or add manual assets to start tracking.",
    "lastUpdatedAt": null
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
    "message": "Invalid query parameters",
    "details": [
      {
        "field": "source",
        "message": "Must be 'all', 'exchange', or 'manual'",
        "code": "INVALID_SOURCE"
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
- Exchange and manual assets combined in unified response
- Summary statistics calculated correctly
- Filtering works across all parameters
- Grouping aggregates correctly
- Pagination works correctly
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid source filter | 400 | Return "Must be 'all', 'exchange', or 'manual'" |
| Invalid group_by | 400 | Return "Must be 'none', 'asset', or 'source'" |
| Invalid storage_type | 400 | Return "Invalid storage type" |
| Invalid exchange | 400 | Return "Unknown exchange" |
| Invalid sort_by | 400 | Return "Invalid sort field" |
| No broker connections and no manual assets | 200 | Return empty with helpful message |
| Price fetch fails | 200 | Return assets with last known prices, include warning |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Target P95 latency: < 300ms (cached), < 600ms (fresh)
- Cache TTL: 60 seconds (for unfiltered queries)
- Batch price fetch for efficiency
- In-memory aggregation (portfolio data typically small)

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_current_state`, `manual_assets`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Cache:**
- Redis - Unified assets cache (60-second TTL)

**External Services:**
- Broker Service: `POST /api/v1/broker/prices/batch` (for current prices)
- Portfolio Service internal (PROC-PORTFOLIO-008 for refresh if stale)

#### Notes

**Filter Combinations:**
| Filter | Works With |
|--------|------------|
| `source=exchange` | `exchange`, `asset` |
| `source=manual` | `storage_type`, `asset` |
| `source=all` | All filters |
| `exchange=bybit` | Implies `source=exchange` |
| `storage_type=hardware_wallet` | Implies `source=manual` |

**Grouping Modes:**
| Mode | Description | Use Case |
|------|-------------|----------|
| `none` | Flat list of all holdings | Detailed view, editing |
| `asset` | Aggregate by symbol | Asset allocation chart |
| `source` | Group by exchange/storage | Location breakdown |

**Summary Statistics:**
Always returned regardless of grouping:
- `totalAssets`: Count of unique asset symbols
- `totalHoldings`: Count of individual holdings (exchange + manual)
- `totalValueUsd`: Sum of all holding values
- `totalCostBasis`: Sum of cost basis (where available)
- `totalUnrealizedPnL`: Total unrealized P&L
- `bySource`: Breakdown by exchange/storage type
- `byAsset`: Breakdown by asset symbol

**Frontend Usage:**
1. **Assets Tab Default**: `GET /api/v1/portfolio/assets` (all assets, no grouping)
2. **Exchange Filter Tab**: `GET /api/v1/portfolio/assets?exchange=bybit`
3. **Manual Assets Tab**: `GET /api/v1/portfolio/assets?source=manual`
4. **Asset Allocation Chart**: `GET /api/v1/portfolio/assets?group_by=asset`
5. **Hide Dust**: `GET /api/v1/portfolio/assets?include_small_balances=false`

**Deprecation:**
This endpoint replaces:
- Previous `GET /api/v1/portfolio/assets` (exchange only)
- `GET /api/v1/portfolio/assets/manual` (manual only - now use `source=manual` filter)

**Related Processes:**
- PROC-PORTFOLIO-001: Fetch Real-Time Portfolio Value (total portfolio summary)
- PROC-PORTFOLIO-014: Add Manual Asset (CRUD for manual)
- PROC-PORTFOLIO-015: Update Manual Asset (CRUD for manual)
- PROC-PORTFOLIO-016: Delete Manual Asset (CRUD for manual)

---

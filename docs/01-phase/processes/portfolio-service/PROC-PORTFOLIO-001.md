### PROC-PORTFOLIO-001: Fetch Real-Time Portfolio Value

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views portfolio dashboard OR Frontend polls every 60 seconds

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User has at least one active broker connection OR at least one manual asset

#### Inputs
**API Endpoint:** `GET /api/v1/portfolio`

**Query Parameters:**
```
GET /api/v1/portfolio?
  include_manual={boolean}&
  include_breakdown={boolean}
```

**Parameter Details:**
- `include_manual` (boolean, default: true): Include manually entered assets
- `include_breakdown` (boolean, default: true): Include per-exchange and per-storage breakdown

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller checks cache**
   ```
   GET portfolio:{userId}:current
   ```
   - If found and fresh (< 60 seconds) → Return cached data
4. **Portfolio Aggregator queries user's exchange connections**
   ```sql
   -- Query broker_db via Broker Service
   SELECT connection_id, exchange
   FROM broker_connections
   WHERE user_id = $1 AND status = 'active' AND deleted_at IS NULL;
   ```
5. **Portfolio Aggregator fetches data from each broker**
   - Call Broker Service: `GET /api/v1/broker/portfolio?broker={exchange}&connection_id={connectionId}`
   - Execute calls in parallel for all connections
   - Track which exchanges succeeded/failed
6. **Portfolio Aggregator queries user's manual assets**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     id,
     asset,
     asset_name,
     amount,
     purchase_price_usd,
     purchase_date,
     total_cost_usd,
     storage_type,
     storage_location,
     notes
   FROM manual_assets
   WHERE user_id = $1
   ORDER BY asset, storage_location;
   ```
7. **Portfolio Aggregator fetches current prices for manual assets**
   - Collect unique asset symbols from manual assets
   - Call Broker Service: `POST /api/v1/broker/prices/batch` with symbols list
   - Use fallback price from last known value if price fetch fails
8. **Portfolio Aggregator combines all data sources**
   - Exchange assets (from step 5)
   - Manual assets with current prices (from steps 6-7)
9. **Portfolio Aggregator deduplicates and aggregates assets**
   - Combine same asset across exchanges (BTC on Bybit + BTC on Binance)
   - Combine same asset across manual entries (BTC on Ledger + BTC on paper wallet)
   - Keep track of sources for breakdown
10. **P&L Calculator calculates portfolio values**
    ```go
    type PortfolioValuation struct {
      // Exchange assets
      ExchangeValueUSD     float64
      ExchangeRealizedPnL  float64
      ExchangeUnrealizedPnL float64

      // Manual assets
      ManualValueUSD       float64
      ManualCostBasis      float64  // Sum of total_cost_usd
      ManualUnrealizedPnL  float64  // current_value - cost_basis

      // Combined
      TotalValueUSD        float64
      TotalRealizedPnL     float64
      TotalUnrealizedPnL   float64
      TotalPnL             float64
    }
    ```
11. **Risk Analyzer calculates basic metrics**
    - Drawdown: Compare with historical max value
    - Volatility: Not calculated in real-time (uses snapshots)
12. **Cache Manager caches result**
    ```
    SET portfolio:{userId}:current {jsonData}
    EXPIRE portfolio:{userId}:current 60
    ```
13. **Return portfolio data**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "totalValueUsd": 250000.50,
    "totalCostBasis": 180000.00,
    "realizedPnL": 15000.00,
    "unrealizedPnL": 55000.50,
    "totalPnL": 70000.50,
    "exchanges": [
      {
        "exchange": "bybit",
        "valueUsd": 125000,
        "percentage": 50.0
      },
      {
        "exchange": "binance",
        "valueUsd": 75000.50,
        "percentage": 30.0
      }
    ],
    "manualStorage": [
      {
        "storageType": "hardware_wallet",
        "storageLocation": "Ledger Nano X",
        "valueUsd": 45000,
        "percentage": 18.0
      },
      {
        "storageType": "cold_storage",
        "storageLocation": "Paper wallet in bank safe",
        "valueUsd": 5000,
        "percentage": 2.0
      }
    ],
    "assets": [
      {
        "symbol": "BTC",
        "totalQuantity": 5.0,
        "valueUsd": 225000,
        "percentage": 90,
        "avgCostBasis": 36000.00,
        "unrealizedPnL": 45000.00,
        "unrealizedPnLPct": 25.0,
        "holdings": [
          {
            "source": "exchange",
            "location": "bybit",
            "quantity": 2.5,
            "valueUsd": 112500
          },
          {
            "source": "exchange",
            "location": "binance",
            "quantity": 1.5,
            "valueUsd": 67500
          },
          {
            "source": "manual",
            "storageType": "hardware_wallet",
            "location": "Ledger Nano X",
            "quantity": 1.0,
            "valueUsd": 45000,
            "purchasePrice": 30000.00,
            "purchaseDate": "2023-06-15"
          }
        ]
      },
      {
        "symbol": "USDT",
        "totalQuantity": 25000.50,
        "valueUsd": 25000.50,
        "percentage": 10,
        "avgCostBasis": 1.00,
        "unrealizedPnL": 0.50,
        "unrealizedPnLPct": 0.002,
        "holdings": [
          {
            "source": "exchange",
            "location": "bybit",
            "quantity": 12500.50,
            "valueUsd": 12500.50
          },
          {
            "source": "exchange",
            "location": "binance",
            "quantity": 7500,
            "valueUsd": 7500
          },
          {
            "source": "manual",
            "storageType": "cold_storage",
            "location": "Paper wallet in bank safe",
            "quantity": 5000,
            "valueUsd": 5000,
            "purchasePrice": 1.00,
            "purchaseDate": "2024-01-10"
          }
        ]
      }
    ],
    "summary": {
      "exchangeAssetsValue": 200000.50,
      "exchangeAssetsCount": 3,
      "manualAssetsValue": 50000.00,
      "manualAssetsCount": 2,
      "totalAssetsCount": 5
    },
    "riskMetrics": {
      "currentDrawdownPct": -5.2
    },
    "lastUpdated": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "cacheHit": false
  }
}
```

**Success Response - No Manual Assets (200 OK):**
```json
{
  "success": true,
  "data": {
    "totalValueUsd": 200000.50,
    "exchanges": [
      {
        "exchange": "bybit",
        "valueUsd": 125000,
        "percentage": 62.5
      },
      {
        "exchange": "binance",
        "valueUsd": 75000.50,
        "percentage": 37.5
      }
    ],
    "manualStorage": [],
    "assets": [
      {
        "symbol": "BTC",
        "totalQuantity": 4.0,
        "valueUsd": 180000,
        "percentage": 90,
        "holdings": [
          {
            "source": "exchange",
            "location": "bybit",
            "quantity": 2.5,
            "valueUsd": 112500
          },
          {
            "source": "exchange",
            "location": "binance",
            "quantity": 1.5,
            "valueUsd": 67500
          }
        ]
      }
    ],
    "summary": {
      "exchangeAssetsValue": 200000.50,
      "exchangeAssetsCount": 2,
      "manualAssetsValue": 0,
      "manualAssetsCount": 0,
      "totalAssetsCount": 2
    },
    "lastUpdated": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Manual Assets Only (200 OK):**
```json
{
  "success": true,
  "data": {
    "totalValueUsd": 50000.00,
    "totalCostBasis": 35000.00,
    "unrealizedPnL": 15000.00,
    "exchanges": [],
    "manualStorage": [
      {
        "storageType": "hardware_wallet",
        "storageLocation": "Ledger Nano X",
        "valueUsd": 50000,
        "percentage": 100.0
      }
    ],
    "assets": [
      {
        "symbol": "BTC",
        "totalQuantity": 1.0,
        "valueUsd": 50000,
        "percentage": 100,
        "avgCostBasis": 35000.00,
        "unrealizedPnL": 15000.00,
        "unrealizedPnLPct": 42.86,
        "holdings": [
          {
            "source": "manual",
            "storageType": "hardware_wallet",
            "location": "Ledger Nano X",
            "quantity": 1.0,
            "valueUsd": 50000,
            "purchasePrice": 35000.00,
            "purchaseDate": "2023-01-15"
          }
        ]
      }
    ],
    "summary": {
      "exchangeAssetsValue": 0,
      "exchangeAssetsCount": 0,
      "manualAssetsValue": 50000.00,
      "manualAssetsCount": 1,
      "totalAssetsCount": 1
    },
    "lastUpdated": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Empty Portfolio (200 OK):**
```json
{
  "success": true,
  "data": {
    "totalValueUsd": 0,
    "exchanges": [],
    "manualStorage": [],
    "assets": [],
    "summary": {
      "exchangeAssetsValue": 0,
      "exchangeAssetsCount": 0,
      "manualAssetsValue": 0,
      "manualAssetsCount": 0,
      "totalAssetsCount": 0
    },
    "message": "No assets found. Connect an exchange or add manual assets to start tracking.",
    "lastUpdated": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Portfolio data aggregated from all exchange connections
- Manual assets included with current prices
- Assets deduplicated and aggregated by symbol
- P&L calculated using cost basis
- Total value calculated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| No connections and no manual assets | 200 | Return empty portfolio with helpful message |
| Broker Service unavailable | 503 | Return cached data if available, or manual assets only |
| Partial data (one exchange fails) | 200 | Return data from successful exchanges + manual assets, log warning |
| Price fetch fails for manual assets | 200 | Use last known price or 0, include warning in response |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- P95 latency: < 800ms (fresh data), < 50ms (cached)
- Cache TTL: 60 seconds
- Parallel broker API calls for efficiency
- Parallel price fetch for manual assets

#### Dependencies
**Cache:**
- Redis (portfolio cache, 60-second TTL)

**External Services:**
- Broker Service: `GET /api/v1/broker/portfolio` (per connection)
- Broker Service: `POST /api/v1/broker/prices/batch` (for manual asset pricing)

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `manual_assets`, `portfolio_snapshots`, `asset_cost_basis`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

#### Notes

**Data Sources:**
| Source | Description | P&L Calculation |
|--------|-------------|-----------------|
| Exchange | Synced from connected brokers | Uses `asset_cost_basis` table |
| Manual | User-entered assets | Uses `purchase_price_usd` from `manual_assets` |

**Asset Aggregation:**
Assets are aggregated by symbol across all sources:
- BTC on Bybit + BTC on Binance + BTC on Ledger = Total BTC holding
- Each source is tracked in the `holdings` array for breakdown

**Cost Basis for Manual Assets:**
- User provides `purchase_price_usd` when adding manual asset
- If not provided, unrealized P&L cannot be calculated
- Total cost = `amount * purchase_price_usd`
- Unrealized P&L = `current_value - total_cost`

**Price Fetching for Manual Assets:**
1. Collect unique symbols from manual assets
2. Fetch current prices from Broker Service batch endpoint
3. If symbol not found on any exchange, try CoinGecko API (future)
4. If price unavailable, use 0 and include warning

**Related Processes:**
- PROC-PORTFOLIO-014: Add Manual Asset
- PROC-PORTFOLIO-015: Update Manual Asset
- PROC-PORTFOLIO-016: Delete Manual Asset
- PROC-PORTFOLIO-017: List Manual Assets
- PROC-BROKER-016: Get Batch Asset Prices

---

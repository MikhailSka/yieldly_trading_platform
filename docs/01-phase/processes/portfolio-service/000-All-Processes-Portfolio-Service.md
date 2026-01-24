# Portfolio Service Processes - Consolidated

This document contains all process documentation for the Portfolio Service.

**Total Documents:** 18  
**Last Generated:** 2025-11-30T23:58:38.363Z  
**Source Directory:** `processes/portfolio-service`


---

## Table of Contents

1. [PROC-PORTFOLIO-001](#proc-portfolio-001)
2. [PROC-PORTFOLIO-002](#proc-portfolio-002)
3. [PROC-PORTFOLIO-003](#proc-portfolio-003)
4. [PROC-PORTFOLIO-004](#proc-portfolio-004)
5. [PROC-PORTFOLIO-005](#proc-portfolio-005)
6. [PROC-PORTFOLIO-006](#proc-portfolio-006)
7. [PROC-PORTFOLIO-007](#proc-portfolio-007)
8. [PROC-PORTFOLIO-008](#proc-portfolio-008)
9. [PROC-PORTFOLIO-009](#proc-portfolio-009)
10. [PROC-PORTFOLIO-010](#proc-portfolio-010)
11. [PROC-PORTFOLIO-011](#proc-portfolio-011)
12. [PROC-PORTFOLIO-012](#proc-portfolio-012)
13. [PROC-PORTFOLIO-013](#proc-portfolio-013)
14. [PROC-PORTFOLIO-014](#proc-portfolio-014)
15. [PROC-PORTFOLIO-015](#proc-portfolio-015)
16. [PROC-PORTFOLIO-016](#proc-portfolio-016)
17. [PROC-PORTFOLIO-017](#proc-portfolio-017)
18. [PROC-PORTFOLIO-018](#proc-portfolio-018)

---

## PROC-PORTFOLIO-001: Fetch Real-Time Portfolio Value

**Source File:** `PROC-PORTFOLIO-001.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-001.md`

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


---

## PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot

**Source File:** `PROC-PORTFOLIO-002.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-002.md`

### PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-022, ADR-032

#### Trigger
Scheduled background job (every hour during market hours)

#### Actor
System (Scheduler)

#### Preconditions
- Market is open (crypto: 24/7)

#### Process Steps

1. **Scheduled Job triggers snapshot creation**
2. **Snapshot Scheduler queries active users**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/broker_db_schema.dbml
   SELECT DISTINCT user_id
   FROM broker_connections
   WHERE status = 'active'
   ```
3. **For each user:**
4. **Snapshot Scheduler calls Portfolio Aggregator**
   - Same as PROC-PORTFOLIO-001 steps 3-7
5. **Snapshot Scheduler saves snapshot to database**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   INSERT INTO portfolio_snapshots (
     user_id, timestamp, total_value_usd,
     exchange_breakdown, asset_breakdown,
     created_at
   ) VALUES (
     $1, NOW(), $2,
     $3, $4,
     NOW()
   )
   ```
6. **Snapshot Scheduler checks for significant changes**
   - If portfolio value changed > 10% in 1 hour → Publish notification event
   - Event type: `portfolio.value.changed`
   - Message format per ADR-032

#### Outputs
**Service Bus Message (if significant change, ADR-032):**
```json
{
  "messageId": "uuid",
  "eventType": "portfolio.value.changed",
  "timestamp": "2024-12-01T12:00:00Z",
  "version": "1.0",
  "source": {
    "service": "portfolio-service",
    "instance": "instance-id"
  },
  "payload": {
    "userId": "uuid",
    "changePct": 12.5,
    "oldValue": 200000,
    "newValue": 225000
  },
  "metadata": {
    "correlationId": "uuid",
    "causationId": "uuid",
    "userId": "uuid"
  }
}
```

#### Success Criteria
- Snapshots created for all active users
- Data saved to database

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Execution time: < 5 minutes for 1000 users
- Runs hourly in background
- Processes users in batches for efficiency

#### Dependencies
**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_snapshots`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**External Services:**
- Broker Service (for fetching portfolio data)

**Message Queue:**
- Azure Service Bus - Topic: `portfolio.value.changed`

---


---

## PROC-PORTFOLIO-003: Generate Portfolio Performance Charts

**Source File:** `PROC-PORTFOLIO-003.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-003.md`

### PROC-PORTFOLIO-003: Generate Portfolio Performance Charts

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-007
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views portfolio charts (daily, weekly, monthly)

#### Actor
Authenticated User

#### Preconditions
- Hourly snapshots exist for user

#### Inputs
**API Endpoint:** `GET /api/v1/portfolio/charts`

**Query Parameters:**
```
GET /api/v1/portfolio/charts?
  user_id={uuid}
  &period=7d
```

#### Process Steps

1. **API Gateway receives request**
2. **Portfolio Controller validates period**
   - Valid options: "24h", "7d", "30d", "3m", "1y", "all"
3. **Chart Generator queries snapshots**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT timestamp, total_value_usd
   FROM portfolio_snapshots
   WHERE user_id = $1
   AND timestamp >= NOW() - INTERVAL '{period}'
   ORDER BY timestamp ASC
   ```
4. **Chart Generator calculates data points**
   - For "24h": Use hourly snapshots
   - For "7d": Use hourly snapshots (168 points)
   - For "30d": Downsample to 4-hour intervals
   - For "3m": Downsample to daily
   - For "1y": Downsample to daily
5. **Chart Generator calculates period metrics**
   ```
   startValue = snapshots[0].value
   endValue = snapshots[last].value
   changePct = ((endValue - startValue) / startValue) * 100
   maxValue = max(snapshots.value)
   minValue = min(snapshots.value)
   ```
6. **Return chart data**

#### Outputs
**Success Response (ADR-032):**
```json
{
  "success": true,
  "data": {
    "period": "7d",
    "dataPoints": [
      {"timestamp": "2024-11-24T00:00:00Z", "value": 200000},
      {"timestamp": "2024-11-24T01:00:00Z", "value": 200500}
    ],
    "summary": {
      "startValue": 200000,
      "endValue": 205000,
      "changePct": 2.5,
      "maxValue": 206000,
      "minValue": 198000,
      "maxDrawdownPct": -3.5
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Snapshots retrieved
- Data downsampled if needed
- Summary metrics calculated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| No snapshots found | 200 | Return empty array with message |
| Invalid period | 400 | Return "Invalid period" |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Target P95 latency: < 200ms
- Downsampling reduces data points for longer periods
- Efficient SQL queries using indexed timestamp column

#### Dependencies
**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_snapshots`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

---


---

## PROC-PORTFOLIO-004: Get Assets (Unified)

**Source File:** `PROC-PORTFOLIO-004.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-004.md`

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


---

## PROC-PORTFOLIO-005: Get Transactions History

**Source File:** `PROC-PORTFOLIO-005.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-005.md`

### PROC-PORTFOLIO-005: Get Transactions History

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-003
**Related NFR:** NFR-PERF-001, NFR-API-001
**Related ADR:** ADR-032

#### Trigger
User views transaction history on portfolio page

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Transactions have been synced from connected exchanges

#### Inputs
**API Endpoint:** `GET /api/v1/portfolio/transactions`

**Query Parameters:**
```
GET /api/v1/portfolio/transactions?
  page={number}&
  page_size={number}&
  exchange={exchange}&
  transaction_type={type}&
  asset={symbol}&
  start_date={ISO8601}&
  end_date={ISO8601}&
  sort_by={field}&
  sort_order={asc|desc}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 50, max: 100): Items per page
- `exchange` (string, optional): Filter by exchange (`bybit`, `binance`)
- `transaction_type` (string, optional): Filter by type (`trade`, `deposit`, `withdrawal`, `fee`, `transfer`)
- `asset` (string, optional): Filter by asset symbol (`BTC`, `ETH`, etc.)
- `start_date` (ISO8601, optional): Filter transactions after this date
- `end_date` (ISO8601, optional): Filter transactions before this date
- `sort_by` (string, default: `transaction_timestamp`): Sort field
- `sort_order` (string, default: `desc`): Sort direction (`asc`, `desc`)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/transactions` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates query parameters**
   - Validate `page` is positive integer
   - Validate `page_size` is between 1 and 100
   - Validate `exchange` is valid if provided
   - Validate `transaction_type` is valid enum if provided
   - Validate date range is valid (end_date >= start_date)
   - Return 400 if any validation fails
4. **Portfolio Repository fetches transactions**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     t.id,
     t.exchange,
     t.exchange_transaction_id,
     t.transaction_type,
     t.asset,
     t.amount,
     t.price_usd,
     t.value_usd,
     t.fee_amount,
     t.fee_asset,
     t.fee_usd,
     t.trade_pair,
     t.side,
     t.transaction_timestamp,
     t.synced_at,
     t.notes
   FROM transactions t
   WHERE t.user_id = $1
     AND ($2::varchar IS NULL OR t.exchange = $2)
     AND ($3::transaction_type IS NULL OR t.transaction_type = $3)
     AND ($4::varchar IS NULL OR t.asset = $4)
     AND ($5::timestamptz IS NULL OR t.transaction_timestamp >= $5)
     AND ($6::timestamptz IS NULL OR t.transaction_timestamp <= $6)
   ORDER BY
     CASE WHEN $7 = 'transaction_timestamp' AND $8 = 'desc' THEN t.transaction_timestamp END DESC,
     CASE WHEN $7 = 'transaction_timestamp' AND $8 = 'asc' THEN t.transaction_timestamp END ASC,
     CASE WHEN $7 = 'value_usd' AND $8 = 'desc' THEN t.value_usd END DESC,
     CASE WHEN $7 = 'value_usd' AND $8 = 'asc' THEN t.value_usd END ASC,
     CASE WHEN $7 = 'asset' AND $8 = 'asc' THEN t.asset END ASC,
     CASE WHEN $7 = 'asset' AND $8 = 'desc' THEN t.asset END DESC
   LIMIT $9 OFFSET $10;
   ```
5. **Portfolio Repository counts total matching records**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT COUNT(*)
   FROM transactions t
   WHERE t.user_id = $1
     AND ($2::varchar IS NULL OR t.exchange = $2)
     AND ($3::transaction_type IS NULL OR t.transaction_type = $3)
     AND ($4::varchar IS NULL OR t.asset = $4)
     AND ($5::timestamptz IS NULL OR t.transaction_timestamp >= $5)
     AND ($6::timestamptz IS NULL OR t.transaction_timestamp <= $6);
   ```
6. **Portfolio Controller calculates summary statistics**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     COUNT(*) as total_count,
     SUM(CASE WHEN transaction_type = 'trade' AND side = 'buy' THEN value_usd ELSE 0 END) as total_bought_usd,
     SUM(CASE WHEN transaction_type = 'trade' AND side = 'sell' THEN value_usd ELSE 0 END) as total_sold_usd,
     SUM(CASE WHEN transaction_type = 'deposit' THEN value_usd ELSE 0 END) as total_deposited_usd,
     SUM(CASE WHEN transaction_type = 'withdrawal' THEN value_usd ELSE 0 END) as total_withdrawn_usd,
     SUM(COALESCE(fee_usd, 0)) as total_fees_usd
   FROM transactions
   WHERE user_id = $1
     AND ($2::timestamptz IS NULL OR transaction_timestamp >= $2)
     AND ($3::timestamptz IS NULL OR transaction_timestamp <= $3);
   ```
7. **Portfolio Controller formats response**
8. **Return paginated transactions with summary**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid-1",
        "exchange": "bybit",
        "exchangeTransactionId": "tx_123456",
        "transactionType": "trade",
        "asset": "BTC",
        "amount": 0.5,
        "priceUsd": 45000.00,
        "valueUsd": 22500.00,
        "fee": {
          "amount": 0.0001,
          "asset": "BTC",
          "valueUsd": 4.50
        },
        "trade": {
          "pair": "BTCUSDT",
          "side": "buy"
        },
        "transactionTimestamp": "2024-12-16T10:30:00Z",
        "syncedAt": "2024-12-16T11:00:00Z"
      },
      {
        "id": "uuid-2",
        "exchange": "binance",
        "exchangeTransactionId": "dep_789012",
        "transactionType": "deposit",
        "asset": "USDT",
        "amount": 10000.00,
        "priceUsd": 1.00,
        "valueUsd": 10000.00,
        "fee": null,
        "trade": null,
        "transactionTimestamp": "2024-12-15T14:00:00Z",
        "syncedAt": "2024-12-15T15:00:00Z"
      },
      {
        "id": "uuid-3",
        "exchange": "bybit",
        "exchangeTransactionId": "tx_345678",
        "transactionType": "trade",
        "asset": "ETH",
        "amount": 2.0,
        "priceUsd": 3000.00,
        "valueUsd": 6000.00,
        "fee": {
          "amount": 6.00,
          "asset": "USDT",
          "valueUsd": 6.00
        },
        "trade": {
          "pair": "ETHUSDT",
          "side": "sell"
        },
        "transactionTimestamp": "2024-12-14T09:15:00Z",
        "syncedAt": "2024-12-14T10:00:00Z"
      }
    ],
    "summary": {
      "totalTransactions": 156,
      "periodStats": {
        "totalBoughtUsd": 85000.00,
        "totalSoldUsd": 42000.00,
        "totalDepositedUsd": 50000.00,
        "totalWithdrawnUsd": 5000.00,
        "totalFeesUsd": 125.50,
        "netFlowUsd": 45000.00
      }
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 156,
    "totalPages": 4,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "filters": {
      "exchange": null,
      "transactionType": null,
      "asset": null,
      "startDate": null,
      "endDate": null
    }
  }
}
```

**Success Response (200 OK) - With Filters:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid-1",
        "exchange": "bybit",
        "transactionType": "trade",
        "asset": "BTC",
        "amount": 0.5,
        "valueUsd": 22500.00,
        "trade": {
          "pair": "BTCUSDT",
          "side": "buy"
        },
        "transactionTimestamp": "2024-12-16T10:30:00Z"
      }
    ],
    "summary": {
      "totalTransactions": 45,
      "periodStats": {
        "totalBoughtUsd": 45000.00,
        "totalSoldUsd": 0,
        "totalFeesUsd": 45.00
      }
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 45,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "filters": {
      "exchange": "bybit",
      "transactionType": "trade",
      "asset": "BTC",
      "startDate": "2024-12-01T00:00:00Z",
      "endDate": "2024-12-31T23:59:59Z"
    }
  }
}
```

**Success Response (200 OK) - Empty:**
```json
{
  "success": true,
  "data": {
    "transactions": [],
    "summary": {
      "totalTransactions": 0,
      "periodStats": null
    },
    "message": "No transactions found. Transactions are synced from your connected exchanges."
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
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
    "message": "Invalid date range",
    "details": [
      {
        "field": "end_date",
        "message": "End date must be after start date",
        "code": "INVALID_DATE_RANGE"
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
- Transactions retrieved for authenticated user
- Filters applied correctly
- Pagination working
- Summary statistics calculated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid exchange filter | 400 | Return "Invalid exchange" |
| Invalid transaction_type | 400 | Return "Invalid transaction type" |
| Invalid date format | 400 | Return "Invalid date format. Use ISO8601" |
| Invalid date range | 400 | Return "End date must be after start date" |
| Invalid page_size | 400 | Return "Page size must be between 1 and 100" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-API-001**: Pagination and List Optimization

**Process-Specific Notes:**
- Database Queries: 3 queries (data, count, summary)
- Target P95 latency: < 300ms
- Index on `(user_id, transaction_timestamp)` for efficient queries
- Summary statistics cached for 5 minutes

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `transactions`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

#### Notes

**Transaction Types:**
- `trade`: Buy or sell trade on exchange
- `deposit`: Funds deposited to exchange
- `withdrawal`: Funds withdrawn from exchange
- `fee`: Standalone fee (e.g., funding fees)
- `transfer`: Transfer between exchanges (future)

**Data Synchronization:**
- Transactions are synced via PROC-PORTFOLIO-010 (Sync Transactions from Exchange)
- New transactions are pulled periodically or on-demand
- `synced_at` indicates when we imported the transaction

**Export Support:**
- This endpoint supports CSV export via Accept header
- `Accept: text/csv` returns CSV format (for tax reporting)

**Use Cases:**
1. User reviewing recent trading activity
2. User filtering transactions for specific asset
3. User exporting transactions for tax purposes
4. User reconciling deposits/withdrawals

**Related Processes:**
- PROC-PORTFOLIO-010: Sync Transactions from Exchange (populates this data)
- PROC-PORTFOLIO-006: Get P&L Report (uses transaction data)
- PROC-PORTFOLIO-011: Calculate/Update Cost Basis (uses transaction data)

---


---

## PROC-PORTFOLIO-006: Get P&L Report

**Source File:** `PROC-PORTFOLIO-006.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-006.md`

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


---

## PROC-PORTFOLIO-007: Get Risk Metrics

**Source File:** `PROC-PORTFOLIO-007.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-007.md`

### PROC-PORTFOLIO-007: Get Risk Metrics

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views risk metrics on portfolio dashboard

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User has historical portfolio snapshots (minimum 7 days for meaningful metrics)

#### Inputs
**API Endpoint:** `GET /api/v1/portfolio/risk-metrics`

**Query Parameters:**
```
GET /api/v1/portfolio/risk-metrics?
  period={30d|90d|1y|all}
```

**Parameter Details:**
- `period` (string, default: `90d`): Time period for risk calculation

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/risk-metrics` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates period parameter**
   - Valid options: `30d`, `90d`, `1y`, `all`
4. **Risk Analyzer checks cache for calculated metrics**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     max_drawdown,
     current_drawdown,
     peak_value_usd,
     peak_timestamp,
     valley_value_usd,
     valley_timestamp,
     volatility,
     sharpe_ratio,
     best_day_return,
     best_day_timestamp,
     worst_day_return,
     worst_day_timestamp,
     calculated_at,
     calculation_period_days
   FROM risk_metrics_cache
   WHERE user_id = $1;
   ```
   - If cached metrics exist and are fresh (< 24 hours) → Return cached
5. **If cache miss or stale, calculate from snapshots**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     snapshot_timestamp,
     total_value_usd
   FROM portfolio_snapshots
   WHERE user_id = $1
     AND snapshot_timestamp >= $2
     AND status = 'complete'
   ORDER BY snapshot_timestamp ASC;
   ```
6. **Risk Analyzer calculates daily returns**
   ```go
   // Group hourly snapshots into daily values (using end-of-day)
   dailyValues := aggregateToDailyValues(snapshots)

   // Calculate daily returns
   returns := make([]float64, len(dailyValues)-1)
   for i := 1; i < len(dailyValues); i++ {
     returns[i-1] = (dailyValues[i] - dailyValues[i-1]) / dailyValues[i-1]
   }
   ```
7. **Risk Analyzer calculates drawdown metrics**
   ```go
   func calculateDrawdown(values []float64) DrawdownResult {
     peak := values[0]
     maxDrawdown := 0.0
     currentDrawdown := 0.0
     peakDate, valleyDate time.Time

     for i, value := range values {
       if value > peak {
         peak = value
         peakDate = dates[i]
       }
       drawdown := (peak - value) / peak
       if drawdown > maxDrawdown {
         maxDrawdown = drawdown
         valleyDate = dates[i]
       }
       currentDrawdown = drawdown
     }
     return DrawdownResult{
       MaxDrawdown:     maxDrawdown * 100,
       CurrentDrawdown: currentDrawdown * 100,
       PeakValue:       peak,
       PeakDate:        peakDate,
       ValleyValue:     valley,
       ValleyDate:      valleyDate,
     }
   }
   ```
8. **Risk Analyzer calculates volatility (standard deviation of returns)**
   ```go
   func calculateVolatility(returns []float64) float64 {
     mean := average(returns)
     variance := 0.0
     for _, r := range returns {
       variance += (r - mean) * (r - mean)
     }
     variance /= float64(len(returns) - 1)
     dailyVol := math.Sqrt(variance)
     annualizedVol := dailyVol * math.Sqrt(365) // Annualize for crypto (365 days)
     return annualizedVol * 100 // Return as percentage
   }
   ```
9. **Risk Analyzer calculates Sharpe Ratio**
   ```go
   func calculateSharpeRatio(returns []float64, riskFreeRate float64) float64 {
     meanReturn := average(returns) * 365 // Annualized
     volatility := calculateVolatility(returns)
     if volatility == 0 {
       return 0
     }
     sharpe := (meanReturn - riskFreeRate) / volatility
     return sharpe
   }
   // Using 5% annual risk-free rate as benchmark
   ```
10. **Risk Analyzer finds best/worst day returns**
    ```go
    bestDay := max(dailyReturns)
    worstDay := min(dailyReturns)
    ```
11. **Cache calculated metrics**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    INSERT INTO risk_metrics_cache (
      user_id, max_drawdown, current_drawdown,
      peak_value_usd, peak_timestamp, valley_value_usd, valley_timestamp,
      volatility, sharpe_ratio,
      best_day_return, best_day_timestamp,
      worst_day_return, worst_day_timestamp,
      calculated_at, calculation_period_days
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14)
    ON CONFLICT (user_id)
    DO UPDATE SET
      max_drawdown = EXCLUDED.max_drawdown,
      current_drawdown = EXCLUDED.current_drawdown,
      peak_value_usd = EXCLUDED.peak_value_usd,
      peak_timestamp = EXCLUDED.peak_timestamp,
      valley_value_usd = EXCLUDED.valley_value_usd,
      valley_timestamp = EXCLUDED.valley_timestamp,
      volatility = EXCLUDED.volatility,
      sharpe_ratio = EXCLUDED.sharpe_ratio,
      best_day_return = EXCLUDED.best_day_return,
      best_day_timestamp = EXCLUDED.best_day_timestamp,
      worst_day_return = EXCLUDED.worst_day_return,
      worst_day_timestamp = EXCLUDED.worst_day_timestamp,
      calculated_at = NOW(),
      calculation_period_days = EXCLUDED.calculation_period_days;
    ```
12. **Return risk metrics**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "period": "90d",
    "calculationPeriodDays": 90,
    "drawdown": {
      "maxDrawdown": 15.25,
      "currentDrawdown": 5.50,
      "peak": {
        "value": 250000.00,
        "timestamp": "2024-11-15T12:00:00Z"
      },
      "valley": {
        "value": 212125.00,
        "timestamp": "2024-11-25T08:00:00Z"
      },
      "recoveryStatus": "recovering",
      "recoveryPercentage": 63.93
    },
    "volatility": {
      "annualized": 45.5,
      "daily": 2.38,
      "interpretation": "high"
    },
    "sharpeRatio": {
      "value": 1.25,
      "riskFreeRate": 5.0,
      "interpretation": "good"
    },
    "extremeDays": {
      "best": {
        "return": 12.5,
        "timestamp": "2024-10-15T00:00:00Z"
      },
      "worst": {
        "return": -8.75,
        "timestamp": "2024-11-25T00:00:00Z"
      }
    },
    "summary": {
      "riskLevel": "moderate-high",
      "description": "Your portfolio shows moderate-high risk with significant volatility. The Sharpe ratio indicates good risk-adjusted returns."
    },
    "calculatedAt": "2024-12-16T06:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (200 OK) - Insufficient Data:**
```json
{
  "success": true,
  "data": {
    "period": "90d",
    "calculationPeriodDays": 5,
    "drawdown": {
      "maxDrawdown": 3.2,
      "currentDrawdown": 1.5,
      "peak": {
        "value": 50000.00,
        "timestamp": "2024-12-14T12:00:00Z"
      }
    },
    "volatility": null,
    "sharpeRatio": null,
    "extremeDays": null,
    "summary": {
      "riskLevel": "insufficient_data",
      "description": "Not enough historical data to calculate complete risk metrics. Metrics will be available after 7+ days of portfolio tracking."
    },
    "dataQuality": {
      "snapshotsAvailable": 120,
      "daysOfData": 5,
      "minimumRequired": 7,
      "optimalRequired": 30
    },
    "calculatedAt": "2024-12-16T06:00:00Z"
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
    "period": "90d",
    "calculationPeriodDays": 0,
    "drawdown": null,
    "volatility": null,
    "sharpeRatio": null,
    "extremeDays": null,
    "summary": {
      "riskLevel": "no_data",
      "description": "No portfolio data available. Connect a broker and wait for snapshots to be created."
    },
    "calculatedAt": null
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
        "message": "Must be one of: 30d, 90d, 1y, all",
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
- Risk metrics calculated from portfolio snapshots
- Drawdown, volatility, Sharpe ratio calculated
- Results cached for performance
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid period | 400 | Return "Must be one of: 30d, 90d, 1y, all" |
| Insufficient snapshots | 200 | Return partial metrics with warning |
| No snapshots | 200 | Return null metrics with message |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1-2 queries (cache check, snapshots if needed)
- Calculation Time: < 500ms for 90 days of data
- Cache Strategy: Metrics cached for 24 hours
- Recalculated daily by PROC-PORTFOLIO-013

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_snapshots`, `risk_metrics_cache`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

#### Notes

**Risk Metric Definitions:**

| Metric | Definition | Interpretation |
|--------|------------|----------------|
| Max Drawdown | Largest peak-to-trough decline | Lower is better; < 20% is good |
| Current Drawdown | Current decline from peak | 0% = at all-time high |
| Volatility | Annualized standard deviation | < 20% = low, 20-50% = medium, > 50% = high |
| Sharpe Ratio | Risk-adjusted return | < 0 = bad, 0-1 = ok, 1-2 = good, > 2 = excellent |

**Volatility Interpretation:**
- `low`: < 20% annualized
- `medium`: 20-50% annualized
- `high`: > 50% annualized

**Sharpe Ratio Interpretation:**
- `poor`: < 0
- `ok`: 0 - 1
- `good`: 1 - 2
- `excellent`: > 2

**Data Requirements:**
- Minimum: 7 days for basic metrics
- Recommended: 30+ days for reliable volatility/Sharpe
- Optimal: 90+ days for statistically significant metrics

**Calculation Frequency:**
- On-demand: When user requests (with caching)
- Scheduled: Daily recalculation via PROC-PORTFOLIO-013

**Related Processes:**
- PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot (data source)
- PROC-PORTFOLIO-013: Calculate Daily Risk Metrics (scheduled recalculation)
- PROC-PORTFOLIO-003: Generate Portfolio Performance Charts (related visualization)

---


---

## PROC-PORTFOLIO-008: Refresh Portfolio (Manual)

**Source File:** `PROC-PORTFOLIO-008.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-008.md`

### PROC-PORTFOLIO-008: Refresh Portfolio (Manual)

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User clicks "Refresh" button on portfolio dashboard OR system needs fresh data

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User has at least one active broker connection
- User hasn't exceeded refresh rate limit (max 6 per minute)

#### Inputs
**API Endpoint:** `POST /api/v1/portfolio/refresh`

**Request Body:** None (empty body)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/refresh` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller checks refresh rate limit**
   ```
   INCR portfolio:refresh:{userId}:minute
   EXPIRE portfolio:refresh:{userId}:minute 60
   GET portfolio:refresh:{userId}:minute
   ```
   - If count > 6 → Return 429 "Refresh rate limit exceeded"
4. **Portfolio Controller queries user's active broker connections**
   ```sql
   -- Query broker_db via Broker Service
   SELECT connection_id, exchange, status
   FROM broker_connections
   WHERE user_id = $1
     AND status = 'active'
     AND deleted_at IS NULL;
   ```
   - If no connections → Return 200 with empty portfolio
5. **Portfolio Aggregator fetches data from each broker in parallel**
   ```go
   var wg sync.WaitGroup
   results := make(chan ExchangePortfolio, len(connections))
   errors := make(chan error, len(connections))

   for _, conn := range connections {
     wg.Add(1)
     go func(c BrokerConnection) {
       defer wg.Done()
       portfolio, err := brokerClient.GetPortfolioData(c.Exchange, c.ConnectionID)
       if err != nil {
         errors <- err
         return
       }
       results <- portfolio
     }(conn)
   }
   wg.Wait()
   ```
6. **Portfolio Aggregator combines data from all exchanges**
   ```go
   combined := Portfolio{
     UserID:       userID,
     Assets:       []Asset{},
     Exchanges:    []ExchangeInfo{},
     TotalValueUSD: 0,
   }

   for portfolio := range results {
     combined.Exchanges = append(combined.Exchanges, portfolio.ExchangeInfo)
     combined.Assets = mergeAssets(combined.Assets, portfolio.Assets)
     combined.TotalValueUSD += portfolio.TotalValueUSD
   }
   ```
7. **Portfolio Aggregator deduplicates assets (same asset across exchanges)**
   ```go
   func mergeAssets(existing, new []Asset) []Asset {
     assetMap := make(map[string]Asset)
     for _, a := range existing {
       assetMap[a.Symbol] = a
     }
     for _, a := range new {
       if existing, ok := assetMap[a.Symbol]; ok {
         existing.TotalAmount += a.Amount
         existing.TotalValueUSD += a.ValueUSD
         existing.Exchanges = append(existing.Exchanges, a.Exchange)
         assetMap[a.Symbol] = existing
       } else {
         assetMap[a.Symbol] = a
       }
     }
     return mapToSlice(assetMap)
   }
   ```
8. **P&L Calculator calculates current P&L**
   - Fetch cost basis data
   - Calculate unrealized P&L for each asset
9. **Portfolio Repository updates current state cache**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   INSERT INTO portfolio_current_state (
     user_id, total_value_usd, realized_pnl, unrealized_pnl, total_pnl,
     asset_count, exchange_count, holdings_data, last_updated_at
   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
   ON CONFLICT (user_id)
   DO UPDATE SET
     total_value_usd = EXCLUDED.total_value_usd,
     realized_pnl = EXCLUDED.realized_pnl,
     unrealized_pnl = EXCLUDED.unrealized_pnl,
     total_pnl = EXCLUDED.total_pnl,
     asset_count = EXCLUDED.asset_count,
     exchange_count = EXCLUDED.exchange_count,
     holdings_data = EXCLUDED.holdings_data,
     last_updated_at = NOW();
   ```
10. **Cache Manager updates Redis cache**
    ```
    SET portfolio:{userId}:current {jsonData}
    EXPIRE portfolio:{userId}:current 60
    DEL portfolio:{userId}:assets:*
    ```
11. **Log refresh in sync logs**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    INSERT INTO portfolio_sync_logs (
      user_id, sync_type, sync_started_at, sync_completed_at,
      duration_ms, success, exchanges_synced, exchanges_failed,
      error_message
    ) VALUES (
      $1, 'manual_refresh', $2, NOW(),
      $3, $4, $5, $6, $7
    );
    ```
12. **Return refreshed portfolio data**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "totalValueUsd": 200000.50,
    "pnl": {
      "realized": 5000.00,
      "unrealized": 12500.00,
      "total": 17500.00
    },
    "exchanges": [
      {
        "exchange": "bybit",
        "valueUsd": 125000.00,
        "percentage": 62.5,
        "status": "synced"
      },
      {
        "exchange": "binance",
        "valueUsd": 75000.50,
        "percentage": 37.5,
        "status": "synced"
      }
    ],
    "assets": [
      {
        "symbol": "BTC",
        "totalAmount": 4.0,
        "valueUsd": 180000.00,
        "percentage": 90,
        "unrealizedPnl": 10000.00,
        "exchanges": [
          {"exchange": "bybit", "amount": 2.5},
          {"exchange": "binance", "amount": 1.5}
        ]
      },
      {
        "symbol": "USDT",
        "totalAmount": 20000.50,
        "valueUsd": 20000.50,
        "percentage": 10,
        "unrealizedPnl": 0,
        "exchanges": [
          {"exchange": "bybit", "amount": 12500.50},
          {"exchange": "binance", "amount": 7500.00}
        ]
      }
    ],
    "assetCount": 2,
    "exchangeCount": 2,
    "refreshedAt": "2024-12-16T12:00:00Z",
    "nextRefreshAllowedAt": "2024-12-16T12:00:10Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "refreshDurationMs": 850
  }
}
```

**Success Response (200 OK) - Partial Success:**
```json
{
  "success": true,
  "data": {
    "totalValueUsd": 125000.00,
    "exchanges": [
      {
        "exchange": "bybit",
        "valueUsd": 125000.00,
        "percentage": 100,
        "status": "synced"
      },
      {
        "exchange": "binance",
        "valueUsd": null,
        "percentage": null,
        "status": "failed",
        "error": "Connection timeout"
      }
    ],
    "assets": [...],
    "warnings": [
      {
        "exchange": "binance",
        "message": "Failed to fetch data from Binance. Showing partial portfolio.",
        "code": "EXCHANGE_FETCH_FAILED"
      }
    ],
    "refreshedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "partialRefresh": true
  }
}
```

**Success Response (200 OK) - No Connections:**
```json
{
  "success": true,
  "data": {
    "totalValueUsd": 0,
    "pnl": null,
    "exchanges": [],
    "assets": [],
    "assetCount": 0,
    "exchangeCount": 0,
    "message": "No active broker connections. Connect an exchange to see your portfolio.",
    "refreshedAt": "2024-12-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (429 Too Many Requests):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Refresh rate limit exceeded",
    "details": {
      "limit": 6,
      "window": "1 minute",
      "retryAfter": 45
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
- Data fetched from all active broker connections
- Assets deduplicated across exchanges
- P&L calculated
- Current state cached in database
- Redis cache updated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Rate limit exceeded | 429 | Return "Refresh rate limit exceeded" with retry time |
| No connections | 200 | Return empty portfolio with message |
| Partial exchange failure | 200 | Return available data with warnings |
| All exchanges failed | 503 | Return "Unable to fetch portfolio data" |
| Broker Service unavailable | 503 | Return cached data if available, else error |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Target P95 latency: < 2 seconds (includes external broker API calls)
- Parallel fetching from multiple exchanges
- Rate limit: 6 refreshes per minute per user
- Timeout per exchange: 5 seconds

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_current_state`, `portfolio_sync_logs`, `asset_cost_basis`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Cache:**
- Redis - Portfolio cache (60-second TTL), rate limiting

**External Services:**
- Broker Connectivity Service: `GET /api/v1/broker/portfolio`

#### Notes

**Rate Limiting:**
- 6 refreshes per minute prevents API abuse
- Encourages use of cached data (PROC-PORTFOLIO-001)
- Rate limit shared across all user sessions

**Partial Refresh Handling:**
- If one exchange fails, return data from successful exchanges
- Show clear warning to user about partial data
- Failed exchange data excluded from totals

**Refresh vs Cached Fetch:**
- PROC-PORTFOLIO-001 returns cached data (fast, < 100ms)
- This process (PROC-PORTFOLIO-008) forces fresh fetch (slower, < 2s)
- Frontend should use cached fetch for polling, manual refresh for explicit action

**Data Freshness:**
- After refresh, data is guaranteed fresh
- `portfolio_current_state` updated with new timestamp
- Redis cache invalidated and repopulated

**Related Processes:**
- PROC-PORTFOLIO-001: Fetch Real-Time Portfolio Value (returns cached data)
- PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot (scheduled snapshots)
- PROC-BROKER-004: Fetch Portfolio Data (called by this process)

---


---

## PROC-PORTFOLIO-009: Get Portfolio History

**Source File:** `PROC-PORTFOLIO-009.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-009.md`

### PROC-PORTFOLIO-009: Get Portfolio History

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-007
**Related NFR:** NFR-PERF-001, NFR-PORTFOLIO-002
**Related ADR:** ADR-032

#### Trigger
User views historical portfolio values with custom date range

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User has portfolio snapshots in requested date range

#### Inputs
**API Endpoint:** `GET /api/v1/portfolio/history`

**Query Parameters:**
```
GET /api/v1/portfolio/history?
  start_date={ISO8601}&
  end_date={ISO8601}&
  interval={1h|4h|1d|1w}
```

**Parameter Details:**
- `start_date` (ISO8601, required): Start of date range
- `end_date` (ISO8601, default: now): End of date range
- `interval` (string, default: auto): Data point interval

**Interval Auto-Selection:**
- Range < 3 days → `1h` (hourly)
- Range 3-14 days → `4h` (4-hourly)
- Range 14-90 days → `1d` (daily)
- Range > 90 days → `1w` (weekly)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/history` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates parameters**
   - `start_date` is required and valid ISO8601
   - `end_date` >= `start_date`
   - `interval` is valid enum if provided
   - Return 400 if validation fails
4. **Portfolio Controller determines interval**
   ```go
   if interval == "" {
     interval = autoSelectInterval(startDate, endDate)
   }
   ```
5. **Chart Generator queries portfolio snapshots**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     snapshot_timestamp,
     total_value_usd,
     realized_pnl,
     unrealized_pnl,
     total_pnl,
     asset_count,
     exchange_count,
     status
   FROM portfolio_snapshots
   WHERE user_id = $1
     AND snapshot_timestamp >= $2
     AND snapshot_timestamp <= $3
     AND status IN ('complete', 'partial')
   ORDER BY snapshot_timestamp ASC;
   ```
6. **Chart Generator downsamples data based on interval**
   ```go
   func downsample(snapshots []Snapshot, interval string) []DataPoint {
     buckets := make(map[time.Time][]Snapshot)

     for _, s := range snapshots {
       bucketKey := truncateToInterval(s.Timestamp, interval)
       buckets[bucketKey] = append(buckets[bucketKey], s)
     }

     result := make([]DataPoint, 0, len(buckets))
     for timestamp, bucket := range buckets {
       // Use last value in bucket (end-of-period value)
       last := bucket[len(bucket)-1]
       result = append(result, DataPoint{
         Timestamp:    timestamp,
         Value:        last.TotalValueUSD,
         RealizedPnL:  last.RealizedPnL,
         UnrealizedPnL: last.UnrealizedPnL,
         AssetCount:   last.AssetCount,
       })
     }
     sort.Slice(result, func(i, j int) bool {
       return result[i].Timestamp.Before(result[j].Timestamp)
     })
     return result
   }
   ```
7. **Chart Generator calculates period statistics**
   ```go
   stats := PeriodStats{
     StartValue:      dataPoints[0].Value,
     EndValue:        dataPoints[len(dataPoints)-1].Value,
     MinValue:        min(dataPoints.Values),
     MaxValue:        max(dataPoints.Values),
     AbsoluteChange:  endValue - startValue,
     PercentChange:   ((endValue - startValue) / startValue) * 100,
     DataPointCount:  len(dataPoints),
   }
   ```
8. **Return historical data**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "dateRange": {
      "start": "2024-11-01T00:00:00Z",
      "end": "2024-12-16T12:00:00Z"
    },
    "interval": "1d",
    "dataPoints": [
      {
        "timestamp": "2024-11-01T00:00:00Z",
        "value": 150000.00,
        "realizedPnl": 2500.00,
        "unrealizedPnl": 8000.00,
        "assetCount": 5,
        "exchangeCount": 2
      },
      {
        "timestamp": "2024-11-02T00:00:00Z",
        "value": 152500.00,
        "realizedPnl": 2500.00,
        "unrealizedPnl": 10000.00,
        "assetCount": 5,
        "exchangeCount": 2
      },
      {
        "timestamp": "2024-11-03T00:00:00Z",
        "value": 148000.00,
        "realizedPnl": 2500.00,
        "unrealizedPnl": 5500.00,
        "assetCount": 5,
        "exchangeCount": 2
      }
    ],
    "statistics": {
      "startValue": 150000.00,
      "endValue": 200000.50,
      "minValue": 142000.00,
      "maxValue": 210000.00,
      "absoluteChange": 50000.50,
      "percentChange": 33.33,
      "dataPointCount": 46
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "intervalSelected": "1d",
    "intervalAutoSelected": true
  }
}
```

**Success Response (200 OK) - Hourly Granularity:**
```json
{
  "success": true,
  "data": {
    "dateRange": {
      "start": "2024-12-15T00:00:00Z",
      "end": "2024-12-16T12:00:00Z"
    },
    "interval": "1h",
    "dataPoints": [
      {
        "timestamp": "2024-12-15T00:00:00Z",
        "value": 198500.00,
        "realizedPnl": 5000.00,
        "unrealizedPnl": 12000.00
      },
      {
        "timestamp": "2024-12-15T01:00:00Z",
        "value": 199000.00,
        "realizedPnl": 5000.00,
        "unrealizedPnl": 12500.00
      }
    ],
    "statistics": {
      "startValue": 198500.00,
      "endValue": 200000.50,
      "minValue": 197000.00,
      "maxValue": 201500.00,
      "absoluteChange": 1500.50,
      "percentChange": 0.76,
      "dataPointCount": 36
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "intervalSelected": "1h",
    "intervalAutoSelected": false
  }
}
```

**Success Response (200 OK) - Partial Data:**
```json
{
  "success": true,
  "data": {
    "dateRange": {
      "start": "2024-10-01T00:00:00Z",
      "end": "2024-12-16T12:00:00Z"
    },
    "interval": "1d",
    "dataPoints": [...],
    "statistics": {
      "startValue": 150000.00,
      "endValue": 200000.50,
      "dataPointCount": 45
    },
    "gaps": [
      {
        "start": "2024-10-15T00:00:00Z",
        "end": "2024-10-18T00:00:00Z",
        "reason": "No snapshots recorded"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "hasGaps": true
  }
}
```

**Success Response (200 OK) - No Data:**
```json
{
  "success": true,
  "data": {
    "dateRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-03-01T00:00:00Z"
    },
    "interval": "1d",
    "dataPoints": [],
    "statistics": null,
    "message": "No portfolio history found for this date range. Portfolio tracking started on 2024-06-15."
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "earliestSnapshot": "2024-06-15T10:00:00Z"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid date range",
    "details": [
      {
        "field": "start_date",
        "message": "Start date is required",
        "code": "REQUIRED_FIELD"
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

**Error Response (400 Bad Request - Range Too Large):**
```json
{
  "success": false,
  "error": {
    "code": "RANGE_TOO_LARGE",
    "message": "Date range too large",
    "details": {
      "maxRangeDays": 730,
      "requestedRangeDays": 1095,
      "hint": "Maximum date range is 2 years"
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
- Historical data retrieved for date range
- Data downsampled to requested interval
- Period statistics calculated
- Data gaps identified if present
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Missing start_date | 400 | Return "Start date is required" |
| Invalid date format | 400 | Return "Invalid date format. Use ISO8601" |
| End before start | 400 | Return "End date must be after start date" |
| Range > 2 years | 400 | Return "Maximum date range is 2 years" |
| Invalid interval | 400 | Return "Invalid interval" |
| No data in range | 200 | Return empty with earliest snapshot info |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-PORTFOLIO-002**: Portfolio Snapshot Storage and Performance

**Process-Specific Notes:**
- Database Queries: 1 query
- Target P95 latency: < 300ms (with appropriate indexing)
- Maximum data points returned: 1000 (auto-downsampled if exceeded)
- Index on `(user_id, snapshot_timestamp)` is critical

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_snapshots`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

#### Notes

**Interval Selection:**
| Date Range | Auto Interval | Max Data Points |
|------------|---------------|-----------------|
| < 3 days | 1h (hourly) | ~72 |
| 3-14 days | 4h (4-hourly) | ~84 |
| 14-90 days | 1d (daily) | ~90 |
| > 90 days | 1w (weekly) | ~104 |

**Data Point Limit:**
- Maximum 1000 data points per request
- If more, auto-downsample to stay under limit
- Frontend can request specific interval if needed

**Gap Detection:**
- Gaps occur when snapshots are missing (service downtime, etc.)
- Gaps > 4 hours at hourly interval are reported
- Gaps > 1 day at daily interval are reported

**Use Cases:**
1. User viewing equity curve chart
2. User analyzing performance over specific period
3. User comparing current value to historical highs
4. Exporting historical data

**Related Processes:**
- PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot (creates the data)
- PROC-PORTFOLIO-003: Generate Portfolio Performance Charts (uses same data, different format)
- PROC-PORTFOLIO-007: Get Risk Metrics (uses snapshot data)

---


---

## PROC-PORTFOLIO-010: Sync Transactions from Exchange

**Source File:** `PROC-PORTFOLIO-010.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-010.md`

### PROC-PORTFOLIO-010: Sync Transactions from Exchange

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-003
**Related NFR:** NFR-PERF-001, NFR-INT-001
**Related ADR:** ADR-032

#### Trigger
- **Session-based:** Background job runs every 5 minutes for users with active sessions
- **Manual:** User triggers manual sync
- **Connection:** After new broker connection added

**Note:** Transaction sync only runs when the user has an active session. There's no need to sync transactions when the user isn't viewing the application.

#### Actor
System (Session-based Scheduler) OR Authenticated User (manual trigger)

#### Preconditions
- User has active broker connections
- Broker connections have valid credentials
- **For session-based sync:** User has an active session (last activity < 15 minutes)
- For manual sync: User hasn't exceeded sync rate limit

#### Inputs

**API Endpoint (Manual Trigger):** `POST /api/v1/portfolio/transactions/sync`

**Request Body (optional):**
```json
{
  "exchange": "bybit",
  "startDate": "2024-01-01T00:00:00Z"
}
```

**Parameter Details:**
- `exchange` (string, optional): Sync specific exchange only
- `startDate` (ISO8601, optional): Sync transactions from this date (default: last sync date)

#### Process Steps

**For Session-Based Scheduled Job:**

1. **Scheduled Job triggers every 5 minutes**
2. **Sync Scheduler queries users with active sessions**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT DISTINCT us.user_id
   FROM user_sessions us
   WHERE us.is_active = true
     AND us.last_activity_at > NOW() - INTERVAL '15 minutes';
   ```
3. **Filter users who haven't synced recently**
   ```sql
   -- Only sync users who haven't synced in the last 5 minutes
   SELECT us.user_id
   FROM user_sessions us
   LEFT JOIN portfolio_sync_logs psl ON us.user_id = psl.user_id
     AND psl.sync_type = 'transaction_sync'
     AND psl.sync_started_at > NOW() - INTERVAL '5 minutes'
   WHERE us.is_active = true
     AND us.last_activity_at > NOW() - INTERVAL '15 minutes'
     AND psl.id IS NULL;
   ```
4. **For each eligible user, verify they have active connections**
   ```sql
   -- Query broker_db
   SELECT DISTINCT user_id
   FROM broker_connections
   WHERE user_id = $1
     AND status = 'active'
     AND deleted_at IS NULL;
   ```
5. **For each user with connections, proceed with steps 7-17**

**For Manual Trigger:**

1. **API Gateway receives request** → `/api/v1/portfolio/transactions/sync` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller checks sync rate limit**
   ```
   INCR portfolio:sync:{userId}:hour
   EXPIRE portfolio:sync:{userId}:hour 3600
   GET portfolio:sync:{userId}:hour
   ```
   - If count > 4 → Return 429 "Sync rate limit exceeded"
4. **Proceed with steps 7-17 for the requesting user**

**For New Connection Trigger:**

1. **Broker Service emits event after successful connection**
2. **Portfolio Service receives `broker.connection.created` event**
3. **Proceed with steps 7-17 for the user's new connection only**

**Common Steps:**

7. **Portfolio Controller queries user's broker connections**
   ```sql
   -- Query broker_db via Broker Service
   SELECT connection_id, exchange, key_vault_secret_name
   FROM broker_connections
   WHERE user_id = $1
     AND status = 'active'
     AND deleted_at IS NULL
     AND ($2::varchar IS NULL OR exchange = $2);
   ```
8. **For each connection, determine sync start date**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT MAX(transaction_timestamp) as last_sync
   FROM transactions
   WHERE user_id = $1
     AND exchange = $2;
   ```
   - If no previous transactions → Use account creation date or 90 days ago
   - If startDate provided → Use max(startDate, lastSync - 1 day) for overlap
9. **Begin sync job tracking**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   INSERT INTO portfolio_sync_logs (
     user_id, sync_type, sync_started_at, success
   ) VALUES ($1, 'transaction_sync', NOW(), false)
   RETURNING id;
   ```
10. **Broker Service fetches transaction history from exchange**

    **For Bybit:**
    ```
    GET /v5/account/transaction-log
    GET /v5/order/history
    ```

    **For Binance:**
    ```
    GET /api/v3/myTrades
    GET /sapi/v1/capital/deposit/hisrec
    GET /sapi/v1/capital/withdraw/history
    ```

11. **Exchange Adapter normalizes transactions**
    ```go
    type NormalizedTransaction struct {
      ExchangeTransactionID string
      TransactionType       TransactionType // trade, deposit, withdrawal, fee
      Asset                 string
      Amount                decimal.Decimal
      PriceUSD              decimal.Decimal
      ValueUSD              decimal.Decimal
      FeeAmount             decimal.Decimal
      FeeAsset              string
      FeeUSD                decimal.Decimal
      TradePair             string // only for trades
      Side                  string // buy/sell, only for trades
      Timestamp             time.Time
    }
    ```
12. **Portfolio Repository upserts transactions (avoid duplicates)**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    INSERT INTO transactions (
      user_id, exchange, exchange_transaction_id,
      transaction_type, asset, amount, price_usd, value_usd,
      fee_amount, fee_asset, fee_usd,
      trade_pair, side, transaction_timestamp, synced_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
    ON CONFLICT (user_id, exchange, exchange_transaction_id)
    DO UPDATE SET
      price_usd = EXCLUDED.price_usd,
      value_usd = EXCLUDED.value_usd,
      fee_usd = EXCLUDED.fee_usd,
      synced_at = NOW()
    WHERE transactions.synced_at < NOW() - INTERVAL '1 hour';
    ```
13. **Count imported transactions**
    ```go
    importStats := ImportStats{
      NewTransactions:     countNew,
      UpdatedTransactions: countUpdated,
      SkippedDuplicates:   countSkipped,
    }
    ```
14. **Trigger cost basis recalculation**
    - Call PROC-PORTFOLIO-011 for affected assets
15. **Update sync log with results**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    UPDATE portfolio_sync_logs
    SET sync_completed_at = NOW(),
        duration_ms = EXTRACT(MILLISECONDS FROM NOW() - sync_started_at),
        success = true,
        exchanges_synced = $2,
        transactions_imported = $3
    WHERE id = $1;
    ```
16. **Update user session last sync timestamp**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    UPDATE user_sessions
    SET last_transaction_sync_at = NOW()
    WHERE user_id = $1 AND is_active = true;
    ```
17. **Invalidate relevant caches**
    ```
    DEL portfolio:{userId}:transactions:*
    DEL portfolio:{userId}:pnl:*
    ```
18. **Return sync results** (for manual trigger)

#### Outputs

**Success Response - Manual Trigger (200 OK):**
```json
{
  "success": true,
  "data": {
    "syncId": "uuid",
    "status": "completed",
    "exchanges": [
      {
        "exchange": "bybit",
        "status": "synced",
        "transactions": {
          "new": 45,
          "updated": 3,
          "skipped": 152
        },
        "dateRange": {
          "from": "2024-12-10T00:00:00Z",
          "to": "2024-12-16T12:00:00Z"
        }
      },
      {
        "exchange": "binance",
        "status": "synced",
        "transactions": {
          "new": 12,
          "updated": 0,
          "skipped": 88
        },
        "dateRange": {
          "from": "2024-12-10T00:00:00Z",
          "to": "2024-12-16T12:00:00Z"
        }
      }
    ],
    "summary": {
      "totalNewTransactions": 57,
      "totalUpdatedTransactions": 3,
      "totalSkippedDuplicates": 240,
      "durationMs": 3452
    },
    "costBasisUpdated": true,
    "syncedAt": "2024-12-16T12:00:03Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:03Z",
    "version": "v1"
  }
}
```

**Success Response - Partial Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "syncId": "uuid",
    "status": "partial",
    "exchanges": [
      {
        "exchange": "bybit",
        "status": "synced",
        "transactions": {
          "new": 45,
          "updated": 3,
          "skipped": 152
        }
      },
      {
        "exchange": "binance",
        "status": "failed",
        "error": {
          "code": "EXCHANGE_API_ERROR",
          "message": "Rate limit exceeded on Binance API"
        }
      }
    ],
    "warnings": [
      {
        "exchange": "binance",
        "message": "Binance sync failed. Will retry in next scheduled sync.",
        "code": "PARTIAL_SYNC"
      }
    ],
    "syncedAt": "2024-12-16T12:00:03Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:03Z",
    "version": "v1",
    "partialSync": true
  }
}
```

**Async Response - Long Sync (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "syncId": "uuid",
    "status": "in_progress",
    "message": "Sync started. This may take a few minutes for large transaction histories.",
    "pollUrl": "/api/v1/portfolio/transactions/sync/uuid/status",
    "estimatedCompletion": "< 5 minutes"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (429 Too Many Requests):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Sync rate limit exceeded",
    "details": {
      "limit": 4,
      "window": "1 hour",
      "retryAfter": 1800,
      "note": "Automatic sync runs every 5 minutes while you're active"
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
- Transactions fetched from all active exchanges
- Transactions deduplicated and stored
- Cost basis recalculated for affected assets
- Sync logged for audit
- User session sync timestamp updated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Rate limit exceeded | 429 | Return "Sync rate limit exceeded" |
| No active connections | 200 | Return empty sync result with message |
| Exchange API error | 200 | Mark exchange as failed, continue with others |
| All exchanges failed | 503 | Return "Unable to sync transactions" |
| Invalid date range | 400 | Return "Invalid date range" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-INT-001**: Exchange API Integration

**Process-Specific Notes:**
- Session-based: Every 5 minutes while user has active session
- Session timeout: 15 minutes of inactivity
- Manual rate limit: 4 per hour
- Target sync time: < 30 seconds for typical user
- Long syncs (>1 minute): Return 202 Accepted with poll URL

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `transactions`, `portfolio_sync_logs`, `user_sessions`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Cache:**
- Redis - Rate limiting, cache invalidation

**External Services:**
- Broker Connectivity Service: Transaction history endpoints

#### Notes

**Session-Based Sync Rationale:**
- Previous approach: Sync every 6 hours for all users
- New approach: Sync every 5 minutes only for active users
- Benefits:
  - Reduces unnecessary API calls to exchanges
  - Provides near real-time data when user is viewing
  - Respects exchange rate limits better
  - Users don't need transaction notifications from our system (exchanges send their own)

**Session Activity Tracking:**
User session activity is tracked via:
- API requests (any authenticated endpoint)
- WebSocket heartbeats
- Frontend periodic pings

Session becomes inactive after 15 minutes of no activity.

**Incremental Sync:**
- Only fetches transactions since last sync
- 1-day overlap to catch late-appearing transactions
- Exchange transaction IDs used for deduplication

**Transaction Types Synced:**
- Trades (buy/sell)
- Deposits
- Withdrawals
- Trading fees
- Funding fees (where available)

**Exchange API Mapping:**

| Exchange | Trades | Deposits | Withdrawals |
|----------|--------|----------|-------------|
| Bybit | `/v5/order/history` | `/v5/account/transaction-log` | `/v5/account/transaction-log` |
| Binance | `/api/v3/myTrades` | `/sapi/v1/capital/deposit/hisrec` | `/sapi/v1/capital/withdraw/history` |

**Cost Basis Impact:**
- New trades trigger cost basis recalculation
- Deposits don't affect cost basis (they establish it)
- Withdrawals may affect cost basis depending on method

**Rate Limiting:**
- Manual: 4 syncs per hour per user
- Session-based: Every 5 minutes while active
- Exchange API limits respected (handled by Broker Service)

**Related Processes:**
- PROC-PORTFOLIO-005: Get Transactions History (reads synced data)
- PROC-PORTFOLIO-011: Calculate/Update Cost Basis (triggered by sync)
- PROC-BROKER-004: Fetch Portfolio Data (fetches balances, not transactions)
- PROC-PORTFOLIO-018: Manage User Session (tracks session activity)

---


---

## PROC-PORTFOLIO-011: Calculate/Update Cost Basis

**Source File:** `PROC-PORTFOLIO-011.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-011.md`

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


---

## PROC-PORTFOLIO-012: Manage Portfolio Alert Preferences

**Source File:** `PROC-PORTFOLIO-012.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-012.md`

### PROC-PORTFOLIO-012: Manage Portfolio Alert Preferences

**Service Owner:** Portfolio Service
**Related FR:** FR-NOTIFY-003
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User configures alert preferences in portfolio settings

#### Actor
Authenticated User

#### Preconditions
- User is authenticated

#### Inputs

**API Endpoint (Get):** `GET /api/v1/portfolio/alert-preferences`

**API Endpoint (Update):** `PUT /api/v1/portfolio/alert-preferences`

**Request Body (for PUT):**
```json
{
  "drawdownAlerts": {
    "enabled": true,
    "thresholdPercent": 10.0
  },
  "valueChangeAlerts": {
    "enabled": true,
    "thresholdPercent": 10.0,
    "period": "24h"
  },
  "valueAlerts": {
    "enabled": false,
    "thresholdUsd": null
  },
  "dailySummary": {
    "enabled": true,
    "time": "09:00"
  },
  "alertChannels": {
    "email": true,
    "inApp": true,
    "push": false
  },
  "cooldownHours": 24
}
```

**Validation Rules:**
- `drawdownAlerts.thresholdPercent` must be between 1 and 50 if enabled
- `valueChangeAlerts.thresholdPercent` must be between 1 and 50 if enabled
- `valueChangeAlerts.period` must be '1h', '24h', or '7d'
- `valueAlerts.thresholdUsd` must be positive if enabled
- `dailySummary.time` must be valid 24h format (HH:mm)
- `cooldownHours` must be between 1 and 168 (1 week)

#### Process Steps

**For GET (View Preferences):**

1. **API Gateway receives request** → `/api/v1/portfolio/alert-preferences` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Repository fetches alert preferences**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     user_id,
     enable_drawdown_alerts,
     drawdown_alert_threshold,
     enable_value_change_alerts,
     value_change_threshold_percent,
     value_change_period,
     enable_value_alerts,
     value_alert_threshold_usd,
     enable_daily_summary,
     daily_summary_time,
     alert_via_email,
     alert_via_in_app,
     alert_via_push,
     alert_cooldown_hours,
     last_drawdown_alert_at,
     last_value_change_alert_at,
     last_value_alert_at,
     created_at,
     updated_at
   FROM portfolio_alert_preferences
   WHERE user_id = $1;
   ```
4. **If no preferences exist, return defaults**
   ```go
   defaultPrefs := AlertPreferences{
     EnableDrawdownAlerts:          true,
     DrawdownAlertThreshold:        10.0,
     EnableValueChangeAlerts:       true,
     ValueChangeThresholdPercent:   10.0,
     ValueChangePeriod:             "24h",
     EnableValueAlerts:             false,
     ValueAlertThresholdUSD:        nil,
     EnableDailySummary:            false,
     DailySummaryTime:              "09:00",
     AlertViaEmail:                 true,
     AlertViaInApp:                 true,
     AlertViaPush:                  false,
     AlertCooldownHours:            24,
   }
   ```
5. **Return preferences**

**For PUT (Update Preferences):**

1. **API Gateway receives request** → `/api/v1/portfolio/alert-preferences` (PUT)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates request body**
   - Validate drawdown thresholdPercent is in range [1, 50]
   - Validate valueChange thresholdPercent is in range [1, 50]
   - Validate valueChange period is '1h', '24h', or '7d'
   - Validate thresholdUsd is positive if provided
   - Validate time format is HH:mm
   - Validate cooldownHours is in range [1, 168]
   - Return 400 if validation fails
4. **Portfolio Repository upserts preferences**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   INSERT INTO portfolio_alert_preferences (
     user_id,
     enable_drawdown_alerts, drawdown_alert_threshold,
     enable_value_change_alerts, value_change_threshold_percent, value_change_period,
     enable_value_alerts, value_alert_threshold_usd,
     enable_daily_summary, daily_summary_time,
     alert_via_email, alert_via_in_app, alert_via_push,
     alert_cooldown_hours,
     created_at, updated_at
   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
   ON CONFLICT (user_id)
   DO UPDATE SET
     enable_drawdown_alerts = EXCLUDED.enable_drawdown_alerts,
     drawdown_alert_threshold = EXCLUDED.drawdown_alert_threshold,
     enable_value_change_alerts = EXCLUDED.enable_value_change_alerts,
     value_change_threshold_percent = EXCLUDED.value_change_threshold_percent,
     value_change_period = EXCLUDED.value_change_period,
     enable_value_alerts = EXCLUDED.enable_value_alerts,
     value_alert_threshold_usd = EXCLUDED.value_alert_threshold_usd,
     enable_daily_summary = EXCLUDED.enable_daily_summary,
     daily_summary_time = EXCLUDED.daily_summary_time,
     alert_via_email = EXCLUDED.alert_via_email,
     alert_via_in_app = EXCLUDED.alert_via_in_app,
     alert_via_push = EXCLUDED.alert_via_push,
     alert_cooldown_hours = EXCLUDED.alert_cooldown_hours,
     updated_at = NOW()
   RETURNING *;
   ```
5. **If daily summary enabled/changed, update scheduler**
   - Register/update user in daily summary job
6. **Return updated preferences**

#### Outputs

**Success Response - GET (200 OK):**
```json
{
  "success": true,
  "data": {
    "drawdownAlerts": {
      "enabled": true,
      "thresholdPercent": 10.0,
      "description": "Alert when portfolio drops 10% from peak"
    },
    "valueChangeAlerts": {
      "enabled": true,
      "thresholdPercent": 10.0,
      "period": "24h",
      "description": "Alert when portfolio value changes by 10% in 24 hours"
    },
    "valueAlerts": {
      "enabled": false,
      "thresholdUsd": null,
      "description": "Alert when portfolio value drops below threshold"
    },
    "dailySummary": {
      "enabled": true,
      "time": "09:00",
      "timezone": "UTC",
      "description": "Daily portfolio summary at 09:00 UTC"
    },
    "alertChannels": {
      "email": true,
      "inApp": true,
      "push": false
    },
    "cooldownHours": 24,
    "lastAlerts": {
      "lastDrawdownAlertAt": null,
      "lastValueChangeAlertAt": "2024-12-15T08:00:00Z",
      "lastValueAlertAt": null
    },
    "lastUpdatedAt": "2024-12-15T10:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - GET (200 OK) - Defaults:**
```json
{
  "success": true,
  "data": {
    "drawdownAlerts": {
      "enabled": true,
      "thresholdPercent": 10.0,
      "description": "Alert when portfolio drops 10% from peak"
    },
    "valueChangeAlerts": {
      "enabled": true,
      "thresholdPercent": 10.0,
      "period": "24h",
      "description": "Alert when portfolio value changes by 10% in 24 hours"
    },
    "valueAlerts": {
      "enabled": false,
      "thresholdUsd": null,
      "description": "Alert when portfolio value drops below threshold"
    },
    "dailySummary": {
      "enabled": false,
      "time": "09:00",
      "timezone": "UTC",
      "description": "Daily portfolio summary at 09:00 UTC"
    },
    "alertChannels": {
      "email": true,
      "inApp": true,
      "push": false
    },
    "cooldownHours": 24,
    "isDefault": true,
    "lastUpdatedAt": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - PUT (200 OK):**
```json
{
  "success": true,
  "data": {
    "drawdownAlerts": {
      "enabled": true,
      "thresholdPercent": 15.0,
      "description": "Alert when portfolio drops 15% from peak"
    },
    "valueChangeAlerts": {
      "enabled": true,
      "thresholdPercent": 10.0,
      "period": "24h",
      "description": "Alert when portfolio value changes by 10% in 24 hours"
    },
    "valueAlerts": {
      "enabled": true,
      "thresholdUsd": 100000.00,
      "description": "Alert when portfolio value drops below $100,000"
    },
    "dailySummary": {
      "enabled": true,
      "time": "08:00",
      "timezone": "UTC",
      "description": "Daily portfolio summary at 08:00 UTC"
    },
    "alertChannels": {
      "email": true,
      "inApp": true,
      "push": true
    },
    "cooldownHours": 12,
    "lastUpdatedAt": "2024-12-16T12:00:00Z",
    "message": "Alert preferences updated successfully"
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
    "message": "Invalid alert configuration",
    "details": [
      {
        "field": "drawdownAlerts.thresholdPercent",
        "message": "Threshold must be between 1% and 50%",
        "code": "OUT_OF_RANGE"
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
- GET: Preferences retrieved (or defaults returned)
- PUT: Preferences validated and stored
- PUT: Scheduler updated if daily summary changed
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid threshold range | 400 | Return "Threshold must be between 1% and 50%" |
| Invalid value threshold | 400 | Return "Value threshold must be positive" |
| Invalid time format | 400 | Return "Time must be in HH:mm format" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- GET: < 50ms (simple query)
- PUT: < 100ms (upsert + scheduler update)
- No caching needed (settings accessed infrequently)

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_alert_preferences`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Daily summary scheduler registration

#### Notes

**Alert Types:**

| Alert Type | Trigger | Check Frequency |
|------------|---------|-----------------|
| Drawdown Alert | Portfolio drops X% from peak | Every snapshot (hourly) |
| Value Change Alert | Portfolio changes by X% in period | Every snapshot (hourly) |
| Value Alert | Portfolio drops below $X | Every snapshot (hourly) |
| Daily Summary | Scheduled time | Daily |

**Value Change Periods:**
- `1h`: Compare to 1 hour ago
- `24h`: Compare to 24 hours ago (default)
- `7d`: Compare to 7 days ago

**Alert Channels:**
- **Email**: Sent via Notification Service
- **In-App**: Real-time in-app notification
- **Push**: Browser push notifications (future)

**Threshold Limits:**
- Drawdown: 1% - 50% (prevents spammy alerts)
- Value Change: 1% - 50% (prevents spammy alerts)
- Value: Any positive amount (user's choice)

**Daily Summary Content:**
- Current portfolio value
- 24h change (value and %)
- Top gainers/losers
- Current drawdown status

**Alert Cooldown:**
- Configurable: 1 - 168 hours (default: 24 hours)
- Same cooldown applies to all alert types
- Tracks last alert time per alert type
- Prevents spam during volatile markets

**Related Processes:**
- PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot (checks alert conditions)
- PROC-PORTFOLIO-007: Get Risk Metrics (drawdown calculation)
- PROC-PORTFOLIO-017: Manage Price Alerts (user price alerts)
- PROC-PORTFOLIO-018: Check Price Alerts (scheduled)
- PROC-NOTIFY-001: Send In-App Notification
- PROC-NOTIFY-002: Send Email Notification

---


---

## PROC-PORTFOLIO-013: Calculate Daily Risk Metrics (Scheduled)

**Source File:** `PROC-PORTFOLIO-013.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-013.md`

### PROC-PORTFOLIO-013: Calculate Daily Risk Metrics (Scheduled)

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
Scheduled background job (daily at 06:00 UTC)

#### Actor
System (Scheduler)

#### Preconditions
- Portfolio snapshots exist for users
- At least 7 days of snapshot data recommended for meaningful metrics

#### Process Steps

1. **Scheduled Job triggers daily at 06:00 UTC**
2. **Risk Metrics Scheduler queries users with sufficient snapshot data**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT DISTINCT user_id
   FROM portfolio_snapshots
   WHERE snapshot_timestamp >= NOW() - INTERVAL '90 days'
     AND status IN ('complete', 'partial')
   GROUP BY user_id
   HAVING COUNT(*) >= 168;  -- At least 7 days of hourly snapshots
   ```
3. **For each user, calculate risk metrics (batch processing)**
4. **Risk Analyzer fetches portfolio snapshots**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     snapshot_timestamp,
     total_value_usd
   FROM portfolio_snapshots
   WHERE user_id = $1
     AND snapshot_timestamp >= NOW() - INTERVAL '90 days'
     AND status IN ('complete', 'partial')
   ORDER BY snapshot_timestamp ASC;
   ```
5. **Risk Analyzer aggregates to daily values**
   ```go
   func aggregateToDailyValues(snapshots []Snapshot) []DailyValue {
     dailyMap := make(map[string]float64)
     for _, s := range snapshots {
       dateKey := s.Timestamp.Format("2006-01-02")
       // Use end-of-day value (last snapshot of the day)
       dailyMap[dateKey] = s.TotalValueUSD
     }
     // Convert map to sorted slice
     return sortedDailyValues(dailyMap)
   }
   ```
6. **Risk Analyzer calculates daily returns**
   ```go
   func calculateDailyReturns(dailyValues []DailyValue) []float64 {
     returns := make([]float64, len(dailyValues)-1)
     for i := 1; i < len(dailyValues); i++ {
       returns[i-1] = (dailyValues[i].Value - dailyValues[i-1].Value) / dailyValues[i-1].Value
     }
     return returns
   }
   ```
7. **Risk Analyzer calculates drawdown metrics**
   ```go
   func calculateDrawdown(dailyValues []DailyValue) DrawdownResult {
     peak := dailyValues[0].Value
     peakTimestamp := dailyValues[0].Date
     maxDrawdown := 0.0
     valleyValue := dailyValues[0].Value
     valleyTimestamp := dailyValues[0].Date

     for _, dv := range dailyValues {
       if dv.Value > peak {
         peak = dv.Value
         peakTimestamp = dv.Date
       }
       drawdown := (peak - dv.Value) / peak
       if drawdown > maxDrawdown {
         maxDrawdown = drawdown
         valleyValue = dv.Value
         valleyTimestamp = dv.Date
       }
     }

     currentDrawdown := (peak - dailyValues[len(dailyValues)-1].Value) / peak

     return DrawdownResult{
       MaxDrawdown:      maxDrawdown * 100,
       CurrentDrawdown:  currentDrawdown * 100,
       PeakValue:        peak,
       PeakTimestamp:    peakTimestamp,
       ValleyValue:      valleyValue,
       ValleyTimestamp:  valleyTimestamp,
     }
   }
   ```
8. **Risk Analyzer calculates volatility**
   ```go
   func calculateVolatility(returns []float64) float64 {
     if len(returns) < 2 {
       return 0
     }
     mean := average(returns)
     variance := 0.0
     for _, r := range returns {
       variance += (r - mean) * (r - mean)
     }
     variance /= float64(len(returns) - 1)
     dailyVol := math.Sqrt(variance)
     // Annualize: multiply by sqrt(365) for crypto
     annualizedVol := dailyVol * math.Sqrt(365)
     return annualizedVol * 100
   }
   ```
9. **Risk Analyzer calculates Sharpe Ratio**
   ```go
   func calculateSharpeRatio(returns []float64, riskFreeRate float64) float64 {
     if len(returns) < 2 {
       return 0
     }
     // Annualized mean return
     meanDailyReturn := average(returns)
     annualizedReturn := meanDailyReturn * 365 * 100 // As percentage

     // Annualized volatility
     volatility := calculateVolatility(returns)

     if volatility == 0 {
       return 0
     }

     // Sharpe = (Return - RiskFreeRate) / Volatility
     sharpe := (annualizedReturn - riskFreeRate) / volatility
     return sharpe
   }
   // Using 5% annual risk-free rate
   ```
10. **Risk Analyzer finds best/worst day**
    ```go
    func findExtremes(dailyValues []DailyValue) (best DayReturn, worst DayReturn) {
      bestReturn := math.Inf(-1)
      worstReturn := math.Inf(1)

      for i := 1; i < len(dailyValues); i++ {
        dailyReturn := (dailyValues[i].Value - dailyValues[i-1].Value) / dailyValues[i-1].Value * 100
        if dailyReturn > bestReturn {
          bestReturn = dailyReturn
          best = DayReturn{Return: dailyReturn, Date: dailyValues[i].Date}
        }
        if dailyReturn < worstReturn {
          worstReturn = dailyReturn
          worst = DayReturn{Return: worstReturn, Date: dailyValues[i].Date}
        }
      }
      return best, worst
    }
    ```
11. **Store calculated metrics in cache table**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    INSERT INTO risk_metrics_cache (
      user_id,
      max_drawdown, current_drawdown,
      peak_value_usd, peak_timestamp,
      valley_value_usd, valley_timestamp,
      volatility, sharpe_ratio,
      best_day_return, best_day_timestamp,
      worst_day_return, worst_day_timestamp,
      calculated_at, calculation_period_days
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14)
    ON CONFLICT (user_id)
    DO UPDATE SET
      max_drawdown = EXCLUDED.max_drawdown,
      current_drawdown = EXCLUDED.current_drawdown,
      peak_value_usd = EXCLUDED.peak_value_usd,
      peak_timestamp = EXCLUDED.peak_timestamp,
      valley_value_usd = EXCLUDED.valley_value_usd,
      valley_timestamp = EXCLUDED.valley_timestamp,
      volatility = EXCLUDED.volatility,
      sharpe_ratio = EXCLUDED.sharpe_ratio,
      best_day_return = EXCLUDED.best_day_return,
      best_day_timestamp = EXCLUDED.best_day_timestamp,
      worst_day_return = EXCLUDED.worst_day_return,
      worst_day_timestamp = EXCLUDED.worst_day_timestamp,
      calculated_at = NOW(),
      calculation_period_days = EXCLUDED.calculation_period_days;
    ```
12. **Check alert conditions for each user**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    SELECT
      p.user_id,
      p.enable_drawdown_alerts,
      p.drawdown_alert_threshold,
      r.current_drawdown
    FROM portfolio_alert_preferences p
    JOIN risk_metrics_cache r ON p.user_id = r.user_id
    WHERE p.enable_drawdown_alerts = true
      AND r.current_drawdown >= p.drawdown_alert_threshold;
    ```
13. **Publish drawdown alerts to Service Bus**
    ```json
    {
      "messageId": "uuid",
      "eventType": "portfolio.drawdown.alert",
      "timestamp": "2024-12-17T06:00:00Z",
      "version": "1.0",
      "source": {
        "service": "portfolio-service",
        "instance": "risk-calculator-1"
      },
      "payload": {
        "userId": "uuid",
        "currentDrawdown": 12.5,
        "alertThreshold": 10.0,
        "peakValue": 250000.00,
        "currentValue": 218750.00,
        "peakDate": "2024-11-15T12:00:00Z"
      },
      "metadata": {
        "correlationId": "uuid",
        "userId": "uuid"
      }
    }
    ```
14. **Log job completion**

#### Outputs

**Job Completion Log:**
```json
{
  "jobType": "daily_risk_metrics_calculation",
  "startedAt": "2024-12-17T06:00:00Z",
  "completedAt": "2024-12-17T06:05:32Z",
  "durationMs": 332000,
  "results": {
    "usersProcessed": 1523,
    "usersSkipped": 234,
    "metricsUpdated": 1489,
    "calculationErrors": 34,
    "drawdownAlertsTriggered": 87
  },
  "nextScheduledRun": "2024-12-18T06:00:00Z"
}
```

**Service Bus Message (Drawdown Alert):**
```json
{
  "messageId": "uuid",
  "eventType": "portfolio.drawdown.alert",
  "timestamp": "2024-12-17T06:00:00Z",
  "version": "1.0",
  "source": {
    "service": "portfolio-service",
    "instance": "instance-id"
  },
  "payload": {
    "userId": "uuid",
    "alertType": "drawdown_threshold_exceeded",
    "currentDrawdown": 12.5,
    "alertThreshold": 10.0,
    "portfolioSummary": {
      "peakValue": 250000.00,
      "currentValue": 218750.00,
      "peakDate": "2024-11-15T12:00:00Z"
    }
  },
  "metadata": {
    "correlationId": "uuid",
    "userId": "uuid"
  }
}
```

#### Success Criteria
- Risk metrics calculated for all eligible users
- Metrics cached in database
- Drawdown alerts published for affected users
- Job completion logged

#### Error Scenarios

| Error | Handling |
|-------|----------|
| Insufficient snapshots for user | Skip user, log info |
| Calculation error for user | Log error, continue with other users |
| Database error (read) | Retry with backoff, alert on persistent failure |
| Database error (write) | Log error, continue with other users |
| Service Bus unavailable | Queue alerts for retry |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Target execution time: < 10 minutes for 10,000 users
- Batch processing: 100 users per batch
- Parallelization: Up to 10 concurrent calculations
- Runs daily at 06:00 UTC (off-peak hours)

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `portfolio_snapshots`, `risk_metrics_cache`, `portfolio_alert_preferences`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Message Queue:**
- Azure Service Bus - Topic: `portfolio.drawdown.alert`

#### Notes

**Calculation Schedule:**
- Runs daily at 06:00 UTC
- Chosen time minimizes overlap with hourly snapshot creation
- Allows users to see fresh metrics each morning

**Metrics Calculation Period:**
- Default: Last 90 days of data
- Minimum: 7 days required
- Maximum: 365 days (for "all time" view, on-demand only)

**Alert Deduplication:**
- Alerts only sent once per 24-hour period
- Tracked via `last_alert_sent_at` in preferences or separate table
- Prevents spam during extended drawdown periods

**Batch Processing:**
- Users processed in batches of 100
- Each batch commits independently
- Failure in one batch doesn't affect others

**Error Resilience:**
- Individual user failures logged but don't stop job
- Critical errors (DB unavailable) trigger job pause
- Automatic retry with exponential backoff

**Monitoring:**
- Job duration tracked
- Error rate monitored
- Alerting if job fails completely

**Related Processes:**
- PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot (data source)
- PROC-PORTFOLIO-007: Get Risk Metrics (serves cached data)
- PROC-PORTFOLIO-012: Manage Portfolio Alert Preferences (alert thresholds)
- PROC-NOTIFY-XXX: Send Notification (handles alert delivery)

---


---

## PROC-PORTFOLIO-014: Add Manual Asset

**Source File:** `PROC-PORTFOLIO-014.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-014.md`

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


---

## PROC-PORTFOLIO-015: Update Manual Asset

**Source File:** `PROC-PORTFOLIO-015.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-015.md`

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


---

## PROC-PORTFOLIO-016: Delete Manual Asset

**Source File:** `PROC-PORTFOLIO-016.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-016.md`

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


---

## PROC-PORTFOLIO-017: Manage Price Alerts (CRUD)

**Source File:** `PROC-PORTFOLIO-017.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-017.md`

### PROC-PORTFOLIO-017: Manage Price Alerts (CRUD)

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-010
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-023

#### Trigger
User creates, updates, or deletes a price alert

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- User has verified email (for email alerts)

---

## 17.1 Create Price Alert

#### Inputs

**API Endpoint:** `POST /api/v1/portfolio/alerts/price`

**Request Body - Crosses Above/Below:**
```json
{
  "asset": "BTC",
  "alertType": "crosses_above",
  "targetValue": 50000.00,
  "isRecurring": false,
  "cooldownHours": 24,
  "notifyEmail": true,
  "notifyInApp": true,
  "notifyPush": false,
  "expiresAt": null,
  "notes": "Buy signal if BTC breaks 50k"
}
```

**Request Body - Percent Change:**
```json
{
  "asset": "ETH",
  "alertType": "change_percent",
  "targetValue": 10.0,
  "comparisonPeriod": "24h",
  "isRecurring": true,
  "cooldownHours": 12,
  "notifyEmail": true,
  "notifyInApp": true,
  "notifyPush": false,
  "expiresAt": "2025-01-01T00:00:00Z",
  "notes": "Monitor ETH volatility"
}
```

**Parameter Details:**
- `asset` (string, required): Asset symbol (BTC, ETH, SOL, etc.)
- `alertType` (enum, required): 'crosses_above', 'crosses_below', 'change_percent'
- `targetValue` (decimal, required): Target price (USD) or percentage
- `comparisonPeriod` (string, conditional): Required for 'change_percent': '1h', '24h', '7d'
- `isRecurring` (boolean, optional): Alert resets after triggering (default: false)
- `cooldownHours` (int, optional): Hours before alert can trigger again (default: 24)
- `notifyEmail` (boolean, optional): Send email notification (default: true)
- `notifyInApp` (boolean, optional): Create in-app notification (default: true)
- `notifyPush` (boolean, optional): Send push notification (default: false)
- `expiresAt` (ISO8601, optional): Alert expiration time
- `notes` (string, optional): User notes (max 500 chars)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/alerts/price` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates request**
   - Asset must be a valid supported asset
   - Alert type must be valid enum
   - Target value must be positive
   - Comparison period required for 'change_percent'
   - Expiration must be in future
4. **Check user alert limits**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT COUNT(*) as alert_count
   FROM price_alerts
   WHERE user_id = $1
     AND status IN ('active', 'paused');
   ```
   - If count >= 50 → Return 400 "Maximum alert limit reached"
5. **Validate asset against current price**
   - Fetch current price from Market Data Service
   - For 'crosses_above': warn if target < current price (already above)
   - For 'crosses_below': warn if target > current price (already below)
6. **Alert Repository creates price alert**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   INSERT INTO price_alerts (
     user_id, asset,
     alert_type, target_value, comparison_period,
     status, is_recurring,
     cooldown_hours,
     notify_email, notify_in_app, notify_push,
     expires_at, notes
   ) VALUES (
     $1, $2,
     $3, $4, $5,
     'active', $6,
     $7,
     $8, $9, $10,
     $11, $12
   ) RETURNING *;
   ```
7. **Return created alert with current price context**

#### Outputs

**Success Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "asset": "BTC",
      "alertType": "crosses_above",
      "targetValue": 50000.00,
      "comparisonPeriod": null,
      "status": "active",
      "isRecurring": false,
      "triggeredCount": 0,
      "lastTriggeredAt": null,
      "cooldownHours": 24,
      "notifications": {
        "email": true,
        "inApp": true,
        "push": false
      },
      "expiresAt": null,
      "notes": "Buy signal if BTC breaks 50k",
      "createdAt": "2024-12-16T12:00:00Z"
    },
    "context": {
      "currentPrice": 43500.00,
      "percentToTarget": 14.94,
      "priceDirection": "above"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Warning Response (201 Created with warning):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "asset": "BTC",
      "alertType": "crosses_above",
      "targetValue": 40000.00,
      "status": "active"
    },
    "context": {
      "currentPrice": 43500.00,
      "percentToTarget": -8.05
    },
    "warnings": [
      {
        "code": "ALREADY_ABOVE_TARGET",
        "message": "BTC is currently above your target price. Alert will trigger when price drops below and then crosses above again."
      }
    ]
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
    "code": "ALERT_LIMIT_EXCEEDED",
    "message": "Maximum alert limit reached",
    "details": {
      "currentAlerts": 50,
      "maxAllowed": 50
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 17.2 List Price Alerts

#### Inputs

**API Endpoint:** `GET /api/v1/portfolio/alerts/price`

**Query Parameters:**
- `asset` (string, optional): Filter by asset symbol
- `status` (string, optional): Filter by status (active, triggered, paused, expired)
- `alertType` (string, optional): Filter by alert type
- `page` (int, optional): Page number (default: 1)
- `limit` (int, optional): Items per page (default: 20, max: 50)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/alerts/price` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Alert Repository queries user's alerts**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT *
   FROM price_alerts
   WHERE user_id = $1
     AND ($2::varchar IS NULL OR asset = $2)
     AND ($3::varchar IS NULL OR status = $3)
     AND ($4::varchar IS NULL OR alert_type = $4)
   ORDER BY
     CASE status
       WHEN 'active' THEN 1
       WHEN 'triggered' THEN 2
       WHEN 'paused' THEN 3
       ELSE 4
     END,
     created_at DESC
   LIMIT $5 OFFSET $6;
   ```
4. **Enrich with current prices**
   - Fetch current prices for all unique assets
   - Calculate percent to target for each alert
5. **Return alert list**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "uuid-1",
        "asset": "BTC",
        "alertType": "crosses_above",
        "targetValue": 50000.00,
        "status": "active",
        "isRecurring": false,
        "triggeredCount": 0,
        "currentPrice": 43500.00,
        "percentToTarget": 14.94,
        "notifications": {
          "email": true,
          "inApp": true,
          "push": false
        },
        "createdAt": "2024-12-16T12:00:00Z"
      },
      {
        "id": "uuid-2",
        "asset": "ETH",
        "alertType": "change_percent",
        "targetValue": 10.0,
        "comparisonPeriod": "24h",
        "status": "active",
        "isRecurring": true,
        "triggeredCount": 3,
        "lastTriggeredAt": "2024-12-15T08:30:00Z",
        "currentPrice": 2250.00,
        "currentChange24h": 5.2,
        "createdAt": "2024-12-10T10:00:00Z"
      }
    ],
    "summary": {
      "totalAlerts": 12,
      "activeAlerts": 8,
      "triggeredAlerts": 2,
      "pausedAlerts": 2
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 12,
      "totalPages": 1
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 17.3 Get Price Alert Details

#### Inputs

**API Endpoint:** `GET /api/v1/portfolio/alerts/price/{alertId}`

**Path Parameters:**
- `alertId` (uuid, required): Alert ID

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/alerts/price/{alertId}` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Alert Repository fetches alert**
   ```sql
   SELECT * FROM price_alerts
   WHERE id = $1 AND user_id = $2;
   ```
   - If not found → Return 404
4. **Fetch alert trigger history**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT *
   FROM price_alert_history
   WHERE alert_id = $1
   ORDER BY triggered_at DESC
   LIMIT 10;
   ```
5. **Enrich with current price**
6. **Return alert with history**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "asset": "BTC",
      "alertType": "crosses_above",
      "targetValue": 50000.00,
      "comparisonPeriod": null,
      "status": "triggered",
      "isRecurring": false,
      "triggeredCount": 1,
      "lastTriggeredAt": "2024-12-15T14:30:00Z",
      "lastTriggeredPrice": 50150.00,
      "cooldownHours": 24,
      "notifications": {
        "email": true,
        "inApp": true,
        "push": false
      },
      "expiresAt": null,
      "notes": "Buy signal if BTC breaks 50k",
      "createdAt": "2024-12-10T12:00:00Z",
      "updatedAt": "2024-12-15T14:30:00Z"
    },
    "currentContext": {
      "currentPrice": 50800.00,
      "percentFromTarget": 1.6
    },
    "history": [
      {
        "id": "uuid",
        "triggeredAt": "2024-12-15T14:30:00Z",
        "triggerPrice": 50150.00,
        "emailSent": true,
        "inAppSent": true,
        "pushSent": false
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 17.4 Update Price Alert

#### Inputs

**API Endpoint:** `PUT /api/v1/portfolio/alerts/price/{alertId}`

**Request Body:**
```json
{
  "targetValue": 55000.00,
  "isRecurring": true,
  "cooldownHours": 12,
  "notifyEmail": true,
  "notifyInApp": true,
  "expiresAt": "2025-02-01T00:00:00Z",
  "notes": "Updated target"
}
```

**Note:** `asset` and `alertType` cannot be changed. Create a new alert instead.

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/alerts/price/{alertId}` (PUT)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates request**
4. **Alert Repository fetches existing alert**
   ```sql
   SELECT * FROM price_alerts
   WHERE id = $1 AND user_id = $2;
   ```
   - If not found → Return 404
5. **Update alert**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   UPDATE price_alerts
   SET
     target_value = COALESCE($2, target_value),
     comparison_period = COALESCE($3, comparison_period),
     is_recurring = COALESCE($4, is_recurring),
     cooldown_hours = COALESCE($5, cooldown_hours),
     notify_email = COALESCE($6, notify_email),
     notify_in_app = COALESCE($7, notify_in_app),
     notify_push = COALESCE($8, notify_push),
     expires_at = COALESCE($9, expires_at),
     notes = COALESCE($10, notes),
     updated_at = NOW()
   WHERE id = $1 AND user_id = $11
   RETURNING *;
   ```
6. **Return updated alert**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "asset": "BTC",
      "alertType": "crosses_above",
      "targetValue": 55000.00,
      "status": "active",
      "isRecurring": true,
      "updatedAt": "2024-12-16T12:00:00Z"
    },
    "message": "Alert updated successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 17.5 Pause/Resume Price Alert

#### Inputs

**API Endpoint:** `POST /api/v1/portfolio/alerts/price/{alertId}/pause`
**API Endpoint:** `POST /api/v1/portfolio/alerts/price/{alertId}/resume`

#### Process Steps

1. **API Gateway receives request**
2. **API Gateway validates JWT** → Extracts user_id
3. **Alert Repository updates status**
   ```sql
   -- For pause
   UPDATE price_alerts
   SET status = 'paused', updated_at = NOW()
   WHERE id = $1 AND user_id = $2 AND status = 'active'
   RETURNING *;

   -- For resume
   UPDATE price_alerts
   SET status = 'active', updated_at = NOW()
   WHERE id = $1 AND user_id = $2 AND status = 'paused'
   RETURNING *;
   ```
4. **Return updated alert**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "status": "paused"
    },
    "message": "Alert paused successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 17.6 Delete Price Alert

#### Inputs

**API Endpoint:** `DELETE /api/v1/portfolio/alerts/price/{alertId}`

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/alerts/price/{alertId}` (DELETE)
2. **API Gateway validates JWT** → Extracts user_id
3. **Alert Repository deletes alert**
   ```sql
   DELETE FROM price_alerts
   WHERE id = $1 AND user_id = $2
   RETURNING id;
   ```
   - If not found → Return 404
4. **Return success**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "deletedAlertId": "uuid",
    "message": "Alert deleted successfully"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 17.7 Reset Triggered Alert

#### Inputs

**API Endpoint:** `POST /api/v1/portfolio/alerts/price/{alertId}/reset`

**Note:** Only available for non-recurring alerts that have been triggered.

#### Process Steps

1. **API Gateway receives request**
2. **API Gateway validates JWT** → Extracts user_id
3. **Alert Repository resets alert**
   ```sql
   UPDATE price_alerts
   SET status = 'active', updated_at = NOW()
   WHERE id = $1
     AND user_id = $2
     AND status = 'triggered'
     AND is_recurring = false
   RETURNING *;
   ```
4. **Return reset alert**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "uuid",
      "status": "active"
    },
    "message": "Alert reset and reactivated"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria
- Alert created and active
- Alert list returns all user alerts with current prices
- Alert updates reflect immediately
- Pause/resume toggles monitoring
- Delete removes alert permanently

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid asset | 400 | Return "Invalid asset symbol" |
| Invalid alert type | 400 | Return "Invalid alert type" |
| Missing comparison period | 400 | Return "Comparison period required for change_percent alerts" |
| Alert limit exceeded | 400 | Return "Maximum alert limit reached (50)" |
| Alert not found | 404 | Return "Alert not found" |
| Cannot reset recurring | 400 | Return "Cannot reset recurring alert" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Create alert: < 100ms
- List alerts with prices: < 300ms
- Price enrichment batched for efficiency
- Max 50 alerts per user

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `price_alerts`, `price_alert_history`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**External Services:**
- Market Data Service: Current asset prices

#### Notes

**Supported Assets:**
Initial support for top 50 cryptocurrencies by market cap. Asset list maintained in configuration.

**Alert Checking:**
Price alerts are checked by a scheduled job (PROC-PORTFOLIO-018) every minute during market hours.

**Related Processes:**
- PROC-PORTFOLIO-018: Check Price Alerts (Scheduled)
- PROC-NOTIFY-001: Send In-App Notification
- PROC-NOTIFY-002: Send Email Notification

---


---

## PROC-PORTFOLIO-018: Check Price Alerts (Scheduled)

**Source File:** `PROC-PORTFOLIO-018.md`  
**Path:** `processes\portfolio-service\PROC-PORTFOLIO-018.md`

### PROC-PORTFOLIO-018: Check Price Alerts (Scheduled)

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-010
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-023, ADR-032

#### Trigger
Scheduled job runs every minute

#### Actor
System (Scheduler)

#### Preconditions
- Market Data Service is available
- Notification Service is available

---

#### Inputs

**No external inputs - scheduled job**

---

#### Process Steps

1. **Scheduled job triggers every minute**

2. **Alert Scheduler fetches all active alerts grouped by asset**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     asset,
     json_agg(
       json_build_object(
         'id', id,
         'user_id', user_id,
         'alert_type', alert_type,
         'target_value', target_value,
         'comparison_period', comparison_period,
         'is_recurring', is_recurring,
         'cooldown_hours', cooldown_hours,
         'last_triggered_at', last_triggered_at,
         'notify_email', notify_email,
         'notify_in_app', notify_in_app,
         'notify_push', notify_push
       )
     ) as alerts
   FROM price_alerts
   WHERE status = 'active'
     AND (expires_at IS NULL OR expires_at > NOW())
   GROUP BY asset;
   ```

3. **Fetch current prices for all monitored assets**
   - Call Market Data Service batch price endpoint
   ```
   GET /api/v1/market/prices?assets=BTC,ETH,SOL,...
   ```
   - Response includes current price and 1h/24h/7d change percentages

4. **For each asset with alerts:**

   **4.1 Check "crosses_above" alerts:**
   ```go
   for _, alert := range alerts {
     if alert.AlertType != "crosses_above" {
       continue
     }

     // Check if price has crossed above target
     if currentPrice >= alert.TargetValue {
       // Verify it wasn't already above (prevent double-trigger)
       previousPrice := getPreviousPrice(asset, 1) // 1 minute ago
       if previousPrice < alert.TargetValue {
         triggerAlert(alert, currentPrice)
       }
     }
   }
   ```

   **4.2 Check "crosses_below" alerts:**
   ```go
   for _, alert := range alerts {
     if alert.AlertType != "crosses_below" {
       continue
     }

     if currentPrice <= alert.TargetValue {
       previousPrice := getPreviousPrice(asset, 1)
       if previousPrice > alert.TargetValue {
         triggerAlert(alert, currentPrice)
       }
     }
   }
   ```

   **4.3 Check "change_percent" alerts:**
   ```go
   for _, alert := range alerts {
     if alert.AlertType != "change_percent" {
       continue
     }

     // Get price from comparison period ago
     var comparisonPrice decimal.Decimal
     switch alert.ComparisonPeriod {
     case "1h":
       comparisonPrice = prices.Change1h
     case "24h":
       comparisonPrice = prices.Change24h
     case "7d":
       comparisonPrice = prices.Change7d
     }

     // Calculate actual percent change
     percentChange := ((currentPrice - comparisonPrice) / comparisonPrice) * 100

     // Check if change exceeds threshold (either direction)
     if math.Abs(percentChange) >= alert.TargetValue {
       triggerAlert(alert, currentPrice, comparisonPrice, percentChange)
     }
   }
   ```

5. **For each triggered alert:**

   **5.1 Check cooldown period**
   ```go
   if alert.LastTriggeredAt != nil {
     cooldownEnd := alert.LastTriggeredAt.Add(
       time.Hour * time.Duration(alert.CooldownHours)
     )
     if time.Now().Before(cooldownEnd) {
       continue // Still in cooldown
     }
   }
   ```

   **5.2 Update alert status**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   UPDATE price_alerts
   SET
     status = CASE WHEN is_recurring THEN 'active' ELSE 'triggered' END,
     triggered_count = triggered_count + 1,
     last_triggered_at = NOW(),
     last_triggered_price = $2,
     updated_at = NOW()
   WHERE id = $1
   RETURNING *;
   ```

   **5.3 Record trigger in history**
   ```sql
   INSERT INTO price_alert_history (
     alert_id, user_id, triggered_at,
     trigger_price, comparison_price, actual_change_percent,
     email_sent, in_app_sent, push_sent
   ) VALUES (
     $1, $2, NOW(),
     $3, $4, $5,
     false, false, false
   ) RETURNING id;
   ```

   **5.4 Send notifications via Service Bus**
   ```json
   {
     "messageId": "uuid",
     "eventType": "price_alert.triggered",
     "timestamp": "2024-12-16T12:00:00Z",
     "version": "1.0",
     "source": {
       "service": "portfolio-service",
       "instance": "instance-id"
     },
     "payload": {
       "userId": "user-uuid",
       "alertId": "alert-uuid",
       "asset": "BTC",
       "alertType": "crosses_above",
       "targetValue": 50000.00,
       "triggerPrice": 50150.00,
       "comparisonPrice": null,
       "actualChangePercent": null,
       "notifyEmail": true,
       "notifyInApp": true,
       "notifyPush": false
     },
     "metadata": {
       "correlationId": "uuid",
       "userId": "user-uuid"
     }
   }
   ```

6. **Notification Service processes event:**
   - Creates in-app notification (PROC-NOTIFY-001)
   - Sends email notification (PROC-NOTIFY-002)
   - Uses template for price_alert notification type

7. **Update history with delivery status**
   ```sql
   UPDATE price_alert_history
   SET
     email_sent = $2,
     in_app_sent = $3,
     push_sent = $4
   WHERE id = $1;
   ```

8. **Check for expired alerts**
   ```sql
   UPDATE price_alerts
   SET status = 'expired', updated_at = NOW()
   WHERE status = 'active'
     AND expires_at IS NOT NULL
     AND expires_at <= NOW();
   ```

9. **Log job completion**

---

#### Outputs

**No direct output - async job**

**Service Bus Events Published:**
- `price_alert.triggered` for each triggered alert

**Database Updates:**
- `price_alerts` status and trigger tracking
- `price_alert_history` records

---

#### Notification Content

**In-App Notification:**
```json
{
  "type": "price_alert",
  "priority": "high",
  "title": "Price Alert: BTC",
  "message": "BTC has crossed above $50,000. Current price: $50,150",
  "data": {
    "alert_id": "uuid",
    "asset": "BTC",
    "alert_type": "crosses_above",
    "target_price": 50000.00,
    "current_price": 50150.00
  },
  "action_url": "/portfolio/alerts/uuid",
  "action_label": "View Alert"
}
```

**Email Subject:**
```
Price Alert: BTC crossed above $50,000
```

**Email Body Variables:**
```json
{
  "user_name": "John",
  "asset": "BTC",
  "alert_type_description": "crossed above",
  "target_price": "$50,000.00",
  "current_price": "$50,150.00",
  "change_percent": null,
  "comparison_period": null,
  "alert_notes": "Buy signal if BTC breaks 50k",
  "action_url": "https://app.yieldly.io/portfolio/alerts/uuid"
}
```

---

#### Success Criteria
- All active alerts checked every minute
- Triggered alerts updated correctly
- Notifications sent via appropriate channels
- Cooldown periods respected
- Recurring alerts reset properly
- Expired alerts marked as expired

#### Error Scenarios

| Error | Handling |
|-------|----------|
| Market Data Service unavailable | Skip this run, log warning, retry next minute |
| Notification Service unavailable | Log trigger, queue for retry |
| Database error | Log error, continue with other alerts |
| Individual alert processing fails | Log error, continue with other alerts |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: Job completion < 30 seconds

**Process-Specific Notes:**
- Job runs every 60 seconds
- Must complete before next run starts
- Batch processing: Check up to 10,000 alerts per run
- Market data fetch: Single batch request for all assets
- Notifications queued async (non-blocking)

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `price_alerts`, `price_alert_history`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**External Services:**
- Market Data Service: Current and historical prices
- Notification Service: Alert delivery

**Message Queue:**
- Azure Service Bus: price_alert.triggered events

#### Notes

**Alert Checking Logic:**

For "crosses_above" and "crosses_below" alerts:
- Compare current price vs 1-minute-ago price
- Only trigger if price actually *crossed* the threshold (not just above/below)
- Prevents duplicate triggers for prices that stay above/below target

For "change_percent" alerts:
- Compare current price vs price from comparison period ago
- Trigger if absolute change exceeds threshold (either direction)
- User can create separate alerts for up/down moves if needed

**Cooldown Behavior:**
- Non-recurring: Status changes to 'triggered', stays there
- Recurring: Status stays 'active' but won't trigger until cooldown expires

**Rate Limiting:**
- Max 3 notifications per asset per user per hour
- Prevents spam if price oscillates around target

**Job Locking:**
- Uses distributed lock to prevent multiple instances running simultaneously
- Lock key: `price_alert_check_job`
- Lock TTL: 55 seconds

**Related Processes:**
- PROC-PORTFOLIO-017: Manage Price Alerts (CRUD)
- PROC-NOTIFY-001: Send In-App Notification
- PROC-NOTIFY-002: Send Email Notification

---


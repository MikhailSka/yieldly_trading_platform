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

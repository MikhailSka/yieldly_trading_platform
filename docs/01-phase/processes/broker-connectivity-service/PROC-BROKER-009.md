### PROC-BROKER-009: Get Available Trading Pairs

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-MARKET-004, FR-BROKER-002
**Related NFR:** NFR-PERF-001, NFR-API-001
**Related ADR:** ADR-032

#### Trigger
User or admin browses available trading pairs for a specific exchange

#### Actor
Authenticated User or Admin User

#### Preconditions
- User is authenticated
- Exchange is supported (bybit, binance)

---

## Part A: User Access (Cached Data)

#### Inputs
**API Endpoint:** `GET /api/v1/broker/exchanges/{exchange}/trading-pairs`

**Path Parameters:**
- `{exchange}`: Exchange identifier (`bybit`, `binance`)

**Query Parameters:**
```
GET /api/v1/broker/exchanges/{exchange}/trading-pairs?
  page={number}&
  page_size={number}&
  search={term}&
  quote_asset={asset}&
  base_asset={asset}&
  is_active={boolean}&
  trending={boolean}&
  min_volume_24h={number}&
  sort_by={field}&
  sort_order={asc|desc}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 50, max: 200): Items per page
- `search` (string, optional, max 20 chars): Search in symbol name
- `quote_asset` (string, optional): Filter by quote asset (e.g., `USDT`, `BTC`)
- `base_asset` (string, optional): Filter by base asset (e.g., `BTC`, `ETH`)
- `is_active` (boolean, default: true): Filter by active trading status
- `trending` (boolean, optional): Filter to show only trending pairs (high volume, high volatility)
- `min_volume_24h` (number, optional): Minimum 24h trading volume in USD
- `sort_by` (string, default: `symbol`): Sort field (`symbol`, `volume_24h`, `base_asset`, `quote_asset`, `price_change_24h`)
- `sort_order` (string, default: `asc`): Sort direction (`asc`, `desc`)

#### Process Steps (User Access)

1. **API Gateway receives request** → Routes to Broker Connectivity Service
2. **API Gateway validates JWT** → Extracts user_id
3. **Broker Controller validates exchange**
   - If exchange not in (`bybit`, `binance`) → Return 400 "Invalid exchange"
4. **Broker Controller validates query parameters**
   - Validate `page` is positive integer
   - Validate `page_size` is between 1 and 200
   - Validate `sort_by` is valid field
   - Return 400 if any validation fails
5. **Broker Controller checks cache for trading pairs**
   ```
   GET exchange:{exchange}:trading_pairs:list
   ```
   - If cache exists and fresh (< 1 hour) → Use cached data
   - If cache miss → Fetch from database
6. **Broker Repository fetches trading pairs from database**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     id,
     exchange,
     symbol,
     base_currency,
     quote_currency,
     is_active,
     is_trading,
     min_order_size,
     max_order_size,
     price_precision,
     quantity_precision,
     maker_fee,
     taker_fee,
     market_type,
     volume_24h_usd,
     price_change_24h_pct,
     is_trending,
     last_synced_at
   FROM exchange_markets
   WHERE exchange = $1
     AND ($2::boolean IS NULL OR is_active = $2)
     AND ($3::varchar IS NULL OR symbol ILIKE '%' || $3 || '%')
     AND ($4::varchar IS NULL OR quote_currency = $4)
     AND ($5::varchar IS NULL OR base_currency = $5)
     AND ($6::boolean IS NULL OR is_trending = $6)
     AND ($7::numeric IS NULL OR volume_24h_usd >= $7)
   ORDER BY
     CASE WHEN $8 = 'symbol' AND $9 = 'asc' THEN symbol END ASC,
     CASE WHEN $8 = 'symbol' AND $9 = 'desc' THEN symbol END DESC,
     CASE WHEN $8 = 'volume_24h' AND $9 = 'asc' THEN volume_24h_usd END ASC,
     CASE WHEN $8 = 'volume_24h' AND $9 = 'desc' THEN volume_24h_usd END DESC,
     CASE WHEN $8 = 'price_change_24h' AND $9 = 'asc' THEN price_change_24h_pct END ASC,
     CASE WHEN $8 = 'price_change_24h' AND $9 = 'desc' THEN price_change_24h_pct END DESC,
     CASE WHEN $8 = 'base_asset' AND $9 = 'asc' THEN base_currency END ASC,
     CASE WHEN $8 = 'base_asset' AND $9 = 'desc' THEN base_currency END DESC,
     CASE WHEN $8 = 'quote_asset' AND $9 = 'asc' THEN quote_currency END ASC,
     CASE WHEN $8 = 'quote_asset' AND $9 = 'desc' THEN quote_currency END DESC
   LIMIT $10 OFFSET $11;
   ```
7. **Broker Repository counts total matching records**
8. **Broker Controller formats response with pagination**
9. **Return paginated trading pairs list**

#### Outputs (User Access)

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTCUSDT",
      "baseAsset": "BTC",
      "quoteAsset": "USDT",
      "exchange": "bybit",
      "isActive": true,
      "isTrading": true,
      "minOrderSize": 0.001,
      "maxOrderSize": 100.0,
      "pricePrecision": 2,
      "quantityPrecision": 3,
      "makerFee": 0.0001,
      "takerFee": 0.0006,
      "marketType": "spot",
      "volume24hUsd": 2500000000.00,
      "priceChange24hPct": 2.45,
      "isTrending": true,
      "lastSyncedAt": "2024-12-16T11:00:00Z"
    },
    {
      "symbol": "ETHUSDT",
      "baseAsset": "ETH",
      "quoteAsset": "USDT",
      "exchange": "bybit",
      "isActive": true,
      "isTrading": true,
      "minOrderSize": 0.01,
      "maxOrderSize": 1000.0,
      "pricePrecision": 2,
      "quantityPrecision": 2,
      "makerFee": 0.0001,
      "takerFee": 0.0006,
      "marketType": "spot",
      "volume24hUsd": 1200000000.00,
      "priceChange24hPct": 3.12,
      "isTrending": true,
      "lastSyncedAt": "2024-12-16T11:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 432,
    "totalPages": 9,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "exchange": "bybit",
    "lastSyncedAt": "2024-12-16T11:00:00Z"
  }
}
```

**Success Response - Trending Filter:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTCUSDT",
      "baseAsset": "BTC",
      "quoteAsset": "USDT",
      "exchange": "binance",
      "isActive": true,
      "isTrading": true,
      "volume24hUsd": 2500000000.00,
      "priceChange24hPct": 5.67,
      "isTrending": true,
      "trendingReason": "high_volume",
      "lastSyncedAt": "2024-12-16T11:00:00Z"
    },
    {
      "symbol": "SOLUSDT",
      "baseAsset": "SOL",
      "quoteAsset": "USDT",
      "exchange": "binance",
      "isActive": true,
      "isTrading": true,
      "volume24hUsd": 890000000.00,
      "priceChange24hPct": 12.34,
      "isTrending": true,
      "trendingReason": "high_volatility",
      "lastSyncedAt": "2024-12-16T11:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 25,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "exchange": "binance",
    "filter": "trending",
    "lastSyncedAt": "2024-12-16T11:00:00Z"
  }
}
```

---

## Part B: Admin Access (Live Data with Comparison)

#### Inputs
**API Endpoint:** `GET /api/v1/admin/broker/exchanges/{exchange}/symbols`

**Path Parameters:**
- `{exchange}`: Exchange identifier (`bybit`, `binance`)

**Query Parameters:**
```
GET /api/v1/admin/broker/exchanges/{exchange}/symbols?
  page={number}&
  page_size={number}&
  search={term}&
  quote_asset={asset}&
  status={status}&
  compare_downloaded={boolean}&
  refresh={boolean}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 100, max: 500): Items per page
- `search` (string, optional, max 50 chars): Search in symbol name
- `quote_asset` (string, optional): Filter by quote asset (e.g., `USDT`, `BTC`, `ETH`)
- `status` (string, optional): Filter by trading status (`trading`, `settling`, `closed`)
- `compare_downloaded` (boolean, default: false): Compare against Historical Data Service
- `refresh` (boolean, default: false): Force refresh from exchange API (bypass cache)

#### Process Steps (Admin Access)

1. **API Gateway receives request** → Routes to Broker Connectivity Service
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Broker Controller validates exchange**
   - If exchange not supported → Return 400 "Unsupported exchange"
5. **Check cache (unless refresh=true)**
   ```
   GET exchange:{exchange}:symbols:admin
   ```
   - If cache exists and fresh (< 1 hour) and refresh=false → Use cached data
6. **If cache miss or refresh=true, fetch from exchange API**

   **For Bybit:**
   ```
   GET https://api.bybit.com/v5/market/instruments-info?category=spot
   ```

   **For Binance:**
   ```
   GET https://api.binance.com/api/v3/exchangeInfo
   ```
7. **Cache exchange response**
   - Cache key: `exchange:{exchange}:symbols:admin`
   - Cache TTL: 1 hour
8. **If compare_downloaded = true, fetch downloaded symbols from Historical Data Service**
   ```sql
   -- Query historical_db for comparison
   SELECT exchange, symbol, available_timeframes, earliest_data_timestamp, latest_data_timestamp
   FROM symbols_metadata
   WHERE exchange = $1 AND total_candles_count > 0;
   ```
9. **Apply filters and pagination**
10. **Return paginated response with comparison data**

#### Outputs (Admin Access)

**Success Response (200 OK) - With Comparison:**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "symbols": [
      {
        "symbol": "BTCUSDT",
        "baseAsset": "BTC",
        "quoteAsset": "USDT",
        "status": "trading",
        "contractType": "spot",
        "launchTime": "2020-03-30T00:00:00Z",
        "priceScale": 2,
        "quantityScale": 3,
        "downloadStatus": "downloaded",
        "downloadedData": {
          "timeframes": ["1h", "4h", "1d"],
          "earliestData": "2020-03-30T00:00:00Z",
          "latestData": "2024-12-16T11:00:00Z",
          "coverage": "full"
        }
      },
      {
        "symbol": "NEWCOINUSDT",
        "baseAsset": "NEWCOIN",
        "quoteAsset": "USDT",
        "status": "trading",
        "contractType": "spot",
        "launchTime": "2024-11-01T00:00:00Z",
        "downloadStatus": "not_downloaded",
        "downloadedData": null
      }
    ],
    "summary": {
      "totalExchangeSymbols": 456,
      "downloadedSymbols": 89,
      "partialSymbols": 23,
      "notDownloadedSymbols": 344
    },
    "exchangeInfo": {
      "totalSymbols": 456,
      "tradingSymbols": 432,
      "lastUpdated": "2024-12-16T11:00:00Z",
      "cacheHit": false
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 100,
    "totalItems": 456,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria
- User access: Trading pairs retrieved from database cache
- Admin access: Symbols retrieved from exchange API (cached)
- Filters applied correctly (including trending, volume)
- Pagination working
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid exchange | 400 | Return "Exchange must be one of: bybit, binance" |
| Invalid page number | 400 | Return "Page must be a positive integer" |
| Invalid page_size | 400 | Return "Page size must be between 1 and 200" |
| Invalid sort_by field | 400 | Return "Invalid sort field" |
| Not admin (admin endpoint) | 403 | Return "Admin access required" |
| Exchange API error | 502 | Return "Exchange API temporarily unavailable" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-API-001**: Pagination and List Optimization

**Process-Specific Notes:**
- **User Access**: < 100ms (cached), < 300ms (database)
- **Admin Access**: < 200ms (cached), 1-2 seconds (exchange API call)
- **Cache Strategy**: Trading pairs list cached for 1 hour in Redis
- **Indexes**: `exchange`, `symbol`, `base_currency`, `quote_currency`, `is_trending`, `volume_24h_usd`

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `exchange_markets`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Cache:**
- Redis - Trading pairs cache (TTL: 1 hour)

**External Services (Admin Only):**
- Bybit API: `GET /v5/market/instruments-info`
- Binance API: `GET /api/v3/exchangeInfo`
- Historical Data Service: `GET /api/v1/admin/historical/symbols` (for comparison)

#### Notes

**Trending Criteria:**
Trading pairs are marked as "trending" based on:
1. **High Volume**: 24h volume in top 10% for the exchange
2. **High Volatility**: Price change > 5% in 24h
3. **Volume Spike**: Current volume > 2x average volume

Trending status is updated by PROC-BROKER-015 (Sync Exchange Markets Cache).

**User vs Admin Access:**
| Feature | User Endpoint | Admin Endpoint |
|---------|---------------|----------------|
| Data Source | Database cache | Exchange API (cached) |
| Trending Filter | ✓ | - |
| Volume Filter | ✓ | - |
| Download Comparison | - | ✓ |
| Force Refresh | - | ✓ |
| Rate Limits | Standard | Higher |

**Use Cases:**
1. **User**: Browse trending pairs for trading ideas
2. **User**: Search for specific symbol to add to watchlist
3. **User**: Filter high-volume pairs for liquidity
4. **Admin**: Discover new symbols available on exchange
5. **Admin**: Identify symbols not yet downloaded for historical data
6. **Admin**: Plan bulk download of missing symbols

**Related Processes:**
- PROC-BROKER-015: Sync Exchange Markets Cache - populates trading pairs and trending data
- PROC-BROKER-005: Download Historical Data (Admin) - queue symbol downloads
- PROC-HISTORICAL-003: List Available Symbols - view downloaded symbols

---

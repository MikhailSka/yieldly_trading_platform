### PROC-BROKER-015: Sync Exchange Markets Cache

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-MARKET-004, FR-ADMIN-007
**Related NFR:** NFR-PERF-001, NFR-INT-001
**Related ADR:** ADR-032

#### Trigger
Scheduled daily job OR Admin triggers manual sync

#### Actor
System (Scheduler) OR Admin User

#### Preconditions
- Exchange API is available
- Admin connection exists for the exchange (if fetching from exchange API)

#### Inputs

**API Endpoint (Manual Trigger):** `POST /api/v1/admin/broker/exchanges/{exchange}/sync-markets`

**Path Parameters:**
- `{exchange}`: Exchange identifier (`bybit`, `binance`)

**Request Body (optional):**
```json
{
  "forceRefresh": true
}
```

**Parameter Details:**
- `forceRefresh` (boolean, default: false): Skip cache check and fetch fresh data

#### Process Steps

**For Scheduled Job:**

1. **Scheduled Job triggers daily at 00:00 UTC**
2. **Sync Scheduler iterates through enabled exchanges**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT exchange, rest_api_base_url, api_version
   FROM exchange_configurations
   WHERE is_enabled = true;
   ```
3. **For each exchange, proceed with steps 4-12**

**For Manual Trigger:**

1. **API Gateway receives request** → `/api/v1/admin/broker/exchanges/{exchange}/sync-markets` (POST)
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"

**Common Steps (both triggers):**

4. **Broker Controller validates exchange**
   - If exchange not supported → Return 400 "Unsupported exchange"
5. **Check last sync time (skip if forceRefresh = true)**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT MAX(last_synced_at) as last_sync
   FROM exchange_markets
   WHERE exchange = $1;
   ```
   - If last_sync < 1 hour ago AND forceRefresh = false → Skip (return cached)
6. **Exchange Adapter fetches market info from exchange API**

   **For Bybit:**
   ```
   GET https://api.bybit.com/v5/market/instruments-info?category=spot
   GET https://api.bybit.com/v5/market/instruments-info?category=linear
   ```

   **For Binance:**
   ```
   GET https://api.binance.com/api/v3/exchangeInfo
   ```

7. **Parse and normalize exchange response**
   ```go
   type NormalizedMarket struct {
     Symbol           string
     BaseCurrency     string
     QuoteCurrency    string
     IsActive         bool
     IsTrading        bool
     MinOrderSize     decimal.Decimal
     MaxOrderSize     decimal.Decimal
     PricePrecision   int
     QuantityPrecision int
     MakerFee         decimal.Decimal
     TakerFee         decimal.Decimal
     MarketType       string
     Metadata         json.RawMessage
   }
   ```
8. **Begin database transaction**
9. **Upsert market data**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   INSERT INTO exchange_markets (
     exchange, symbol, base_currency, quote_currency,
     is_active, is_trading, min_order_size, max_order_size,
     price_precision, quantity_precision, maker_fee, taker_fee,
     market_type, metadata, last_synced_at
   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
   ON CONFLICT (exchange, symbol)
   DO UPDATE SET
     base_currency = EXCLUDED.base_currency,
     quote_currency = EXCLUDED.quote_currency,
     is_active = EXCLUDED.is_active,
     is_trading = EXCLUDED.is_trading,
     min_order_size = EXCLUDED.min_order_size,
     max_order_size = EXCLUDED.max_order_size,
     price_precision = EXCLUDED.price_precision,
     quantity_precision = EXCLUDED.quantity_precision,
     maker_fee = EXCLUDED.maker_fee,
     taker_fee = EXCLUDED.taker_fee,
     market_type = EXCLUDED.market_type,
     metadata = EXCLUDED.metadata,
     last_synced_at = NOW();
   ```
10. **Mark removed symbols as inactive**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
    UPDATE exchange_markets
    SET is_active = false,
        is_trading = false,
        last_synced_at = NOW()
    WHERE exchange = $1
      AND symbol NOT IN (SELECT unnest($2::varchar[]))
      AND is_active = true;
    ```
11. **Commit transaction**
12. **Update Redis cache**
    ```
    DEL exchange:{exchange}:trading_pairs:list
    ```
13. **Log sync completion**
    ```sql
    -- Log to exchange_status_history
    INSERT INTO exchange_status_history (
      exchange, is_operational, rest_api_available,
      avg_response_time_ms, checked_at
    ) VALUES ($1, true, true, $2, NOW());
    ```
14. **Return sync results**

#### Outputs

**Success Response - Manual Trigger (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "syncResult": {
      "totalSymbols": 456,
      "newSymbols": 12,
      "updatedSymbols": 432,
      "deactivatedSymbols": 3,
      "unchangedSymbols": 9
    },
    "timing": {
      "fetchDurationMs": 1245,
      "processDurationMs": 523,
      "totalDurationMs": 1768
    },
    "syncedAt": "2024-12-16T00:00:00Z",
    "nextScheduledSync": "2024-12-17T00:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T00:00:02Z",
    "version": "v1"
  }
}
```

**Success Response - Skipped (Already Fresh):**
```json
{
  "success": true,
  "data": {
    "exchange": "binance",
    "syncResult": {
      "skipped": true,
      "reason": "Data is fresh (last synced 45 minutes ago)"
    },
    "lastSyncedAt": "2024-12-15T23:15:00Z",
    "nextScheduledSync": "2024-12-17T00:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-16T00:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (403 Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Admin access required",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T00:00:00Z",
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
    "message": "Unsupported exchange",
    "details": {
      "exchange": "kraken",
      "supportedExchanges": ["bybit", "binance"]
    }
  },
  "meta": {
    "timestamp": "2024-12-16T00:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (502 Bad Gateway):**
```json
{
  "success": false,
  "error": {
    "code": "EXCHANGE_API_ERROR",
    "message": "Failed to fetch market data from exchange",
    "details": {
      "exchange": "bybit",
      "errorCode": "10001",
      "errorMessage": "Service temporarily unavailable"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T00:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Market data fetched from exchange API
- Database updated with new/changed markets
- Inactive symbols marked appropriately
- Redis cache invalidated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin (manual) | 403 | Return "Admin access required" |
| Unsupported exchange | 400 | Return "Unsupported exchange" |
| Exchange API timeout | 502 | Log error, return "Exchange API timeout" |
| Exchange API error | 502 | Log error, return "Failed to fetch market data" |
| Database error | 500 | Rollback transaction, log error, return generic message |
| Rate limited by exchange | 429 | Log warning, retry with backoff |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-INT-001**: Exchange API Integration

**Process-Specific Notes:**
- Exchange API fetch: 1-3 seconds
- Database upsert (batch): 500ms - 2 seconds for 500 symbols
- Total sync time: < 5 seconds per exchange
- Runs daily at off-peak hours (00:00 UTC)

#### Dependencies

**Database:**
- `broker_db` (PostgreSQL) - Tables: `exchange_markets`, `exchange_configurations`, `exchange_status_history`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

**Cache:**
- Redis - Trading pairs cache (invalidated on sync)

**External Services:**
- Bybit API: `/v5/market/instruments-info`
- Binance API: `/api/v3/exchangeInfo`

#### Notes

**Sync Schedule:**
- Automated sync runs daily at 00:00 UTC
- Manual sync available for admins
- Skip threshold: 1 hour (won't re-sync if data is fresh)

**Data Normalization:**
Each exchange returns data in different formats:
- Bybit: `baseCoin`, `quoteCoin`, `status`
- Binance: `baseAsset`, `quoteAsset`, `status`

The adapter normalizes these to a common format.

**Symbol Lifecycle:**
1. New symbol on exchange → Added as `is_active = true`
2. Symbol removed from exchange → Marked as `is_active = false`
3. Symbol trading halted → `is_trading = false`, `is_active = true`

**Market Types:**
- `spot`: Spot trading pairs
- `linear`: Linear perpetual futures (USDT-margined)
- `inverse`: Inverse perpetual futures (coin-margined)

**Use Cases:**
1. Daily automated refresh of trading pairs
2. Admin manually triggers sync after exchange announces new listings
3. System initialization (first-time data population)

**Related Processes:**
- PROC-BROKER-009: List Available Symbols from Exchange (Admin) - fetches live data with comparison
- PROC-BROKER-011: Get Trading Pairs (User-facing) - uses cached data from this sync

---

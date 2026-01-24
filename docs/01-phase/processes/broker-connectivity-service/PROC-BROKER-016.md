### PROC-BROKER-016: Get Batch Asset Prices

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-PORTFOLIO-002, FR-MARKET-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
Portfolio Service or frontend requests current prices for multiple assets to calculate portfolio value

#### Actor
System (Portfolio Service) or Authenticated User (via frontend)

#### Preconditions
- User is authenticated
- At least one valid symbol provided
- Exchange is supported (bybit, binance)

#### Overview

This endpoint provides batch pricing for multiple symbols in a single request. It is primarily used by:
1. **Portfolio Service**: Calculate total portfolio value for manually added assets
2. **Frontend**: Display current prices for watchlist or portfolio holdings
3. **Risk Calculations**: Get latest prices for P&L calculations

The endpoint returns a dictionary mapping each symbol to its current price, making it efficient to price multiple assets without multiple API calls.

---

#### Inputs
**API Endpoint:** `POST /api/v1/broker/prices/batch`

**Request Body:**
```json
{
  "exchange": "bybit",
  "symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"],
  "includeMetadata": false
}
```

**Parameter Details:**
- `exchange` (string, required): Exchange identifier (`bybit`, `binance`)
- `symbols` (array of strings, required): List of trading pair symbols (max 100)
- `includeMetadata` (boolean, default: false): Include additional price metadata (24h change, volume)

**Alternative GET Endpoint (for simpler queries):**
```
GET /api/v1/broker/prices/batch?
  exchange=bybit&
  symbols=BTCUSDT,ETHUSDT,SOLUSDT
```

#### Process Steps

1. **API Gateway receives request** → Routes to Broker Connectivity Service
2. **API Gateway validates JWT** → Extracts user_id
3. **Broker Controller validates request**
   - Validate exchange is supported (`bybit`, `binance`)
   - Validate symbols array is not empty
   - Validate symbols array length <= 100
   - Validate each symbol format (alphanumeric, max 20 chars)
   - Return 400 if any validation fails
4. **Check Redis cache for recent prices**
   ```
   MGET price:{exchange}:BTCUSDT price:{exchange}:ETHUSDT price:{exchange}:SOLUSDT ...
   ```
   - Cache TTL: 5 seconds (prices update frequently)
5. **For cache misses, batch fetch from exchange API**

   **For Bybit:**
   ```
   GET /v5/market/tickers?category=spot&symbol=BTCUSDT,ETHUSDT,SOLUSDT
   ```

   **For Binance:**
   ```
   GET /api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","SOLUSDT"]
   ```
6. **Exchange Adapter normalizes response**
   ```go
   type PriceData struct {
     Symbol      string    `json:"symbol"`
     Price       float64   `json:"price"`
     Timestamp   time.Time `json:"timestamp"`
     // Optional metadata
     Change24h   *float64  `json:"change24h,omitempty"`
     Volume24h   *float64  `json:"volume24h,omitempty"`
   }
   ```
7. **Update Redis cache with fresh prices**
   ```
   MSET price:{exchange}:BTCUSDT {priceData} price:{exchange}:ETHUSDT {priceData} ...
   EXPIRE price:{exchange}:BTCUSDT 5
   EXPIRE price:{exchange}:ETHUSDT 5
   ...
   ```
8. **Build response dictionary**
   ```go
   func buildPriceResponse(prices []PriceData) map[string]interface{} {
     result := make(map[string]interface{})
     for _, p := range prices {
       result[p.Symbol] = map[string]interface{}{
         "price":     p.Price,
         "timestamp": p.Timestamp,
       }
     }
     return result
   }
   ```
9. **Return batch price response**

#### Outputs

**Success Response (200 OK) - Basic:**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "prices": {
      "BTCUSDT": {
        "price": 45250.50,
        "timestamp": "2024-12-16T12:00:01Z"
      },
      "ETHUSDT": {
        "price": 2350.75,
        "timestamp": "2024-12-16T12:00:01Z"
      },
      "SOLUSDT": {
        "price": 98.45,
        "timestamp": "2024-12-16T12:00:01Z"
      },
      "BNBUSDT": {
        "price": 315.20,
        "timestamp": "2024-12-16T12:00:01Z"
      }
    },
    "summary": {
      "requested": 4,
      "found": 4,
      "notFound": 0
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:01Z",
    "version": "v1",
    "cacheHit": true
  }
}
```

**Success Response (200 OK) - With Metadata:**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "prices": {
      "BTCUSDT": {
        "price": 45250.50,
        "timestamp": "2024-12-16T12:00:01Z",
        "change24h": 2.45,
        "change24hPct": 5.42,
        "volume24h": 2500000000.00,
        "high24h": 46000.00,
        "low24h": 44000.00
      },
      "ETHUSDT": {
        "price": 2350.75,
        "timestamp": "2024-12-16T12:00:01Z",
        "change24h": 45.25,
        "change24hPct": 1.96,
        "volume24h": 1200000000.00,
        "high24h": 2400.00,
        "low24h": 2280.00
      },
      "SOLUSDT": {
        "price": 98.45,
        "timestamp": "2024-12-16T12:00:01Z",
        "change24h": 8.50,
        "change24hPct": 9.45,
        "volume24h": 890000000.00,
        "high24h": 102.00,
        "low24h": 89.00
      }
    },
    "summary": {
      "requested": 3,
      "found": 3,
      "notFound": 0
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:01Z",
    "version": "v1",
    "cacheHit": false
  }
}
```

**Success Response (200 OK) - Partial Results:**
```json
{
  "success": true,
  "data": {
    "exchange": "binance",
    "prices": {
      "BTCUSDT": {
        "price": 45250.50,
        "timestamp": "2024-12-16T12:00:01Z"
      },
      "ETHUSDT": {
        "price": 2350.75,
        "timestamp": "2024-12-16T12:00:01Z"
      }
    },
    "notFound": ["INVALIDUSDT", "FAKECOIN"],
    "summary": {
      "requested": 4,
      "found": 2,
      "notFound": 2
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:01Z",
    "version": "v1",
    "cacheHit": false,
    "warning": "Some symbols were not found on the exchange"
  }
}
```

**Error Response (400 Bad Request - Too Many Symbols):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Too many symbols requested",
    "details": [
      {
        "field": "symbols",
        "message": "Maximum 100 symbols per request",
        "code": "MAX_SYMBOLS_EXCEEDED",
        "provided": 150,
        "maximum": 100
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

**Error Response (400 Bad Request - Empty Symbols):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Symbols array is required",
    "details": [
      {
        "field": "symbols",
        "message": "At least one symbol is required",
        "code": "EMPTY_SYMBOLS"
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

---

#### Success Criteria
- Prices retrieved for all valid symbols
- Invalid symbols reported in `notFound` array
- Response cached for subsequent requests
- HTTP 200 OK (even for partial results)

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid exchange | 400 | Return "Exchange must be one of: bybit, binance" |
| Empty symbols array | 400 | Return "At least one symbol is required" |
| Too many symbols | 400 | Return "Maximum 100 symbols per request" |
| Invalid symbol format | 400 | Return "Invalid symbol format" |
| Exchange API error | 502 | Return "Exchange temporarily unavailable" |
| Rate limit exceeded | 429 | Return "Rate limit exceeded, try again in X seconds" |
| All symbols not found | 404 | Return "No valid symbols found on exchange" |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Cache Strategy**: Prices cached for 5 seconds in Redis
- **Cache Hit**: < 50ms response time
- **Cache Miss**: < 300ms response time (single exchange API call)
- **Batch Size**: Max 100 symbols per request
- **Exchange API Calls**: Single call per request (batch endpoint)

#### Dependencies

**Cache:**
- Redis - Price cache (TTL: 5 seconds)
- Cache key format: `price:{exchange}:{symbol}`

**External Services:**
- Bybit API: `GET /v5/market/tickers`
- Binance API: `GET /api/v3/ticker/price`

**Database:**
- None (prices are not stored, only cached)

#### Notes

**Use Cases:**

1. **Portfolio Value Calculation:**
   ```go
   // Portfolio Service calls this to price manual assets
   func calculatePortfolioValue(assets []Asset) (float64, error) {
     symbols := extractSymbols(assets)
     prices, err := brokerService.GetBatchPrices("bybit", symbols)
     if err != nil {
       return 0, err
     }

     total := 0.0
     for _, asset := range assets {
       price := prices[asset.Symbol]
       total += asset.Quantity * price
     }
     return total, nil
   }
   ```

2. **Watchlist Display:**
   ```javascript
   // Frontend fetches prices for watchlist
   const response = await fetch('/api/v1/broker/prices/batch', {
     method: 'POST',
     body: JSON.stringify({
       exchange: 'binance',
       symbols: watchlistSymbols,
       includeMetadata: true
     })
   });
   ```

3. **P&L Calculation:**
   ```go
   // Calculate unrealized P&L for positions
   func calculateUnrealizedPnL(positions []Position) map[string]float64 {
     symbols := extractSymbols(positions)
     prices, _ := brokerService.GetBatchPrices(exchange, symbols)

     pnl := make(map[string]float64)
     for _, pos := range positions {
       currentValue := pos.Quantity * prices[pos.Symbol]
       pnl[pos.Symbol] = currentValue - pos.CostBasis
     }
     return pnl
   }
   ```

**Caching Strategy:**

| Scenario | Cache TTL | Reason |
|----------|-----------|--------|
| Standard request | 5 seconds | Balance freshness vs API limits |
| High-frequency user | 5 seconds | Prevent API abuse |
| Portfolio calculation | 5 seconds | Acceptable staleness for aggregation |

**Rate Limiting:**
- Counted against user's broker rate limit
- Weight: 1 per request (regardless of symbol count)
- Bybit: 120 requests/minute
- Binance: 1200 requests/minute

**Symbol Validation:**
Symbols are validated against the exchange_markets cache before making API calls. If a symbol doesn't exist in the cache:
1. First check: Query exchange_markets table
2. If not found: Still attempt API call (symbol might be new)
3. If API returns no price: Add to `notFound` array

**Related Processes:**
- PROC-BROKER-003: Fetch Real-Time Market Data (for single symbol, real-time)
- PROC-PORTFOLIO-001: Get Portfolio Dashboard (uses batch prices for valuation)
- PROC-PORTFOLIO-002: Create Hourly Portfolio Snapshot (uses batch prices)
- PROC-BROKER-009: Get Available Trading Pairs (symbol validation)

---

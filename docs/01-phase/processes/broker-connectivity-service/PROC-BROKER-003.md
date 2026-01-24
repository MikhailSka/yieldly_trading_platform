### PROC-BROKER-003: Fetch Real-Time Market Data

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-MARKET-001, FR-MARKET-002, FR-MARKET-003, FR-MARKET-005
**Related NFR:** NFR-PERF-001, NFR-PERF-002, NFR-SCALE-004
**Related ADR:** ADR-032

#### Trigger
Portfolio Service or frontend requests market data (REST or WebSocket)

#### Actor
System (Portfolio Service) or User (via frontend)

#### Preconditions
- Exchange API is available
- For authenticated endpoints: Valid broker connection (if using user's connection)

---

## Part A: REST API for Initial Data Load

#### Inputs
**API Endpoint:** `GET /api/v1/broker/market-data`

**Query Parameters:**
```
GET /api/v1/broker/market-data?
  exchange=bybit&
  symbol=BTCUSDT&
  type={ticker|klines}&
  interval={1m|5m|15m|1h|4h|1d}&
  limit={number}
```

**Parameter Details:**
- `exchange` (string, required): Exchange identifier (`bybit`, `binance`)
- `symbol` (string, required): Trading pair symbol (e.g., `BTCUSDT`)
- `type` (string, default: `ticker`): Data type (`ticker` for current price, `klines` for candlestick data)
- `interval` (string, required for klines): Candlestick interval
- `limit` (integer, default: 200, max: per exchange config): Number of candles to fetch

#### Process Steps (REST)

1. **API Gateway receives request** → `/api/v1/broker/market-data` (GET)
2. **API Gateway validates JWT** → Extracts user_id (optional for public data)
3. **Broker Controller validates parameters**
   - Check exchange is valid ("bybit", "binance")
   - Check symbol format
   - Validate interval if type=klines
   - Validate limit against exchange configuration (PROC-BROKER-011)
4. **Broker Controller fetches exchange API configuration**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml
   SELECT
     max_klines_per_request,
     supported_intervals,
     rest_api_base_url
   FROM exchange_configurations
   WHERE exchange = $1;
   ```
   - Ensure requested limit doesn't exceed `max_klines_per_request`
5. **Rate Limiter checks limit**
   ```
   INCR rate_limit:broker:{exchange}:{userId}:minute
   EXPIRE rate_limit:broker:{exchange}:{userId}:minute 60
   GET rate_limit:broker:{exchange}:{userId}:minute
   ```
   - Bybit: 120 requests/minute (default)
   - Binance: 1200 requests/minute (default)
   - If exceeded → Return 429 "Rate limit exceeded"
6. **Broker Controller selects appropriate adapter**
7. **Exchange Adapter makes API call**

   **For Ticker (type=ticker):**
   - Bybit: `GET /v5/market/tickers?category=spot&symbol=BTCUSDT`
   - Binance: `GET /api/v3/ticker/24hr?symbol=BTCUSDT`

   **For Klines (type=klines):**
   - Bybit: `GET /v5/market/kline?category=spot&symbol=BTCUSDT&interval=60&limit=1000`
   - Binance: `GET /api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000`

8. **Exchange Adapter normalizes response** (different formats between exchanges)
9. **Return market data**

#### Outputs (REST)

**Success Response - Ticker (200 OK):**
```json
{
  "success": true,
  "data": {
    "type": "ticker",
    "symbol": "BTCUSDT",
    "exchange": "bybit",
    "lastPrice": 45250.50,
    "bidPrice": 45249.00,
    "askPrice": 45251.00,
    "volume24h": 12345.67,
    "quoteVolume24h": 558432156.78,
    "priceChange24h": 1035.50,
    "priceChange24hPct": 2.34,
    "high24h": 46000.00,
    "low24h": 44000.00,
    "timestamp": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Klines (200 OK):**
```json
{
  "success": true,
  "data": {
    "type": "klines",
    "symbol": "BTCUSDT",
    "exchange": "bybit",
    "interval": "1h",
    "candles": [
      {
        "openTime": "2024-12-01T00:00:00Z",
        "closeTime": "2024-12-01T00:59:59Z",
        "open": 44500.00,
        "high": 44750.00,
        "low": 44400.00,
        "close": 44700.00,
        "volume": 125.5,
        "quoteVolume": 5593875.00
      },
      {
        "openTime": "2024-12-01T01:00:00Z",
        "closeTime": "2024-12-01T01:59:59Z",
        "open": 44700.00,
        "high": 45000.00,
        "low": 44650.00,
        "close": 44950.00,
        "volume": 145.2,
        "quoteVolume": 6524460.00
      }
    ],
    "count": 1000,
    "earliestTimestamp": "2024-11-20T00:00:00Z",
    "latestTimestamp": "2024-12-01T11:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "limit": 1000,
    "exchangeMaxLimit": 1000
  }
}
```

---

## Part B: WebSocket for Real-Time Updates

#### Inputs
**WebSocket Endpoint:** `wss://api.yieldly.io/ws/market-data`

**Connection Parameters:**
```
wss://api.yieldly.io/ws/market-data?token={jwt}
```

**Subscription Message:**
```json
{
  "action": "subscribe",
  "channel": "ticker",
  "exchange": "bybit",
  "symbols": ["BTCUSDT", "ETHUSDT"]
}
```

**Subscription Types:**
- `ticker`: Real-time price updates
- `kline`: Real-time candlestick updates (specify interval)
- `trade`: Recent trades (optional)

#### Process Steps (WebSocket)

1. **Client connects to WebSocket endpoint**
   ```
   wss://api.yieldly.io/ws/market-data?token={jwt}
   ```
2. **WebSocket Gateway validates JWT**
   - If invalid → Close connection with 4001 "Invalid token"
3. **WebSocket Gateway registers connection**
   ```
   SET ws:connection:{connectionId} {userId}
   EXPIRE ws:connection:{connectionId} 3600
   ```
4. **Client sends subscription request**
   ```json
   {
     "action": "subscribe",
     "channel": "ticker",
     "exchange": "bybit",
     "symbols": ["BTCUSDT", "ETHUSDT"]
   }
   ```
5. **WebSocket Manager validates subscription**
   - Check exchange is valid
   - Check symbols exist
   - Limit: Max 50 symbols per connection
6. **WebSocket Manager registers subscription**
   ```
   SADD ws:subscriptions:{exchange}:{symbol} {connectionId}
   SADD ws:user:{connectionId}:subscriptions {exchange}:{symbol}
   ```
7. **WebSocket Manager establishes exchange connection (if not exists)**
   - Connect to exchange WebSocket if not already connected
   - Bybit: `wss://stream.bybit.com/v5/public/spot`
   - Binance: `wss://stream.binance.com:9443/ws`
8. **Exchange stream receives data**
   - Parse and normalize incoming data
9. **WebSocket Manager broadcasts to subscribed clients**
   ```go
   func broadcastToSubscribers(exchange, symbol string, data MarketData) {
     connectionIds := redis.SMembers(fmt.Sprintf("ws:subscriptions:%s:%s", exchange, symbol))
     for _, connId := range connectionIds {
       wsConn := getConnection(connId)
       wsConn.WriteJSON(data)
     }
   }
   ```
10. **Client receives real-time updates**

#### WebSocket Messages

**Subscribe Confirmation:**
```json
{
  "type": "subscribed",
  "channel": "ticker",
  "exchange": "bybit",
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "timestamp": "2024-12-01T12:00:00Z"
}
```

**Ticker Update:**
```json
{
  "type": "ticker",
  "exchange": "bybit",
  "symbol": "BTCUSDT",
  "data": {
    "lastPrice": 45250.50,
    "bidPrice": 45249.00,
    "askPrice": 45251.00,
    "volume24h": 12345.67,
    "priceChange24hPct": 2.34,
    "timestamp": "2024-12-01T12:00:01.234Z"
  }
}
```

**Kline Update:**
```json
{
  "type": "kline",
  "exchange": "bybit",
  "symbol": "BTCUSDT",
  "interval": "1h",
  "data": {
    "openTime": "2024-12-01T11:00:00Z",
    "open": 45100.00,
    "high": 45300.00,
    "low": 45050.00,
    "close": 45250.50,
    "volume": 85.2,
    "isClosed": false
  }
}
```

**Unsubscribe:**
```json
{
  "action": "unsubscribe",
  "channel": "ticker",
  "exchange": "bybit",
  "symbols": ["ETHUSDT"]
}
```

**Error Message:**
```json
{
  "type": "error",
  "code": "INVALID_SYMBOL",
  "message": "Symbol INVALIDUSDT not found on bybit",
  "timestamp": "2024-12-01T12:00:00Z"
}
```

**Heartbeat (every 30 seconds):**
```json
{
  "type": "ping"
}
```

**Heartbeat Response:**
```json
{
  "type": "pong"
}
```

---

## Recommended Usage Pattern

**Initial Chart Load (REST + WebSocket):**

1. **Frontend requests initial chart data via REST:**
   ```
   GET /api/v1/broker/market-data?exchange=bybit&symbol=BTCUSDT&type=klines&interval=1h&limit=1000
   ```
   - Gets last 1000 candles for full chart display

2. **Frontend establishes WebSocket connection:**
   ```
   wss://api.yieldly.io/ws/market-data?token={jwt}
   ```

3. **Frontend subscribes to real-time updates:**
   ```json
   {
     "action": "subscribe",
     "channel": "kline",
     "exchange": "bybit",
     "symbols": ["BTCUSDT"],
     "interval": "1h"
   }
   ```

4. **Frontend receives real-time kline updates and appends to chart**

---

#### Success Criteria
- REST: Market data retrieved from exchange, normalized
- WebSocket: Real-time updates streaming to subscribed clients
- Both: Response normalized across exchanges
- HTTP 200 OK / WebSocket messages delivered

#### Error Scenarios

| Error | Code | Handling |
|-------|------|----------|
| Rate limit exceeded (REST) | 429 | Return "Rate limit exceeded, try again in X seconds" |
| Invalid symbol | 400 | Return "Invalid symbol" |
| Exchange API error | 502 | Return "Exchange temporarily unavailable" |
| Timeout | 504 | Return "Request timeout" |
| Limit exceeds max (REST) | 400 | Return "Limit exceeds exchange maximum of {max}" |
| WebSocket auth failed | 4001 | Close connection "Invalid token" |
| WebSocket subscription limit | 4002 | Error message "Max 50 symbols per connection" |
| WebSocket exchange disconnected | N/A | Auto-reconnect, buffer messages |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for REST)
- **NFR-PERF-002**: Real-time Data Latency (< 100ms from exchange to client)
- **NFR-SCALE-004**: WebSocket Connections (10,000+ concurrent per instance)

**Process-Specific Notes:**
- REST P95 latency: < 500ms (includes external API call)
- WebSocket latency: < 100ms from exchange to client
- WebSocket heartbeat: Every 30 seconds
- Connection timeout: 5 minutes of inactivity
- Auto-reconnect: 3 retries with exponential backoff

#### Dependencies

**Cache:**
- Redis (rate limiting, WebSocket connection registry, subscription management)

**External Services:**
- Bybit REST API: `/v5/market/tickers`, `/v5/market/kline`
- Binance REST API: `/api/v3/ticker/24hr`, `/api/v3/klines`
- Bybit WebSocket: `wss://stream.bybit.com/v5/public/spot`
- Binance WebSocket: `wss://stream.binance.com:9443/ws`

**Database:**
- `broker_db` (PostgreSQL) - Tables: `exchange_configurations`
- Verify schema: docs/01-phase/database-schemas/broker_connectivity_db_schema.dbml

#### Notes

**Kline Limit Configuration:**
- Maximum candles per request is configured per exchange in `exchange_configurations`
- Default Bybit: 1000 candles max
- Default Binance: 1000 candles max
- Configured via PROC-BROKER-011 (Manage Exchange API Configuration)

**WebSocket Connection Lifecycle:**
1. Client connects with JWT
2. Client subscribes to channels/symbols
3. Server streams real-time updates
4. Heartbeat every 30 seconds
5. Client unsubscribes or disconnects
6. Server cleans up subscriptions

**Exchange WebSocket Management:**
- Single shared connection per exchange for all users
- Messages multiplexed to subscribed clients
- Auto-reconnect with exponential backoff
- Message buffering during reconnection

**Related Processes:**
- PROC-BROKER-011: Manage Exchange API Configuration (kline limits)
- PROC-BROKER-016: Get Batch Asset Prices (for portfolio pricing)
- PROC-HISTORICAL-001: Query Historical Data (for historical klines)

---

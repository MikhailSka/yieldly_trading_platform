## ADR-028: Real-Time Market Data Architecture

### Status
Proposed

### Context
Yieldly requires access to market data in two distinct ways:

1. **Real-Time Live Data** (Frontend Display)
   - Users need to see live price updates for trading pairs
   - Low latency is critical (< 1 second from exchange to UI)
   - High concurrency (hundreds of users watching same symbols)
   - Primarily for UI display, not trading execution

2. **Historical Data** (Backtesting & Charts)
   - Backtesting engine needs OHLCV data from TimescaleDB
   - Frontend charts need historical candles for chart display
   - No real-time requirement (can be slightly stale)
   - High volume (years of data per symbol)
   - Stored centrally to avoid repeated exchange API calls

**Challenges:**
- Avoid creating N exchange connections for N users (expensive, rate-limited)
- Minimize latency for real-time data (avoid complex routing)
- Reduce traffic duplication through multiple service layers
- Simplify frontend integration
- Respect exchange rate limits

### Decision
Implement a **hybrid dual-path architecture** with:
- **Path 1:** Direct/semi-direct frontend connections to exchanges for real-time data (minimal routing)
- **Path 2:** Centralized historical data storage in Historical Data Service (for backtesting and charts)
- **Data Ingestion:** Broker Connectivity Service downloads candles and stores in Historical Data Service

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                       │
│                                                                  │
│  ┌────────────────┐              ┌────────────────┐            │
│  │ Price Charts   │              │ Trading View   │            │
│  │ (Live Prices)  │              │ (Ticker Data)  │            │
│  └────────────────┘              └────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
         │                              │
         │ WebSocket (Path 1)           │ REST API (Historical Candles)
         │ Real-Time Data               │
         ▼                              ▼
┌──────────────────────────────────────────────────────────────────┐
│           API GATEWAY / WebSocket Proxy (Node.js)                │
│         (Aggregates & Broadcasts Real-Time Data)                 │
│         (Serves Historical Candles via REST API)                 │
└──────────────────────────────────────────────────────────────────┘
         │                              │
         │ WebSocket Connection         │ Query Historical Data
         │ (Singleton per symbol)       │
         ▼                              ▼
┌──────────────────────┐    ┌──────────────────────────────────────┐
│  EXCHANGE APIs       │    │  HISTORICAL DATA SERVICE             │
│  (Bybit, Binance)    │    │         ↓                            │
│  WebSocket Feeds     │    │    TimescaleDB (historical_data_db)  │
└──────────────────────┘    └──────────────────────────────────────┘
         │                              ▲
         │ (Candle Downloads)           │ (Used by)
         ▼                              │
┌──────────────────────────────────────┐│
│  BROKER CONNECTIVITY SERVICE         ││
│  (Downloads & Stores Candles)        ││
└──────────────────────────────────────┘│
         │                              │
         └──────────────────────────────┘
                                        │
                                        ▼
                        ┌──────────────────────────────────────┐
                        │      BACKTESTING SERVICE             │
                        │  (Direct read from TimescaleDB)      │
                        └──────────────────────────────────────┘
```

### Path 1: Real-Time Data (Frontend Display)

**Chosen Approach: Frontend → API Gateway (WebSocket Proxy) → Exchange**

**Diagram:**
```
Multiple Frontends ─┬──> API Gateway (Node.js WebSocket Proxy) ──> Bybit
                    ├──> (Maintains 1 connection per symbol)    ──> Binance
                    └──> (Broadcasts to all subscribed clients)
```

**Implementation:**
- **Technology:** Node.js (excellent WebSocket support, easy frontend integration)
- **API Gateway acts as WebSocket proxy/aggregator**
- **Maintains singleton connection to exchange per trading pair**
- **Broadcasts exchange updates to all subscribed frontend clients**

**Data Flow:**
```
1. User opens trading chart for BTCUSDT
2. Frontend connects to API Gateway WebSocket:
   wss://api.yieldly.io/ws/market/live
3. Frontend subscribes: { "action": "subscribe", "symbol": "BTCUSDT", "exchange": "bybit" }
4. API Gateway checks if already connected to Bybit for BTCUSDT:
   - If YES → Add client to broadcast list
   - If NO → Open new connection to Bybit, start broadcasting
5. Bybit sends update: { "symbol": "BTCUSDT", "price": 67000, "timestamp": ... }
6. API Gateway broadcasts to all subscribed clients (minimal transformation)
7. Frontend receives update, renders on chart (< 500ms total latency)
```

**Subscription Management:**
```javascript
// Frontend subscribes to symbol
{
  "action": "subscribe",
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "exchange": "bybit",
  "data_type": "ticker"  // or "trades", "orderbook"
}

// Frontend unsubscribes
{
  "action": "unsubscribe",
  "symbols": ["BTCUSDT"]
}

// API Gateway broadcasts
{
  "type": "ticker",
  "exchange": "bybit",
  "symbol": "BTCUSDT",
  "data": {
    "price": 67000,
    "volume_24h": 1234567,
    "change_24h": 2.5,
    "timestamp": 1730000000
  }
}
```

**Connection Pooling (Key Feature):**
- API Gateway maintains **1 WebSocket connection per (exchange, symbol) pair**
- Example: 100 users watching BTCUSDT = 1 connection to Bybit, 100 client connections to gateway
- When last client unsubscribes, gateway keeps connection open for 5 minutes (connection warmth)
- If no resubscribe within 5 minutes, gateway closes exchange connection

**Rate Limiting:**
- Exchange connections managed centrally (respect Bybit 120/min, Binance 1200/min)
- No client can cause rate limit violations
- Gateway queues subscription requests if needed

**Technology Choice: Node.js**
- Excellent WebSocket support (ws library, socket.io)
- Same ecosystem as Next.js frontend (easy integration)
- Event-driven architecture (perfect for WebSocket fanout)
- Can share types/interfaces with frontend (TypeScript)

### Path 2: Historical Data Storage (Backtesting & Charts)

**Architecture:**

```
┌──────────────────────────────────────────────────────────────────┐
│            BROKER CONNECTIVITY SERVICE                           │
│         (Downloads Candles via Scheduled Jobs or On-Demand)      │
└──────────────────────────────────────────────────────────────────┘
              │
              │ REST API Calls (Scheduled/On-Demand)
              ▼
┌──────────────────────────────────────────────────────────────────┐
│                  EXCHANGE REST APIs                              │
│              (Historical OHLCV Endpoints)                        │
└──────────────────────────────────────────────────────────────────┘
              │
              │ Store OHLCV Data
              ▼
┌──────────────────────────────────────────────────────────────────┐
│              HISTORICAL DATA SERVICE                             │
│                      ↓                                           │
│                 TimescaleDB (historical_data_db)                 │
│         (OHLCV data, 200-300 symbols)                           │
└──────────────────────────────────────────────────────────────────┘
              │                              │
              │ Direct Query                 │ Via API Gateway
              ▼                              ▼
┌──────────────────────┐      ┌──────────────────────────────────┐
│  BACKTESTING SERVICE │      │  FRONTEND (Charts)               │
│  (Direct DB Access)  │      │  GET /api/v1/candles/:symbol     │
└──────────────────────┘      └──────────────────────────────────┘
```

**Data Ingestion Flow:**

**Option A: Admin-Triggered Download (Initial Data Load)**
```
1. Admin requests historical data download via Admin Panel:
   - Exchange: Bybit
   - Symbol: BTCUSDT
   - Timeframe: 5m
   - Date Range: 2023-01-01 to 2025-10-26

2. Admin Panel → API Gateway → Broker Connectivity Service

3. Broker Connectivity Service checks what's already stored in TimescaleDB:
   Query Historical Data Service: GET /api/v1/historical/check?symbol=BTCUSDT&timeframe=5m

4. If data missing, Broker Connectivity Service calls exchange REST API:
   GET /v5/market/kline?symbol=BTCUSDT&interval=5&start=...&end=...

5. Exchange returns OHLCV data (paginated, may require multiple requests)

6. Broker Connectivity Service stores in Historical Data Service via REST API:
   POST /api/v1/historical/candles
   {
     "symbol": "BTCUSDT",
     "exchange": "bybit",
     "timeframe": "5m",
     "candles": [
       { "timestamp": ..., "open": ..., "high": ..., "low": ..., "close": ..., "volume": ... },
       ...
     ]
   }

7. Historical Data Service validates data quality (no gaps, correct ordering)

8. Historical Data Service inserts into TimescaleDB (historical_data_db):
   INSERT INTO ohlcv (symbol, exchange, timeframe, timestamp, open, high, low, close, volume)

9. Historical Data Service marks data as "available" for backtesting
```

**Option B: Automated Incremental Updates (Daily Sync)**
```
1. Broker Connectivity Service runs scheduled cron job (daily at 00:30 UTC)

2. For each tracked symbol in database:
   - Query Historical Data Service for last timestamp:
     GET /api/v1/historical/last-timestamp?symbol=BTCUSDT&timeframe=5m

3. Call exchange REST API to download candles since last timestamp:
   GET /v5/market/kline?symbol=BTCUSDT&interval=5&start=<last_timestamp>

4. Store new candles via Historical Data Service REST API

5. Backfill any detected gaps automatically

6. Log completion, send notification if failures
```

**Option C: On-Demand Download (Triggered by Backtest)**
```
1. User initiates backtest requiring data not yet in database

2. Backtesting Service detects missing data, sends event to Broker Connectivity Service:
   Event: { "type": "data.missing", "symbol": "BTCUSDT", "timeframe": "5m", "start": ..., "end": ... }

3. Broker Connectivity Service downloads missing data from exchange

4. Stores in Historical Data Service

5. Sends completion event back to Backtesting Service

6. Backtesting Service proceeds with backtest
```

**Backtesting Data Access:**

Direct Database Access (Recommended for Performance):
```
┌──────────────────┐          ┌──────────────────┐
│ Backtesting Svc  │ ───────> │  TimescaleDB     │
│  (Python)        │  Direct  │  (Historical)    │
└──────────────────┘   Query  └──────────────────┘
```

Why Direct Access:
- Backtesting is compute-intensive, needs fast data access
- Reads millions of rows (years of 5-minute candles)
- No need for REST API overhead
- TimescaleDB optimized for time-series queries
- PostgreSQL connection pooling handles concurrency

Security:
- Backtesting Service has read-only database credentials
- Connection pooling (max 50 connections)
- Query timeouts (30 seconds)

### Available Symbols & Metadata

**Symbol Directory Service:**

Storage: Historical Data Service database (separate table in `historical_data_db`)

Schema:
```sql
CREATE TABLE available_symbols (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol          VARCHAR(20) NOT NULL,
    base_currency   VARCHAR(10) NOT NULL,
    quote_currency  VARCHAR(10) NOT NULL,
    exchange        VARCHAR(20) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    listed_at       TIMESTAMP,
    delisted_at     TIMESTAMP,
    metadata        JSONB,
    last_updated    TIMESTAMP NOT NULL DEFAULT NOW(),

    UNIQUE (symbol, exchange)
);
```

Data Source:
- Downloaded from exchange metadata APIs (daily sync)
- Bybit: `/v5/market/instruments-info`
- Binance: `/api/v3/exchangeInfo`

Frontend Access:
```
GET /api/v1/market/symbols?exchange=bybit&status=active
```

Used By:
- Strategy builder (user selects symbol for backtesting)
- Real-time data subscription (user selects symbol to watch)
- Admin panel (download historical data for specific symbol)

### Deployment Architecture

**API Gateway / WebSocket Proxy (Node.js):**
- Deployed on Azure Kubernetes Service (AKS)
- Auto-scaling: 2-5 pods based on WebSocket connection count
- Health check: `/health` endpoint
- Stateless (can scale horizontally)

**Load Balancing for WebSocket:**
- Nginx Ingress with sticky sessions (session affinity by client IP)
- Ensures client reconnects to same pod
- Or use Azure Application Gateway with WebSocket support

### Frontend Data Access Patterns

**Real-Time Price Updates (Live Ticker):**
```
Frontend → API Gateway (WebSocket) → Exchange WebSocket
           wss://api.yieldly.io/ws/market/live
           { "action": "subscribe", "symbol": "BTCUSDT" }
```

**Historical Candles for Charts (OHLCV):**
```
Frontend → API Gateway (REST) → Historical Data Service → TimescaleDB
           GET /api/v1/candles?symbol=BTCUSDT&timeframe=5m&start=...&end=...
```

**Unified Frontend Architecture:**
- Single API Gateway entry point for both real-time and historical data
- No direct frontend connection to exchanges
- Consistent authentication (JWT) for all requests
- Simplified frontend code (one API client)

### Data Flow Summary

**Real-Time Price Display:**
```
Exchange → API Gateway WebSocket Proxy (Node.js) → Frontend (WebSocket)
          (1 connection per symbol)                 (N client connections)
```

**Historical Data for Backtesting:**
```
Exchange REST API → Broker Connectivity Service → Historical Data Service → TimescaleDB → Backtesting Service
    (Admin/Scheduled)      (Downloads)              (Validates/Stores)      (Storage)      (Direct query)
```

**Symbol Directory:**
```
Exchange Metadata API → Broker Connectivity Service → Historical Data Service → TimescaleDB → Frontend / Services
      (Daily sync)              (Fetches)                  (Stores)              (Cache)       (REST API)
```

### Rate Limiting Strategy

**Exchange Rate Limits:**
- **Bybit:** 120 requests/min (WebSocket: 100 connections)
- **Binance:** 1200 requests/min (weight-based)

**WebSocket Proxy Rate Limits:**
- Max 1000 client connections per pod
- Max 100 symbols subscribed per pod
- Max 50 symbols subscribed per client
- Auto-scale pods if limits reached

**Caching:**
- Symbol directory: Redis cache (1-hour TTL)
- Last known prices: Redis cache (30-second TTL) for initial page load

### Monitoring & Observability

**Metrics to Track:**
- WebSocket connection count (total, per symbol)
- Exchange connection count
- Message throughput (messages/sec)
- Latency: Exchange → Proxy → Client (P50, P95, P99)
- Reconnection rate (exchange connection drops)
- Client disconnection rate

**Alerts:**
- Exchange WebSocket disconnected (critical)
- Latency > 2 seconds (warning)
- Connection count > 800 (warning, scale up)
- Message delivery failures > 5% (critical)

### Error Handling

**Exchange Disconnection:**
```
1. Detect disconnect
2. Attempt reconnection (exponential backoff: 1s, 2s, 4s, 8s)
3. If reconnect fails after 5 attempts, alert operations
4. Send error message to subscribed clients:
   { "type": "error", "message": "Live data temporarily unavailable" }
5. Frontend shows "Reconnecting..." indicator
```

**Client Disconnection:**
```
1. Detect client disconnect (TCP close, timeout)
2. Remove client from subscriber registry
3. Check if last subscriber for a symbol
4. If yes, schedule exchange connection close (5-minute delay)
```

### Security Considerations

**WebSocket Authentication:**
```
Client → WebSocket connection with JWT token
wss://api.yieldly.io/ws/market/live?token=<jwt>

Proxy validates JWT on connection:
- Valid? → Allow connection
- Invalid? → Close connection with 401 error
```

**Rate Limiting (Per User):**
- Max 50 symbols subscribed per user
- Max 10 subscription requests per minute per user
- Enforce via JWT user_id claim

**DDoS Protection:**
- Cloudflare or Azure Front Door in front of WebSocket proxy
- Rate limiting by IP
- Connection limits per IP

### Future Enhancements (Phase 2+)

1. **Message Compression:** Compress WebSocket messages (gzip, zlib)
2. **Binary Protocol:** Use binary format (MessagePack, Protobuf) instead of JSON
3. **Smart Subscription:** Suggest popular symbols to users
4. **Collaborative Viewing:** Show "X users watching this symbol"
5. **Historical Replay:** Replay historical price movements for analysis

### Alternatives Considered

**Alternative 1: Server-Sent Events (SSE) instead of WebSocket**
- **Pros:** Simpler than WebSocket, HTTP/2 support
- **Cons:** Unidirectional (server → client only), less efficient
- **Decision:** Rejected - WebSocket preferred for bidirectional communication

**Alternative 2: Polling (REST API every 1 second)**
- **Pros:** Simplest implementation
- **Cons:** High server load, high latency, wasteful (most polls return no new data)
- **Decision:** Rejected - unacceptable for real-time data

**Alternative 3: GraphQL Subscriptions**
- **Pros:** Flexible query language
- **Cons:** Added complexity, WebSocket under the hood anyway
- **Decision:** Rejected - unnecessary abstraction for Phase 1

### Unified Architecture Benefits

**Single Responsibility Per Service:**
- **API Gateway:** WebSocket proxy for real-time data + REST API for historical data
- **Broker Connectivity Service:** Downloads candles from exchanges (scheduled + on-demand)
- **Historical Data Service:** Validates, stores, and serves historical OHLCV data
- **Backtesting Service:** Consumes historical data for strategy simulation

**Data Flow Consolidation:**
All data ingestion flows through Broker Connectivity Service:
- ✅ Admin-triggered downloads (initial data load)
- ✅ Scheduled incremental updates (daily sync)
- ✅ On-demand downloads (triggered by backtest)
- ✅ Symbol metadata sync (exchange info)

**Frontend Simplification:**
Single API Gateway for all market data needs:
- ✅ Real-time prices via WebSocket
- ✅ Historical candles via REST API
- ✅ Symbol directory via REST API
- ✅ No direct exchange connections from frontend
- ✅ Consistent authentication and error handling

**Scalability:**
- Broker Connectivity Service can scale horizontally for concurrent downloads
- Historical Data Service can scale for read-heavy workloads
- API Gateway can scale for WebSocket connections
- TimescaleDB handles time-series data efficiently

### Related ADRs
- ADR-002: Database Choice (TimescaleDB for historical data, separate `historical_data_db`)
- ADR-017: Service Division and Boundaries (Broker Connectivity Service responsibilities)
- ADR-021: Broker Integration & Connectivity (exchange API integration)
- ADR-025: Market Data Flow & Caching (historical data caching strategies)

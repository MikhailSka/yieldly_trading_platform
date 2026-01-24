# ADR-025: Market Data Flow & Caching Strategy (Updated)

**Status:** Accepted  
**Date:** 2025-10-29  
**Updated:** 2025-11-03

## Context
Platform needs efficient market data access for multiple services (Backtesting, Portfolio, displays). Historical data volumes are massive - real-world experience shows gigabytes of data even with 5-15 minute candles for all coins. Need to balance performance, cost, and complexity. TimescaleDB chosen specifically for time-series optimization (ADR-002) and should be leveraged directly for its strengths.

## Decision
Implement TimescaleDB-first architecture with selective, minimal caching only where proven necessary. Store smallest timeframe (1-minute), aggregate up for larger timeframes on read. Leverage TimescaleDB's built-in optimization features (compression, continuous aggregates, indexing) rather than adding complexity with external caching layers.

**Updated:** Historical Data Service requests all exchange data downloads through **Broker Connectivity Service** (unified interface) rather than directly calling exchange APIs.

## Rationale

**TimescaleDB Is Purpose-Built for This**
- Specifically chosen in ADR-002 for time-series optimization
- Built-in features for fast time-range queries
- Automatic partitioning (hypertables) optimizes query performance
- Native compression reduces storage and improves I/O performance
- Adding Redis caching layer may be premature optimization

**Avoid Premature Optimization**
- TimescaleDB can handle our query load efficiently with proper configuration
- Redis adds operational complexity (another service to manage, monitor, sync)
- Cache invalidation complexity for time-series data
- Start simple, add caching only when measurements show it's needed
- "Measure first, optimize second" principle

**Continuous Aggregates (TimescaleDB Feature)**
- TimescaleDB can pre-compute and maintain aggregated views
- Materialized views automatically updated as new data arrives
- Eliminates need for application-level aggregation
- Much simpler than managing Redis cache keys for different timeframes

**Broker Service as Unified Interface**
- Historical Data Service delegates all exchange interactions to Broker Connectivity Service
- Prevents duplication of exchange-specific adapters across services
- Consistent rate limiting and credential management
- Single point of truth for exchange API logic
- Easier to add new exchanges without modifying Historical Data Service

**Query Performance with Proper Indexing**
- Composite indexes on (symbol, timestamp) provide fast lookups
- Partition pruning automatically excludes irrelevant time ranges
- Query planner optimized for time-series access patterns
- Real-world TimescaleDB deployments handle billions of rows efficiently

**Simpler Architecture**
- One source of truth (no sync issues between cache and DB)
- Fewer moving parts to maintain and monitor
- Easier to reason about and debug
- Lower operational overhead for solo developer

## Architecture

```
┌─────────────────────────────────────────┐
│  Broker APIs (Bybit, Binance, etc.)    │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│  Broker Connectivity Service            │
│  - Unified interface for all exchanges  │
│  - Handles rate limiting                │
│  - Manages API credentials              │
│  - Fetches historical data on request   │
└────────────┬────────────────────────────┘
             │ Called by
             ↓
┌─────────────────────────────────────────┐
│  Historical Data Service                │
│  - Requests data via Broker Service     │
│  - Validates downloaded data            │
│  - Stores to TimescaleDB                │
└────────────┬────────────────────────────┘
             │ Stores to
             ↓
┌─────────────────────────────────────────┐
│  TimescaleDB - Historical Data DB       │
│  - All historical candles (1-minute)    │
│  - Continuous aggregates (5m,15m,1h,4h) │
│  - Compressed, partitioned by time      │
│  - Indexed for fast queries             │
│  - Single source of truth               │
└────────────┬────────────────────────────┘
             │ Services read directly
             ↓
┌─────────────────────────────────────────┐
│  Consuming Services                     │
│  - Backtesting Service                  │
│  - Portfolio Service                    │
│  - Market Data displays                 │
│  - Strategy Service                     │
└─────────────────────────────────────────┘

Optional (add only if measurements show need):
┌─────────────────────────────────────────┐
│  Application-Level Cache (Redis)        │
│  - ONLY for proven bottlenecks          │
│  - Hot path: Latest prices only         │
│  - Minimal complexity                   │
└─────────────────────────────────────────┘
```

## Data Flow Details

**Write Path (Admin Data Download):**
1. Admin triggers data download from Historical Data Service
2. Historical Data Service calls Broker Connectivity Service API:
   - `GET /api/v1/brokers/historical?broker=binance&symbol=BTCUSDT&interval=1m&from=...&to=...`
3. Broker Service fetches 1-minute candles from specified exchange
4. Broker Service returns data to Historical Data Service
5. Historical Data Service validates data quality
6. Historical Data Service stores to TimescaleDB
7. TimescaleDB automatically updates continuous aggregates
8. Compression policy applies to data older than 7 days

**Why Through Broker Service:**
- Unified rate limiting across all services
- No need for Historical Data Service to maintain Bybit/Binance adapters
- Easier to add new exchanges (change only Broker Service)
- Single point of credential management
- Consistent error handling and retry logic

**Read Path (Normal Operation):**
1. Service requests data: `getCandleData(symbol, timeframe, start, end)`
2. Query TimescaleDB directly:
   - If timeframe = 1-minute: Query base hypertable
   - If timeframe > 1-minute: Query continuous aggregate (pre-computed)
3. TimescaleDB query planner:
   - Uses partition pruning (only scans relevant time chunks)
   - Uses index scan on (symbol, timestamp)
   - Reads compressed data efficiently
4. Return results to requesting service

**Update Path (New Data):**
1. Broker Service receives new candle (WebSocket or polling)
2. Historical Data Service retrieves new data via Broker Service API
3. Write to TimescaleDB
4. Continuous aggregates automatically refresh
5. (Optional) Publish update event to Service Bus for real-time displays

## TimescaleDB Optimization Features

**1. Hypertables (Automatic Partitioning)**
```sql
-- Create hypertable on candles table
SELECT create_hypertable('candles', 'timestamp',
  chunk_time_interval => INTERVAL '1 day');
```
- Automatically partitions data by time
- Query planner only scans relevant chunks
- Massive performance improvement for time-range queries

**2. Continuous Aggregates (Pre-computed Views)**
```sql
-- 5-minute continuous aggregate
CREATE MATERIALIZED VIEW candles_5m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', timestamp) AS bucket,
  symbol,
  FIRST(open, timestamp) AS open,
  MAX(high) AS high,
  MIN(low) AS low,
  LAST(close, timestamp) AS close,
  SUM(volume) AS volume
FROM candles
GROUP BY bucket, symbol;

-- Refresh policy: automatically update as new data arrives
SELECT add_continuous_aggregate_policy('candles_5m',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');
```

**Supported Timeframes (via Continuous Aggregates):**
- `candles` - Base table (1-minute data)
- `candles_5m` - 5-minute aggregates
- `candles_15m` - 15-minute aggregates
- `candles_1h` - 1-hour aggregates
- `candles_4h` - 4-hour aggregates
- `candles_1d` - 1-day aggregates

**Benefits:**
- Pre-computed, always up-to-date
- Querying aggregates is extremely fast (already computed)
- No application-level aggregation logic needed
- No cache invalidation complexity

**3. Compression**
```sql
-- Enable compression on older data
ALTER TABLE candles SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol'
);

-- Compression policy: compress data older than 7 days
SELECT add_compression_policy('candles', INTERVAL '7 days');
```
- 10-20x compression ratio typical for time-series data
- Compressed data still queryable (transparent decompression)
- Significant storage cost savings
- Improved I/O performance (less data to read)

**4. Indexing Strategy**
```sql
-- Primary index (already created with hypertable)
CREATE INDEX idx_candles_symbol_time ON candles (symbol, timestamp DESC);

-- Secondary indexes for common query patterns
CREATE INDEX idx_candles_symbol ON candles (symbol);
CREATE INDEX idx_candles_broker_symbol ON candles (broker, symbol);
```

**5. Retention Policies**
```sql
-- Automatically drop data older than 3 years
SELECT add_retention_policy('candles', INTERVAL '3 years');
```

## Performance Characteristics

**Expected Query Performance (with proper configuration):**
- Recent data (last 7 days, uncompressed): 10-50ms
- Historical data (compressed): 50-200ms
- Continuous aggregate queries: 5-20ms
- Large backtest data pulls (1 year): 1-3 seconds

**Benchmark Targets:**
| Query Type | Target P95 | Notes |
|------------|-----------|-------|
| Latest price (1 candle) | < 10ms | Most recent data |
| Recent range (7 days) | < 100ms | Uncompressed data |
| Historical range (1 year) | < 2s | Compressed, large dataset |
| Aggregate query (5m, 1 year) | < 500ms | Pre-computed continuous aggregate |

## When to Consider Adding Cache

**Add Redis caching ONLY if measurements show:**
1. **Latest Price Queries** become bottleneck
   - If > 1000 requests/sec for latest prices
   - Cache only: `latest_price:{symbol}` (TTL: 60 seconds)
   - Single simple cache key pattern

2. **Specific Hot Queries** identified through monitoring
   - Monitor query logs for repeated identical queries
   - Cache only proven hot queries
   - Keep cache strategy simple and targeted

**Do NOT cache:**
- Historical data ranges (TimescaleDB handles efficiently)
- Aggregated timeframes (use continuous aggregates instead)
- Infrequently accessed data (cache miss overhead not worth it)

**Caching Decision Tree:**
```
Query slow?
  → Yes: Is it repeated frequently?
    → Yes: Is TimescaleDB properly configured? (indexes, compression, aggregates)
      → Yes: Consider targeted caching
      → No: Fix TimescaleDB configuration first
    → No: No cache needed (one-off slow query acceptable)
  → No: No optimization needed
```

## Data Download Strategy (Admin)

**Bulk Download Process:**
1. Admin triggers download via Historical Data Service API
2. Historical Data Service calls Broker Service with parameters:
   - `broker` (bybit, binance)
   - `symbol` (BTCUSDT)
   - `interval` (1m)
   - `from/to` timestamps
3. Broker Service handles exchange-specific API calls
4. Historical Data Service validates received data
5. Batch insert to TimescaleDB (1000-5000 rows per transaction)
6. Progress tracking with resume capability

**Initial Seed:**
- Bybit: Download last 2 years of BTC, ETH, top 20 coins
- Binance: Download for data-rich pairs
- 1-minute candles for all (smallest available timeframe)

**Ongoing Updates:**
- Scheduled jobs to fetch new data daily (or hourly)
- Alternative: Real-time WebSocket updates via Broker Service
- Gap detection and automatic backfill

## Integration with Services

**Historical Data Service:**
- Does NOT directly call exchange APIs
- Uses Broker Service API for all data downloads
- Validates data quality before storage
- Manages TimescaleDB schema and policies

**Backtesting Service:**
- Direct database access for heavy operations (as per ADR-017)
- Queries continuous aggregates for larger timeframes
- Efficient batch reads for backtest periods
- No API overhead for large data pulls

**Portfolio Service:**
- Queries latest candle for current prices
- Simple query: `SELECT * FROM candles WHERE symbol = ? ORDER BY timestamp DESC LIMIT 1`
- Falls back to Broker Service API if data stale

**Market Data API Service:**
- Exposes REST API wrapping TimescaleDB queries
- Rate limiting per user
- Pagination for large results (per ADR-029)
- Returns data directly from TimescaleDB (or continuous aggregates)

## Performance Monitoring

**Metrics to Track:**
- Query response time (P50, P95, P99) per query type
- Slow query log (queries > 500ms)
- Database CPU and memory usage
- Storage growth rate
- Compression effectiveness
- Continuous aggregate refresh lag
- Broker Service API call count

**Alerting:**
- P95 query time exceeds 1 second
- Slow queries detected (> 2 seconds)
- Database CPU > 80% sustained
- Storage growth exceeds projections
- Continuous aggregate lag > 5 minutes

**Optimization Triggers:**
- If alerts fire consistently, investigate:
  1. Missing indexes?
  2. Compression not applied?
  3. Continuous aggregates not being used?
  4. Query patterns that can be optimized?
  5. **Only then**: Consider targeted caching

## Data Consistency

**Source of Truth:**
- TimescaleDB is the single source of truth
- No distributed cache sync issues
- No cache invalidation complexity
- Strong consistency by default

**Consistency Level:**
- Read-your-writes consistency for new data
- No stale data issues (no cache to go stale)
- Market data rarely changes retroactively (except rare corrections)

## Cost Optimization

**TimescaleDB Storage:**
- Compression drastically reduces costs (10-20x reduction)
- Retention policies automatically drop old data
- Monitor storage growth and project costs
- Consider archiving very old data to blob storage if needed

**Compute:**
- Start with modest instance size
- Scale vertically based on actual load
- TimescaleDB efficient use of resources with proper configuration
- No additional Redis infrastructure costs

**Network:**
- Co-locate services with TimescaleDB (same region/VNet)
- Minimize cross-region queries
- Compression reduces data transfer

## Implementation Phases

**Phase 1A: TimescaleDB Setup**
- Set up TimescaleDB with hypertables
- Download initial dataset (1-minute data via Broker Service)
- Create continuous aggregates for 5m, 15m, 1h, 4h, 1d
- Configure compression policies
- Set up retention policies

**Phase 1B: Query Optimization**
- Create necessary indexes
- Monitor query performance
- Optimize slow queries
- Benchmark common access patterns
- Document baseline performance

**Phase 1C: Validation & Monitoring**
- Set up monitoring and alerting
- Load testing with realistic workloads
- Validate continuous aggregates working correctly
- Fine-tune compression and retention settings

**Phase 2 (If Needed): Targeted Caching**
- **Only if** monitoring shows specific bottlenecks
- Add minimal Redis caching for proven hot paths
- Keep cache strategy simple (e.g., latest prices only)
- Monitor cache effectiveness

## Error Handling

**TimescaleDB Unavailable:**
- Return error to client (503 Service Unavailable)
- Alert critical (P1 incident)
- No data access until resolved
- Consider read-replica for high availability (future)

**Broker Service Unavailable (Data Download):**
- Retry with exponential backoff
- Log failure with details
- Alert if failures persist
- Resume download from last checkpoint

**Data Gap Detected:**
- Log gap with details
- Queue for automatic backfill via Broker Service
- Background job fills gaps
- Monitor gap frequency

**Query Timeout:**
- Set query timeout (30 seconds)
- Return 504 Gateway Timeout
- Log slow query for investigation
- Alert if timeouts become frequent

## Security Considerations

**Access Control:**
- TimescaleDB: Restricted to services only (no public access)
- Each service has dedicated database user with limited permissions
- Backtesting service: Read-only access
- Historical Data Service: Read-write access
- Network-level isolation (private VNet)

**Data Privacy:**
- Market data is public → no privacy concerns
- User portfolios stored separately (Portfolio Service)
- No personal data in market data services

## Alternatives Considered

**Historical Data Service with Direct Exchange API Calls:**
- **Pros:** Fewer network hops
- **Cons:**
  - Duplicates exchange adapter logic
  - Inconsistent rate limiting across services
  - Harder to add new exchanges
  - Multiple services managing exchange credentials
- **Decision:** Use Broker Service as unified interface for all exchange interactions

**Redis Two-Tier Caching (Original Approach):**
- **Pros:** Maximum performance for cache hits
- **Cons:**
  - Operational complexity (another service to manage)
  - Cache invalidation complexity
  - Sync issues between cache and database
  - Memory costs for Redis
  - May be premature optimization
- **Decision:** Not needed initially. TimescaleDB is purpose-built for this exact use case and can handle our load efficiently. Add caching only if measurements prove it necessary.

**Pre-Aggregated Storage (Store All Timeframes):**
- **Pros:** Fastest reads for all timeframes
- **Cons:**
  - Storage explosion (6x storage for 6 timeframes)
  - Write complexity (update all timeframes)
  - Less flexible for ad-hoc timeframes
- **Decision:** Use TimescaleDB continuous aggregates instead. Provides pre-computed performance with automatic maintenance and no storage explosion.

**Cache Everything Aggressively:**
- **Pros:** Maximum cache hit rate
- **Cons:**
  - Expensive (large Redis instance)
  - Complex invalidation logic
  - Diminishing returns (many cache entries rarely accessed)
- **Decision:** Start without caching, add only proven hot paths if needed.

## Related ADRs
- ADR-002: Database Choice (TimescaleDB chosen for time-series optimization)
- ADR-017: Service Division and Boundaries (Backtesting direct DB access)
- ADR-021: Broker Integration Architecture (Unified exchange interface)
- ADR-029: API Design Patterns (Pagination for large result sets)
- ADR-006: Logging and Monitoring (Performance monitoring strategy)

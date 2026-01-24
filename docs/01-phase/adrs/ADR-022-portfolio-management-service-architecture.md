# ADR-022: Portfolio Management Service Architecture (Updated)

**Status:** Accepted
**Date:** 2025-10-29
**Updated:** 2025-11-03

## Context
Users need a unified view of their cryptocurrency portfolio across multiple exchanges (Bybit, Binance). The system must aggregate real-time data, calculate P&L, analyze risk metrics, and provide historical tracking for trend analysis. Portfolio data is critical for user decision-making and must be accurate, performant, and available.

## Decision
Implement a dedicated **Portfolio Service** that:
- Aggregates portfolio data from multiple exchanges via Broker Connectivity Service
- Calculates P&L (realized and unrealized)
- Computes risk metrics (drawdown, volatility, Sharpe ratio)
- **Stores hourly portfolio snapshots** for historical tracking and trend analysis
- Generates charts (equity curves, asset allocation)
- Publishes portfolio-related notification events
- Caches aggregated data to reduce broker API load

## Key Features

### 1. Multi-Exchange Aggregation
**Process:**
- Fetch balances from each connected exchange (via Broker Connectivity Service)
- Normalize currency symbols across exchanges (e.g., BTC vs XBT)
- Calculate USD/USDT equivalent values for all assets
- Combine into unified portfolio view

**Data Sources:**
- Broker Connectivity Service → Bybit API
- Broker Connectivity Service → Binance API
- Historical Data Service → Price data for conversion

### 2. P&L Calculation

**Realized P&L:**
- Calculated from completed transactions
- Tracks: deposits, withdrawals, trades, fees
- Historical transaction log maintained

**Unrealized P&L:**
- Current portfolio value - initial cost basis
- Calculated in real-time based on current prices
- Updates as market prices change

### 3. Risk Metrics

**Drawdown:**
- Track maximum drawdown from peak portfolio value
- Calculate current drawdown percentage
- Alert users when drawdown exceeds threshold

**Volatility:**
- Standard deviation of daily returns
- Annualized volatility calculation
- Risk-adjusted return metrics

**Sharpe Ratio:**
- (Portfolio Return - Risk-Free Rate) / Portfolio Volatility
- Risk-free rate: configurable (default: 2% annual)

### 4. Historical Portfolio Snapshots (New Feature)

**Purpose:**
- Enable trend analysis and performance tracking over time
- Reduce broker API calls for historical data
- Speed up chart generation
- Provide accurate historical portfolio states

**Snapshot Schedule:**
- **Hourly snapshots during market hours** (24/7 for crypto)
- Store: total value, asset breakdown, P&L, timestamp
- Automatic cleanup: keep hourly for 30 days, daily for 1 year, weekly thereafter

**Snapshot Data Structure:**
```json
{
  "snapshot_id": "uuid",
  "user_id": "uuid",
  "timestamp": "2025-11-03T14:00:00Z",
  "total_value_usd": 10523.45,
  "realized_pnl": 523.45,
  "unrealized_pnl": 1250.00,
  "assets": [
    {
      "symbol": "BTC",
      "amount": 0.25,
      "value_usd": 8750.50,
      "exchange": "bybit"
    },
    {
      "symbol": "ETH",
      "amount": 5.0,
      "value_usd": 1772.95,
      "exchange": "binance"
    }
  ],
  "exchanges": [
    {
      "name": "bybit",
      "value_usd": 8750.50,
      "asset_count": 1
    },
    {
      "name": "binance",
      "value_usd": 1772.95,
      "asset_count": 1
    }
  ]
}
```

**Snapshot Storage:**
- Stored in `portfolio_db` (PostgreSQL)
- Indexed on `user_id` and `timestamp`
- Partitioned by month for query performance
- Compressed older snapshots to save storage

### 5. Chart Generation

**Equity Curve:**
- Uses **historical snapshots** instead of real-time queries
- Shows portfolio value over time (1D, 1W, 1M, 3M, 1Y, ALL)
- Compares to benchmark (e.g., BTC, ETH)
- Much faster than querying brokers for each data point

**Asset Allocation:**
- Pie chart of asset breakdown by USD value
- Shows distribution across exchanges
- Color-coded by asset type

**Performance Benefits:**
- Chart generation: < 200ms (from snapshots vs 2-5s from broker queries)
- No broker API rate limits hit
- Consistent historical data even if broker API changes

### 6. Caching Strategy

**Cache Layers:**
1. **Redis Cache** (1-minute TTL)
   - Current portfolio summary
   - Asset breakdown
   - Real-time P&L

2. **Database Snapshots** (hourly)
   - Historical portfolio states
   - Used for charts and trend analysis

**Cache Invalidation:**
- Time-based (TTL expires)
- Event-based (new transaction detected)
- Manual (user force refresh)

## REST API Endpoints

```
GET    /api/v1/portfolio                      - Current portfolio summary
GET    /api/v1/portfolio/assets                - Asset breakdown
GET    /api/v1/portfolio/transactions          - Transaction history (paginated)
GET    /api/v1/portfolio/performance           - Performance metrics (daily/weekly/monthly)
GET    /api/v1/portfolio/pnl                   - Profit and loss (realized/unrealized)
GET    /api/v1/portfolio/risk                  - Risk metrics (drawdown, volatility, Sharpe)
GET    /api/v1/portfolio/charts                - Equity curve and allocation charts
GET    /api/v1/portfolio/history               - Historical portfolio snapshots (NEW)
POST   /api/v1/portfolio/refresh               - Force refresh (bypasses cache)
```

### New Endpoint: Historical Snapshots
```
GET /api/v1/portfolio/history
  ?from=2025-10-01T00:00:00Z
  &to=2025-11-03T23:59:59Z
  &interval=1h  // 1h, 1d, 1w
```

**Response:**
```json
{
  "snapshots": [
    {
      "timestamp": "2025-11-03T14:00:00Z",
      "total_value_usd": 10523.45,
      "realized_pnl": 523.45,
      "unrealized_pnl": 1250.00,
      "asset_count": 3
    }
  ],
  "summary": {
    "total_change_usd": 1523.45,
    "total_change_percent": 16.9,
    "peak_value_usd": 11200.00,
    "max_drawdown_percent": -5.2
  }
}
```

## Service Architecture

### Components

1. **Portfolio Controller**
   - REST API endpoints
   - Request validation
   - Response formatting

2. **Portfolio Aggregator**
   - Fetches data from Broker Connectivity Service
   - Normalizes data across exchanges
   - Aggregates balances

3. **P&L Calculator**
   - Realized P&L from transaction history
   - Unrealized P&L from current positions
   - Historical cost basis tracking

4. **Risk Analyzer**
   - Drawdown calculations
   - Volatility metrics
   - Sharpe ratio computation

5. **Chart Generator**
   - Reads from portfolio snapshots (not broker APIs)
   - Generates equity curves
   - Creates allocation visualizations

6. **Snapshot Scheduler (New Component)**
   - Runs every hour (cron-style)
   - Aggregates current portfolio state
   - Stores snapshot in database
   - Manages snapshot retention policy

7. **Notification Publisher**
   - Publishes events to Azure Service Bus
   - Triggers: significant drawdown, milestone reached

8. **Portfolio Repository**
   - Database access layer
   - CRUD operations for portfolio data
   - Snapshot storage and retrieval

9. **Cache Manager**
   - Redis caching operations
   - Cache invalidation logic
   - TTL management

## Data Flow

### Real-Time Portfolio Query
```
User → API Gateway → Portfolio Service
    ↓
Portfolio Controller → Cache Manager (check cache)
    ↓ (cache miss)
Portfolio Aggregator → Broker Connectivity Service → Exchanges
    ↓
Portfolio Aggregator → P&L Calculator → Risk Analyzer
    ↓
Cache Manager (store in Redis, TTL: 1 min)
    ↓
Response to User
```

### Historical Chart Generation
```
User → API Gateway → Portfolio Service
    ↓
Portfolio Controller → Chart Generator
    ↓
Chart Generator → Portfolio Repository (query snapshots)
    ↓
Portfolio Repository → portfolio_db (fast query, indexed)
    ↓
Chart Generator → Formats chart data
    ↓
Response to User (< 200ms)
```

### Hourly Snapshot Creation
```
Cron Scheduler → Snapshot Scheduler (every hour)
    ↓
Snapshot Scheduler → Portfolio Aggregator (get current state)
    ↓
Portfolio Aggregator → Broker Connectivity Service (if needed)
    ↓
Snapshot Scheduler → Portfolio Repository (save snapshot)
    ↓
Portfolio Repository → portfolio_db
```

## Database Schema

```sql
-- Portfolio snapshots table
CREATE TABLE portfolio_snapshots (
    snapshot_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    snapshot_timestamp TIMESTAMP NOT NULL,
    total_value_usd DECIMAL(20, 8) NOT NULL,
    realized_pnl DECIMAL(20, 8) DEFAULT 0,
    unrealized_pnl DECIMAL(20, 8) DEFAULT 0,
    asset_count INTEGER DEFAULT 0,
    exchange_count INTEGER DEFAULT 0,
    snapshot_data JSONB NOT NULL, -- Full snapshot JSON
    created_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for fast queries
CREATE INDEX idx_portfolio_snapshots_user_timestamp
    ON portfolio_snapshots(user_id, snapshot_timestamp DESC);
CREATE INDEX idx_portfolio_snapshots_user_id
    ON portfolio_snapshots(user_id);

-- Partition by month for better performance
CREATE TABLE portfolio_snapshots_2025_11
    PARTITION OF portfolio_snapshots
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Transaction history table (existing)
CREATE TABLE portfolio_transactions (
    transaction_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    exchange VARCHAR(50) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'trade', 'deposit', 'withdrawal', 'fee'
    asset VARCHAR(20) NOT NULL,
    amount DECIMAL(20, 8) NOT NULL,
    price_usd DECIMAL(20, 8),
    value_usd DECIMAL(20, 8),
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_portfolio_transactions_user_timestamp
    ON portfolio_transactions(user_id, timestamp DESC);
```

## Snapshot Retention Policy

**Retention Schedule:**
- **Last 7 days**: Keep all hourly snapshots
- **Last 30 days**: Keep hourly snapshots
- **Last 1 year**: Keep daily snapshots (aggregate hourly → daily)
- **Older than 1 year**: Keep weekly snapshots (aggregate daily → weekly)

**Cleanup Job:**
- Runs daily at 2 AM UTC
- Aggregates hourly → daily for data older than 30 days
- Aggregates daily → weekly for data older than 1 year
- Deletes raw hourly data after aggregation

## Performance Considerations

### Broker API Load Reduction
**Before (without snapshots):**
- Chart request: 100+ API calls to brokers for historical data
- Time: 2-5 seconds
- Rate limit risk: High

**After (with snapshots):**
- Chart request: 1 database query
- Time: < 200ms
- Rate limit risk: None

### Database Performance
- Partitioned tables by month
- Indexed on user_id and timestamp
- JSONB for flexible snapshot data
- Regular VACUUM and ANALYZE

### Caching Strategy
- Redis for real-time queries (1-minute TTL)
- Database snapshots for historical queries
- No broker API calls for chart generation

## Error Handling

**Broker API Failures:**
- Retry with exponential backoff
- Fall back to cached data if available
- Return partial data if some exchanges fail
- Log errors to Azure Monitor

**Snapshot Creation Failures:**
- Skip failed snapshot (don't block subsequent ones)
- Alert admin if failures exceed threshold
- Retry logic for transient errors

## Monitoring

**Metrics to Track:**
- Portfolio aggregation time
- Cache hit rate
- Broker API call count
- Snapshot creation success rate
- Chart generation time
- Query response times

**Alerts:**
- Portfolio aggregation > 5 seconds
- Cache hit rate < 80%
- Snapshot creation failures > 5%
- Database query time > 1 second

## Consequences

**Positive:**
- Unified portfolio view across exchanges
- Accurate P&L calculations
- Comprehensive risk metrics
- **Fast chart generation** (< 200ms vs 2-5s)
- **Reduced broker API load** (no historical queries to brokers)
- **Historical trend analysis** enabled
- Efficient caching strategy
- Scalable architecture

**Negative:**
- Additional database storage for snapshots (mitigated by retention policy)
- Hourly snapshot job adds system load
- Small delay in historical data (up to 1 hour)
- More complex backup strategy

**Mitigation:**
- Partitioned tables and compression
- Efficient retention policy
- Snapshot job runs during low-traffic hours
- Automated snapshot cleanup

## Related ADRs
- ADR-017: Service Division and Boundaries
- ADR-021: Broker Integration Architecture
- ADR-025: Market Data Flow and Caching Strategy

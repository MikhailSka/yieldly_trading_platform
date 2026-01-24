# ADR-021: Broker Integration and Connectivity Architecture (Updated)

**Status:** Accepted
**Date:** 2025-10-29
**Updated:** 2025-11-03

## Context
Yieldly needs to connect to multiple cryptocurrency exchanges (Bybit, Binance) to fetch real-time market data, portfolio information, and historical OHLCV data. Exchange APIs differ in:
- Authentication methods
- Rate limits
- Request/response formats
- Available endpoints
- Error handling

The platform requires a unified approach to:
- Securely manage API credentials
- Abstract exchange-specific differences
- Enforce read-only access
- Handle rate limiting consistently
- **Serve as the single point of contact for all exchange interactions**
- Monitor connection health

## Decision
Implement a **Broker Connectivity Service** that acts as the **unified interface** for all exchange API interactions. All services requiring exchange data must communicate through this service rather than directly with exchange APIs.

### Architecture Components

1. **Unified Broker Interface**
   - Single service responsible for all exchange API calls
   - Other services (Historical Data Service, Portfolio Service) access exchanges only through this service
   - Prevents duplication of exchange-specific logic across services

2. **Adapter Pattern**
   - Create exchange-specific adapters (Bybit Adapter, Binance Adapter)
   - Each adapter implements common interface: `BrokerAdapter`
   - Standardized method signatures across all exchanges

3. **Secure Credential Management**
   - Store API keys in Azure Key Vault
   - Encrypt sensitive data at rest
   - Never log API keys or secrets
   - Store only metadata (connection ID, exchange name, status) in database

4. **Read-Only Enforcement**
   - Validate API keys are read-only during connection setup
   - Reject keys with trading permissions
   - Test connections before saving
   - Block all trading-related endpoints

5. **Rate Limiting**
   - Implement per-exchange rate limiters
   - Use Redis for distributed rate limit tracking
   - Respect exchange-specific limits (Bybit: 120 req/min, Binance: 1200 req/min with weights)
   - Return 429 status when limits exceeded

6. **Connection Health Monitoring**
   - Periodic health checks (as part of Connection Manager, not standalone component)
   - Monitor API response times
   - Detect and report connection failures
   - Auto-reconnect on transient failures

## Service Responsibilities

### Broker Connectivity Service Handles:
- Exchange API credential management
- Real-time market data fetching
- Portfolio data retrieval
- Historical OHLCV data downloads
- Rate limiting and quota management
- Connection health monitoring
- API error handling and retry logic

### Other Services Delegate to Broker Service:
- **Portfolio Service** → requests portfolio data via HTTP
- **Historical Data Service** → requests historical data downloads via HTTP
- **Backtesting Service** → uses Historical Data Service (which uses Broker Service)

### Benefits of Unified Interface:
- **Single source of truth** for exchange API logic
- **Consistent rate limiting** across all services
- **Easier maintenance** - exchange API changes handled in one place
- **Simplified scaling** - add new exchanges without modifying other services
- **Centralized monitoring** - all exchange API calls tracked in one service
- **No duplication** - exchange-specific adapters exist only once

## API Endpoints

### Connection Management
```
POST   /api/v1/brokers/connections          - Add broker connection
GET    /api/v1/brokers/connections          - List user's connections
GET    /api/v1/brokers/connections/:id      - Get connection details
PUT    /api/v1/brokers/connections/:id      - Update connection
DELETE /api/v1/brokers/connections/:id      - Remove connection
GET    /api/v1/brokers/connections/:id/test - Test connection health
```

### Market Data Access (Unified Interface)
```
GET /api/v1/brokers/market-data
  ?broker=bybit&symbol=BTCUSDT&interval=1h

GET /api/v1/brokers/portfolio
  ?broker=bybit&connectionId=<uuid>

GET /api/v1/brokers/historical
  ?broker=binance&symbol=ETHUSDT&interval=5m&from=<timestamp>&to=<timestamp>

GET /api/v1/brokers/trading-pairs
  ?broker=bybit
```

**Note:** All endpoints accept `broker` parameter to specify which exchange to use, eliminating need for separate endpoints per exchange.

## Data Flow Examples

### Example 1: Portfolio Service Fetching Data
```
User Request → API Gateway → Portfolio Service
    ↓
Portfolio Service → Broker Connectivity Service
    ↓
Broker Service → Bybit/Binance API
    ↓
Response flows back through same chain
```

### Example 2: Historical Data Ingestion
```
Admin Trigger → Historical Data Service
    ↓
Historical Data Service → Broker Connectivity Service
    (specifies: broker=binance, symbol=BTCUSDT, timeframe)
    ↓
Broker Service → Binance API (downloads data)
    ↓
Broker Service → Returns data to Historical Data Service
    ↓
Historical Data Service → Validates and stores in historical_db
```

**Key Point:** Historical Data Service does NOT have Binance Fetcher or Bybit Fetcher components. It only has a Broker Service Client component that requests data through the unified interface.

## Adapter Interface

```python
class BrokerAdapter(ABC):
    """Common interface all exchange adapters must implement"""

    @abstractmethod
    def get_account_info(self, api_key: str, api_secret: str) -> AccountInfo:
        """Fetch account information"""
        pass

    @abstractmethod
    def get_portfolio_balance(self, api_key: str, api_secret: str) -> List[Balance]:
        """Fetch portfolio balances"""
        pass

    @abstractmethod
    def get_market_data(self, symbol: str) -> MarketData:
        """Fetch real-time market data"""
        pass

    @abstractmethod
    def get_historical_ohlcv(self, symbol: str, interval: str,
                            start_time: int, end_time: int) -> List[OHLCV]:
        """Fetch historical OHLCV data"""
        pass

    @abstractmethod
    def get_trading_pairs(self) -> List[TradingPair]:
        """Get list of available trading pairs"""
        pass

    @abstractmethod
    def test_connection(self, api_key: str, api_secret: str) -> bool:
        """Test if connection is valid and read-only"""
        pass
```

## Rate Limiting Strategy

### Implementation
- Use Redis sorted sets for sliding window rate limiting
- Track requests per API key per exchange
- Key format: `rate_limit:{exchange}:{user_id}:{endpoint}`
- TTL matches exchange's rate limit window

### Exchange-Specific Limits
**Bybit:**
- 120 requests per minute per IP
- Separate limits for public vs authenticated endpoints

**Binance:**
- 1200 request weight per minute
- Each endpoint has different weight
- Track cumulative weight, not just request count

### Error Handling
- Return `429 Too Many Requests` when limit exceeded
- Include `Retry-After` header with seconds to wait
- Log rate limit violations for monitoring

## Security Measures

1. **API Key Storage**
   - Store encrypted reference IDs in `broker_db`
   - Store actual keys in Azure Key Vault
   - Never log or expose keys in responses

2. **Read-Only Validation**
   - Test all connections before accepting
   - Attempt a test read operation (account info)
   - Reject if key has trading permissions
   - Re-validate periodically (daily health check)

3. **Connection Isolation**
   - Each user's connections are isolated
   - No cross-user data access
   - User can only query their own connections

4. **Network Security**
   - All exchange API calls use HTTPS
   - Validate SSL certificates
   - Timeout after 30 seconds
   - Retry with exponential backoff

## Database Schema

```sql
-- Broker Connectivity Database (broker_db)
CREATE TABLE broker_connections (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    broker_type VARCHAR(50) NOT NULL, -- 'bybit', 'binance'
    connection_name VARCHAR(255),
    api_key_reference VARCHAR(255) NOT NULL, -- Key Vault reference
    status VARCHAR(50) NOT NULL, -- 'active', 'error', 'disconnected'
    last_health_check TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (user_id, broker_type, api_key_reference)
);

CREATE INDEX idx_broker_connections_user_id ON broker_connections(user_id);
CREATE INDEX idx_broker_connections_status ON broker_connections(status);
```

## Monitoring and Observability

- Log all API calls (without credentials) to Azure Monitor
- Track metrics:
  - Request count per exchange
  - Response times
  - Error rates
  - Rate limit hit rate
  - Connection health status
- Alert on:
  - Repeated connection failures
  - Rate limit violations
  - Abnormal error rates

## Future Considerations

### Adding New Exchanges
To add a new exchange (e.g., Kraken, OKX):
1. Implement `KrakenAdapter` conforming to `BrokerAdapter` interface
2. Add exchange-specific rate limiting rules
3. Update API endpoint to accept new broker type
4. **No changes required** in Historical Data Service, Portfolio Service, or other consumers

### WebSocket Support
- Phase 2 may add WebSocket connections for real-time data
- Broker Service will manage WebSocket connections
- Other services subscribe via internal pub/sub (Redis or Service Bus)
- Maintains unified interface principle

## Consequences

**Positive:**
- **Unified interface** - single point for all exchange interactions
- **No duplication** - exchange logic exists only once
- **Easy extensibility** - add exchanges without modifying other services
- **Consistent rate limiting** - centralized rate limit management
- Secure credential management
- Connection health monitoring
- Adapter pattern allows easy exchange addition
- Simplified maintenance

**Negative:**
- Single point of failure (mitigated by high availability deployment)
- Additional network hop for exchange data (mitigated by caching)
- Service becomes bottleneck if not scaled properly

**Mitigation:**
- Deploy multiple instances with load balancer
- Implement circuit breaker pattern
- Use Redis caching for frequently accessed data
- Monitor performance closely

## Related ADRs
- ADR-007: Security and Access Control
- ADR-017: Service Division and Boundaries
- ADR-020: Resilience Pattern Approach
- ADR-025: Market Data Flow and Caching Strategy

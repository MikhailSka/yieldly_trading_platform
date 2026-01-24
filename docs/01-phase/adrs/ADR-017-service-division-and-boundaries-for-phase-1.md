# ADR-017: Service Division and Boundaries for Phase 1 (Updated)

**Status:** Accepted
**Date:** 2025-10-28
**Updated:** 2025-11-03

## Context
Define clear service boundaries and responsibilities for Phase 1 MVP of the Yieldly trading platform. Each service must have well-defined responsibilities, clear interfaces, and appropriate data ownership. Services should be designed to minimize coupling while maximizing cohesion.

## Decision
Implement the following 7 microservices for Phase 1:

1. **User Service** (merged Auth + Profile)
2. Strategy Service
3. Backtesting Service
4. Broker Connectivity Service
5. Portfolio Service
6. Historical Data Service
7. Notification Service

## Service Definitions

### 1. User Service (Merged: Authentication + User Profile)

**Responsibilities:**
- User registration with invite codes
- Authentication (email/password, OAuth via Auth0)
- Session management and JWT token generation
- Password reset and email verification
- User profile management (name, email, avatar, bio)
- Trading preferences and account settings
- GDPR compliance (data export, account deletion)
- Invite code generation and management

**Key Endpoints:**
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `POST /api/v1/auth/refresh` - Refresh JWT token
- `POST /api/v1/auth/password-reset` - Initiate password reset
- `POST /api/v1/auth/verify-email` - Verify email address
- `GET /api/v1/users/me` - Get current user profile
- `PUT /api/v1/users/me` - Update user profile
- `PUT /api/v1/users/me/preferences` - Update trading preferences
- `POST /api/v1/users/me/export` - GDPR data export
- `DELETE /api/v1/users/me` - Request account deletion
- `GET /api/v1/admin/users` - List all users (admin)
- `POST /api/v1/admin/invite-codes` - Generate invite codes (admin)

**Data Ownership:**
- User accounts and credentials
- User profiles and preferences
- Session data
- Invite codes and usage tracking

**Database:** `user_db` (PostgreSQL)

**External Dependencies:**
- Auth0 (OAuth provider)
- Redis (session cache)
- Azure Blob Storage (profile avatars)

**Rationale for Merge:**
- Authentication and user profile are tightly coupled
- Simplifies queries for combined user data (username + avatar + session status)
- Reduces inter-service communication overhead
- Solo developer efficiency - fewer services to manage
- Auth0 handles external OAuth; internal service manages credentials + profiles
- Can be separated later if scaling demands it

---

### 2. Strategy Service

**Responsibilities:**
- Strategy CRUD operations (create, read, update, delete)
- Strategy code validation and syntax checking
- Strategy versioning and history
- Strategy templates and examples management
- Built-in documentation and guides
- **Technical indicator management** (fetch from Backtesting Service, expose to frontend)
- **Indicator configuration** (enable/disable, descriptions, examples)

**Key Endpoints:**
- `GET /api/v1/strategies` - List user strategies
- `GET /api/v1/strategies/:id` - Get strategy details
- `POST /api/v1/strategies` - Create new strategy
- `PUT /api/v1/strategies/:id` - Update strategy
- `DELETE /api/v1/strategies/:id` - Delete strategy
- `POST /api/v1/strategies/:id/validate` - Validate strategy code
- `GET /api/v1/strategies/templates` - List strategy templates
- `GET /api/v1/strategies/documentation` - Get built-in docs
- `GET /api/v1/indicators` - List available technical indicators
- `GET /api/v1/indicators/:id` - Get indicator details and usage examples
- `PUT /api/v1/admin/indicators/:id` - Update indicator metadata (admin)

**Data Ownership:**
- User-created strategies
- Strategy versions
- Strategy templates (flagged as `is_template=true`)
- Indicator configurations and metadata

**Database:** `strategy_db` (PostgreSQL)

**External Dependencies:**
- Azure Blob Storage (strategy screenshots)
- Backtesting Service (indicator definitions)

---

### 3. Backtesting Service

**Responsibilities:**
- Execute backtests using historical market data
- Strategy code adaptation to backtesting library format
- Historical data fetching and formatting
- Simulate trades with realistic fees and slippage
- Calculate performance metrics (Sharpe, Sortino, max drawdown, etc.)
- Generate equity curves and trade logs
- Store backtest results and detailed reports
- **Manage technical indicator library** (TA-Lib interface)
- **Expose indicator definitions** to Strategy Service

**Key Endpoints:**
- `POST /api/v1/backtests` - Submit backtest job (async, returns job ID)
- `GET /api/v1/backtests/:id` - Get backtest status and results
- `GET /api/v1/backtests/:id/report` - Get detailed backtest report
- `GET /api/v1/backtests/:id/trades` - Get trade log
- `GET /api/v1/backtests` - List user backtest history
- `DELETE /api/v1/backtests/:id` - Cancel running backtest
- `GET /api/v1/backtests/quota` - Check backtest quota usage
- `GET /api/v1/backtests/indicators` - List available indicators from TA-Lib
- `GET /api/v1/backtests/indicators/:name` - Get indicator definition

**Data Ownership:**
- Backtest runs and results
- Simulated trades
- Performance metrics
- Equity curves
- Technical indicator definitions (from TA-Lib)

**Database:**
- `backtesting_db` (PostgreSQL) - backtest results
- `historical_data_db` (TimescaleDB, read-only) - market data for simulation

**External Dependencies:**
- Azure Service Bus (job queue)
- Azure Blob Storage (detailed reports)
- Historical Data Service (read-only database access)

---

### 4. Broker Connectivity Service

**Responsibilities:**
- Manage exchange API connections (Bybit, Binance)
- Secure API credential storage (Azure Key Vault)
- **Unified broker API interface** for all exchange interactions
- Real-time market data fetching
- Portfolio data fetching
- **Historical data download** (for Historical Data Service)
- Rate limiting and API quota management
- Connection health monitoring
- Read-only API enforcement

**Key Endpoints:**
- `POST /api/v1/brokers/connections` - Add broker connection
- `GET /api/v1/brokers/connections` - List connections
- `GET /api/v1/brokers/connections/:id` - Get connection status
- `DELETE /api/v1/brokers/connections/:id` - Remove connection
- `GET /api/v1/brokers/connections/:id/test` - Test connection health
- `GET /api/v1/brokers/market-data` - Get real-time market data
- `GET /api/v1/brokers/portfolio` - Get portfolio data from broker
- `GET /api/v1/brokers/historical` - Download historical OHLCV data
- `GET /api/v1/brokers/trading-pairs` - List available trading pairs

**Data Ownership:**
- Broker connection metadata
- API credential references (actual keys in Key Vault)
- Connection health status

**Database:** `broker_db` (PostgreSQL)

**External Dependencies:**
- Bybit REST API
- Binance REST API
- Azure Key Vault (API key storage)
- Redis (rate limiting)

**Note:** This service is the **single point of contact** for all exchange APIs. Other services (Historical Data Service, Portfolio Service) must go through this service to access broker data.

---

### 5. Portfolio Service

**Responsibilities:**
- Aggregate portfolio data from multiple exchanges
- Calculate realized and unrealized P&L
- Calculate risk metrics (drawdown, volatility, Sharpe ratio)
- Generate equity curves and allocation charts
- **Store historical portfolio snapshots** (hourly during market hours)
- Track portfolio performance over time
- Publish portfolio-related notification events

**Key Endpoints:**
- `GET /api/v1/portfolio` - Get current portfolio summary
- `GET /api/v1/portfolio/assets` - Get asset breakdown
- `GET /api/v1/portfolio/transactions` - Get transaction history
- `GET /api/v1/portfolio/performance` - Get performance metrics
- `GET /api/v1/portfolio/pnl` - Get profit and loss (realized/unrealized)
- `GET /api/v1/portfolio/risk` - Get risk metrics
- `GET /api/v1/portfolio/charts` - Get equity curve and allocation charts
- `GET /api/v1/portfolio/history` - Get historical portfolio snapshots

**Data Ownership:**
- Portfolio snapshots (hourly)
- Aggregated portfolio data
- Historical portfolio states
- Calculated P&L and risk metrics

**Database:** `portfolio_db` (PostgreSQL)

**External Dependencies:**
- Broker Connectivity Service (portfolio data source)
- Redis (caching, 1-minute TTL)
- Azure Service Bus (notification events)

---

### 6. Historical Data Service

**Responsibilities:**
- Ingest and store historical OHLCV data
- Serve historical market data to other services
- Validate data quality and integrity
- Cache frequently accessed price data
- **Trigger data downloads via Broker Connectivity Service**
- Schedule periodic data updates

**Key Endpoints:**
- `GET /api/v1/market/historical` - Get historical OHLCV data
- `GET /api/v1/market/symbols` - List available symbols
- `POST /api/v1/admin/market/ingest` - Trigger data ingestion (admin)
- `GET /api/v1/admin/market/data-status` - Check data availability (admin)

**Data Ownership:**
- Historical OHLCV candle data
- Time-series market data
- Data quality metadata

**Database:** `historical_data_db` (TimescaleDB)

**External Dependencies:**
- **Broker Connectivity Service** (data source - not direct exchange APIs)
- Redis (price cache)

**Important:** This service does NOT directly call exchange APIs. All data downloads go through Broker Connectivity Service for unified interface and rate limiting.

---

### 7. Notification Service

**Responsibilities:**
- Process notification events from message queue
- Send in-app notifications
- Send email notifications (via SendGrid)
- Store notification history
- Manage user notification preferences
- Track notification delivery status

**Key Endpoints:**
- `GET /api/v1/notifications` - List user notifications
- `GET /api/v1/notifications/:id` - Get notification details
- `PUT /api/v1/notifications/:id/read` - Mark notification as read
- `PUT /api/v1/notifications/read-all` - Mark all as read
- `DELETE /api/v1/notifications/:id` - Delete notification
- `GET /api/v1/notifications/preferences` - Get notification preferences
- `PUT /api/v1/notifications/preferences` - Update preferences

**Data Ownership:**
- Notification history
- User notification preferences
- Delivery status

**Database:** `notification_db` (PostgreSQL)

**External Dependencies:**
- Azure Service Bus (notification events)
- SendGrid (email delivery)

---

## Service Communication Patterns

### Synchronous (HTTP/REST)
- API Gateway → All Services (REST endpoints)
- Strategy Service → Backtesting Service (fetch indicator definitions)
- Portfolio Service → Broker Connectivity Service (fetch portfolio data)
- Historical Data Service → Broker Connectivity Service (request data download)
- All Services → Azure Monitor (logging, metrics)

### Asynchronous (Message Queue)
- Strategy Service → Backtesting Service (backtest job submission via Service Bus)
- Backtesting Service → Notification Service (backtest completion events via Service Bus)
- Portfolio Service → Notification Service (portfolio alerts via Service Bus)

### Direct Database Access
- Backtesting Service → Historical Data DB (read-only, high-volume market data access)

---

## REST Controller Pattern

**All services** must implement a REST Controller component to:
- Expose HTTP endpoints for frontend data access
- Enable potential inter-service communication
- Provide admin endpoints where applicable
- Support pagination, filtering, and search (per ADR-029)

This ensures consistent API patterns and facilitates future service-to-service communication if needed.

---

## Consequences

**Positive:**
- Clear service boundaries and responsibilities
- Minimal coupling between services
- Each service can be developed and deployed independently
- User Service merge simplifies authentication + profile data access
- Strategy Service handles indicator management for frontend
- Backtesting Service maintains indicator library interface
- Broker Connectivity Service is single point for exchange API access
- Portfolio Service stores historical data for trend analysis
- Historical Data Service uses unified broker interface

**Negative:**
- More services to manage (7 total)
- Network latency for inter-service calls
- Eventual consistency for some operations

**Mitigation:**
- Docker Compose simplifies local development
- Service mesh or API Gateway handles routing and resilience
- Async messaging for non-critical operations
- Caching strategies to reduce latency

## Related ADRs
- ADR-001: Microservices Architecture
- ADR-002: Database Choice (User Service merge)
- ADR-019: Azure Service Bus for Service Communication
- ADR-021: Broker Integration Architecture
- ADR-029: API Design Patterns and Standards

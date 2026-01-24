# Level 3 Component Diagrams (Updated)

**Last Updated:** 2025-11-03

---

## User Service Components (Merged: Auth + Profile)

```mermaid
C4Component
    title Component Diagram - User Service (Merged Auth + Profile)

    Container_Boundary(user_service_boundary, "User Service") {
        Component(auth_controller, "Auth Controller", "Go", "REST endpoints for authentication (register, login, logout, password reset)")
        Component(profile_controller, "Profile Controller", "Go", "REST endpoints for user profile management")
        Component(session_manager, "Session Manager", "Go", "Manages user sessions and JWT tokens")
        Component(invite_code_manager, "Invite Code Manager", "Go", "Validates and tracks invite code usage")
        Component(oauth_handler, "OAuth Handler", "Go", "Handles OAuth flow with Auth0")
        Component(user_repository, "User Repository", "Go", "Database access for user data")
        Component(cache_manager, "Cache Manager", "Go", "Redis session and user data caching")
    }

    ContainerDb_Ext(user_db, "User Database", "PostgreSQL", "User accounts, profiles, sessions, invite codes")
    ContainerDb_Ext(redis, "Redis", "Session cache, rate limiting")
    ContainerDb_Ext(blob_storage, "Azure Blob Storage", "Profile avatars")
    System_Ext(auth0, "Auth0", "OAuth 2.0 provider")
    Container_Ext(azure_monitor, "Azure Monitor", "Logging & monitoring")

    Rel(auth_controller, session_manager, "Creates/validates sessions", "Function call")
    Rel(auth_controller, invite_code_manager, "Validates invite codes", "Function call")
    Rel(auth_controller, oauth_handler, "OAuth login", "Function call")
    Rel(auth_controller, user_repository, "User CRUD", "Function call")
    
    Rel(profile_controller, user_repository, "Profile CRUD", "Function call")
    Rel(profile_controller, blob_storage, "Upload/delete avatars", "Azure SDK")
    
    Rel(session_manager, cache_manager, "Cache sessions", "Function call")
    Rel(oauth_handler, auth0, "OAuth flow", "OIDC")
    
    Rel(user_repository, user_db, "Reads/Writes", "SQL")
    Rel(cache_manager, redis, "Stores cache", "Redis protocol")
    
    Rel(auth_controller, azure_monitor, "Sends logs/metrics", "Azure SDK")
    Rel(profile_controller, azure_monitor, "Sends logs/metrics", "Azure SDK")
```

**Key Components:**
- **Auth Controller**: Registration, login, logout, password reset, email verification
- **Profile Controller**: Profile management, preferences, GDPR operations (export/delete)
- **Session Manager**: JWT generation, session validation, refresh tokens
- **Invite Code Manager**: Invite code validation, usage tracking, generation (admin)
- **OAuth Handler**: Google OAuth integration via Auth0
- **User Repository**: All user data access (accounts, profiles, preferences, invite codes)
- **Cache Manager**: Session caching, user data caching (Redis)

---

## Strategy Service Components

```mermaid
C4Component
    title Component Diagram - Strategy Service

    Container_Boundary(strategy_service_boundary, "Strategy Service") {
        Component(strategy_controller, "Strategy Controller", "Go", "REST endpoints for strategy CRUD")
        Component(strategy_manager, "Strategy Manager", "Go", "Business logic for strategy operations")
        Component(code_validator, "Code Validator", "Go", "Validates strategy code syntax and security")
        Component(version_manager, "Version Manager", "Go", "Manages strategy versioning")
        Component(indicator_manager, "Indicator Manager", "Go", "Manages indicator configurations and metadata")
        Component(backtesting_client, "Backtesting Service Client", "Go", "HTTP client to fetch indicators from Backtesting Service")
        Component(strategy_repository, "Strategy Repository", "Go", "Database access for strategies and indicators")
        Component(cache_manager, "Cache Manager", "Go", "Redis caching for indicators")
    }

    ContainerDb_Ext(strategy_db, "Strategy Database", "PostgreSQL", "User strategies, versions, templates, indicator configs")
    ContainerDb_Ext(redis, "Redis", "Indicator cache")
    ContainerDb_Ext(blob_storage, "Azure Blob Storage", "Strategy screenshots")
    Container_Ext(backtesting_service, "Backtesting Service", "Indicator definitions source")
    Container_Ext(azure_monitor, "Azure Monitor", "Logging & monitoring")

    Rel(strategy_controller, strategy_manager, "Strategy operations", "Function call")
    Rel(strategy_controller, indicator_manager, "Get indicators", "Function call")
    
    Rel(strategy_manager, code_validator, "Validates code", "Function call")
    Rel(strategy_manager, version_manager, "Version control", "Function call")
    Rel(strategy_manager, strategy_repository, "Strategy CRUD", "Function call")
    Rel(strategy_manager, blob_storage, "Store screenshots", "Azure SDK")
    
    Rel(indicator_manager, backtesting_client, "Fetch indicator definitions", "Function call")
    Rel(indicator_manager, strategy_repository, "Indicator CRUD", "Function call")
    Rel(indicator_manager, cache_manager, "Cache indicators", "Function call")
    
    Rel(backtesting_client, backtesting_service, "GET /indicators", "HTTP")
    
    Rel(strategy_repository, strategy_db, "Reads/Writes", "SQL")
    Rel(cache_manager, redis, "Stores cache", "Redis protocol")
    
    Rel(strategy_controller, azure_monitor, "Sends logs/metrics", "Azure SDK")
```

**Key Components:**
- **Strategy Controller**: REST API for strategy CRUD, templates, indicators
- **Strategy Manager**: Core business logic for strategy operations
- **Code Validator**: Python syntax validation, security checks, dependency validation
- **Version Manager**: Strategy versioning and history tracking
- **Indicator Manager**: Fetches indicators from Backtesting Service, manages metadata (descriptions, active status)
- **Backtesting Service Client**: HTTP client for indicator definitions
- **Strategy Repository**: Data access for strategies (including templates with `is_template` flag) and indicator configs
- **Cache Manager**: Caches top 20 indicators in Redis (24-hour TTL)

**Note:** No separate Template Provider - templates are strategies with `is_template=true` and admin metadata

---

## Backtesting Service Components

```mermaid
C4Component
    title Component Diagram - Backtesting Service

    Container_Boundary(backtest_service_boundary, "Backtesting Service") {
        Component(backtest_controller, "Backtest REST Controller", "Python", "REST endpoints for backtest results and indicators")
        Component(job_consumer, "Job Consumer", "Python", "Consumes backtest jobs from Azure Service Bus")
        Component(strategy_adapter, "Strategy Adapter", "Python", "Converts user strategy to library format")
        Component(data_adapter, "Data Adapter", "Python", "Fetches and formats data for backtesting library")
        Component(backtest_engine, "Backtest Engine Wrapper", "Python", "Wraps backtesting library (backtrader)")
        Component(indicator_library_manager, "Indicator Library Manager", "Python", "Interface to TA-Lib, provides indicator definitions")
        Component(result_parser, "Result Parser", "Python", "Parses library output to standard format")
        Component(report_formatter, "Report Formatter", "Python", "Formats results for frontend")
        Component(result_publisher, "Result Publisher", "Python", "Publishes results to database and storage")
        Component(backtesting_repository, "Backtesting Repository", "Python", "Database access for backtest results")
    }

    ContainerDb_Ext(historical_db, "Historical Data Database", "TimescaleDB", "Read-only access to OHLCV data")
    ContainerDb_Ext(backtest_db, "Backtesting Database", "PostgreSQL", "Backtest results and trades")
    ContainerDb_Ext(service_bus, "Azure Service Bus", "Backtest job queue")
    ContainerDb_Ext(blob_storage, "Azure Blob Storage", "Detailed report storage")
    Container_Ext(azure_monitor, "Azure Monitor", "Logging & monitoring")

    Rel(backtest_controller, indicator_library_manager, "Get indicators", "Function call")
    Rel(backtest_controller, backtesting_repository, "Query results", "Function call")
    
    Rel(service_bus, job_consumer, "Delivers jobs", "AMQP")
    Rel(job_consumer, strategy_adapter, "Adapts strategy", "Function call")
    Rel(job_consumer, data_adapter, "Fetches data", "Function call")
    
    Rel(data_adapter, historical_db, "Queries OHLCV", "SQL")
    
    Rel(strategy_adapter, backtest_engine, "Provides adapted strategy", "Function call")
    Rel(data_adapter, backtest_engine, "Provides formatted data", "Function call")
    Rel(indicator_library_manager, backtest_engine, "Calculate indicators", "Function call")
    
    Rel(backtest_engine, result_parser, "Returns raw results", "Function call")
    Rel(result_parser, report_formatter, "Provides parsed results", "Function call")
    
    Rel(report_formatter, result_publisher, "Provides formatted report", "Function call")
    Rel(result_publisher, backtesting_repository, "Save results", "Function call")
    Rel(result_publisher, blob_storage, "Saves detailed report", "Azure SDK")
    
    Rel(backtesting_repository, backtest_db, "Reads/Writes", "SQL")
    
    Rel(backtest_controller, azure_monitor, "Sends logs/metrics", "Azure SDK")
    Rel(job_consumer, azure_monitor, "Sends logs/metrics", "Azure SDK")
```

**Key Components:**
- **Backtest REST Controller**: HTTP endpoints for querying results, getting indicator list (NEW)
- **Job Consumer**: Listens to Service Bus for async backtest jobs
- **Strategy Adapter**: Converts user Python code to backtrader format
- **Data Adapter**: Fetches OHLCV data from TimescaleDB
- **Backtest Engine Wrapper**: Wraps backtrader library, executes simulation
- **Indicator Library Manager**: Interfaces with TA-Lib, exposes indicator definitions to Strategy Service (NEW)
- **Result Parser**: Parses backtrader output to standard format
- **Report Formatter**: Creates frontend-friendly JSON reports
- **Result Publisher**: Saves results to database and blob storage
- **Backtesting Repository**: Data access for backtest results (NEW)

**Dual Access:**
- Write access to `backtest_db` (results storage)
- Read-only access to `historical_db` (market data)

---

## Broker Connectivity Service Components

```mermaid
C4Component
    title Component Diagram - Broker Connectivity Service

    Container_Boundary(broker_service_boundary, "Broker Connectivity Service") {
        Component(broker_controller, "Broker Controller", "Go", "REST endpoints for broker connections and data requests")
        Component(connection_manager, "Connection Manager", "Go", "Manages broker connections lifecycle and health checking")
        Component(credential_manager, "Credential Manager", "Go", "Encrypts/decrypts API keys via Azure Key Vault")
        Component(bybit_adapter, "Bybit Adapter", "Go", "Bybit-specific API client")
        Component(binance_adapter, "Binance Adapter", "Go", "Binance-specific API client")
        Component(rate_limiter, "Rate Limiter", "Go", "Exchange-specific rate limiting")
        Component(broker_repository, "Broker Repository", "Go", "Database access for connection metadata")
    }

    ContainerDb_Ext(broker_db, "Broker Connectivity Database", "PostgreSQL", "Connection metadata")
    ContainerDb_Ext(key_vault, "Azure Key Vault", "API key storage")
    ContainerDb_Ext(redis, "Redis", "Rate limiting counters")
    System_Ext(bybit_api, "Bybit API", "REST API")
    System_Ext(binance_api, "Binance API", "REST API")
    Container_Ext(azure_monitor, "Azure Monitor", "Logging & monitoring")

    Rel(broker_controller, connection_manager, "Manages connections", "Function call")
    Rel(broker_controller, bybit_adapter, "Broker data requests", "Function call")
    Rel(broker_controller, binance_adapter, "Broker data requests", "Function call")
    
    Rel(connection_manager, credential_manager, "Encrypt/decrypt keys", "Function call")
    Rel(connection_manager, broker_repository, "Connection CRUD", "Function call")
    Rel(connection_manager, bybit_adapter, "Test connection", "Function call")
    Rel(connection_manager, binance_adapter, "Test connection", "Function call")
    
    Rel(credential_manager, key_vault, "Store/retrieve keys", "Azure SDK")
    
    Rel(bybit_adapter, rate_limiter, "Checks limit", "Function call")
    Rel(binance_adapter, rate_limiter, "Checks limit", "Function call")
    
    Rel(bybit_adapter, bybit_api, "API calls", "REST API/HTTPS")
    Rel(binance_adapter, binance_api, "API calls", "REST API/HTTPS")
    
    Rel(rate_limiter, redis, "Tracks usage", "Redis protocol")
    Rel(broker_repository, broker_db, "Reads/Writes", "SQL")
    
    Rel(broker_controller, azure_monitor, "Sends logs/metrics", "Azure SDK")
```

**Key Components:**
- **Broker Controller**: REST endpoints for connections, market data, portfolio data, historical downloads
- **Connection Manager**: Connection lifecycle, health checking (internal function, not separate component)
- **Credential Manager**: Encrypts/decrypts API keys using Azure Key Vault
- **Bybit Adapter**: Bybit-specific API implementation
- **Binance Adapter**: Binance-specific API implementation
- **Rate Limiter**: Per-exchange rate limiting (120/min Bybit, 1200/min Binance)
- **Broker Repository**: Data access for connection metadata

**Note:** Health checking is part of Connection Manager, not a standalone component

**Unified Interface:**
- All endpoints accept `broker` parameter (bybit, binance)
- Single point for all exchange API interactions
- Other services (Historical Data, Portfolio) use this service exclusively

---

## Portfolio Service Components

```mermaid
C4Component
    title Component Diagram - Portfolio Service

    Container_Boundary(portfolio_service_boundary, "Portfolio Service") {
        Component(portfolio_controller, "Portfolio Controller", "Go", "REST endpoints for portfolio data and history")
        Component(aggregator, "Portfolio Aggregator", "Go", "Aggregates data from multiple exchanges")
        Component(pnl_calculator, "P&L Calculator", "Go", "Calculates realized/unrealized P&L")
        Component(risk_analyzer, "Risk Analyzer", "Go", "Calculates drawdown, volatility, Sharpe ratio")
        Component(chart_generator, "Chart Generator", "Go", "Generates equity curves from snapshots")
        Component(snapshot_scheduler, "Snapshot Scheduler", "Go", "Creates hourly portfolio snapshots")
        Component(notification_publisher, "Notification Publisher", "Go", "Publishes notification events")
        Component(portfolio_repository, "Portfolio Repository", "Go", "Database access for snapshots and data")
        Component(cache_manager, "Cache Manager", "Go", "Redis caching for real-time data")
    }

    ContainerDb_Ext(portfolio_db, "Portfolios Database", "PostgreSQL", "Portfolio snapshots and historical data")
    ContainerDb_Ext(redis, "Redis", "Portfolio cache (1-min TTL)")
    ContainerDb_Ext(service_bus, "Message Queue", "Notification events")
    Container_Ext(broker_service, "Broker Connectivity Service", "Portfolio data source")
    Container_Ext(azure_monitor, "Azure Monitor", "Logging & monitoring")

    Rel(portfolio_controller, aggregator, "Requests aggregation", "Function call")
    Rel(portfolio_controller, chart_generator, "Generate charts", "Function call")
    Rel(portfolio_controller, portfolio_repository, "Query history", "Function call")
    
    Rel(aggregator, broker_service, "Fetches exchange data", "HTTP")
    Rel(aggregator, pnl_calculator, "Calculates P&L", "Function call")
    Rel(aggregator, risk_analyzer, "Analyzes risk", "Function call")
    Rel(aggregator, cache_manager, "Caches results", "Function call")
    Rel(aggregator, notification_publisher, "Publishes events", "Function call")
    
    Rel(snapshot_scheduler, aggregator, "Get current state", "Function call")
    Rel(snapshot_scheduler, portfolio_repository, "Save snapshot", "Function call")
    
    Rel(chart_generator, portfolio_repository, "Query snapshots", "Function call")
    
    Rel(notification_publisher, service_bus, "Publishes events", "AMQP")
    
    Rel(cache_manager, redis, "Stores cache", "Redis protocol")
    Rel(portfolio_repository, portfolio_db, "Reads/Writes", "SQL")
    
    Rel(portfolio_controller, azure_monitor, "Sends logs/metrics", "Azure SDK")
```

**Key Components:**
- **Portfolio Controller**: REST endpoints for current portfolio, history, charts
- **Portfolio Aggregator**: Combines data from multiple exchanges via Broker Service
- **P&L Calculator**: Realized and unrealized P&L calculations
- **Risk Analyzer**: Drawdown, volatility, Sharpe ratio calculations
- **Chart Generator**: Creates charts from historical snapshots (fast, no broker API calls)
- **Snapshot Scheduler**: Hourly cron job to save portfolio state (NEW)
- **Notification Publisher**: Publishes portfolio-related events
- **Portfolio Repository**: Data access for snapshots and portfolio data
- **Cache Manager**: Redis caching (1-minute TTL for real-time data)

**Snapshot Storage:**
- Hourly snapshots stored in `portfolio_db`
- Retention: 30 days hourly, 1 year daily, all time weekly
- Enables fast chart generation (< 200ms vs 2-5s)

---

## Historical Data Service Components

```mermaid
C4Component
    title Component Diagram - Historical Data Service

    Container_Boundary(historical_service_boundary, "Historical Data Service") {
        Component(data_controller, "Data Controller", "Go", "REST endpoints for historical data queries and admin ingestion")
        Component(ingestion_manager, "Ingestion Manager", "Go", "Orchestrates data download and storage")
        Component(download_scheduler, "Download Scheduler", "Go", "Schedules periodic data updates")
        Component(broker_service_client, "Broker Service Client", "Go", "HTTP client to request data from Broker Service")
        Component(data_validator, "Data Validator", "Go", "Validates data quality and integrity")
        Component(data_repository, "Data Repository", "Go", "Database access for OHLCV data")
        Component(cache_manager, "Cache Manager", "Go", "Redis caching for frequently accessed prices")
    }

    ContainerDb_Ext(historical_db, "Historical Data Database", "TimescaleDB", "Time-series OHLCV data")
    ContainerDb_Ext(redis, "Redis", "Price cache")
    Container_Ext(broker_service, "Broker Connectivity Service", "Data download via unified interface")
    Container_Ext(azure_monitor, "Azure Monitor", "Logging & monitoring")

    Rel(data_controller, ingestion_manager, "Triggers ingestion", "Function call")
    Rel(data_controller, data_repository, "Query data", "Function call")
    Rel(data_controller, cache_manager, "Cache access", "Function call")
    
    Rel(download_scheduler, ingestion_manager, "Scheduled downloads", "Function call")
    
    Rel(ingestion_manager, broker_service_client, "Request data download", "Function call")
    Rel(ingestion_manager, data_validator, "Validates data", "Function call")
    Rel(ingestion_manager, data_repository, "Stores data", "Function call")
    
    Rel(broker_service_client, broker_service, "GET /brokers/historical", "HTTP")
    
    Rel(data_validator, data_repository, "Validates stored data", "Function call")
    
    Rel(data_repository, historical_db, "Reads/Writes", "SQL")
    Rel(data_repository, cache_manager, "Updates cache", "Function call")
    
    Rel(cache_manager, redis, "Caches prices", "Redis protocol")
    
    Rel(data_controller, azure_monitor, "Sends logs/metrics", "Azure SDK")
```

**Key Components:**
- **Data Controller**: REST endpoints for querying data and triggering admin ingestion
- **Ingestion Manager**: Orchestrates data download workflow
- **Download Scheduler**: Cron-based scheduler for periodic updates (NEW)
- **Broker Service Client**: HTTP client for Broker Service API (NEW - replaces direct exchange fetchers)
- **Data Validator**: Validates data quality (gaps, format, reasonable values)
- **Data Repository**: Database access to TimescaleDB
- **Cache Manager**: Redis caching for frequently accessed prices

**Critical Change:**
- **No direct exchange API calls** - all downloads go through Broker Service
- No Bybit Fetcher or Binance Fetcher components
- Broker Service handles all exchange-specific logic

**Data Flow:**
1. Admin/Scheduler triggers download
2. Ingestion Manager → Broker Service Client
3. Broker Service Client → Broker Service (with broker parameter)
4. Broker Service → Exchange API
5. Data flows back and gets validated and stored

---

## Notification Service Components

```mermaid
C4Component
    title Component Diagram - Notification Service

    Container_Boundary(notification_service_boundary, "Notification Service") {
        Component(notification_controller, "Notification Controller", "Go", "REST endpoints for user notifications")
        Component(event_consumer, "Event Consumer", "Go", "Consumes notification events from Service Bus")
        Component(notification_manager, "Notification Manager", "Go", "Orchestrates notification delivery")
        Component(email_sender, "Email Sender", "Go", "Sends email notifications via SendGrid")
        Component(in_app_manager, "In-App Manager", "Go", "Creates in-app notifications")
        Component(notification_repository, "Notification Repository", "Go", "Database access for notifications")
    }

    ContainerDb_Ext(notification_db, "Notifications Database", "PostgreSQL", "Notification history and preferences")
    ContainerDb_Ext(service_bus, "Message Queue", "Azure Service Bus", "Notification events")
    System_Ext(sendgrid, "SendGrid", "Email delivery")
    Container_Ext(azure_monitor, "Azure Monitor", "Logging & monitoring")

    Rel(notification_controller, notification_repository, "Queries notifications", "Function call")
    
    Rel(service_bus, event_consumer, "Delivers events", "AMQP")
    Rel(event_consumer, notification_manager, "Processes events", "Function call")
    
    Rel(notification_manager, email_sender, "Sends emails", "Function call")
    Rel(notification_manager, in_app_manager, "Creates in-app", "Function call")
    Rel(notification_manager, notification_repository, "Persists notifications", "Function call")
    
    Rel(email_sender, sendgrid, "Sends emails", "HTTPS/SMTP")
    
    Rel(in_app_manager, notification_repository, "Stores notifications", "Function call")
    Rel(notification_repository, notification_db, "Reads/Writes", "SQL")
    
    Rel(notification_controller, azure_monitor, "Sends logs/metrics", "Azure SDK")
    Rel(event_consumer, azure_monitor, "Sends logs/metrics", "Azure SDK")
```

**Key Components:**
- **Notification Controller**: REST endpoints for querying notifications, preferences
- **Event Consumer**: Listens to Azure Service Bus for notification events
- **Notification Manager**: Orchestrates delivery (email + in-app)
- **Email Sender**: Sends email via SendGrid
- **In-App Manager**: Creates web UI notifications
- **Notification Repository**: Database access for notification data

---

## Component Summary Table

| Service | REST Controller | Repository | Key New Components | External Dependencies |
|---------|----------------|------------|-------------------|----------------------|
| **User Service** | Auth Controller, Profile Controller | User Repository | Invite Code Manager | Auth0, Redis, Blob Storage |
| **Strategy Service** | Strategy Controller | Strategy Repository | Indicator Manager, Backtesting Client | Backtesting Service, Redis, Blob Storage |
| **Backtesting Service** | Backtest Controller (NEW) | Backtesting Repository (NEW) | Indicator Library Manager (NEW) | TimescaleDB (read-only), Service Bus, Blob Storage |
| **Broker Service** | Broker Controller | Broker Repository | - | Bybit API, Binance API, Key Vault, Redis |
| **Portfolio Service** | Portfolio Controller | Portfolio Repository | Snapshot Scheduler (NEW) | Broker Service, Redis, Service Bus |
| **Historical Data Service** | Data Controller | Data Repository | Broker Service Client (NEW), Download Scheduler (NEW) | Broker Service (not direct exchange APIs), Redis |
| **Notification Service** | Notification Controller | Notification Repository | - | Service Bus, SendGrid |

---

## Key Architectural Patterns

**REST Controller Pattern:**
- ALL services expose REST controllers for frontend and inter-service communication
- Standardized API patterns (pagination, filtering, search per ADR-029)
- Health check endpoints for monitoring

**Repository Pattern:**
- ALL services with databases have repository components
- Repositories handle all database access
- SQL injection prevention via parameterized queries

**Unified Broker Interface:**
- Broker Service is single point for ALL exchange API interactions
- Historical Data Service uses Broker Service (no direct exchange calls)
- Portfolio Service uses Broker Service
- Consistent rate limiting and error handling

**Indicator Management:**
- Backtesting Service owns TA-Lib library and exposes definitions
- Strategy Service caches indicators and manages metadata
- Clear separation: calculation (Backtesting) vs. configuration (Strategy)

**Portfolio Snapshots:**
- Hourly snapshots enable fast chart generation
- Reduces broker API load significantly
- Retention policy manages storage costs

**Caching Strategy:**
- Redis used selectively for proven hot paths
- Session data (User Service)
- Real-time portfolio (1-min TTL)
- Top 20 indicators (24-hour TTL)
- Latest prices (optional, if needed)
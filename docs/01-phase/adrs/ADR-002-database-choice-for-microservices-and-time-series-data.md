# ADR-002: Database Choice for Microservices and Time-Series Data (Updated)

**Status:** Accepted
**Date:** 2025-11-03
**Updated:** 2025-11-03

## Context
Building microservices for a trading platform. Most services won't have extremely high data loads and can rely on traditional relational databases. However, the historical data service handling time-series data (candlestick charts) needs optimization for time-series storage and queries. Based on practical experience, downloading Binance data for all coins results in gigabytes of data, even when using 5-15 minute candle intervals.

## Decision
Use **PostgreSQL with TimescaleDB extension** for the historical data service and **standard PostgreSQL** for other services.

Each microservice will have its own **dedicated database container/instance** to maintain true service independence, autonomy, and to enable easier scaling and separation in the future.

## Rationale

**Time-Series Optimization**
- TimescaleDB allows PostgreSQL to handle time-series data efficiently
- Optimized for the specific access patterns of historical market data
- Proven performance with large data volumes
- Automatic partitioning and compression

**Database-per-Service Pattern**
- Each microservice has its own dedicated PostgreSQL container/instance
- True service independence and autonomy
- Independent scaling capabilities per service
- Failure isolation - database issues in one service don't affect others
- Easier future migration and deployment flexibility
- Historical Data Service uses TimescaleDB (PostgreSQL with TimescaleDB extension)

**Consistency and Flexibility**
- PostgreSQL across the board keeps technology stack consistent
- Reduces operational complexity
- SQL-based solution provides robust foundation
- Can migrate to NoSQL if requirements change dramatically

## Service Database Organization

### Core Services and Databases

- **User Service** → Dedicated PostgreSQL container (`user_db`)
  - **Merged from Auth Service + User Profile Service**
  - Handles: authentication, authorization, sessions, profiles, preferences, invite codes, GDPR operations
  - Rationale for merge:
    - Solo developer efficiency - fewer databases to manage
    - Closely related concerns (authentication + user data)
    - Simplifies queries for combined user data (username + avatar + session status)
    - Auth0 handles external OAuth, internal service manages credentials + profiles
    - Can separate into two databases in Phase 2 if scaling requires it
  - Database remains separate from other services to maintain service independence

- **Strategy Service** → Dedicated PostgreSQL container (`strategy_db`)
  - Stores: user strategies, strategy versions, templates, indicator configurations

- **Portfolio Service** → Dedicated PostgreSQL container (`portfolio_db`)
  - Stores: portfolio snapshots, aggregated data, historical portfolio states
  - **Includes historical snapshot storage**: hourly portfolio snapshots during market hours

- **Broker Connectivity Service** → Dedicated PostgreSQL container (`broker_db`)
  - Stores: broker connections, API credentials metadata, connection health status

- **Notification Service** → Dedicated PostgreSQL container (`notification_db`)
  - Stores: notification history, user preferences, delivery status

- **Historical Data Service** → Dedicated TimescaleDB container (`historical_data_db`)
  - Stores: OHLCV candle data, time-series market data
  - Uses TimescaleDB for time-series optimization

- **Backtesting Service** → Dedicated PostgreSQL container (`backtesting_db`)
  - Stores: backtest runs, results, simulated trades, equity curves, performance metrics
  - Separate from Portfolio DB to isolate write-heavy backtest operations
  - Also has **read-only access** to `historical_data_db` for market data during simulation

## Access Control

- Each service has dedicated database user/role with credentials
- Each service can only access its own database instance
- Network-level isolation via Docker networking or Kubernetes network policies
- No direct cross-database queries between services
- **Exception: Backtesting Service dual database access**
  - Read-only credentials to `historical_data_db` (TimescaleDB) for market data
  - Read-write credentials to `backtesting_db` (PostgreSQL) for storing results
  - Prevents API overhead for high-volume historical data access during simulation

## Deployment Considerations

- **Development**: Docker Compose with multiple PostgreSQL containers on local machine
- **Production**: Can deploy containers to single server initially, scale to separate nodes later
- **Resource Management**: Configure memory/CPU limits per container to prevent resource contention
- **Backup Strategy**: Independent backup schedules per service based on data criticality

## Consequences

**Positive:**
- Optimized for time-series workload
- Each service maintains data independence
- Independent scaling per service
- Failure isolation between services
- Easier to manage backups and recovery per service
- Consistent PostgreSQL tooling across all services
- User Service merge simplifies development and data access

**Negative:**
- More database containers to manage (development environment)
- Slightly more complex connection management
- Cannot use database-level joins across services (by design)
- User Service merge means larger initial service boundary

**Mitigation:**
- Docker Compose simplifies multi-container orchestration in development
- Azure Database for PostgreSQL can host multiple isolated databases in production
- Service boundaries enforced through API contracts, not database joins
- User Service can be split later if needed (database already separated)

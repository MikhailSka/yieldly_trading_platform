# Architecture Decision Records (ADRs) - Consolidated

This document contains all Architecture Decision Records for the Yieldly Trading Platform.

**Total Documents:** 32  
**Last Generated:** 2025-11-30T23:58:38.346Z  
**Source Directory:** `adrs`


---

## Table of Contents

1. [ADR-001-monolith-vs-microservices-architecture](#adr-001-monolith-vs-microservices-architecture)
2. [ADR-002-database-choice-for-microservices-and-time-series-data](#adr-002-database-choice-for-microservices-and-time-series-data)
3. [ADR-003-containerization-and-orchestration](#adr-003-containerization-and-orchestration)
4. [ADR-004-api-gateway-selection](#adr-004-api-gateway-selection)
5. [ADR-005-centralized-azure-based-development-and-production-environments](#adr-005-centralized-azure-based-development-and-production-environments)
6. [ADR-006-logging-and-monitoring-choice](#adr-006-logging-and-monitoring-choice)
7. [ADR-007-security-and-access-control](#adr-007-security-and-access-control)
8. [ADR-008-database-backup-and-recovery-plan](#adr-008-database-backup-and-recovery-plan)
9. [ADR-009-media-storage-strategy](#adr-009-media-storage-strategy)
10. [ADR-010-ci-cd-pipeline-tooling-and-branching-strategy](#adr-010-ci-cd-pipeline-tooling-and-branching-strategy)
11. [ADR-011-testing-strategy-in-ci-cd-pipeline-simplified-for-solo-developer](#adr-011-testing-strategy-in-ci-cd-pipeline-simplified-for-solo-developer)
12. [ADR-012-configuration-management-approach](#adr-012-configuration-management-approach)
13. [ADR-013-role-based-feature-toggles](#adr-013-role-based-feature-toggles)
14. [ADR-014-front-end-handling-of-feature-toggles](#adr-014-front-end-handling-of-feature-toggles)
15. [ADR-015-alerting-strategy](#adr-015-alerting-strategy)
16. [ADR-016-load-testing-and-performance-benchmarking](#adr-016-load-testing-and-performance-benchmarking)
17. [ADR-017-service-division-and-boundaries-for-phase-1](#adr-017-service-division-and-boundaries-for-phase-1)
18. [ADR-018-api-versioning-strategy](#adr-018-api-versioning-strategy)
19. [ADR-019-azure-service-bus-for-service-communication](#adr-019-azure-service-bus-for-service-communication)
20. [ADR-020-resilience-pattern-approach](#adr-020-resilience-pattern-approach)
21. [ADR-021-broker-integration-and-connectivity-architecture](#adr-021-broker-integration-and-connectivity-architecture)
22. [ADR-022-portfolio-management-service-architecture](#adr-022-portfolio-management-service-architecture)
23. [ADR-023-notification-system-architecture](#adr-023-notification-system-architecture)
24. [ADR-024-strategy-definition-language-and-execution](#adr-024-strategy-definition-language-and-execution)
25. [ADR-025-market-data-flow-and-caching-strategy](#adr-025-market-data-flow-and-caching-strategy)
26. [ADR-026-invite-and-referral-code-system-architecture](#adr-026-invite-and-referral-code-system-architecture)
27. [ADR-027-gdpr-compliance-architecture](#adr-027-gdpr-compliance-architecture)
28. [ADR-028-real-time-market-data-architecture](#adr-028-real-time-market-data-architecture)
29. [ADR-029-api-design-patterns-and-standards](#adr-029-api-design-patterns-and-standards)
30. [ADR-030-technical-indicator-management](#adr-030-technical-indicator-management)
31. [ADR-031-automatic-api-capability-detection](#adr-031-automatic-api-capability-detection)
32. [ADR-032-unified-api-and-message-schema-standards](#adr-032-unified-api-and-message-schema-standards)

---

## ADR-001: Monolith vs. Microservices Architecture

**Source File:** `ADR-001-monolith-vs-microservices-architecture.md`  
**Path:** `adrs\ADR-001-monolith-vs-microservices-architecture.md`

## ADR-001: Monolith vs. Microservices Architecture

### Context
Designing a trading platform that includes a compute-intensive backtesting engine. The system must be scalable for heavy computational loads. The backtesting service requires Python for its excellent library support, while other services will use Go or Java.

### Decision
Implement the system using a microservices architecture rather than a monolithic architecture.

### Rationale
Scalability for Compute-Intensive Workloads

The backtesting service can consume significant resources
Microservices allow independent scaling of the backtesting service
Spin up more instances only when needed
Efficient resource utilization

Technology Flexibility

Use Python specifically for the backtesting service (best library support)
Use Go or Java for other services
Select optimal technology stack per service

Isolation and Independent Development

Each service can be developed, deployed, and updated independently
Easier to manage and evolve specific components
Changes to one service don't disrupt the entire platform


### Implementation Notes

Core services for Phase 1: Authentication, Backtesting, Market Data, Strategy, User Profile, Broker Connectivity, Portfolio, Notification
Each service has clear boundaries and responsibilities
Detailed service specifications documented separately


---

## Context

**Source File:** `ADR-002-database-choice-for-microservices-and-time-series-data.md`  
**Path:** `adrs\ADR-002-database-choice-for-microservices-and-time-series-data.md`

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


---

## ADR-003: Containerization and Orchestration

**Source File:** `ADR-003-containerization-and-orchestration.md`  
**Path:** `adrs\ADR-003-containerization-and-orchestration.md`

## ADR-003: Containerization and Orchestration

### Context
Adopting a microservices architecture requires consistent deployment, management, and scaling of services. Containers ensure each microservice runs in a consistent environment regardless of deployment location.

### Decision
Use Docker for containerization of all microservices and Azure Kubernetes Service (AKS) for orchestration.

### Rationale
Consistency Across Environments

Docker containers ensure microservices run identically across development, testing, and production
Eliminates "works on my machine" problem
Reproducible runtime environment

Scalability and Management

Kubernetes provides robust orchestration capabilities
Automatic scaling based on load
Service discovery and failover handling
Built-in health checking and self-healing

Industry Standard Tools

Docker and Kubernetes are widely adopted and well-documented
Strong community support
Extensive tooling ecosystem

Azure Integration

AKS provides seamless integration with other Azure services
Managed Kubernetes reduces operational overhead
Supports Azure DevOps for CI/CD

Future-Proofing

Cloud-agnostic approach
Can deploy on any cloud provider or on-premises if needed


### Implementation Notes

Containerize all services using Docker
Deploy to AKS for orchestration
Configure auto-scaling policies
Implement health checks for all services


---

## ADR-004: API Gateway Selection

**Source File:** `ADR-004-api-gateway-selection.md`  
**Path:** `adrs\ADR-004-api-gateway-selection.md`

## ADR-004: API Gateway Selection

### Context
Multiple microservices require a unified entry point for client requests. An API gateway handles routing, authentication, load balancing, and rate limiting.

### Decision
Use Nginx as the API gateway.

### Rationale
Proven Reliability

Battle-tested web server and reverse proxy
High performance and stability
Efficient API gateway functionality

Simplicity

Lightweight compared to specialized API gateways
Straightforward configuration
Maintainable for solo developer

Flexibility

Supports wide range of plugins and modules
Rate limiting, SSL termination, and caching capabilities
HTTP Basic Auth and JWT verification
Can handle authentication at gateway level

Integration

Well-supported in Kubernetes ingress controllers
Easy integration with AKS
Works seamlessly with existing infrastructure

Caching Capabilities

Nginx can act as caching layer
Reduces backend load for appropriate endpoints
Built-in caching mechanisms


### Implementation Notes

Configure Nginx for routing to microservices
Implement JWT validation
Set up caching for appropriate endpoints
Consider Redis for distributed caching if needed


---

## ADR-005: Centralized Azure-Based Development and Production Environments

**Source File:** `ADR-005-centralized-azure-based-development-and-production-environments.md`  
**Path:** `adrs\ADR-005-centralized-azure-based-development-and-production-environments.md`

## ADR-005: Centralized Azure-Based Development and Production Environments

### Context
To streamline development and maintain consistency, using Azure for both development and production environments enables unified tooling and leverages Azure's CI/CD capabilities.

### Decision
Maintain both development and production environments on Azure, using Azure DevOps for CI/CD pipelines.

### Rationale
Unified Environment

Both dev and prod in Azure enables easy management and replication
Cloud-based access from anywhere
Consistent tooling and configuration

Azure DevOps CI/CD

Feature branches for development
Main branch deployed to production
Strong DevOps practices
Automated pipeline capabilities

Azure Certification Alignment

Supports Azure certification objectives
Practical experience with Azure ecosystem
Deep expertise in Azure services

Simplified Operations

No local development infrastructure to maintain
Consistent networking and security policies
Easier collaboration if team expands


### Implementation Strategy

Create separate resource groups for development and production
Use Azure DevOps for pipeline automation
Implement proper environment isolation and security
Configure appropriate access controls per environment


---

## ADR-006: Logging and Monitoring Choice

**Source File:** `ADR-006-logging-and-monitoring-choice.md`  
**Path:** `adrs\ADR-006-logging-and-monitoring-choice.md`

## ADR-006: Logging and Monitoring Choice

### Context
Need straightforward logging and monitoring for microservices. Azure-native tools provide the most value given standardization on Azure.

### Decision
Use Azure Monitor for logging and monitoring in both development and production environments.

### Rationale
Integrated Tooling

Designed to work seamlessly with other Azure services
Simplified setup and maintenance
Native integration reduces configuration complexity

Comprehensive Features

Application performance monitoring
Log aggregation and search
Metrics and dashboards
Alerting capabilities

Unified Monitoring

Works across both development and production
Consistent monitoring experience
Single tool to master

Azure Alignment

Supports Azure certification goals
Deepens Azure expertise
Part of Azure ecosystem


### Implementation Notes

Configure Azure Monitor for all services
Set up application insights
Define key metrics to track
Create dashboards for visibility


---

## ADR-007: Security and Access Control

**Source File:** `ADR-007-security-and-access-control.md`  
**Path:** `adrs\ADR-007-security-and-access-control.md`

## ADR-007: Security and Access Control

### Context
Need robust security for both internal team operations and external application users. Internally, must manage who can deploy, configure, and monitor resources. Externally, need secure authentication for users accessing the application.

### Decision
For internal access control, use Azure Active Directory (Azure AD) to define roles and permissions. For external user authentication, use Auth0 integrated with Nginx as API gateway.

### Rationale
Layered Security Approach

Separation of internal and external authentication concerns
Internal team access controlled through Azure AD
External users authenticated through Auth0
Defense in depth strategy

Azure AD for Internal Access

Centralized identity management
Define roles: Admin, Developer, Viewer
Control access to Azure resources
Seamless integration with Azure services

Auth0 for External Authentication

Specialized in user authentication
Proven security practices
OAuth/OIDC support
Easy integration with Nginx gateway

Secure Communication

All internal service communication secured via HTTPS
Appropriate network security groups
Data in transit protection

User Profile Service Separation

Auth0 handles authentication and JWT generation
User Profile Service stores user preferences, settings, portfolio configs
Clean separation: authentication vs. user data management
Different access patterns allow independent scaling


### Implementation Notes

Configure Azure AD for team access to Azure resources
Set up Auth0 tenant for application users
Configure Nginx to validate Auth0 tokens
Implement role-based access control (RBAC)
User Profile Service communicates with other services via APIs


---

## ADR-008: Database Backup and Recovery Plan

**Source File:** `ADR-008-database-backup-and-recovery-plan.md`  
**Path:** `adrs\ADR-008-database-backup-and-recovery-plan.md`

## ADR-008: Database Backup and Recovery Plan

### Context
Data is a critical asset. Need reliable backup and recovery plan to ensure databases are regularly backed up and can be restored if something goes wrong.

### Decision
Implement automated backups using Azure SQL Database's built-in backup features or Azure Blob Storage for other database types. Define Recovery Time Objective (RTO) and Recovery Point Objective (RPO) for data.

### Rationale
Data Protection

Automated backups ensure data is not lost
Regular backup schedule reduces risk
Critical for production system

Azure Native Solution

Azure SQL Database provides automatic backups
Point-in-time restore capabilities
Geo-redundant storage options

Compliance and Best Practices

Essential for any production system
Professional approach to system reliability
Enables disaster recovery planning

Recovery Planning

Defined RTO and RPO provide clear recovery expectations
Documented recovery processes
Peace of mind for system operations


### Implementation Notes

Configure automated backup schedules
Test restore procedures regularly
Document recovery processes
Set appropriate retention periods
Consider geo-redundancy for critical data


---

## ADR-009: Media Storage Strategy

**Source File:** `ADR-009-media-storage-strategy.md`  
**Path:** `adrs\ADR-009-media-storage-strategy.md`

## ADR-009: Media Storage Strategy

### Context
Need reliable and scalable solution for storing media assets like user avatars, strategy screenshots, and other files. Cloud-based solution is more robust and accessible than local storage.

### Decision
Use Azure Blob Storage for storing all media assets.

### Rationale
Scalability and Reliability

Designed to handle large amounts of data
Provides redundancy to ensure files are always available
Scales seamlessly with application growth

Easy Integration

Integrates smoothly with other Azure services
Accessible via APIs
Simple to use within application

Simplified Architecture

No need for separate media service
Store files directly in Blob Storage
Keep URL references in appropriate services
Azure handles infrastructure

Cost-Effective

Pay only for storage used
Multiple storage tiers for cost optimization
No infrastructure management overhead


### Implementation Notes

Store files directly in Azure Blob Storage
Keep references (URLs) in User Profile Service and other services
No dedicated media service needed in Phase 1
Can add CDN later for performance optimization


---

## ADR-010: CI/CD Pipeline Tooling and Branching Strategy

**Source File:** `ADR-010-ci-cd-pipeline-tooling-and-branching-strategy.md`  
**Path:** `adrs\ADR-010-ci-cd-pipeline-tooling-and-branching-strategy.md`

## ADR-010: CI/CD Pipeline Tooling and Branching Strategy

### Context
Using Azure for both development and production requires clear CI/CD pipeline structure and branching strategy in version control.

### Decision
Implement Git branching strategy with main branch for production-ready code, develop branch for ongoing integration, and feature branches for individual work. Use Azure DevOps pipeline to run automated tests on feature branches, merge into develop for integration testing, and promote to main for production deployment.

### Rationale
Clear Separation of Concerns

Branching strategy keeps production code stable
Allows ongoing development and testing
Feature branches isolate work in progress

Automated Quality Control

Pipeline ensures code is tested at multiple stages
Catches issues before production
Reduces manual testing burden

Industry Best Practices

Git flow is well-established pattern
Easy for future team members to understand
Professional development workflow

Azure DevOps Integration

Seamless integration with Azure infrastructure
Unified tooling experience
Built-in pipeline capabilities

Branching Strategy

main - Production-ready code only
develop - Integration branch for ongoing development
feature/* - Individual feature development branches

Pipeline Flow

Developer creates feature branch from develop
Automated tests run on feature branch pushes
Feature merged to develop after review
Integration tests run on develop
Develop merged to main for production release
Production deployment triggered from main branch


---

## ADR-011: Testing Strategy in CI/CD Pipeline (Simplified for Solo Developer)

**Source File:** `ADR-011-testing-strategy-in-ci-cd-pipeline-simplified-for-solo-developer.md`  
**Path:** `adrs\ADR-011-testing-strategy-in-ci-cd-pipeline-simplified-for-solo-developer.md`

## ADR-011: Testing Strategy in CI/CD Pipeline (Simplified for Solo Developer)

### Context
As solo developer, need testing approach that's manageable without overwhelming complexity. Must balance automated testing benefits with development velocity and resource constraints.

### Decision
Phase 1: Start with basic automated tests focusing on build verification and deployment checks. Ensure application builds correctly and can be deployed successfully. Include simple smoke test to verify deployment is running.
Phase 2: Expand to comprehensive testing strategy including:

Unit tests for critical business logic
Integration tests for service interactions
Backtesting validation test suite with known expected outcomes
End-to-end tests for user workflows


### Rationale
Phase 1 - Keep It Simple

Build and deployment tests give quick feedback
Minimal time investment required
Suitable for solo developer constraints
Focus on essentials

Phase 2 - Comprehensive Coverage

Add testing infrastructure as project matures
Backtesting validation critical for platform trust
Known test cases with expected outcomes
More bandwidth available for test development

Practical Approach

Focus on essentials for MVP
Avoid overwhelming testing infrastructure initially
Build foundation that can be expanded

Testing Levels
Phase 1 - Minimal

Build Verification - Ensure code compiles/builds successfully
Deployment Check - Verify deployment completes without errors
Smoke Test - Basic test that application is running and responsive

Phase 2 - Comprehensive

Unit tests for business logic
Integration tests (Postman, pytest)
Backtesting validation suite with hardcoded test data
End-to-end tests (Cypress, Selenium)
Performance testing


### Implementation Notes

Start simple in Phase 1
Manual testing by developer during MVP phase
Expand testing in Phase 2 when adding users
Include in CI/CD pipeline progressively


---

## ADR-012: Configuration Management Approach

**Source File:** `ADR-012-configuration-management-approach.md`  
**Path:** `adrs\ADR-012-configuration-management-approach.md`

## ADR-012: Configuration Management Approach

### Context
Configuration settings need to be managed across different environments (development, testing, production). Need strategy for handling connection strings, API keys, feature flags, and other configuration without hardcoding.

### Decision
Use Azure App Configuration as centralized configuration management solution.

### Rationale
Centralized Management

Manage all settings in one place
Change settings without redeploying application
Single source of truth for configuration

Environment-Specific Configuration

Easy to manage different settings per environment
Switch between environments seamlessly
Reduce configuration errors

Security

Keep sensitive data out of source code
Integration with Azure Key Vault for secrets
Proper access control for configuration

Feature Flag Support

Built-in feature management capabilities
Enable/disable features without deployment
Supports gradual rollouts

Azure Integration

Seamless integration with other Azure services
Part of Azure ecosystem
Consistent with Azure-first approach


### Implementation Notes

Store configuration in Azure App Configuration
Use Key Vault references for secrets
Implement configuration refresh in application
Set up different configuration profiles per environment


---

## ADR-013: Role-Based Feature Toggles

**Source File:** `ADR-013-role-based-feature-toggles.md`  
**Path:** `adrs\ADR-013-role-based-feature-toggles.md`

## ADR-013: Role-Based Feature Toggles

### Context
As new features are developed, need ability to release them gradually or enable them only for certain users or roles before rolling out to everyone.

### Decision
Integrate feature toggle system using Azure App Configuration feature management to turn features on or off based on user roles.

### Rationale
Controlled Rollouts

Test new functionality with specific users before full release
Reduce risk of introducing bugs to all users
Gradual feature adoption

Flexibility

Quickly enable or disable features without changing code
No redeployment required
Respond quickly to issues

Role-Based Access

Different features for admins vs regular users
Support tiered access (free, subscriber, premium)
Beta testing with select users

Development Efficiency

Deploy incomplete features to production behind toggle
Trunk-based development enabled
Reduce long-lived feature branches

Business Value

A/B testing capabilities
Gradual rollout to monitor performance
Quick rollback if issues arise

Implementation

Use Azure App Configuration feature management
Define feature flags for new functionality
Implement role-based targeting
Create UI for feature toggle management (admin panel)


---

## ADR-014: Front-End Handling of Feature Toggles

**Source File:** `ADR-014-front-end-handling-of-feature-toggles.md`  
**Path:** `adrs\ADR-014-front-end-handling-of-feature-toggles.md`

## ADR-014: Front-End Handling of Feature Toggles

### Context
Feature toggles controlled on back end need reflection in front-end application. Front end must know which features are enabled or disabled for current user.

### Decision
When user logs in or application loads, retrieve feature toggle configuration from back end through API call. On front end, conditionally render components or UI elements based on those flags.

### Rationale
Dynamic UI

Front end adapts in real time based on user permissions/roles
No need for separate routes for different user types
Single codebase handles all user types

Consistent Experience

Only appropriate features visible to each user
Maintains consistency between front end and back end
Prevents confusion from visible but inaccessible features

Flexibility Without Code Changes

No front-end code changes needed to enable/disable features
Toggle changes reflected immediately
No frontend deployment needed for feature changes

Cleaner Architecture

Avoid hardcoded routes for different user types
Conditional rendering based on feature flags
More maintainable codebase

Implementation Approach

API endpoint returns user's feature flags on login/app load
Store feature flags in front-end state management
Use flags to conditionally render components
Check flags before showing UI elements
Disable/hide features not available to user


---

## ADR-015: Alerting Strategy

**Source File:** `ADR-015-alerting-strategy.md`  
**Path:** `adrs\ADR-015-alerting-strategy.md`

## ADR-015: Alerting Strategy

### Context
Using Azure Monitor for logging and monitoring. Need to decide when and how to receive notifications if something goes wrong. As solo developer with minimal initial users, need simple alerting approach.

### Decision
Set up basic alerts in Azure Monitor to notify via email if certain thresholds are breached. Start with few key alerts to avoid alert fatigue, then refine as needed.

### Rationale
Early Issue Detection

Basic alerts help catch issues early
Quick response to problems
Reduce downtime

Manageable Alerts

Small set of alerts avoids overwhelming notifications
Focus on critical issues only
Can expand alerting as system matures

Solo Developer Appropriate

Simple email notifications sufficient for Phase 1
Only one user (developer) initially
No need for complex on-call rotation

Resource Efficient

Quick to set up and maintain
Low overhead
Can integrate with DevOps tools later

Initial Alert Thresholds

System downtime (application not responding)
Failed deployments
High CPU usage (>80% for extended period)
Database connection failures
High error rates in logs

Future Expansion

SMS notifications for critical alerts
Integration with DevOps tools (Slack, Teams)
More sophisticated alerting rules
On-call rotation if team expands


---

## ADR-016: Load Testing and Performance Benchmarking

**Source File:** `ADR-016-load-testing-and-performance-benchmarking.md`  
**Path:** `adrs\ADR-016-load-testing-and-performance-benchmarking.md`

## ADR-016: Load Testing and Performance Benchmarking

### Context
Before going live, need to understand how system performs under load. This helps identify bottlenecks and ensures application can handle expected traffic.

### Decision
Incorporate load testing using Azure Load Testing or JMeter. Define performance benchmarks and run tests regularly to validate system meets them.

### Rationale
Performance Validation

Understand system behavior under load
Identify bottlenecks before production
Validate scalability assumptions

Capacity Planning

Determine user capacity
Plan infrastructure scaling needs
Optimize resource allocation

Risk Mitigation

Catch performance issues early
Prevent production performance surprises
Validate architectural decisions


### Implementation Notes

Define performance benchmarks (response times, throughput)
Create load test scenarios simulating realistic usage
Test individual services and end-to-end flows
Run tests regularly during development
Document performance baselines
Monitor for performance regressions

Performance Metrics to Track

Response times (p50, p95, p99)
Throughput (requests per second)
Error rates under load
Resource utilization (CPU, memory, database)
Concurrent user capacity


---

## Context

**Source File:** `ADR-017-service-division-and-boundaries-for-phase-1.md`  
**Path:** `adrs\ADR-017-service-division-and-boundaries-for-phase-1.md`

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


---

## ADR-018: API Versioning Strategy

**Source File:** `ADR-018-api-versioning-strategy.md`  
**Path:** `adrs\ADR-018-api-versioning-strategy.md`

## ADR-018: API Versioning Strategy

### Context
As platform evolves, services will undergo updates and changes. Need to ensure existing clients remain functional and new features can be added without breaking functionality.

### Decision
Implement API versioning using URL-based versioning scheme: /api/v1/... for version one, /api/v2/... for version two.

### Rationale
Backward Compatibility

Clients using older versions won't break when new features introduced
Existing integrations continue to work
Smooth evolution without disruption

Smooth Transition

Developers can gradually migrate clients to newer versions
No forced immediate changes
Time to adapt to API changes

Flexibility

Introduce breaking changes in future versions
Maintain old versions during transition period
Support multiple client versions simultaneously

Microservices Advantage

Architecture makes version management easier
Can run multiple versions of same service
Independent deployment of versions

Implementation Options
URL Versioning (Primary)

Include version number in API path: /api/v1/strategy
Explicit and easy to manage
Clear visual indication of version
Straightforward for clients

Header Versioning (Alternative)

Pass version in custom header
Keeps URLs clean
Can be used as supplementary approach

Deprecation Policy
Version Lifecycle

New versions introduced with clear migration guide
Old versions maintained for defined period (6-12 months)
Deprecation warnings in API responses
Clear communication to clients about timeline
Final sunset date announced in advance

Migration Support

Documentation for version differences
Migration guides provided
Breaking changes clearly documented
Support during transition period


---

## ADR-019: Azure Service Bus for Service Communication

**Source File:** `ADR-019-azure-service-bus-for-service-communication.md`  
**Path:** `adrs\ADR-019-azure-service-bus-for-service-communication.md`

## ADR-019: Azure Service Bus for Service Communication

### Context
As platform grows into microservices architecture, reliable and scalable communication between services becomes crucial.

### Decision
Integrate Azure Service Bus as primary messaging service for inter-service communication.

### Rationale
Reliability

Messages delivered even if service temporarily unavailable
Built-in retry mechanisms
Dead-lettering capabilities for failed messages
Guaranteed message delivery

Scalability

Handles large volume of messages
Communication remains smooth under load
Automatic scaling of messaging infrastructure

Integration with Azure Ecosystem

Seamless integration with other Azure services
Leverages existing Azure infrastructure
Unified management and monitoring
Consistent with Azure-first approach

Flexibility

Supports both queues and topics
Queues (Point-to-Point): Direct service communication
Topics (Publish-Subscribe): Broadcasting events to multiple subscribers
Choose right pattern based on needs

Decoupling

Services don't need direct knowledge of each other
Asynchronous communication reduces tight coupling
Services updated independently
Better fault isolation

Implementation
Setup

Configure Azure Service Bus namespaces
Set up queues for point-to-point messaging
Set up topics for publish-subscribe patterns
Update microservices to connect to Service Bus

Message Patterns

Define standard message formats and contracts
Implement message schemas
Version messages appropriately
Document message flows


### Error Handling

Implement retry policies
Dead-letter queue processing
Error logging and monitoring
Alert on message failures

Use Cases
Queue Examples (Point-to-Point)

Backtesting job requests
User registration notifications
Report generation requests

Topic Examples (Publish-Subscribe)

Market data updates
User action events
System-wide notifications

Considerations

Monitor message throughput and latency
Implement proper error handling and logging
Consider message ordering requirements
Plan for message schema evolution
Handle poison messages appropriately


---

## ADR-020: Resilience Pattern Approach

**Source File:** `ADR-020-resilience-pattern-approach.md`  
**Path:** `adrs\ADR-020-resilience-pattern-approach.md`

## ADR-020: Resilience Pattern Approach

### Context
In microservices architecture, services need to be resilient to failures. Question arose whether to implement resilience patterns (circuit breakers, retries, timeouts) as separate shared service or as pattern within each microservice.

### Decision
Implement resilience pattern directly inside each microservice rather than as separate service.

### Rationale
Simplicity

Easier and faster to develop
Less infrastructure to maintain
Straightforward implementation

Reduced Overhead

No complexity of maintaining additional service
No extra network hop for resilience checks
Lower operational burden

Service Autonomy

Each service handles its own resilience logic
Services remain independent
No dependency on external resilience service

Quick Development

Aligns with Phase 1 goals of building functional MVP
Can use established libraries
Faster time to market

Future Flexibility

Can standardize patterns across services
Can extract to shared library if needed
Can migrate to service mesh later if requirements grow


### Implementation Notes

Each microservice implements own resilience patterns
Use established libraries:

Polly for .NET
resilience4j for Java
tenacity for Python


Standardize pattern implementation for consistency
Document resilience patterns per service

Patterns to Implement

Circuit Breaker - Prevent cascading failures
Retry with Exponential Backoff - Handle transient failures
Timeout - Prevent hanging operations
Bulkhead - Isolate resources
Fallback - Graceful degradation


---

## Context

**Source File:** `ADR-021-broker-integration-and-connectivity-architecture.md`  
**Path:** `adrs\ADR-021-broker-integration-and-connectivity-architecture.md`

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


---

## Context

**Source File:** `ADR-022-portfolio-management-service-architecture.md`  
**Path:** `adrs\ADR-022-portfolio-management-service-architecture.md`

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


---

## ADR-023: Notification System Architecture

**Source File:** `ADR-023-notification-system-architecture.md`  
**Path:** `adrs\ADR-023-notification-system-architecture.md`

## ADR-023: Notification System Architecture

### Context
Platform needs to send email notifications for various events: backtesting completion, strategy errors, system maintenance, portfolio alerts. Need simple, cost-effective solution that can scale as platform grows.

### Decision
Use SendGrid via Azure Marketplace for email delivery and implement dedicated Notification Microservice that consumes events from Azure Service Bus.

### Rationale
SendGrid Selection

Free Tier: 25,000 emails/month (sufficient for Phase 1)
Cost-Effective: ~$15/month for 40,000 emails after free tier
Proven Solution: Well-documented, easy to integrate
Simple Setup: Via Azure Marketplace
Reliable: Industry-standard email service

Dedicated Microservice Approach

Centralized Logic: All notification handling in one place
Decoupling: Other services don't need SendGrid credentials
Template Management: Centralized email templates
Easy Extension: Can add SMS/push notifications later
Service Bus Integration: Leverages existing infrastructure (ADR-019)

Alternative Azure Communication Services rejected because:

More expensive for email
More complex setup
SendGrid simpler for email-only Phase 1
Can migrate later if need SMS

Alternative Embedded Notifications rejected because:

Duplicate code across services
Each service needs SendGrid credentials
Harder to maintain templates
Doesn't align with microservices architecture

Architecture
┌──────────────────────────────────────────────┐
│  Other Services                              │
│  (Backtesting, Portfolio, Strategy, etc.)   │
└─────────────┬────────────────────────────────┘
              │ Publish notification events
              ↓
┌──────────────────────────────────────────────┐
│  Azure Service Bus                           │
│  Topic: notifications                        │
└─────────────┬────────────────────────────────┘
              │ Subscribe to events
              ↓
┌──────────────────────────────────────────────┐
│  Notification Service                        │
├──────────────────────────────────────────────┤
│  - Listen to Service Bus                    │
│  - Process notification events               │
│  - Render email templates                    │
│  - Send via SendGrid                         │
│  - Track delivery status                     │
│  - Retry failed notifications                │
└──────────────────────────────────────────────┘
              │ Email delivery
              ↓
┌──────────────────────────────────────────────┐
│  SendGrid                                    │
│  - SMTP relay                                │
│  - Delivery tracking                         │
│  - Bounce handling                           │
└──────────────────────────────────────────────┘
              │
              ↓
         User's Email
Notification Types (Phase 1)
Backtesting Notifications

Backtesting started
Backtesting completed (with results summary)
Backtesting failed (with error details)

Strategy Notifications

Strategy validation errors
Strategy saved successfully

System Notifications

Scheduled maintenance announcements
System updates
Service disruptions

Security Notifications

Failed login attempts
Password changed
New device login
API key created/revoked

Future (Phase 2)

Trade execution confirmations
Portfolio threshold alerts (significant gains/losses)
Broker connection failures
Daily/weekly portfolio summaries

Event Message Format
Service Bus Message Schema:
```json
{
  "notification_id": "uuid",
  "type": "backtest_complete",
  "user_id": "user_uuid",
  "priority": "normal",
  "timestamp": "ISO8601",
  "data": {
    "backtest_id": "uuid",
    "strategy_name": "SMA Crossover",
    "result_summary": {
      "total_return": "15.3%",
      "win_rate": "62%",
      "max_drawdown": "8.2%"
    }
  },
  "template": "backtest_complete",
  "recipient": {
    "email": "user@example.com",
    "name": "User Name"
  }
}
```
Email Template Management
Template Storage:

HTML templates stored in Azure Blob Storage
Or: Embedded in Notification Service (simpler for Phase 1)
Or: Use SendGrid's template feature

Template Variables:

Dynamic content injection
User name, data from event
Conditional sections

Template Examples:

backtest_complete.html
backtest_failed.html
security_alert.html
system_maintenance.html

User Notification Preferences
Stored in User Profile Service:
- email_enabled (boolean)
- notification_types_enabled (array)
  - backtesting
  - security_alerts
  - system_updates
  - marketing (future)
- preferred_email
- notification_frequency (immediate, digest)
Preference Check:

Notification Service checks user preferences before sending
Respects opt-out settings
Compliance with email regulations

Retry and Error Handling
Retry Strategy:

Failed sends automatically retried
Exponential backoff (1min, 5min, 15min, 1hr)
Max 3 retry attempts
Move to dead-letter queue after max retries

Error Tracking:

Log all send attempts
Track delivery status from SendGrid webhooks
Alert on high failure rates
Monitor bounce rates

Dead Letter Queue Processing:

Manual review of failed notifications
Identify systemic issues (invalid emails, template errors)
User notification of permanent failures

SendGrid Integration
Configuration:

API key stored in Azure Key Vault
SendGrid account linked via Azure Marketplace
Configure sender domain (SPF, DKIM)
Set up webhooks for delivery tracking

Delivery Tracking:

SendGrid provides webhooks for:

Delivered
Opened (if tracking enabled)
Clicked (if tracking enabled)
Bounced
Spam reported


Store delivery status in database

Rate Limiting:

SendGrid handles rate limiting
Notification Service respects SendGrid limits
Queue messages if needed

Monitoring and Alerting
Metrics to Track:

Notifications sent per hour/day
Delivery success rate
Average send time
Queue depth
Failed notifications count

Alerts:

High failure rate (>5%)
SendGrid quota approaching
Queue backing up
Service Bus connection issues

Cost Management
Free Tier (25,000 emails/month):

Sufficient for Phase 1
~800 emails/day average
Supports initial user base

Paid Tier (~$15/month for 40,000):

Needed as user base grows
Still very affordable
Scales linearly

Cost Optimization:

Only send necessary notifications
Respect user preferences (reduce opt-outs)
Use digests for non-urgent notifications (future)
Monitor usage via Azure Cost Management


### Security Considerations
Email Content:

Never include sensitive data (passwords, full API keys)
Use links to platform for detailed information
Implement click-through authentication

Sender Authentication:

Configure SPF records
Configure DKIM signing
Use verified sender domain
Avoid spam triggers

User Privacy:

Allow users to opt out
Honor unsubscribe requests immediately
Comply with GDPR/CAN-SPAM

Implementation Phases
Phase 1A - Basic Email:

SendGrid integration
Service Bus subscription
Simple text templates
Core notification types

Phase 1B - Enhanced Email:

HTML templates with branding
Template variables
User preferences
Delivery tracking

Phase 2 - Extended Channels:

SMS via Azure Communication Services
Push notifications (web/mobile)
In-app notifications
Slack/Discord webhooks

Testing Strategy
Development:

Use SendGrid sandbox mode
Test with personal email accounts
Validate template rendering
Test all notification types

Production:

Monitor first 100 notifications closely
Verify delivery rates
Check spam scores
Validate user preferences respected


### Alternative Considered
Azure Communication Services:

Pros: Native Azure, supports email + SMS
Cons: More expensive, more complex, newer service
Decision: Start with SendGrid, can migrate later


---

## ADR-024: Strategy Definition Language & Execution

**Source File:** `ADR-024-strategy-definition-language-and-execution.md`  
**Path:** `adrs\ADR-024-strategy-definition-language-and-execution.md`

## ADR-024: Strategy Definition Language & Execution

### Context
Users need to create custom trading strategies using technical indicators, entry/exit rules, and risk management logic. The system must execute user-provided code safely in backtesting without compromising security or platform stability.

**Requirements:**
1. Flexible strategy definition (support various indicators and conditions)
2. Safe code execution (prevent malicious code)
3. Easy to learn for beginners, powerful for advanced users
4. Performant for backtesting (thousands of candles)

### Decision
Use **Python-based DSL** with **RestrictedPython** sandboxing and **Docker container isolation** for strategy execution.

### Strategy DSL Design

**DSL Format: Python-based**

Rationale:
- Leverages existing Python libraries (pandas, numpy, pandas-ta)
- Familiar syntax for many traders
- Flexible and powerful
- Large community and resources

**Strategy Components:**
1. **Data Sources:** Price, volume, indicators
2. **Indicators:** SMA, EMA, RSI, MACD, Bollinger Bands, ATR, etc.
3. **Entry Rules:** Conditions to open positions
4. **Exit Rules:** Conditions to close positions (stop-loss, take-profit, trailing stop)
5. **Position Sizing:** Fixed amount, percentage of capital, volatility-based
6. **Risk Management:** Max drawdown limits, max open positions

### Code Editor & Builder

**Monaco Editor Integration:**
- Syntax highlighting (Python)
- Auto-completion (indicators, strategy methods)
- Real-time syntax validation
- Inline error messages
- Code folding and minimap

**Built-in Documentation:**
- DSL reference (available indicators, methods)
- Strategy templates (starter code)
- Code examples library
- Interactive help panel

**Validation (Pre-execution):**
- Python syntax check (AST parsing)
- Detect prohibited imports/functions
- Verify required methods present
- Check for common mistakes

### Strategy Execution Sandbox (Security)

User code must be sandboxed to prevent malicious actions through multiple security layers.

#### Layer 1: RestrictedPython

**Restrictions:**
- No `eval()` or `exec()`
- No `open()` (file access)
- No `__import__()` (arbitrary imports)
- No access to `os`, `sys`, `subprocess` modules
- No network access via standard library

**Allowed:**
- Basic Python syntax (if/else, loops, functions)
- Math operations
- pandas, numpy (data manipulation)
- pandas-ta (technical indicators)

#### Layer 2: Docker Container Isolation

**Container Security:**
- Network isolation (--network none)
- Filesystem: read-only except /tmp
- Non-root user execution
- Drop all capabilities

**Resource Limits:**
- Memory: 512MB
- CPU: 0.5 core
- Timeout: 5 minutes maximum
- Disk (tmp): 100MB

**Library Access:**
- Allowed: pandas, numpy, pandas-ta, Python standard library (restricted subset)
- Blocked: requests, urllib, subprocess, os, sys, socket

#### Layer 3: Code Validation (AST Parsing)

**Pre-execution checks:**
- Prohibited imports detection
- Prohibited function calls (eval, exec, open, __import__)
- Excessively nested loops
- Suspicious patterns

### Strategy Execution Workflow

1. User submits backtest request
2. Strategy Service validates strategy code (AST parsing)
3. If validation passes, send job to Backtesting Service
4. Backtesting Service creates isolated Docker container
5. Strategy code + historical data loaded into container
6. RestrictedPython executes strategy in sandbox
7. Strategy generates trades (buy/sell signals)
8. Backtesting engine simulates trades (fee, slippage)
9. Results calculated
10. Container destroyed (cleanup)
11. Results stored in database
12. User notified

**Execution Timeout:**
- Max 5 minutes per backtest
- If timeout exceeded → Kill container, mark as failed

### Strategy Management

**CRUD Operations:**
- Create: Save new strategy to database
- Read: Load strategy for editing or execution
- Update: Save modified strategy (creates new version)
- Delete: Soft-delete strategy

**Versioning:**
- Automatic versioning (v1, v2, v3)
- Version created on every "publish" action
- Users can run backtests on any version
- Version history viewable

**Privacy:**
- Phase 1: All strategies private (no sharing)
- Phase 2+: Optional strategy sharing/marketplace

### Backtesting Engine

**Execution Model:**
- Event-driven backtesting (process candles sequentially)
- No look-ahead bias
- Realistic order execution (next candle open price)

**Fee & Slippage Modeling:**
- Exchange-specific fees (Bybit: 0.1%, Binance: 0.1%)
- Basic slippage: Fixed percentage (0.05% default)
- Advanced slippage (Phase 2+): Volume-based

**Position Tracking:**
- Current position (long, short, flat)
- Entry price, quantity, unrealized P&L
- Multiple open positions support (Phase 2+)

### Performance Optimization

**Data Loading:**
- Pre-load historical data from TimescaleDB
- Cache in memory during backtest
- Use pandas DataFrames (vectorized operations)

**Indicator Calculation:**
- Vectorized operations (pandas/numpy)
- Cache indicator values

**Parallel Backtesting (Phase 2+):**
- Run multiple backtests concurrently
- Use Kubernetes job scaling

### Monitoring & Logging

**Execution Metrics:**
- Backtest duration
- Memory usage
- CPU usage
- Number of trades generated

**Logging:**
- Strategy execution logs (user-visible)
- System logs (errors, warnings)
- Performance logs

**Alerts:**
- Backtest timeout (critical)
- Container creation failed (critical)
- High memory usage (warning)

### Future Enhancements (Phase 2+)

**Visual Strategy Builder (No-Code):**
- Drag-and-drop interface (React Flow)
- Pre-built blocks (indicators, conditions, actions)
- Generates Python code under the hood

**Machine Learning Strategies:**
- Support for ML libraries (scikit-learn, TensorFlow Lite)
- Separate sandbox with higher resource limits
- Model training in cloud

**Live Trading Execution:**
- Connect strategy to live market data
- Execute trades via Broker Connectivity Service
- Real-time portfolio updates
- Risk management automation

### Alternatives Considered

**Option 1: JSON/YAML Configuration**
- Pros: Easier to parse, safer
- Cons: Limited flexibility, hard to express complex logic
- Decision: Rejected - too restrictive

**Option 2: Custom DSL (Proprietary Language)**
- Pros: Full control, maximum security
- Cons: Learning curve, limited ecosystem, high development cost
- Decision: Rejected - not worth effort for solo developer

**Option 3: JavaScript-based DSL**
- Pros: Frontend/backend consistency
- Cons: Weaker data science libraries compared to Python
- Decision: Rejected - Python superior for quantitative analysis


---

## Context

**Source File:** `ADR-025-market-data-flow-and-caching-strategy.md`  
**Path:** `adrs\ADR-025-market-data-flow-and-caching-strategy.md`

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


---

## ADR-026: Invite and Referral Code System Architecture

**Source File:** `ADR-026-invite-and-referral-code-system-architecture.md`  
**Path:** `adrs\ADR-026-invite-and-referral-code-system-architecture.md`

## ADR-026: Invite and Referral Code System Architecture

### Status
Proposed

### Context
Yieldly requires an invite-only registration system for Phase 1 to control user onboarding and build an exclusive community. The system must:
- Prevent open public registration during beta/MVP phase
- Allow admins to generate invite codes for controlled user acquisition
- Track invite code usage and analytics
- Be designed for future evolution into a referral/referral-reward system when platform goes fully public

### Decision
Implement a **flexible invite code system** that starts as admin-controlled invites and can evolve into a user referral system post-launch.

### Architecture

#### Database Schema

```sql
-- Invite Codes Table
CREATE TABLE invite_codes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(20) UNIQUE NOT NULL,
    created_by          UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMP,
    max_uses            INTEGER DEFAULT 1,  -- 1, 10, 100, -1 (unlimited)
    current_uses        INTEGER DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, expired, revoked, exhausted
    assigned_role       VARCHAR(50) NOT NULL DEFAULT 'free_user',  -- Role to assign to new users
    invite_type         VARCHAR(20) NOT NULL DEFAULT 'admin',  -- admin, referral (for future)
    metadata            JSONB,  -- Flexible field for future features

    CHECK (status IN ('active', 'expired', 'revoked', 'exhausted')),
    CHECK (invite_type IN ('admin', 'referral')),
    CHECK (max_uses = -1 OR max_uses > 0)
);

-- Invite Code Usage Tracking
CREATE TABLE invite_code_usage (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code_id      UUID NOT NULL REFERENCES invite_codes(id),
    used_by             UUID NOT NULL REFERENCES users(id),
    used_at             TIMESTAMP NOT NULL DEFAULT NOW(),
    user_ip             VARCHAR(45),  -- IPv4/IPv6
    user_agent          TEXT,

    UNIQUE (invite_code_id, used_by)  -- Prevent duplicate usage by same user
);

-- Indexes
CREATE INDEX idx_invite_codes_code ON invite_codes(code);
CREATE INDEX idx_invite_codes_created_by ON invite_codes(created_by);
CREATE INDEX idx_invite_codes_status ON invite_codes(status);
CREATE INDEX idx_invite_code_usage_invite_code_id ON invite_code_usage(invite_code_id);
CREATE INDEX idx_invite_code_usage_used_by ON invite_code_usage(used_by);
```

#### Code Format

**Phase 1 (Admin Invites):**
- Format: `YIELDLY-XXXXX-XXXXX`
- Example: `YIELDLY-A7G3K-9NQ2M`
- Length: 18 characters (YIELDLY- prefix + 10 alphanumeric)
- Character set: Uppercase letters + numbers (excluding ambiguous: 0, O, I, 1, L)
- Generation: Cryptographically secure random

**Future Phase (Referral Codes):**
- Format: `YIELDLY-{USERNAME}-XXXX` (optional)
- Example: `YIELDLY-JOHN-5K9M`
- Or keep same random format

#### Invite Code Types

| Type | Created By | Max Uses | Expires | Use Case |
|------|-----------|----------|---------|----------|
| **Single-Use Admin** | Admin | 1 | Optional | Individual invitations |
| **Multi-Use Admin** | Admin | 10-100 | Optional | Event invitations, bulk onboarding |
| **Unlimited Admin** | Admin | -1 (unlimited) | Optional | Trusted partners, special campaigns |
| **Referral** (Future) | Users | -1 (unlimited) | Never | User-driven growth, rewards |

### API Endpoints

#### Admin Endpoints

```
POST   /api/v1/admin/invite-codes
GET    /api/v1/admin/invite-codes
GET    /api/v1/admin/invite-codes/:id
PATCH  /api/v1/admin/invite-codes/:id/revoke
DELETE /api/v1/admin/invite-codes/:id
GET    /api/v1/admin/invite-codes/:id/usage
GET    /api/v1/admin/invite-codes/analytics
```

#### Public Endpoints

```
POST   /api/v1/auth/register  (requires valid invite code)
POST   /api/v1/auth/validate-invite-code  (check if code is valid before registration)
```

#### User Endpoints (Future - Referral System)

```
GET    /api/v1/user/my-referral-code  (get user's personal referral code)
GET    /api/v1/user/referrals  (see who joined using my code)
GET    /api/v1/user/referral-stats  (referral analytics)
```

### Invite Code Lifecycle

```
[Generated by Admin] → [Active]
                         ├─> [Expired] (time-based expiration)
                         ├─> [Revoked] (manually by admin)
                         ├─> [Exhausted] (max uses reached)
                         └─> [Active] (continues if unlimited or within limits)
```

### Validation Rules

**Code Validation Logic (on registration):**
1. Code exists in database ✓
2. Code status is 'active' ✓
3. Code has not expired (expires_at > NOW or NULL) ✓
4. Code has remaining uses (current_uses < max_uses OR max_uses = -1) ✓
5. User has not already used this code ✓

**On Successful Registration:**
1. Increment `current_uses`
2. Create record in `invite_code_usage`
3. If `current_uses >= max_uses AND max_uses != -1`, set status to 'exhausted'
4. Assign role to new user based on `assigned_role`

### Security Considerations

**Brute Force Prevention:**
- Rate limit code validation endpoint (10 attempts per hour per IP)
- CAPTCHA on registration page
- Account suspension after 5 failed validation attempts
- Monitor for code guessing patterns

**Code Generation Security:**
- Use cryptographically secure random generator
- Avoid predictable patterns
- Character set excludes ambiguous characters (0, O, I, 1, L)
- Ensure uniqueness before persisting

### Admin Panel Features

**Code Generation Form:**
- Quantity: 1-100 codes at once
- Max uses: 1, 10, 50, 100, Unlimited
- Expiration: None, 7 days, 30 days, 90 days, Custom date
- Role assignment: Free User, Beta Tester, Subscriber (future)
- Label/Purpose: Optional text field for tracking

**Code Management Table:**
- Columns: Code, Created By, Created At, Expires At, Uses (X/Y), Status, Actions
- Filters: Status, Created Date Range, Created By
- Actions: Copy Code, View Usage, Revoke, Extend Expiration
- Bulk actions: Export to CSV, Bulk Revoke

**Analytics Dashboard:**
- Total codes generated
- Active codes count
- Codes used (exhausted)
- Codes expired
- Codes revoked
- New registrations per code (top 10)
- Registration timeline (daily/weekly)
- Conversion rate (codes sent vs. used)

### Future Evolution: Referral System

**When transitioning to public launch (Phase 2+):**

1. **Enable User Referral Codes:**
   - Auto-generate referral code for every user
   - Format: User-specific (username-based or unique random)
   - Unlimited uses, never expires

2. **Referral Rewards (Optional):**
   - Track referral count per user
   - Reward referrers:
     - Free premium features
     - Extended backtest quotas
     - Subscription discounts
     - Commission sharing (if trading goes live)

3. **Referral Analytics:**
   - Leaderboard of top referrers
   - Referral chain visualization (multi-level)
   - Referral source tracking (social media, blog, etc.)

4. **Migration Path:**
   - Keep admin invites for special cases
   - Disable mandatory invite requirement for general public
   - Invite codes become optional referral tracking

### Implementation Notes

**Service Ownership:**
- Auth Service owns invite code validation
- User Profile Service tracks referral relationships (future)
- Admin Service manages code generation and analytics

**Database:**
- Invite codes stored in Auth Service database (PostgreSQL)
- Separate schema from user authentication tables

**Caching:**
- Cache frequently validated codes in Redis (5-minute TTL)
- Invalidate cache on code status change

**Logging:**
- Log all invite code creation (who, when, parameters)
- Log all validation attempts (success/failure, IP, user agent)
- Log all revocations (who revoked, reason)

### Error Handling

**Invalid Code Scenarios:**
```
Code not found        → "Invalid invite code"
Code expired          → "This invite code has expired"
Code exhausted        → "This invite code has reached its usage limit"
Code revoked          → "This invite code has been revoked"
Already used by user  → "You have already used this invite code"
```

### Monitoring & Alerts

**Metrics to Track:**
- Invite codes generated per day
- Invite codes used per day
- Average time from code generation to usage
- Unused code ratio (codes generated but never used)
- Registration conversion rate

**Alerts:**
- Spike in failed invite code validations (possible attack)
- Unused codes approaching expiration (admin action needed)
- Low invite code inventory (< 10 active codes)

### Alternatives Considered

#### Option 1: Third-Party Invite Management Service
- **Pros:** Faster implementation, managed service
- **Cons:** External dependency, limited customization, recurring cost
- **Decision:** Build in-house for full control and future referral features

#### Option 2: Simple Single-Use Codes Only
- **Pros:** Simplest implementation
- **Cons:** No flexibility for events, partners, or future referral system
- **Decision:** Rejected - need flexibility for various use cases

#### Option 3: Email-Based Invitations Only
- **Pros:** No code management needed
- **Cons:** Cannot track who invited whom, no bulk invites, no referral evolution
- **Decision:** Rejected - lacks analytics and future-proofing

### Consequences

**Positive:**
- Complete control over user onboarding during beta
- Rich analytics for understanding growth channels
- Easy evolution to referral/reward system
- Prevents spam and low-quality signups
- Builds exclusivity and demand

**Negative:**
- Additional development complexity
- Admin overhead for code management (mitigated by bulk generation)
- Potential friction in user acquisition (intentional trade-off)

**Risks:**
- Code leaking publicly (mitigate with expiration and usage limits)
- Code sharing abuse (monitor usage patterns)
- Admin code management burden (provide good UX tools)


---

## ADR-027: GDPR Compliance Architecture

**Source File:** `ADR-027-gdpr-compliance-architecture.md`  
**Path:** `adrs\ADR-027-gdpr-compliance-architecture.md`

## ADR-027: GDPR Compliance Architecture

### Status
Proposed

### Context
Yieldly must comply with GDPR (General Data Protection Regulation) requirements as it handles personal data of EU users. The platform operates using a microservices architecture where user data is distributed across multiple services and databases. GDPR mandates specific user rights that must be technically implemented:

**Key GDPR Rights:**
1. **Right to Access** (Article 15) - Users can request all personal data held
2. **Right to Rectification** (Article 16) - Users can correct inaccurate data
3. **Right to Erasure** (Article 17) - Users can request deletion ("Right to be Forgotten")
4. **Right to Data Portability** (Article 20) - Users can export data in machine-readable format

**Challenges:**
- Data scattered across 8+ microservices and databases
- Need to aggregate data for exports without coupling services
- Need to cascade deletion across services atomically
- Must preserve audit trails while respecting deletion requests
- Must handle anonymization for analytics/backtesting results

### Decision
Implement a **distributed GDPR compliance system** using event-driven architecture (Azure Service Bus) to orchestrate data operations across microservices while maintaining service independence.

**Phase 1 Implementation:** GDPR orchestration logic integrated into **User Profile Service** (avoids creating additional microservice for infrequent operations).

**Future Consideration:** Extract to dedicated GDPR Orchestrator Service if complexity warrants (Phase 2+).

### Architecture

#### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│              User Profile Service + GDPR Orchestration           │
│  - User profile CRUD                                             │
│  - GDPR export/deletion request handling                         │
│  - Coordinates GDPR operations via Service Bus                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Publishes events to
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Service Bus (Topics)                    │
│  - gdpr.export.requested                                         │
│  - gdpr.deletion.requested                                       │
│  - gdpr.deletion.confirmed                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │ Auth Service │    │ Strategy Svc │    │Portfolio Svc │
  │ (Subscriber) │    │ (Subscriber) │    │ (Subscriber) │
  └──────────────┘    └──────────────┘    └──────────────┘
```

**Rationale for Integration into User Profile Service:**
- GDPR operations are infrequent (not performance-critical)
- User Profile Service already owns core user data
- Reduces operational overhead for solo developer
- Fewer microservices to deploy, monitor, and maintain
- Can extract to dedicated service later if complexity grows
- Natural fit: GDPR requests initiated from user profile settings

#### Service Data Ownership

| Service | Data Owned | GDPR Relevance |
|---------|-----------|----------------|
| **Auth Service** | Email, password hash, login history, sessions | ✅ Personal Data |
| **User Profile Service** | Name, bio, avatar, preferences, experience level | ✅ Personal Data |
| **Strategy Service** | User-created strategies, versions, descriptions | ✅ User Content |
| **Broker Connectivity Service** | API keys (encrypted), connection metadata | ✅ Sensitive Data |
| **Portfolio Service** | Portfolio snapshots, transaction history | ✅ Financial Data |
| **Notification Service** | Notification preferences, history | ✅ Personal Preferences |
| **Backtesting Service** | Backtest results, execution logs (stored in `backtesting_db`) | ⚠️ Anonymizable Analytics |
| **Media Service** (Azure Blob) | Avatar images, strategy screenshots | ✅ User Content |
| **Admin Service** | Admin actions log, invite codes used | ⚠️ Audit Trail (partial retention) |

### GDPR Operations

#### 1. Data Export (Right to Access + Data Portability)

**User Flow:**
```
User → Profile Settings → "Export My Data" → Email Confirmation →
Wait (24h) → Download ZIP (7-day availability)
```

**Export Data Format:**

ZIP Structure:
```
user_data_export_2025-10-26.zip
├── README.txt                    (explains contents)
├── auth_data.json
├── profile_data.json
├── strategies.json
├── portfolio_data.json
├── connections.json
├── notifications.json
├── backtests.json
└── media/
    ├── avatar.jpg
    └── strategy_screenshots/
```

**Rate Limiting:**
- One export request per user per 30 days
- Prevent abuse of export functionality

**Security:**
- Download links use Azure Blob SAS tokens (time-limited, read-only)
- Links automatically expire after 7 days
- User must be authenticated to request export
- Email confirmation required before processing

#### 2. Data Deletion (Right to Erasure / Right to be Forgotten)

**User Flow:**
```
User → Profile Settings → "Delete My Account" →
Confirmation Dialog (WARNING) → Email Confirmation →
30-Day Grace Period → Final Deletion
```

**Grace Period (30 Days):**

Purpose:
- Prevent accidental deletions
- Allow users to change their mind
- Comply with financial record retention (if applicable)

During Grace Period:
- Account marked as `pending_deletion`
- User cannot log in
- User can cancel deletion via email link
- No data is deleted yet
- Broker connections automatically disconnected

**Anonymization vs. Hard Deletion:**

| Data Type | Action | Reason |
|-----------|--------|--------|
| Personal identifiers (name, email) | **Hard delete** | No business need |
| Auth credentials | **Hard delete** | Security requirement |
| Strategy code | **Hard delete** | User content, no analytics value |
| Backtest results | **Anonymize** | Valuable for platform analytics |
| Transaction history | **Hard delete** OR **Anonymize** | Depends on regulatory requirements |
| API keys | **Hard delete** | Security requirement |
| Audit logs | **Anonymize** (hash user_id) | Compliance requirement |

Anonymization Strategy:
```sql
-- Example: Anonymize backtest results in backtesting_db (see ADR-002)
UPDATE backtest_results
SET user_id = NULL,
    user_identifier = MD5(user_id::text),  -- One-way hash for grouping
    anonymized_at = NOW()
WHERE user_id = :deleted_user_id;

-- Also anonymize related trade records
UPDATE backtest_trades
SET user_id = NULL
WHERE backtest_id IN (
    SELECT id FROM backtest_results WHERE user_id = :deleted_user_id
);
```

**Cancellation Flow:**

```
User receives deletion email → Clicks "Cancel Deletion" →
Validates cancellation token → Reactivates account →
User can log in again
```

#### 3. Data Rectification (Right to Rectification)

Implementation:
- User can directly edit profile data (name, bio, preferences)
- No special GDPR process needed - standard update APIs
- Changes logged in audit trail

#### 4. Consent Management (GDPR Article 7)

**Cookie Consent:**
```
On first visit → Cookie consent banner →
User accepts/rejects → Store preference →
Apply cookie policy
```

Cookie Types:
- Essential: Authentication, session (cannot be rejected)
- Functional: Preferences, theme (can be rejected)
- Analytics: Azure Monitor, usage tracking (can be rejected)

**Privacy Policy & Terms:**
- User must accept during registration
- Version tracked (privacy_policy_v1, terms_v1)
- User must re-accept if policies change significantly

Acceptance Tracking:
```sql
CREATE TABLE user_consents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    consent_type    VARCHAR(50) NOT NULL,
    consent_version VARCHAR(20) NOT NULL,
    accepted_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    ip_address      VARCHAR(45),

    UNIQUE (user_id, consent_type, consent_version)
);
```

### Monitoring & Compliance

**Metrics to Track:**
- GDPR export requests per month
- Average export processing time
- GDPR deletion requests per month
- Deletion completion rate (should be 100%)
- Failed deletions (investigate immediately)

**Alerts:**
- Export processing > 24 hours (SLA violation)
- Deletion confirmation missing from any service (critical)
- Spike in deletion requests (investigate reason)

### Audit Logging (Compliance)

**What to log (immutable, 3-year retention):**
- All GDPR export requests (who, when, completed)
- All GDPR deletion requests (who, when, completed)
- Consent acceptance events (what, when, version, IP)
- Data breach incidents (if any)
- Admin access to user data (when, who, reason)

Audit Log Storage:
- Separate append-only database or Azure Table Storage
- Encrypted at rest
- Admin-only access
- Automated archival after 3 years

### Data Breach Response Plan

**In case of data breach (GDPR Article 33):**

1. **Detect & Contain** (within 24 hours)
   - Identify affected data
   - Stop the breach
   - Preserve evidence

2. **Assess Severity** (within 24 hours)
   - Risk to user rights and freedoms?
   - Sensitive data exposed?
   - Number of users affected

3. **Notify Authorities** (within 72 hours)
   - Report to relevant Data Protection Authority (DPA)
   - Required if high risk to users

4. **Notify Affected Users** (without undue delay)
   - If high risk to users
   - Explain nature of breach
   - Explain steps taken
   - Explain steps users should take

5. **Document Incident**
   - Full incident report
   - Lessons learned
   - Remediation steps

### Data Protection Officer (DPO)

**Phase 1 (MVP):**
- Solo developer acts as DPO
- DPO contact: privacy@yieldly.io (or founder email)

**Phase 2 (Growth):**
- Designate formal DPO if:
  - Regular monitoring of data subjects at large scale
  - Processing sensitive data at scale
  - Required by law

### International Data Transfers

**Current Approach:**
- All data stored in **Azure West Europe** (primary)
- Backup in **Azure North Europe**
- No data transfer outside EU

**Third-Party Services (Data Processing Agreements required):**
- Auth0: GDPR-compliant, EU data residency option
- SendGrid: GDPR-compliant, EU data residency option
- Azure: GDPR-compliant, EU regions

### Privacy by Design Principles

1. **Data Minimization:** Collect only necessary data
2. **Purpose Limitation:** Use data only for stated purposes
3. **Storage Limitation:** Delete data when no longer needed
4. **Accuracy:** Allow users to correct their data
5. **Integrity & Confidentiality:** Encrypt data, secure access
6. **Accountability:** Document compliance measures

### Documentation Requirements

**User-Facing:**
- Privacy Policy (clear, accessible)
- Cookie Policy
- Terms of Service
- Data export instructions
- Data deletion instructions

**Internal:**
- Data Processing Inventory (what data, why, how long)
- Data Flow Diagrams (where data goes)
- GDPR procedures documentation
- Incident response plan
- Vendor GDPR compliance verification

### Implementation Checklist

**Phase 1 (MVP Launch):**
- [ ] Implement data export functionality
- [ ] Implement account deletion with grace period
- [ ] Create Privacy Policy & Terms of Service
- [ ] Implement cookie consent banner
- [ ] Set up audit logging
- [ ] Document data flows
- [ ] Verify third-party GDPR compliance
- [ ] Set up GDPR request monitoring

**Phase 2 (Ongoing):**
- [ ] Regular privacy audits (yearly)
- [ ] Update policies as needed
- [ ] Train team on GDPR (when team grows)
- [ ] Review and improve processes

### Related ADRs
- ADR-007: Security and Access Control (data encryption, access control)
- ADR-008: Database Backup and Recovery (data retention)
- ADR-019: Azure Service Bus (event-driven GDPR operations)
- ADR-026: Invite and Referral Code System (invite data anonymization)


---

## ADR-028: Real-Time Market Data Architecture

**Source File:** `ADR-028-real-time-market-data-architecture.md`  
**Path:** `adrs\ADR-028-real-time-market-data-architecture.md`

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


---

## ADR-029: API Design Patterns and Standards

**Source File:** `ADR-029-api-design-patterns-and-standards.md`  
**Path:** `adrs\ADR-029-api-design-patterns-and-standards.md`

## ADR-029: API Design Patterns and Standards

### Context
As we build multiple microservices exposing REST APIs, we need consistent patterns for common operations like listing resources, filtering, sorting, and pagination. Without standardization, each service might implement these features differently, leading to inconsistent user experience, inefficient data transfer, and potential performance issues when dealing with large datasets.

### Decision
Implement standardized API design patterns across all microservices for list/collection endpoints, with **mandatory pagination and search**, plus optional sorting and filtering capabilities.

### Rationale

**Performance and Scalability**
- Pagination prevents loading large datasets unnecessarily
- Reduces memory consumption on both server and client
- Improves response times by limiting data transfer
- Essential for admin endpoints that may return thousands of records

**Consistent User Experience**
- Predictable API behavior across all endpoints
- Same query parameters across different resources
- Easier for frontend developers to implement
- Simplified API documentation

**Network Efficiency**
- Reduces bandwidth usage
- Faster initial page loads
- Progressive data loading improves perceived performance
- Mobile-friendly data consumption

**Database Performance**
- LIMIT and OFFSET clauses reduce database load
- Indexed sorting columns improve query performance
- Prevents full table scans on large tables

**User Experience**
- Users expect to search/filter large lists
- Finding specific items without search is frustrating
- Search improves usability and reduces support requests
- Standard across all modern web applications

### Implementation Standards

#### 1. Pagination (Mandatory for all list endpoints)

**Query Parameters:**
- `page` (integer, default: 1): Current page number (1-indexed)
- `pageSize` or `page_size` (integer, default varies by endpoint): Number of items per page
- Maximum page size: Configurable per endpoint (typically 100-200)

**Response Format:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 1247,
    "totalPages": 25,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

**Default Page Sizes by Endpoint Type:**
- Admin user lists: 50 per page
- User strategies: 20 per page
- Transaction history: 50 per page
- Backtest history: 20 per page
- Notification lists: 30 per page
- Search results: 20-50 per page (depending on data richness)

#### 2. Search (Mandatory for all list endpoints)

**Query Parameter:**
- `search` or `q` (string, optional but always supported): Search term
- Searches across relevant text fields appropriate for that resource
- Case-insensitive partial matching (use ILIKE or full-text search)
- Empty or omitted = return all results (paginated)

**Search Fields by Endpoint Type:**
- **Users:** email, name, user ID
- **Strategies:** name, description
- **Backtests:** strategy name, trading pair
- **Transactions:** asset, transaction type
- **Notifications:** message content, title
- **Trading Pairs:** symbol, base currency, quote currency

**Implementation:**
- Use database indexes on searchable text fields
- PostgreSQL: Use `ILIKE '%term%'` or full-text search (tsvector) for better performance
- Search should work with pagination (search results are paginated)
- Return empty results if no matches found (with pagination metadata)

**Examples:**
- `GET /api/v1/admin/users?search=john&page=1&pageSize=50`
- `GET /api/v1/strategies?q=momentum&page=1`
- `GET /api/v1/backtests?search=BTCUSDT&sortBy=date`

**Validation:**
- Minimum search term length: 1 character (configurable per endpoint if needed)
- Maximum search term length: 100 characters
- Sanitize input to prevent SQL injection (use parameterized queries)
- Trim whitespace from search terms

#### 3. Sorting (Recommended for list endpoints)

**Query Parameters:**
- `sortBy` or `sort_by` (string): Field name to sort by
- `sortOrder` or `sort_order` (string): `asc` or `desc` (default: `desc` for dates, `asc` for names)

**Examples:**
- `GET /api/v1/admin/users?sortBy=registrationDate&sortOrder=desc`
- `GET /api/v1/strategies?sortBy=name&sortOrder=asc`

**Allowed Sort Fields:**
- Must be explicitly defined per endpoint
- Typically include: name, date fields, status, numerical metrics
- Reject requests with invalid sort fields (400 Bad Request)

#### 4. Filtering (Recommended for complex list endpoints)

**Query Parameters:**
- Use descriptive field names: `status`, `dateFrom`, `dateTo`, `type`, etc.
- Support multiple values where appropriate: `status=active,suspended`
- Use ISO 8601 format for dates: `dateFrom=2024-01-01T00:00:00Z`

**Examples:**
- `GET /api/v1/admin/users?status=active&role=betaTester`
- `GET /api/v1/backtests?dateFrom=2024-01-01&status=completed`
- `GET /api/v1/transactions?type=trade,fee&exchange=binance`

#### 5. Combined Example

```
GET /api/v1/admin/users?
  page=2&
  pageSize=50&
  sortBy=lastLogin&
  sortOrder=desc&
  status=active&
  role=betaTester&
  search=john
```

### Endpoints Requiring Pagination and Search

All list endpoints must support both pagination and search functionality.

**Admin Endpoints:**
- GET /api/v1/admin/users (view all users)
  - Search: email, name, user ID
  - Sort: registration date, last login, email, role
- GET /api/v1/admin/invite-codes (view invite codes)
  - Search: code, created by
  - Sort: creation date, usage count, status
- GET /api/v1/admin/system/logs (view system logs)
  - Search: message, service name, level
  - Sort: timestamp, level, service

**User Endpoints:**
- GET /api/v1/strategies (list strategies)
  - Search: name, description
  - Sort: name, modified date, status
- GET /api/v1/backtests (backtest history)
  - Search: strategy name, trading pair
  - Sort: run date, total return, drawdown
- GET /api/v1/backtests/:id/trades (trade logs)
  - Search: symbol, trade type
  - Sort: timestamp, profit/loss
- GET /api/v1/portfolio/transactions (transaction history)
  - Search: asset, transaction type
  - Sort: timestamp, amount, type
- GET /api/v1/notifications (notification list)
  - Search: message content, title
  - Sort: timestamp, read status, priority
- GET /api/v1/media (uploaded media files)
  - Search: filename, type
  - Sort: upload date, file size

**Market Data Endpoints:**
- GET /api/v1/market/pairs (trading pairs list)
  - Search: symbol, base currency, quote currency
  - Sort: volume, name
- GET /api/v1/market/recent-trades (recent trades)
  - Search: symbol
  - Sort: timestamp, volume

### Error Handling

**Invalid Page Number:**
- Request: `page=0` or `page=-1`
- Response: 400 Bad Request with message "Page number must be >= 1"

**Page Exceeds Total:**
- Request: `page=1000` when only 25 pages exist
- Response: 200 OK with empty data array and pagination metadata

**Invalid Page Size:**
- Request: `pageSize=10000`
- Response: 400 Bad Request with message "Page size must be between 1 and {maxPageSize}"

**Invalid Sort Field:**
- Request: `sortBy=invalidField`
- Response: 400 Bad Request with message "Invalid sort field. Allowed: {allowedFields}"

**Search Term Too Long:**
- Request: `search={101+ characters}`
- Response: 400 Bad Request with message "Search term must be 100 characters or less"

### Performance Considerations

**Database Indexing:**
- Create indexes on commonly sorted columns (dates, names, status)
- **Create indexes on all searchable text fields** (email, name, description, etc.)
- For PostgreSQL: Consider GIN indexes for full-text search on large text fields
- Composite indexes for common filter combinations
- Monitor slow queries and add indexes as needed

**Search Performance:**
- Use `ILIKE` for simple partial matching (ensure field is indexed)
- For large datasets or complex searches, use PostgreSQL full-text search (tsvector, tsquery)
- Consider prefix matching (`LIKE 'term%'`) for better index utilization when appropriate
- Set reasonable query timeouts to prevent slow searches from blocking resources

**Caching:**
- Cache frequently requested pages (especially page 1)
- Use Redis with short TTL (30-60 seconds) for highly requested endpoints
- Invalidate cache on data modifications

**Query Optimization:**
- Use database LIMIT and OFFSET for pagination
- Avoid SELECT * - only fetch required columns
- Use JOINs judiciously to prevent N+1 queries

### Migration Plan

**Phase 1 (Immediate):**
- Implement pagination and search on all new endpoints
- Document standards in API documentation
- Create reusable pagination and search middleware/utilities

**Phase 2 (During development):**
- Review existing functional requirements
- Update requirements to explicitly specify pagination and search
- Ensure consistency across all list endpoints

**Phase 3 (Before production):**
- API testing to verify all list endpoints follow standards
- Performance testing with large datasets
- Frontend implementation validation

### Implementation Notes

**Backend:**
- Create reusable pagination and search utility/middleware
- Standardize response format across all services
- Validate query parameters at API gateway level
- Sanitize search input to prevent SQL injection (use parameterized queries)

**Frontend:**
- Create reusable pagination components
- Create reusable search input component with debouncing (300ms delay)
- Implement infinite scroll or traditional pagination UI
- Handle loading states gracefully
- Show "no results" state when search returns empty

**Documentation:**
- API documentation must include pagination and search examples
- Specify default page sizes for each endpoint
- Document maximum page sizes and performance implications
- List searchable fields for each endpoint
- Document search behavior (partial match, case-insensitive)

### Exceptions

**Small, Static Lists:**
- Lists guaranteed to have < 20 items (e.g., trading preferences, notification types)
- Can omit pagination but should still return consistent format
- Examples: User settings options, supported exchanges list

**Real-Time Streams:**
- WebSocket feeds don't require pagination
- Use different patterns (windowing, subscription filtering)

### Related ADRs
- ADR-018: API Versioning Strategy
- ADR-025: Market Data Flow & Caching Strategy


---

## Context

**Source File:** `ADR-030-technical-indicator-management.md`  
**Path:** `adrs\ADR-030-technical-indicator-management.md`

# ADR-030: Technical Indicator Management Architecture

**Status:** Accepted  
**Date:** 2025-11-03

## Context
Users need access to technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands, etc.) to build trading strategies. The platform must:
- Provide a comprehensive library of technical indicators
- Allow users to browse available indicators with descriptions
- Enable admins to manage indicator metadata (descriptions, examples, enable/disable)
- Use industry-standard indicator calculations (TA-Lib library)
- Expose indicators to frontend for strategy building
- Maintain indicator definitions across Backtesting and Strategy services

## Decision
Implement a **distributed indicator management system** where:
1. **Backtesting Service** owns the technical indicator library (TA-Lib) and provides raw indicator definitions
2. **Strategy Service** manages indicator configurations, metadata, and exposes curated indicators to frontend
3. **Admins** can enable/disable indicators and add documentation through Strategy Service
4. **Frontend** fetches indicator list from Strategy Service for strategy building

## Architecture Overview

### Component Ownership

**Backtesting Service:**
- Interface with TA-Lib (or pandas-ta)
- Provide list of available indicators with technical specifications
- Calculate indicator values during backtest execution
- Expose indicator definitions via REST API

**Strategy Service:**
- Fetch indicator definitions from Backtesting Service
- Cache most common indicators locally in `strategy_db`
- Store indicator metadata (descriptions, examples, active status)
- Expose curated indicator list to frontend
- Allow admins to manage indicator configurations

### Data Flow

```
TA-Lib Library → Backtesting Service (Indicator Library Manager)
                         ↓
            REST API (/api/v1/backtests/indicators)
                         ↓
            Strategy Service (Indicator Manager)
                         ↓
            strategy_db (cached indicators + metadata)
                         ↓
            REST API (/api/v1/indicators)
                         ↓
                    Frontend
```

## Backtesting Service: Indicator Library Manager

### Responsibilities
- Interface with TA-Lib to list available indicators
- Provide technical specifications (parameters, return types)
- Calculate indicator values during backtest execution

### Component: Indicator Library Manager

```python
class IndicatorLibraryManager:
    """Manages interface to TA-Lib indicator library"""
    
    def list_indicators(self) -> List[IndicatorDefinition]:
        """Get all indicators from TA-Lib"""
        pass
    
    def get_indicator_details(self, indicator_name: str) -> IndicatorDefinition:
        """Get details for specific indicator"""
        pass
    
    def calculate_indicator(self, indicator_name: str, 
                          data: pd.DataFrame, 
                          params: Dict) -> pd.Series:
        """Calculate indicator values for given data"""
        pass
```

### API Endpoints

```
GET /api/v1/backtests/indicators
  - List all available indicators from TA-Lib
  - Returns technical specifications
  
GET /api/v1/backtests/indicators/:name
  - Get details for specific indicator
  - Returns parameters, return type, calculation method
```

### Response Example

```json
{
  "indicators": [
    {
      "name": "SMA",
      "full_name": "Simple Moving Average",
      "category": "Overlap Studies",
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 30,
          "min": 2,
          "max": 100000
        }
      ],
      "input": ["close"],
      "output": ["sma"],
      "function": "talib.SMA"
    },
    {
      "name": "RSI",
      "full_name": "Relative Strength Index",
      "category": "Momentum Indicators",
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 14,
          "min": 2,
          "max": 100000
        }
      ],
      "input": ["close"],
      "output": ["rsi"],
      "function": "talib.RSI"
    },
    {
      "name": "BBANDS",
      "full_name": "Bollinger Bands",
      "category": "Overlap Studies",
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 5,
          "min": 2,
          "max": 100000
        },
        {
          "name": "nbdevup",
          "type": "float",
          "default": 2.0
        },
        {
          "name": "nbdevdn",
          "type": "float",
          "default": 2.0
        }
      ],
      "input": ["close"],
      "output": ["upperband", "middleband", "lowerband"],
      "function": "talib.BBANDS"
    }
  ]
}
```

## Strategy Service: Indicator Manager

### Responsibilities
- Fetch indicator definitions from Backtesting Service
- Cache most common indicators in `strategy_db`
- Store admin-curated metadata (descriptions, examples, active status)
- Expose indicators to frontend with user-friendly documentation
- Manage indicator visibility (enable/disable)

### Component: Indicator Manager

```go
type IndicatorManager struct {
    backtestingClient *BacktestingServiceClient
    repository        *IndicatorRepository
    cache             *redis.Client
}

// Fetch indicators from Backtesting Service
func (im *IndicatorManager) SyncIndicators() error {}

// Get indicator list for frontend
func (im *IndicatorManager) GetIndicators(onlyActive bool) ([]Indicator, error) {}

// Get indicator details with examples
func (im *IndicatorManager) GetIndicatorDetails(name string) (*IndicatorDetails, error) {}

// Update indicator metadata (admin only)
func (im *IndicatorManager) UpdateIndicatorMetadata(name string, metadata IndicatorMetadata) error {}
```

### API Endpoints

```
GET /api/v1/indicators
  - List curated indicators for users
  - Returns indicators with descriptions and examples
  - Filter: ?active=true (only enabled indicators)
  
GET /api/v1/indicators/:name
  - Get detailed indicator information
  - Includes usage examples and parameter guidance
  
PUT /api/v1/admin/indicators/:name
  - Update indicator metadata (admin only)
  - Can enable/disable, add descriptions, examples
  
POST /api/v1/admin/indicators/sync
  - Trigger sync from Backtesting Service (admin only)
```

### Response Example (Frontend-Facing)

```json
{
  "indicators": [
    {
      "name": "SMA",
      "full_name": "Simple Moving Average",
      "category": "Overlap Studies",
      "description": "The Simple Moving Average (SMA) is a technical indicator that calculates the average price over a specified period. It smooths out price data to identify trend direction.",
      "active": true,
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 30,
          "min": 2,
          "max": 100000,
          "description": "Number of periods to calculate average"
        }
      ],
      "usage_example": "sma_20 = SMA(close, timeperiod=20)",
      "common_use_cases": [
        "Identify trend direction",
        "Generate buy/sell signals when price crosses SMA",
        "Support/resistance levels"
      ],
      "popular_periods": [10, 20, 50, 100, 200]
    },
    {
      "name": "RSI",
      "full_name": "Relative Strength Index",
      "category": "Momentum Indicators",
      "description": "RSI measures the speed and magnitude of price changes. Values range from 0-100. Above 70 indicates overbought conditions, below 30 indicates oversold.",
      "active": true,
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 14,
          "min": 2,
          "max": 100000,
          "description": "Number of periods for RSI calculation"
        }
      ],
      "usage_example": "rsi = RSI(close, timeperiod=14)",
      "common_use_cases": [
        "Identify overbought/oversold conditions",
        "Divergence trading",
        "Momentum confirmation"
      ],
      "popular_periods": [14, 21, 28],
      "thresholds": {
        "overbought": 70,
        "oversold": 30
      }
    }
  ]
}
```

## Database Schema

### Strategy Service: indicator_configs table

```sql
CREATE TABLE indicator_configs (
    indicator_id UUID PRIMARY KEY,
    indicator_name VARCHAR(50) NOT NULL UNIQUE, -- 'SMA', 'RSI', etc.
    full_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    usage_example TEXT,
    common_use_cases JSONB, -- Array of strings
    active BOOLEAN DEFAULT true,
    technical_spec JSONB NOT NULL, -- From Backtesting Service
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_indicator_configs_active ON indicator_configs(active);
CREATE INDEX idx_indicator_configs_category ON indicator_configs(category);
```

### Example Row

```sql
INSERT INTO indicator_configs VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'SMA',
    'Simple Moving Average',
    'Overlap Studies',
    'The Simple Moving Average (SMA) is a technical indicator that calculates the average price over a specified period.',
    'sma_20 = SMA(close, timeperiod=20)',
    '["Identify trend direction", "Generate buy/sell signals", "Support/resistance levels"]',
    true,
    '{"parameters": [...], "input": ["close"], "output": ["sma"]}',
    NOW(),
    NOW()
);
```

## Synchronization Strategy

### Initial Sync (On Deployment)
```
1. Strategy Service starts up
2. Calls Backtesting Service: GET /api/v1/backtests/indicators
3. Stores all indicators in strategy_db with default active=true
4. Admin can then customize descriptions and enable/disable
```

### Periodic Sync (Weekly)
```
1. Cron job triggers indicator sync
2. Fetch indicators from Backtesting Service
3. Update technical_spec for existing indicators
4. Add new indicators (if TA-Lib updated)
5. Preserve admin customizations (descriptions, active status)
```

### Cache Strategy
- Cache most common indicators (top 20) in Redis
- TTL: 24 hours
- Invalidate on admin update

## Admin Workflow

### Enabling/Disabling Indicators
```
1. Admin views all indicators: GET /api/v1/admin/indicators
2. Admin disables complex indicator (e.g., ULTOSC)
3. PUT /api/v1/admin/indicators/ULTOSC
   Body: { "active": false }
4. Strategy Service updates indicator_configs
5. Frontend no longer shows ULTOSC in indicator list
```

### Adding Descriptions and Examples
```
1. Admin edits indicator: PUT /api/v1/admin/indicators/RSI
   Body: {
     "description": "RSI measures momentum...",
     "usage_example": "rsi = RSI(close, 14)",
     "common_use_cases": ["Overbought/oversold", "Divergence"],
     "popular_periods": [14, 21, 28]
   }
2. Strategy Service updates indicator_configs
3. Users see enhanced documentation in UI
```

## Frontend Integration

### Strategy Builder UI
```javascript
// Fetch indicators for dropdown
fetch('/api/v1/indicators?active=true')
  .then(response => response.json())
  .then(data => {
    // Populate indicator selector
    data.indicators.forEach(indicator => {
      addIndicatorOption(indicator.name, indicator.full_name);
    });
  });

// Show indicator details on selection
fetch('/api/v1/indicators/RSI')
  .then(response => response.json())
  .then(indicator => {
    // Display description, parameters, examples
    showIndicatorHelp(indicator);
  });
```

### Code Editor Autocomplete
- Strategy Service can provide indicator list for IDE autocomplete
- Include parameter hints from indicator definitions
- Show inline documentation from indicator descriptions

## Performance Considerations

### Caching Strategy
- **Redis Cache** (24-hour TTL)
  - Most common indicators cached
  - Invalidate on admin update
  
- **Database Storage**
  - All indicators stored in `strategy_db`
  - Indexed on active status and category

### Query Optimization
- Frontend queries filtered by active=true
- Category-based filtering for large indicator lists
- Pagination for admin views (if > 100 indicators)

## Security Considerations

### Admin-Only Operations
- Only admins can:
  - Enable/disable indicators
  - Update descriptions and metadata
  - Trigger manual sync from Backtesting Service

### Validation
- Indicator names must match TA-Lib definitions
- Parameter types validated before saving
- SQL injection prevention on indicator queries

## TA-Lib Indicator Categories

**Overlap Studies:**
- SMA, EMA, WMA, DEMA, TEMA, TRIMA
- KAMA, MAMA, T3
- BBANDS (Bollinger Bands)
- SAR (Parabolic SAR)

**Momentum Indicators:**
- RSI, STOCH (Stochastic), STOCHF
- MACD, MACDEXT, MACDFIX
- CCI (Commodity Channel Index)
- MOM (Momentum), ROC (Rate of Change)
- WILLR (Williams %R)
- ADX, ADXR, DX

**Volume Indicators:**
- AD (Accumulation/Distribution)
- ADOSC (Chaikin A/D Oscillator)
- OBV (On Balance Volume)

**Volatility Indicators:**
- ATR (Average True Range)
- NATR (Normalized ATR)
- TRANGE (True Range)

**Price Transform:**
- AVGPRICE, MEDPRICE, TYPPRICE, WCLPRICE

**Pattern Recognition:**
- CDL patterns (50+ candlestick patterns)

## Example: Most Common Indicators to Cache

**Top 20 Most Used Indicators (Cache in Redis):**
1. SMA (Simple Moving Average)
2. EMA (Exponential Moving Average)
3. RSI (Relative Strength Index)
4. MACD (Moving Average Convergence Divergence)
5. BBANDS (Bollinger Bands)
6. ATR (Average True Range)
7. STOCH (Stochastic Oscillator)
8. ADX (Average Directional Index)
9. CCI (Commodity Channel Index)
10. MOM (Momentum)
11. ROC (Rate of Change)
12. WILLR (Williams %R)
13. OBV (On Balance Volume)
14. SAR (Parabolic SAR)
15. STDDEV (Standard Deviation)
16. AROON (Aroon Indicator)
17. TRIX (Triple Exponential Average)
18. KAMA (Kaufman Adaptive Moving Average)
19. HT_TRENDLINE (Hilbert Transform - Instantaneous Trendline)
20. LINEARREG (Linear Regression)

## Future Enhancements

### Phase 2
- **Custom Indicators**: Allow users to define custom indicators in Python
- **Indicator Backtesting**: Test individual indicators across multiple assets
- **Indicator Combinations**: Suggest indicator combinations that work well together
- **Performance Analytics**: Track which indicators are most used/successful

### Phase 3
- **ML-Based Indicator Selection**: Recommend indicators based on market conditions
- **Indicator Optimization**: Auto-tune indicator parameters for specific assets

## Consequences

**Positive:**
- Clean separation of concerns (calculation vs management)
- Admins can curate user experience
- Backtesting Service remains focused on execution
- Strategy Service provides user-friendly interface
- Cache strategy reduces load on both services
- Easy to update indicator metadata without code changes
- Frontend gets comprehensive indicator documentation

**Negative:**
- Requires synchronization between services
- Additional database storage in Strategy Service
- Potential sync delays for new indicators

**Mitigation:**
- Automated sync jobs
- Admin can trigger manual sync
- Redis caching reduces query load
- Clear API contracts between services

## Related ADRs
- ADR-017: Service Division and Boundaries
- ADR-024: Strategy Definition Language and Execution
- ADR-029: API Design Patterns and Standards


---

## Context

**Source File:** `ADR-031-automatic-api-capability-detection.md`  
**Path:** `adrs\ADR-031-automatic-api-capability-detection.md`

# ADR-031: Automatic API Capability Detection for Exchange Connections

**Status:** Accepted  
**Date:** 2025-01-22

## Context

When users connect their exchange accounts (Bybit, Binance) to Yieldly, they configure API key permissions directly on the exchange platform. These permissions determine what operations the API key can perform (read portfolio, access market data, execute trades, withdraw funds, etc.).

Initially, the design included manual feature toggles in Yieldly (checkboxes for "Enable Portfolio Sync", "Enable Market Data", "Enable Historical Data"). This approach created several problems:

1. **Duplicate Configuration**: Users would need to configure permissions twice - once on the exchange, once in Yieldly
2. **Configuration Drift**: Exchange permissions are the source of truth, but manual toggles could become out of sync
3. **Poor User Experience**: Users could enable features in Yieldly that their API key doesn't actually support, leading to confusing errors
4. **Security Risk**: No automatic validation that keys are truly read-only (required for Phase 1)
5. **Maintenance Overhead**: Manual toggles require UI components, validation logic, and user documentation

The fundamental question: Should Yieldly duplicate exchange permission configuration, or should it automatically detect what the API key can do?

## Decision

Implement **automatic API capability detection** instead of manual feature toggles.

When a user adds an exchange connection, Yieldly will:
1. Test the provided API credentials against known endpoints
2. Automatically detect which permissions the key has
3. Store the detected capabilities in the database
4. Display the detected capabilities to the user (read-only view)
5. Use these capabilities to determine feature availability

## Rationale

### Single Source of Truth
- Exchange permissions are the authoritative source
- Eliminates configuration duplication
- No possibility of drift between Yieldly and exchange settings

### Better User Experience
- User configures permissions once (on exchange)
- Yieldly automatically discovers what the key can do
- Clear feedback: "✓ Portfolio Access Detected, ✓ Market Data Access Detected"
- No confusing checkboxes asking users to duplicate exchange configuration

### Automatic Security Validation
- Detects if API key has unexpected permissions (trading, withdrawal)
- Phase 1 requires read-only keys - detection enforces this automatically
- Warning users if key has dangerous permissions they shouldn't have granted

### Reduced Complexity
- No UI components for manual toggles
- No validation logic for checkbox consistency
- No user documentation explaining why they need to set permissions twice

### Future-Proof Design
- Easy to add detection for new capability types
- Supports different permission models across exchanges
- Enables automatic migration when exchange APIs change

## Implementation Details

### Capability Detection Process

```
1. User provides API key and secret
2. Yieldly creates connection with status: TESTING
3. CapabilityDetector runs tests:
   - Test portfolio read: GET /v5/account/wallet-balance
   - Test market data: GET /v5/market/tickers
   - Test historical data: GET /v5/market/kline
   - Test trading: POST /v5/order/create (should fail)
   - Test withdrawal: POST /v5/asset/withdraw (should fail)
4. Store results in detected_capabilities JSONB field
5. Update connection status based on results:
   - ACTIVE: Has required read permissions, no write permissions
   - ERROR: Missing required permissions or has dangerous permissions
6. Display results to user
```

### Database Schema

**broker_connections table:**
```sql
detected_capabilities JSONB NULL
capabilities_detected_at TIMESTAMP NULL
```

**Example detected_capabilities JSON:**
```json
{
  "portfolio_read": true,
  "market_data_read": true,
  "historical_data_read": true,
  "trading": false,
  "withdrawal": false,
  "detected_at": "2025-01-22T10:30:00Z",
  "test_results": {
    "portfolio": {
      "endpoint": "/v5/account/wallet-balance",
      "method": "GET",
      "success": true,
      "status_code": 200,
      "response_time_ms": 145
    },
    "trading": {
      "endpoint": "/v5/order/create",
      "method": "POST",
      "success": false,
      "status_code": 403,
      "error_message": "API key does not have trading permission"
    }
  }
}
```

### New Components

**CapabilityDetector** - Responsible for testing API key permissions
- Tests specific endpoints for each capability
- Returns structured APICapabilities object
- Exchange-agnostic interface

**APICapabilities Domain Model** - Represents detected permissions
```go
type APICapabilities struct {
    PortfolioRead         bool
    MarketDataRead        bool
    HistoricalDataRead    bool
    Trading               bool
    Withdrawal            bool
    DetectedAt            time.Time
    TestResults           map[string]EndpointTestResult
}

func (c APICapabilities) HasAnyReadPermission() bool
func (c APICapabilities) HasDangerousPermissions() bool
```

### API Changes

**New endpoint:**
```
POST /api/v1/broker/connections/{id}/detect-capabilities
```

**Updated response model:**
```json
{
  "connection_id": "uuid",
  "broker": "bybit",
  "status": "active",
  "capabilities": {
    "portfolio_read": true,
    "market_data_read": true,
    "historical_data_read": true,
    "trading": false,
    "withdrawal": false
  },
  "capabilities_detected_at": "2025-01-22T10:30:00Z"
}
```

### UI Changes

**Before (Manual Toggles - Removed):**
```
[ ] Enable Portfolio Sync
[ ] Enable Market Data
[ ] Enable Historical Data
[Connect]
```

**After (Auto-Detection):**
```
[Paste API Key]
[Validate & Connect]

↓ (Automatic detection runs) ↓

✓ Portfolio Access: Enabled
✓ Market Data Access: Enabled  
✓ Historical Data Access: Enabled
⚠ Trading Access: Disabled (as required)
⚠ Withdrawal Access: Disabled (as required)

[Connected]
```

## Consequences

### Positive
- **Reduced User Friction**: One-step configuration instead of two
- **Automatic Validation**: No way to enable features the key doesn't support
- **Security Enforcement**: Automatic detection of non-read-only keys
- **Simpler Codebase**: Removed manual toggle logic from UI and backend
- **Better Error Messages**: Can tell user exactly which permission is missing

### Negative
- **API Call Overhead**: Initial connection requires 5-10 test API calls
- **Detection Delay**: Takes 1-2 seconds to run all capability tests
- **Exchange API Changes**: If exchange changes endpoints, detection logic needs updates

### Neutral
- **Periodic Re-detection**: Should re-run detection during health checks to catch revoked permissions
- **Cache Capabilities**: Store in database to avoid re-testing on every request

## Alternatives Considered

### Alternative 1: Manual Feature Toggles
**Description**: Keep checkboxes for users to manually enable features  
**Rejected Because**: Creates duplicate configuration, poor UX, security risk

### Alternative 2: Assume All Read Permissions
**Description**: Don't detect capabilities, assume all read-only keys have all permissions  
**Rejected Because**: No validation, would lead to confusing errors when permissions are missing

### Alternative 3: User-Declared Permissions
**Description**: Ask user to declare what their key can do  
**Rejected Because**: Users might not know, could lie (intentionally or not), still duplicate config

## Migration Strategy

### Phase 1 (Current Implementation)
- Remove feature toggle fields from UI
- Remove feature toggle columns from database (already done)
- Implement CapabilityDetector
- Add detected_capabilities JSONB field
- Run capability detection on new connections

### Backward Compatibility
- Existing connections without detected_capabilities: Run detection on next health check
- Display "Capabilities being detected..." during migration period

## Monitoring and Alerting

### Metrics to Track
- Capability detection success rate
- Detection duration (should be < 2 seconds)
- Percentage of connections with dangerous permissions detected
- Rate of capability changes on existing connections

### Alerts
- Alert if >10% of detections fail (indicates exchange API issues)
- Alert if any connection detects trading/withdrawal permissions (Phase 1 violation)
- Alert if detection takes >5 seconds (performance degradation)

## References

- **Related ADRs**: 
  - ADR-021: Broker Integration and Connectivity Architecture
  - ADR-007: Security and Access Control
- **Exchange API Documentation**:
  - Bybit API Permissions: https://bybit-exchange.github.io/docs/v5/guide#authentication
  - Binance API Keys: https://www.binance.com/en/support/faq/how-to-create-api-360002502072

## Review and Approval

**Reviewed by**: Solo Developer  
**Approved by**: Solo Developer  
**Implementation Priority**: High (Required for Phase 1)


---

## ADR-032: Unified API and Message Schema Standards

**Source File:** `ADR-032-unified-api-and-message-schema-standards.md`  
**Path:** `adrs\ADR-032-unified-api-and-message-schema-standards.md`

## ADR-032: Unified API and Message Schema Standards

### Context
As a microservices platform with multiple backend services (User, Strategy, Backtesting, Broker, Portfolio, Historical Data, Notification), we need **consistent API request/response formats** and **standardized Service Bus message schemas** across all services. Without unified schemas, each service might implement different response structures, leading to:
- Inconsistent frontend integration patterns
- Duplicated error handling logic
- Confusion for developers
- Difficult maintenance and debugging
- Incompatible service-to-service communication

This ADR complements:
- **ADR-018**: API Versioning Strategy (URL versioning)
- **ADR-029**: API Design Patterns (pagination, search, filtering)
- **ADR-019**: Azure Service Bus for inter-service communication
- **ADR-023**: Notification System (has one message format example)

### Decision
Implement **unified API request/response schemas** and **standardized Service Bus message formats** across all microservices.

---

## Part 1: API Request/Response Standards

### 1.1 Success Response Format

**For Single Resource Operations** (GET /resource/{id}, POST /resource, PUT /resource/{id}):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "field1": "value1",
    "field2": "value2"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**For Collection/List Operations** (GET /resources):
```json
{
  "success": true,
  "data": [
    { "id": "uuid1", "name": "Item 1" },
    { "id": "uuid2", "name": "Item 2" }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 1247,
    "totalPages": 25,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**For Async Operations** (POST /backtests):
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "estimatedCompletion": "< 5 minutes",
    "pollUrl": "/api/v1/backtests/{jobId}/status"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**For Delete Operations** (DELETE /resource/{id}):
```json
{
  "success": true,
  "message": "Resource deleted successfully",
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

### 1.2 Error Response Format

**Standard Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Email address is invalid",
        "code": "INVALID_EMAIL"
      },
      {
        "field": "password",
        "message": "Password must be at least 8 characters",
        "code": "PASSWORD_TOO_SHORT"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123-xyz789"
  }
}
```

**Error Response Without Field Details:**
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Strategy not found",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123-xyz789"
  }
}
```

### 1.3 Standard Error Codes

**Client Errors (4xx):**
- `VALIDATION_ERROR` - Input validation failed (400)
- `AUTHENTICATION_REQUIRED` - Missing or invalid auth token (401)
- `FORBIDDEN` - User lacks permission (403)
- `RESOURCE_NOT_FOUND` - Requested resource doesn't exist (404)
- `CONFLICT` - Resource already exists / conflict (409)
- `RATE_LIMIT_EXCEEDED` - Quota or rate limit exceeded (429)

**Server Errors (5xx):**
- `INTERNAL_SERVER_ERROR` - Unexpected server error (500)
- `SERVICE_UNAVAILABLE` - Service temporarily unavailable (503)
- `GATEWAY_TIMEOUT` - Upstream service timeout (504)

**Domain-Specific Errors:**
- `QUOTA_EXCEEDED` - User exceeded their quota (429)
- `INVALID_CREDENTIALS` - Invalid API key or password (400)
- `EXPIRED_TOKEN` - Token has expired (401)
- `DUPLICATE_RESOURCE` - Resource with same identifier exists (409)
- `EXTERNAL_SERVICE_ERROR` - Third-party service failed (502)

### 1.4 HTTP Status Code Guidelines

| HTTP Code | Usage | Example |
|-----------|-------|---------|
| 200 OK | Successful GET, PUT, PATCH | Resource retrieved/updated |
| 201 Created | Successful POST | Resource created |
| 204 No Content | Successful DELETE | Resource deleted |
| 400 Bad Request | Validation error, invalid input | Invalid email format |
| 401 Unauthorized | Authentication required/failed | Missing JWT token |
| 403 Forbidden | User lacks permission | Non-admin accessing admin endpoint |
| 404 Not Found | Resource doesn't exist | Strategy ID not found |
| 409 Conflict | Duplicate or conflict | Email already registered |
| 429 Too Many Requests | Rate limit/quota exceeded | Max 100 backtests/month |
| 500 Internal Server Error | Unexpected server error | Database connection failed |
| 502 Bad Gateway | External service error | Exchange API failed |
| 503 Service Unavailable | Service temporarily down | Maintenance mode |
| 504 Gateway Timeout | Upstream timeout | Backtesting service timeout |

### 1.5 Field Naming Conventions

**Use camelCase for JSON fields:**
- ✅ `userId`, `firstName`, `createdAt`
- ❌ `user_id`, `first_name`, `created_at`

**Use snake_case for query parameters** (for consistency with pagination standard):
- ✅ `?page_size=50&sort_by=created_at`
- ❌ `?pageSize=50&sortBy=createdAt`

**Rationale**: Query parameters use snake_case to match existing pagination standard (ADR-029), while JSON payloads use camelCase (JavaScript/TypeScript convention).

### 1.6 Date/Time Format

**Always use ISO 8601 format with timezone:**
- ✅ `2024-12-01T12:00:00Z` (UTC)
- ✅ `2024-12-01T12:00:00+01:00` (with timezone offset)
- ❌ `2024-12-01 12:00:00` (ambiguous)
- ❌ Unix timestamps (not human-readable)

---

## Part 2: Service Bus Message Standards

### 2.1 Standard Message Envelope

**All Service Bus messages MUST use this format:**
```json
{
  "messageId": "uuid",
  "eventType": "domain.action.status",
  "timestamp": "2024-12-01T12:00:00Z",
  "version": "1.0",
  "source": {
    "service": "backtesting-service",
    "instance": "backtesting-worker-01"
  },
  "payload": {
    // Event-specific data
  },
  "metadata": {
    "correlationId": "uuid",
    "causationId": "uuid",
    "userId": "uuid"
  }
}
```

**Field Descriptions:**
- `messageId`: Unique identifier for this message (UUID v4)
- `eventType`: Event name in format `domain.action.status` (e.g., `backtest.execution.completed`)
- `timestamp`: When event occurred (ISO 8601)
- `version`: Message schema version (semantic versioning)
- `source.service`: Which service published this event
- `source.instance`: Which instance/worker published (for debugging)
- `payload`: Domain-specific event data
- `metadata.correlationId`: Links related events (e.g., all events in a user session)
- `metadata.causationId`: ID of the event that caused this event (for tracing)
- `metadata.userId`: User associated with this event (optional)

### 2.2 Event Type Naming Convention

**Format:** `{domain}.{action}.{status}` (3 parts)

**Examples:**
- `backtest.execution.started`
- `backtest.execution.completed`
- `backtest.execution.failed`
- `user.registration.completed`
- `user.email.verified`
- `strategy.creation.completed`
- `strategy.validation.failed`
- `broker.connection.established`
- `broker.connection.lost`
- `portfolio.snapshot.created`
- `notification.email.sent`
- `notification.email.bounced`

**Domain Categories:**
- `backtest.*` - Backtesting events
- `user.*` - User account events
- `strategy.*` - Strategy management events
- `broker.*` - Broker connectivity events
- `portfolio.*` - Portfolio tracking events
- `notification.*` - Notification delivery events
- `system.*` - System-wide events

### 2.3 Example: Backtest Completion Event

```json
{
  "messageId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "backtest.execution.completed",
  "timestamp": "2024-12-01T14:35:22Z",
  "version": "1.0",
  "source": {
    "service": "backtesting-service",
    "instance": "backtest-worker-03"
  },
  "payload": {
    "backtestId": "123e4567-e89b-12d3-a456-426614174000",
    "strategyId": "789e4567-e89b-12d3-a456-426614174000",
    "strategyName": "SMA Crossover",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "dateRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-12-01T00:00:00Z"
    },
    "results": {
      "finalValue": 12500.50,
      "totalReturn": 25.01,
      "totalTrades": 47,
      "winRate": 62.5,
      "maxDrawdown": -15.2,
      "sharpeRatio": 1.42
    },
    "executionTime": 125.3,
    "completedAt": "2024-12-01T14:35:22Z"
  },
  "metadata": {
    "correlationId": "req-abc123-xyz789",
    "causationId": "job-def456-uvw012",
    "userId": "user-aaa111-bbb222"
  }
}
```

### 2.4 Example: User Registration Event

```json
{
  "messageId": "660e8400-e29b-41d4-a716-446655440001",
  "eventType": "user.registration.completed",
  "timestamp": "2024-12-01T10:15:30Z",
  "version": "1.0",
  "source": {
    "service": "user-service",
    "instance": "user-api-02"
  },
  "payload": {
    "userId": "user-123456-abcdef",
    "email": "user@example.com",
    "registrationMethod": "email",
    "inviteCode": "BETA2024XYZ",
    "emailVerificationRequired": true
  },
  "metadata": {
    "correlationId": "req-xyz789-abc123",
    "causationId": null,
    "userId": "user-123456-abcdef"
  }
}
```

### 2.5 Example: Notification Request Event

```json
{
  "messageId": "770e8400-e29b-41d4-a716-446655440002",
  "eventType": "notification.email.requested",
  "timestamp": "2024-12-01T14:36:00Z",
  "version": "1.0",
  "source": {
    "service": "backtesting-service",
    "instance": "backtest-worker-03"
  },
  "payload": {
    "notificationType": "backtest_completed",
    "recipient": {
      "userId": "user-aaa111-bbb222",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "templateId": "backtest_completed_v1",
    "templateData": {
      "strategyName": "SMA Crossover",
      "finalReturn": "25.01%",
      "winRate": "62.5%",
      "backtestUrl": "https://app.yieldly.com/backtests/123e4567"
    },
    "priority": "normal"
  },
  "metadata": {
    "correlationId": "req-abc123-xyz789",
    "causationId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "user-aaa111-bbb222"
  }
}
```

### 2.6 Message Versioning

**Version Format:** Semantic versioning (MAJOR.MINOR)
- `1.0` - Initial version
- `1.1` - Backward-compatible change (added optional field)
- `2.0` - Breaking change (removed/renamed field, changed behavior)

**Backward Compatibility Rules:**
- Consumers MUST ignore unknown fields
- Producers MAY add new optional fields in minor versions
- Breaking changes REQUIRE major version bump
- Consumers SHOULD handle multiple versions gracefully

**Example Version Evolution:**
```json
// Version 1.0
{
  "version": "1.0",
  "payload": {
    "backtestId": "uuid",
    "finalValue": 12500.50
  }
}

// Version 1.1 (backward compatible - added optional field)
{
  "version": "1.1",
  "payload": {
    "backtestId": "uuid",
    "finalValue": 12500.50,
    "executionTime": 125.3  // NEW optional field
  }
}

// Version 2.0 (breaking change - renamed field)
{
  "version": "2.0",
  "payload": {
    "backtestId": "uuid",
    "portfolioValue": 12500.50,  // RENAMED from finalValue
    "executionTime": 125.3
  }
}
```

---

## Part 3: Implementation Guidelines

### 3.1 Backend Implementation

**Create Reusable Response Builders:**
```go
// Go example
type APIResponse struct {
    Success bool        `json:"success"`
    Data    interface{} `json:"data,omitempty"`
    Error   *APIError   `json:"error,omitempty"`
    Meta    Meta        `json:"meta"`
}

func SuccessResponse(data interface{}) APIResponse {
    return APIResponse{
        Success: true,
        Data:    data,
        Meta:    NewMeta(),
    }
}

func ErrorResponse(code string, message string, details interface{}) APIResponse {
    return APIResponse{
        Success: false,
        Error: &APIError{
            Code:    code,
            Message: message,
            Details: details,
        },
        Meta: NewMeta(),
    }
}
```

**Create Message Envelope Builder:**
```go
type ServiceBusMessage struct {
    MessageID string       `json:"messageId"`
    EventType string       `json:"eventType"`
    Timestamp time.Time    `json:"timestamp"`
    Version   string       `json:"version"`
    Source    Source       `json:"source"`
    Payload   interface{}  `json:"payload"`
    Metadata  Metadata     `json:"metadata"`
}

func NewMessage(eventType string, payload interface{}, metadata Metadata) ServiceBusMessage {
    return ServiceBusMessage{
        MessageID: uuid.New().String(),
        EventType: eventType,
        Timestamp: time.Now().UTC(),
        Version:   "1.0",
        Source: Source{
            Service:  os.Getenv("SERVICE_NAME"),
            Instance: os.Getenv("INSTANCE_ID"),
        },
        Payload:  payload,
        Metadata: metadata,
    }
}
```

### 3.2 Frontend Implementation

**Create API Client with Standard Response Handling:**
```typescript
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta: {
    timestamp: string;
    version: string;
    requestId?: string;
  };
}

async function apiCall<T>(endpoint: string): Promise<T> {
  const response = await fetch(endpoint);
  const json: APIResponse<T> = await response.json();

  if (!json.success) {
    throw new APIError(json.error!.code, json.error!.message, json.error!.details);
  }

  return json.data!;
}
```

### 3.3 Validation Requirements

**All API Endpoints MUST:**
1. Return `success: true/false` in response
2. Include `meta` object with timestamp and version
3. Use standard error codes from section 1.3
4. Follow HTTP status code guidelines from section 1.4
5. Use camelCase for JSON fields
6. Use ISO 8601 format for timestamps

**All Service Bus Messages MUST:**
1. Include all required envelope fields
2. Use `domain.entity.action.status` event type format
3. Include message version
4. Use ISO 8601 format for timestamps
5. Include correlationId for event tracing

### 3.4 Migration Plan

**Phase 1 (Immediate):**
- Document standards in this ADR
- Create response/message builder utilities
- Apply to all new endpoints and events

**Phase 2 (During Development):**
- Audit existing processes (PROC-XXX documents)
- Update process documentation to reference this ADR
- Refactor existing endpoints as services are built

**Phase 3 (Before Production):**
- Validate all endpoints follow standards
- Validate all Service Bus messages follow standards
- Frontend integration testing

---

## Part 4: Update to Process Template

The process template ([PROCESS-TEMPLATE.md](../templates/PROCESS-TEMPLATE.md)) should reference this ADR:

**In "Inputs" section:**
```
{Document the request format - reference ADR-032 for unified schema}
{IMPORTANT: Use standard request format from ADR-032}
```

**In "Outputs" section:**
```
{IMPORTANT: Use standard response schema from ADR-032}
{All responses MUST include success, data/error, and meta fields}
```

**In "Service Bus Messages" section:**
```
{IMPORTANT: Use standard message envelope from ADR-032}
{All messages MUST include messageId, eventType, timestamp, version, source, payload, metadata}
```

---

## Rationale

### Why Unified Schemas?

**Consistency:**
- Frontend developers work with predictable API responses
- All services "feel" the same
- Reduced cognitive load

**Maintainability:**
- Centralized error handling
- Reusable response builders
- Easier to update standards

**Debugging:**
- Standard fields (requestId, correlationId) enable request tracing
- Consistent error codes simplify troubleshooting
- Event correlation via causationId

**Monitoring:**
- Standard fields enable centralized logging
- Event tracking across services
- Performance metrics standardization

**Evolution:**
- Version fields enable schema evolution
- Backward compatibility rules prevent breaking changes
- Clear migration paths

### Why This Format?

**API Responses:**
- `success` field enables quick success/failure check
- `data` object holds actual payload (avoids top-level pollution)
- `error` object groups all error information
- `meta` object provides debugging context
- Aligns with common REST API patterns

**Service Bus Messages:**
- Event envelope separates infrastructure from domain data
- CloudEvents-inspired (industry standard)
- Enables event sourcing and CQRS patterns
- Correlation/causation IDs enable distributed tracing
- Version field enables schema evolution

---

## Related ADRs

- **ADR-018**: API Versioning Strategy - URL versioning complements response versioning
- **ADR-029**: API Design Patterns - Pagination standard integrated with unified response format
- **ADR-019**: Azure Service Bus - Message format standardizes Service Bus communication
- **ADR-023**: Notification System - Notification events now follow unified message format

---

## Consequences

**Positive:**
- Consistent API experience across all services
- Simplified frontend integration
- Easier debugging with standard fields
- Clear event tracing with correlationId/causationId
- Schema evolution support with versioning

**Negative:**
- Requires refactoring any existing non-compliant endpoints
- Slightly more verbose responses (extra envelope fields)
- Need to educate developers on standards

**Neutral:**
- Need to maintain response/message builder utilities
- Documentation overhead for new event types

---

## Examples in Existing Processes

**Update PROC-BACKTEST-001 Output:**
```json
{
  "success": true,
  "data": {
    "backtestId": "uuid",
    "status": "queued",
    "estimatedCompletion": "< 5 minutes",
    "pollUrl": "/api/v1/backtests/{id}/status"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Update PROC-USER-001 Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Registration validation failed",
    "details": [
      {
        "field": "email",
        "message": "Email already registered",
        "code": "DUPLICATE_EMAIL"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## Decision Status

**Status:** Accepted
**Date:** 2024-12-01
**Approvers:** System Architect



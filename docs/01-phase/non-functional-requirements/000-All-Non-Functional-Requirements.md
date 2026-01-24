# Non-Functional Requirements - Consolidated

This document contains all Non-Functional Requirements for the Yieldly Trading Platform.

**Total Documents:** 45  
**Last Generated:** 2025-11-30T23:58:38.355Z  
**Source Directory:** `non-functional-requirements`


---

## Table of Contents

1. [NFR-API-001-pagination-and-list-optimization](#nfr-api-001-pagination-and-list-optimization)
2. [NFR-COMP-001-gdpr-compliance](#nfr-comp-001-gdpr-compliance)
3. [NFR-COMP-002-data-residency](#nfr-comp-002-data-residency)
4. [NFR-COMP-003-audit-logging](#nfr-comp-003-audit-logging)
5. [NFR-INT-001-exchange-api-integration](#nfr-int-001-exchange-api-integration)
6. [NFR-INT-002-third-party-service-dependencies](#nfr-int-002-third-party-service-dependencies)
7. [NFR-MAINT-001-code-quality](#nfr-maint-001-code-quality)
8. [NFR-MAINT-002-documentation](#nfr-maint-002-documentation)
9. [NFR-MAINT-003-logging](#nfr-maint-003-logging)
10. [NFR-MAINT-004-monitoring-and-alerting](#nfr-maint-004-monitoring-and-alerting)
11. [NFR-MAINT-005-deployment-automation](#nfr-maint-005-deployment-automation)
12. [NFR-OPS-001-backup-and-recovery](#nfr-ops-001-backup-and-recovery)
13. [NFR-OPS-002-disaster-recovery](#nfr-ops-002-disaster-recovery)
14. [NFR-OPS-003-load-testing](#nfr-ops-003-load-testing)
15. [NFR-OPS-004-capacity-planning](#nfr-ops-004-capacity-planning)
16. [NFR-PERF-001-api-response-time](#nfr-perf-001-api-response-time)
17. [NFR-PERF-002-real-time-data-latency](#nfr-perf-002-real-time-data-latency)
18. [NFR-PERF-003-backtest-execution-performance](#nfr-perf-003-backtest-execution-performance)
19. [NFR-PERF-004-database-query-performance](#nfr-perf-004-database-query-performance)
20. [NFR-PERF-005-page-load-time](#nfr-perf-005-page-load-time)
21. [NFR-PORTFOLIO-002-portfolio-snapshot-storage-and-performance](#nfr-portfolio-002-portfolio-snapshot-storage-and-performance)
22. [NFR-REL-001-system-uptime](#nfr-rel-001-system-uptime)
23. [NFR-REL-002-service-resilience](#nfr-rel-002-service-resilience)
24. [NFR-REL-003-data-durability](#nfr-rel-003-data-durability)
25. [NFR-REL-004-graceful-degradation](#nfr-rel-004-graceful-degradation)
26. [NFR-REL-005-database-failover](#nfr-rel-005-database-failover)
27. [NFR-RES-001-cost-management](#nfr-res-001-cost-management)
28. [NFR-RES-002-development-time](#nfr-res-002-development-time)
29. [NFR-SCALE-001-concurrent-users](#nfr-scale-001-concurrent-users)
30. [NFR-SCALE-002-data-volume-growth](#nfr-scale-002-data-volume-growth)
31. [NFR-SCALE-003-backtesting-queue](#nfr-scale-003-backtesting-queue)
32. [NFR-SCALE-004-websocket-connections](#nfr-scale-004-websocket-connections)
33. [NFR-SCALE-005-horizontal-service-scaling](#nfr-scale-005-horizontal-service-scaling)
34. [NFR-SEC-001-authentication-security](#nfr-sec-001-authentication-security)
35. [NFR-SEC-002-data-encryption](#nfr-sec-002-data-encryption)
36. [NFR-SEC-003-api-security](#nfr-sec-003-api-security)
37. [NFR-SEC-004-strategy-code-execution-security](#nfr-sec-004-strategy-code-execution-security)
38. [NFR-SEC-005-access-control](#nfr-sec-005-access-control)
39. [NFR-SEC-006-secrets-management](#nfr-sec-006-secrets-management)
40. [NFR-SEC-007-vulnerability-management](#nfr-sec-007-vulnerability-management)
41. [NFR-STRATEGY-002-indicator-management-performance](#nfr-strategy-002-indicator-management-performance)
42. [NFR-USAB-001-user-interface-responsiveness](#nfr-usab-001-user-interface-responsiveness)
43. [NFR-USAB-002-accessibility](#nfr-usab-002-accessibility)
44. [NFR-USAB-003-error-messages](#nfr-usab-003-error-messages)
45. [NFR-USAB-004-help-and-documentation](#nfr-usab-004-help-and-documentation)

---

## NFR-API-001: Pagination and List Optimization

**Source File:** `NFR-API-001-pagination-and-list-optimization.md`  
**Path:** `non-functional-requirements\NFR-API-001-pagination-and-list-optimization.md`

### NFR-API-001: Pagination and List Optimization
**Priority:** High
**Requirement:** All API endpoints returning lists or collections must implement pagination to ensure optimal performance and resource utilization.

### Scope
This requirement applies to all REST API endpoints that return collections of resources, including but not limited to:
- User lists (admin)
- Strategy lists
- Backtest history
- Transaction history
- Notification lists
- Search results
- Media/file lists
- System logs
- Audit trails

### Performance Targets

**Response Time with Pagination:**
- 95% of paginated requests must complete within 300ms
- Page 1 (most frequently accessed) should be cached where appropriate
- Database queries must use LIMIT/OFFSET or cursor-based pagination

**Maximum Unpaginated Response Size:**
- No endpoint should return more than 100 items without pagination
- Maximum response payload: 5MB per request
- Endpoints exceeding limits must return 400 Bad Request with clear message

**Database Impact:**
- Pagination queries must not cause full table scans
- All sortable columns must have appropriate indexes
- Query execution time must not exceed 100ms (P95)

### Implementation Requirements

**Mandatory Pagination:**
All list endpoints must support the following query parameters:
- `page`: Page number (1-indexed, default: 1)
- `pageSize` or `page_size`: Items per page (default varies by endpoint)

**Default Page Sizes:**
| Endpoint Type | Default | Maximum |
|---------------|---------|---------|
| Admin user lists | 50 | 200 |
| User strategies | 20 | 100 |
| Backtest history | 20 | 100 |
| Transaction history | 50 | 200 |
| Trade logs | 50 | 500 |
| Notification lists | 30 | 100 |
| Search results | 20 | 100 |
| Media files | 24 | 100 |

**Response Format:**
Every paginated endpoint must return:
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

**Sorting Support:**
Endpoints should support sorting where applicable:
- `sortBy`: Field name (must be whitelisted per endpoint)
- `sortOrder`: `asc` or `desc`
- Default sort order must be logical (newest first for dates, alphabetical for names)

**Filtering Support:**
Complex list endpoints should support filtering:
- Use descriptive query parameters (e.g., `status`, `dateFrom`, `dateTo`)
- Multiple values supported where applicable (e.g., `status=active,suspended`)
- Date filters must use ISO 8601 format

### Performance Optimization

**Caching Strategy:**
- Cache page 1 of frequently accessed lists (TTL: 30-60 seconds)
- Use Redis for distributed caching across service instances
- Invalidate cache on relevant data modifications
- Cache key format: `{service}:{endpoint}:{params_hash}:page:{n}`

**Database Optimization:**
- Create composite indexes for common filter + sort combinations
- Monitor slow query logs for pagination queries
- Use EXPLAIN ANALYZE to validate query performance
- Consider cursor-based pagination for very large datasets (future enhancement)

**Network Optimization:**
- Compress responses with gzip/brotli
- Use ETags for unchanged page responses
- Implement conditional requests (If-None-Match headers)

### Monitoring and Alerting

**Metrics to Track:**
- Average response time per paginated endpoint
- 95th percentile response time
- Cache hit rates for page 1
- Database query execution time
- Most requested page numbers (identify patterns)
- Page size distribution (how many users request max size)

**Alerts:**
- Alert if P95 response time exceeds 500ms
- Alert if database pagination queries exceed 200ms
- Alert if cache hit rate drops below 60% for frequently accessed endpoints
- Alert if any endpoint returns non-paginated response > 100 items

**Dashboard Metrics:**
- Pagination performance per endpoint
- Cache effectiveness metrics
- Top 10 slowest pagination queries
- Page size usage distribution

### Error Handling Standards

**Invalid Page Parameters:**
| Error | HTTP Status | Response |
|-------|-------------|----------|
| page < 1 | 400 | "Page number must be >= 1" |
| pageSize > maximum | 400 | "Page size must be between 1 and {max}" |
| pageSize < 1 | 400 | "Page size must be >= 1" |
| Invalid sortBy field | 400 | "Invalid sort field. Allowed: {list}" |
| Invalid sortOrder | 400 | "Sort order must be 'asc' or 'desc'" |

**Out of Range Pages:**
- Request for page number beyond total pages returns 200 OK with empty data array
- Pagination metadata still includes correct totalItems and totalPages
- Allows frontend to handle edge cases gracefully

### Testing Requirements

**Unit Tests:**
- Test pagination with various page sizes
- Test edge cases (page 0, negative pages, excessive page sizes)
- Test sorting in both directions
- Test filtering combinations

**Integration Tests:**
- Test pagination with real database
- Verify query performance with large datasets (10k, 100k, 1M rows)
- Test cache hit/miss scenarios
- Test concurrent pagination requests

**Load Tests:**
- Simulate 1000 concurrent users paginating through results
- Test performance degradation with increasing page numbers
- Verify database connection pool handles pagination load
- Test cache performance under load

**Performance Benchmarks:**
- Establish baseline pagination performance for each endpoint
- Test with realistic data volumes
- Document performance characteristics in API documentation

### Compliance and Standards

**API Documentation:**
- All paginated endpoints must document pagination parameters
- Include example requests with pagination
- Specify default and maximum page sizes
- Document available sort fields and filter options

**Code Standards:**
- Use shared pagination utility/middleware across services
- Consistent parameter naming (camelCase or snake_case, project-wide)
- Reusable response formatting
- Standardized error messages

**Security Considerations:**
- Validate page and pageSize parameters to prevent integer overflow
- Implement rate limiting per user for pagination requests
- Monitor for potential abuse (rapid pagination through all pages)
- SQL injection prevention in sortBy/filter parameters (use whitelisting)

### Exceptions

**Small Static Lists (< 20 items guaranteed):**
- May omit pagination but should return consistent response format
- Examples: User preference options, supported exchange list, strategy templates
- Must be documented as non-paginated in API documentation

**Real-Time Data Streams:**
- WebSocket connections use different patterns
- Time-windowed data instead of pagination
- Subscription filtering instead of query parameters

### Future Enhancements

**Cursor-Based Pagination (Phase 2+):**
- For very large datasets where OFFSET becomes inefficient
- Provides stable pagination even with data insertions
- Better performance for infinite scroll implementations
- Requires additional implementation complexity

**GraphQL Support (Future consideration):**
- If GraphQL is adopted, implement connection specification
- Relay-style cursor pagination
- Consistent with REST pagination patterns

### Related Requirements
- NFR-PERF-001: API Response Time (pagination helps achieve targets)
- NFR-PERF-004: Database Query Performance
- NFR-SCALE-001: Concurrent Users (pagination reduces per-user load)
- NFR-SEC-003: API Security (parameter validation)

### Related ADRs
- ADR-029: API Design Patterns and Standards
- ADR-018: API Versioning Strategy
- ADR-004: API Gateway Selection


---

## NFR-COMP-001: GDPR Compliance

**Source File:** `NFR-COMP-001-gdpr-compliance.md`  
**Path:** `non-functional-requirements\NFR-COMP-001-gdpr-compliance.md`

### NFR-COMP-001: GDPR Compliance
**Priority:** High
**Requirement:** System must comply with GDPR data protection regulations.

**Specifications:**
- Right to access: Users can export all data
- Right to erasure: Users can delete account and data
- Right to rectification: Users can update personal data
- Data minimization: Collect only necessary data
- Privacy by design: Default privacy settings
- Data processing agreements with third parties (Auth0, SendGrid)


---

## NFR-COMP-002: Data Residency

**Source File:** `NFR-COMP-002-data-residency.md`  
**Path:** `non-functional-requirements\NFR-COMP-002-data-residency.md`

### NFR-COMP-002: Data Residency
**Priority:** Medium
**Requirement:** User data must be stored in compliant geographic locations.

**Specifications:**
- Primary region: Europe (Azure West Europe)
- Backup region: Europe (Azure North Europe)
- No data transfer outside Europe without user consent
- Third-party services must be GDPR-compliant


---

## NFR-COMP-003: Audit Logging

**Source File:** `NFR-COMP-003-audit-logging.md`  
**Path:** `non-functional-requirements\NFR-COMP-003-audit-logging.md`

### NFR-COMP-003: Audit Logging
**Priority:** Medium
**Requirement:** All privileged operations must be logged for audit purposes.

**Specifications:**
- Log admin actions (user suspension, data access)
- Log authentication events (login, logout, failed attempts)
- Log data modifications (create, update, delete)
- Log data exports and deletion requests
- Audit logs immutable and retained for 1 year
- Audit logs not accessible to regular users


---

## NFR-INT-001: Exchange API Integration

**Source File:** `NFR-INT-001-exchange-api-integration.md`  
**Path:** `non-functional-requirements\NFR-INT-001-exchange-api-integration.md`

### NFR-INT-001: Exchange API Integration
**Priority:** High
**Requirement:** System must handle exchange API limitations and errors gracefully.

**Specifications:**
- Respect rate limits (Bybit: 120/min, Binance: 1200/min)
- Exponential backoff on rate limit errors
- Handle API downtime gracefully
- Cache exchange data to reduce API calls
- Monitor API health and latency


---

## NFR-INT-002: Third-Party Service Dependencies

**Source File:** `NFR-INT-002-third-party-service-dependencies.md`  
**Path:** `non-functional-requirements\NFR-INT-002-third-party-service-dependencies.md`

### NFR-INT-002: Third-Party Service Dependencies
**Priority:** High
**Requirement:** System must handle third-party service failures without complete outage.

**Specifications:**
- Auth0 failure → Allow existing sessions to continue (graceful degradation)
- SendGrid failure → Queue emails, retry later
- Azure service failures → Failover to redundant regions
- Timeout limits on all third-party calls (5 seconds default)


---

## NFR-MAINT-001: Code Quality

**Source File:** `NFR-MAINT-001-code-quality.md`  
**Path:** `non-functional-requirements\NFR-MAINT-001-code-quality.md`

### NFR-MAINT-001: Code Quality
**Priority:** Medium
**Requirement:** All code must meet quality standards to ensure maintainability.

**Specifications:**
- Code review: Self-review checklist for solo developer (peer review when team grows)
- Linting enforced in CI/CD (ESLint, Pylint, golangci-lint)
- **Testing approach for Phase 1 MVP (Solo Developer):**
  - Manual testing of critical user flows (required before each release)
  - Basic CI/CD build tests (ensure code compiles/builds successfully)
  - Integration smoke tests for critical paths:
    - Authentication flow
    - Broker connectivity
    - Backtest execution (simple strategy)
  - **Unit test coverage:** Deferred to Phase 2+ when team grows
  - Focus: Functionality over test automation during MVP
- Clear code comments for complex logic
- SOLID principles followed
- DRY principles followed

**Testing Strategy Evolution:**
- **Phase 1 (MVP - Solo Developer):** Manual testing + basic CI/CD
- **Phase 2 (Post-MVP):** Add integration tests for critical services
- **Phase 3 (Team Expansion):** Implement comprehensive unit testing (target: 60% coverage)

**Rationale:**
Given the complexity of microservices architecture, strategy DSL, visual constructor, and full-stack development by a solo developer, comprehensive automated testing is deferred to later phases. The focus during MVP is on delivering working functionality with manual quality assurance.


---

## NFR-MAINT-002: Documentation

**Source File:** `NFR-MAINT-002-documentation.md`  
**Path:** `non-functional-requirements\NFR-MAINT-002-documentation.md`

### NFR-MAINT-002: Documentation
**Priority:** Medium
**Requirement:** All services and APIs must be well-documented.

**Specifications:**
- API documentation: OpenAPI/Swagger specs for all endpoints
- Service documentation: README per service
- Architecture documentation: ADRs updated as needed
- Database schema documentation
- Deployment runbooks for all services


---

## NFR-MAINT-003: Logging

**Source File:** `NFR-MAINT-003-logging.md`  
**Path:** `non-functional-requirements\NFR-MAINT-003-logging.md`

### NFR-MAINT-003: Logging
**Priority:** High
**Requirement:** All services must implement structured logging for troubleshooting.

**Specifications:**
- Structured JSON logging
- Log levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
- Request ID propagation across services
- Sensitive data never logged (passwords, API keys)
- Centralized logging to Azure Monitor
- Logs retained for 30 days


---

## NFR-MAINT-004: Monitoring & Alerting

**Source File:** `NFR-MAINT-004-monitoring-and-alerting.md`  
**Path:** `non-functional-requirements\NFR-MAINT-004-monitoring-and-alerting.md`

### NFR-MAINT-004: Monitoring & Alerting
**Priority:** High
**Requirement:** All critical metrics must be monitored with automated alerting.

**Specifications:**
- Application metrics: Response time, error rate, throughput
- Infrastructure metrics: CPU, memory, disk, network
- Business metrics: Backtests run, new users, active users
- Alerts for:
  - Service downtime
  - Error rate > 5%
  - Response time P95 > 1s
  - Database connection pool exhaustion
  - Disk space < 20%


---

## NFR-MAINT-005: Deployment Automation

**Source File:** `NFR-MAINT-005-deployment-automation.md`  
**Path:** `non-functional-requirements\NFR-MAINT-005-deployment-automation.md`

### NFR-MAINT-005: Deployment Automation
**Priority:** High
**Requirement:** All deployments must be automated with rollback capability.

**Specifications:**
- CI/CD pipeline via Azure DevOps
- Automated builds on every commit
- Automated tests must pass before deployment
- Blue-green deployment for zero-downtime
- Automatic rollback on deployment failure
- Deployment history tracked


---

## NFR-OPS-001: Backup & Recovery

**Source File:** `NFR-OPS-001-backup-and-recovery.md`  
**Path:** `non-functional-requirements\NFR-OPS-001-backup-and-recovery.md`

### NFR-OPS-001: Backup & Recovery
**Priority:** Critical
**Requirement:** All critical data must be backed up with tested recovery procedures.

**Specifications:**
- Database backups: Daily automated (30-day retention)
  - All service databases: `user_db`, `strategy_db`, `portfolio_db`, `broker_db`, `notification_db`
  - Historical data: `historical_data_db` (TimescaleDB)
  - Backtesting results: `backtesting_db` (see ADR-002 for database architecture)
- Backup testing: Monthly recovery drill
- Recovery Time Objective (RTO): 4 hours
- Recovery Point Objective (RPO): 24 hours
- Backup storage: Geo-redundant


---

## NFR-OPS-002: Disaster Recovery

**Source File:** `NFR-OPS-002-disaster-recovery.md`  
**Path:** `non-functional-requirements\NFR-OPS-002-disaster-recovery.md`

### NFR-OPS-002: Disaster Recovery
**Priority:** High
**Requirement:** System must have disaster recovery plan for catastrophic failures.

**Specifications:**
- Documented disaster recovery plan
- Geo-redundant infrastructure (multi-region)
- Regular disaster recovery testing (quarterly)
- Failover procedures documented
- Communication plan for extended outages


---

## NFR-OPS-003: Load Testing

**Source File:** `NFR-OPS-003-load-testing.md`  
**Path:** `non-functional-requirements\NFR-OPS-003-load-testing.md`

### NFR-OPS-003: Load Testing
**Priority:** Medium
**Requirement:** System must be load tested before production release.

**Specifications:**
- Load test scenarios:
  - 500 concurrent users
  - 50 concurrent backtests
  - 1000 API requests/second
- Performance baselines established
- Load test results documented


---

## NFR-OPS-004: Capacity Planning

**Source File:** `NFR-OPS-004-capacity-planning.md`  
**Path:** `non-functional-requirements\NFR-OPS-004-capacity-planning.md`

### NFR-OPS-004: Capacity Planning
**Priority:** Medium
**Requirement:** System resource usage must be monitored for capacity planning.

**Specifications:**
- Monitor resource trends (CPU, memory, disk, network)
- Capacity alerts when utilization > 70%
- Quarterly capacity planning reviews
- Headroom: 30% above current peak usage
- Scaling plan documented


---

## NFR-PERF-001: API Response Time

**Source File:** `NFR-PERF-001-api-response-time.md`  
**Path:** `non-functional-requirements\NFR-PERF-001-api-response-time.md`

### NFR-PERF-001: API Response Time
**Priority:** High
**Requirement:** 95% of API requests must complete within 500ms under normal load.

**Measurement:**
- Target: P95 latency < 500ms
- Monitoring: Azure Monitor Application Insights
- Tracked endpoints: All REST APIs

**Exceptions:**
- Backtest initiation: < 2 seconds
- Large data exports: < 5 seconds
- Historical data queries (2+ years): < 3 seconds


---

## NFR-PERF-002: Real-Time Data Latency

**Source File:** `NFR-PERF-002-real-time-data-latency.md`  
**Path:** `non-functional-requirements\NFR-PERF-002-real-time-data-latency.md`

### NFR-PERF-002: Real-Time Data Latency
**Priority:** High
**Requirement:** Real-time price updates must be delivered to users within 1 second of exchange update.

**Measurement:**
- Target: P95 latency < 1 second from exchange to frontend
- Monitoring: Custom latency tracking per WebSocket message
- Tracked: All real-time price feeds


---

## NFR-PERF-003: Backtest Execution Performance

**Source File:** `NFR-PERF-003-backtest-execution-performance.md`  
**Path:** `non-functional-requirements\NFR-PERF-003-backtest-execution-performance.md`

### NFR-PERF-003: Backtest Execution Performance
**Priority:** Medium
**Requirement:** Backtests must complete within reasonable timeframes based on data volume and complexity.

**Measurement Scenarios:**
The following scenarios serve as baseline performance targets and will be measured during development to establish realistic expectations:

**Scenario 1: Short-term Daily Data**
- Data: 1 year, daily candles, single trading pair
- Strategy: Simple (2-3 indicators)
- Target: Establish baseline (measure during development)
- Acceptable: User perception of "reasonably fast"

**Scenario 2: Medium-term Hourly Data**
- Data: 1 year, 1-hour candles, single trading pair
- Strategy: Moderate complexity (4-5 indicators)
- Target: Establish baseline (measure during development)
- Acceptable: User perception of "worth the wait"

**Scenario 3: Long-term 5-Minute Data**
- Data: 6 months, 5-minute candles, single trading pair
- Strategy: Moderate complexity
- Target: Establish baseline (measure during development)
- Acceptable: < 10 minutes

**Monitoring Approach:**
- Track actual execution times per scenario during development
- Document baseline performance for each scenario
- Monitor 95th percentile execution times
- Alert if execution time exceeds 3× baseline for similar scenarios
- Track execution time trends over time

**Performance Factors to Document:**
- Strategy complexity (number of indicators, conditions)
- Data volume (timeframe × date range)
- Resource availability (CPU, memory)
- Database query performance
  - Read from `historical_data_db` (TimescaleDB) for market data
  - Write to `backtesting_db` (PostgreSQL) for results storage (see ADR-002)

**Notes:**
- Performance highly dependent on strategy complexity
- Python backtesting service slower than compiled languages (acceptable trade-off)
- Exact performance metrics will be established during initial development
- Focus on user experience ("feels fast enough") rather than absolute metrics


---

## NFR-PERF-004: Database Query Performance

**Source File:** `NFR-PERF-004-database-query-performance.md`  
**Path:** `non-functional-requirements\NFR-PERF-004-database-query-performance.md`

### NFR-PERF-004: Database Query Performance
**Priority:** High
**Requirement:** 95% of database queries must complete within 100ms.

**Measurement:**
- Target: P95 query latency < 100ms
- Monitoring: PostgreSQL/TimescaleDB slow query logs
- Azure Monitor database metrics

**Optimizations:**
- Proper indexing on frequently queried columns
- TimescaleDB automatic partitioning for time-series data
- Redis caching for hot data


---

## NFR-PERF-005: Page Load Time

**Source File:** `NFR-PERF-005-page-load-time.md`  
**Path:** `non-functional-requirements\NFR-PERF-005-page-load-time.md`

### NFR-PERF-005: Page Load Time
**Priority:** Medium
**Requirement:** Initial page load must complete within 3 seconds on average broadband connection.

**Measurement:**
- Target: First Contentful Paint (FCP) < 1.5s
- Target: Time to Interactive (TTI) < 3s
- Monitoring: Lighthouse CI, Real User Monitoring (RUM)

**Optimizations:**
- Next.js server-side rendering
- Code splitting and lazy loading
- CDN for static assets
- Image optimization


---

## NFR-PORTFOLIO-002-portfolio-snapshot-storage-and-performance

**Source File:** `NFR-PORTFOLIO-002-portfolio-snapshot-storage-and-performance.md`  
**Path:** `non-functional-requirements\NFR-PORTFOLIO-002-portfolio-snapshot-storage-and-performance.md`

# NFR-PORTFOLIO-002: Portfolio Snapshot Storage and Performance

**Priority:** High
**Type:** Non-Functional Requirement

**Description:**
The Portfolio Service must store hourly portfolio snapshots to enable historical tracking and fast chart generation without overloading broker APIs or databases.

**Requirements:**

**Storage:**
- Hourly snapshots during 24/7 market hours
- Each snapshot max 50 KB (JSON format)
- Store in PostgreSQL (portfolio_db)
- Partition by month for query performance
- Retention policy:
  - Hourly snapshots: 30 days
  - Daily snapshots: 1 year
  - Weekly snapshots: All time

**Performance:**
- Snapshot creation: < 5 seconds per user
- Historical query (30 days): < 200ms
- Chart generation using snapshots: < 200ms (vs 2-5s querying brokers directly)
- Database storage growth: ~1.2 MB per user per year

**Reliability:**
- Snapshot job runs every hour (cron)
- Failed snapshots logged but don't block subsequent runs
- Automatic retry for transient failures (3 attempts)
- Alert if snapshot failure rate > 5%

**Scalability:**
- Supports 1000 concurrent users with hourly snapshots
- Batch snapshot creation to reduce database load
- Indexed queries on user_id and timestamp

**Related:**
- FR-PORTFOLIO-008 (View historical snapshots)
- ADR-022 (Portfolio service architecture)


---

## NFR-REL-001: System Uptime

**Source File:** `NFR-REL-001-system-uptime.md`  
**Path:** `non-functional-requirements\NFR-REL-001-system-uptime.md`

### NFR-REL-001: System Uptime
**Priority:** High
**Requirement:** System must maintain 99% uptime (monthly availability).

**Measurement:**
- Target: 99% uptime = max 7.2 hours downtime per month
- Monitoring: Azure Monitor uptime checks
- Excludes planned maintenance windows (notified 24h in advance)


---

## NFR-REL-002: Service Resilience

**Source File:** `NFR-REL-002-service-resilience.md`  
**Path:** `non-functional-requirements\NFR-REL-002-service-resilience.md`

### NFR-REL-002: Service Resilience
**Priority:** High
**Requirement:** Services must implement resilience patterns to handle failures gracefully.

**Specifications:**
- Circuit breakers for external API calls
- Retry logic with exponential backoff
- Timeout limits on all external calls
- Health checks for all services
- Kubernetes auto-healing (restart unhealthy pods)


---

## NFR-REL-003: Data Durability

**Source File:** `NFR-REL-003-data-durability.md`  
**Path:** `non-functional-requirements\NFR-REL-003-data-durability.md`

### NFR-REL-003: Data Durability
**Priority:** Critical
**Requirement:** No data loss in case of service failures.

**Specifications:**
- Database: Daily automated backups (30-day retention)
  - All service databases including `backtesting_db` for backtest results (see ADR-002)
- Point-in-time recovery available (7 days)
- Azure Blob Storage: Geo-redundant replication (GRS)
- Message queues: Persistent messages with acknowledgment
- Backups tested monthly for recoverability


---

## NFR-REL-004: Graceful Degradation

**Source File:** `NFR-REL-004-graceful-degradation.md`  
**Path:** `non-functional-requirements\NFR-REL-004-graceful-degradation.md`

### NFR-REL-004: Graceful Degradation
**Priority:** Medium
**Requirement:** System must degrade gracefully when non-critical services fail.

**Specifications:**
- Redis cache failure → Fallback to database (slower but functional)
- Notification service failure → Queue notifications, retry later
- Real-time data failure → Display last known prices with warning
- Broker connection failure → Display connection error, allow user retry


---

## NFR-REL-005: Database Failover

**Source File:** `NFR-REL-005-database-failover.md`  
**Path:** `non-functional-requirements\NFR-REL-005-database-failover.md`

### NFR-REL-005: Database Failover
**Priority:** High
**Requirement:** Databases must support automatic failover with minimal downtime.

**Specifications:**
- PostgreSQL: Azure Database for PostgreSQL with automatic failover
- Redis: Azure Cache for Redis with replication
- TimescaleDB: Managed instance with high availability
- Maximum failover time: 60 seconds
- Automatic failover without manual intervention


---

## NFR-RES-001: Cost Management

**Source File:** `NFR-RES-001-cost-management.md`  
**Path:** `non-functional-requirements\NFR-RES-001-cost-management.md`

### NFR-RES-001: Cost Management
**Priority:** High
**Requirement:** System must operate within budget constraints for solo developer project.

**Specifications:**

**Phase 1 MVP (Development & Testing - Solo Developer Only):**
- Maximum monthly Azure cost: **$300** (utilizing Azure free tier credits)
- Limited to development, testing, and personal use
- No real users (only developer and invited beta testers)
- Aggressive cost optimization:
  - Use free tier services where possible
  - Scale to zero during non-usage hours
  - Minimal data retention
  - Single region deployment

**Phase 2+ (Production - Real Users):**
- Maximum monthly Azure cost: **$400-500**
- Acceptable when serving real paid users
- Cost justified by user subscriptions
- More aggressive scaling policies
- Multi-region considerations for performance

**Cost Optimization Strategies:**
- Auto-scaling down during low usage periods
- Use Azure spot instances for backtesting workloads when possible
- Implement aggressive caching to reduce database load
- Optimize database queries and indexing
- Use Azure Cost Management for daily monitoring
- Set up budget alerts for cost overruns


---

## NFR-RES-002: Development Time

**Source File:** `NFR-RES-002-development-time.md`  
**Path:** `non-functional-requirements\NFR-RES-002-development-time.md`

### NFR-RES-002: Development Time
**Priority:** High
**Requirement:** Phase 1 must be completable by solo developer within 6 months.

**Specifications:**
- Prioritize MVP features only
- Defer Phase 1B features (visual builder) if timeline at risk
- Use managed services to reduce operational burden
- Leverage existing libraries and frameworks
- Accept technical debt for non-critical areas


---

## NFR-SCALE-001: Concurrent Users

**Source File:** `NFR-SCALE-001-concurrent-users.md`  
**Path:** `non-functional-requirements\NFR-SCALE-001-concurrent-users.md`

### NFR-SCALE-001: Concurrent Users
**Priority:** High
**Requirement:** System must support 500 concurrent users in Phase 1 without performance degradation.

**Measurement:**
- Load testing with 500 concurrent virtual users
- Monitor API response times remain within SLA
- Monitor resource utilization (CPU, memory, database connections)

**Scaling Strategy:**
- Horizontal scaling of stateless services via Kubernetes
- Database connection pooling
- Redis caching to reduce database load


---

## NFR-SCALE-002: Data Volume Growth

**Source File:** `NFR-SCALE-002-data-volume-growth.md`  
**Path:** `non-functional-requirements\NFR-SCALE-002-data-volume-growth.md`

### NFR-SCALE-002: Data Volume Growth
**Priority:** High
**Requirement:** System must handle 100GB of historical market data in Phase 1.

**Projections:**
Based on actual data collection experience:
- ~200-300 trading symbols (across Binance and Bybit)
- 2 years of historical data per symbol
- Timeframes: 5-minute and 15-minute candles (primary), 1-hour and daily (secondary)
- Estimated total: ~100GB with TimescaleDB compression
- Note: Previous data collection from Binance alone (~500 coins, multiple years) resulted in approximately 100GB

**Scaling Strategy:**
- TimescaleDB automatic partitioning and compression (can reduce size by 10-20×)
- Retention policies:
  - 5-minute data: 1 year (then compress or archive)
  - 15-minute data: 2 years (then compress)
  - 1-hour data: 5 years
  - Daily data: 10 years
- Compression after 6 months (TimescaleDB native compression)
- Archive oldest data to Azure Blob Storage (cold storage) if needed
- Incremental data loading (download only missing data)

**Phase 1 Scope:**
- Start with 20-50 most popular trading pairs
- 2 years of data per pair
- Expand to 200-300 symbols over time
- Monitor storage growth and adjust retention policies

**Additional Data Volume Considerations:**
- **Backtesting Results Database (`backtesting_db`):**
  - Each backtest generates thousands of simulated trade records
  - Equity curve data points (time-series for portfolio value)
  - Estimated: 10-50MB per backtest (varies with strategy complexity and duration)
  - Retention: Keep all backtest results (valuable for strategy comparison)
  - Archive policy: Move backtests older than 1 year to cold storage if needed
  - See ADR-002 for backtesting database architecture


---

## NFR-SCALE-003: Backtesting Queue

**Source File:** `NFR-SCALE-003-backtesting-queue.md`  
**Path:** `non-functional-requirements\NFR-SCALE-003-backtesting-queue.md`

### NFR-SCALE-003: Backtesting Queue
**Priority:** Medium
**Requirement:** System must handle 50 queued backtest jobs without failure.

**Measurement:**
- Test with 50 backtests submitted simultaneously
- All backtests must complete successfully
- Queue must not lose jobs

**Scaling Strategy:**
- Azure Service Bus queue with message persistence
- Horizontal scaling of Backtesting Service pods
- Auto-scaling based on queue depth
- **Database Write Scaling:** Multiple backtest workers writing to `backtesting_db` concurrently
  - PostgreSQL connection pooling to handle concurrent writes
  - Each backtest job writes independently (no write conflicts)
  - See ADR-002 for backtesting database architecture


---

## NFR-SCALE-004: WebSocket Connections

**Source File:** `NFR-SCALE-004-websocket-connections.md`  
**Path:** `non-functional-requirements\NFR-SCALE-004-websocket-connections.md`

### NFR-SCALE-004: WebSocket Connections
**Priority:** Medium
**Requirement:** System must support 500 simultaneous WebSocket connections for real-time data.

**Measurement:**
- Load test with 500 WebSocket clients
- Monitor connection stability
- Monitor message delivery latency

**Scaling Strategy:**
- Horizontal scaling of Market Data Service
- WebSocket connection load balancing
- Sticky sessions for WebSocket connections


---

## NFR-SCALE-005: Horizontal Service Scaling

**Source File:** `NFR-SCALE-005-horizontal-service-scaling.md`  
**Path:** `non-functional-requirements\NFR-SCALE-005-horizontal-service-scaling.md`

### NFR-SCALE-005: Horizontal Service Scaling
**Priority:** High
**Requirement:** All stateless services must support horizontal scaling without code changes.

**Measurement:**
- Services must be stateless (no in-memory session state)
- Services must handle distributed deployment
- Test scaling from 1 to 3 instances per service

**Constraints:**
- No local file storage (use Azure Blob Storage)
- No in-memory caching (use Redis)
- Database connection pooling properly configured


---

## NFR-SEC-001: Authentication Security

**Source File:** `NFR-SEC-001-authentication-security.md`  
**Path:** `non-functional-requirements\NFR-SEC-001-authentication-security.md`

### NFR-SEC-001: Authentication Security
**Priority:** Critical
**Requirement:** All authentication must use industry-standard security practices.

**Specifications:**
- Password hashing: bcrypt with cost factor 12
- JWT tokens: RS256 algorithm with 24-hour expiration
- Refresh tokens: Securely stored, 7-day expiration
- OAuth: Auth0 with PKCE flow
- Session timeout: 24 hours of inactivity


---

## NFR-SEC-002: Data Encryption

**Source File:** `NFR-SEC-002-data-encryption.md`  
**Path:** `non-functional-requirements\NFR-SEC-002-data-encryption.md`

### NFR-SEC-002: Data Encryption
**Priority:** Critical
**Requirement:** All sensitive data must be encrypted at rest and in transit.

**Specifications:**
- **In Transit:**
  - TLS 1.3 for all HTTP connections
  - WSS (WebSocket Secure) for real-time connections
  - No insecure HTTP allowed in production
- **At Rest:**
  - Exchange API keys encrypted using Azure Key Vault
  - Database encryption enabled (PostgreSQL TDE)
  - Backup encryption enabled
  - Azure Blob Storage encryption enabled (default)


---

## NFR-SEC-003: API Security

**Source File:** `NFR-SEC-003-api-security.md`  
**Path:** `non-functional-requirements\NFR-SEC-003-api-security.md`

### NFR-SEC-003: API Security
**Priority:** High
**Requirement:** All APIs must be protected against common vulnerabilities.

**Specifications:**
- JWT validation at API Gateway (Nginx)
- Rate limiting per user role (prevent abuse)
- Input validation and sanitization
- CORS configured restrictively
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding)
- CSRF protection for state-changing operations


---

## NFR-SEC-004: Strategy Code Execution Security

**Source File:** `NFR-SEC-004-strategy-code-execution-security.md`  
**Path:** `non-functional-requirements\NFR-SEC-004-strategy-code-execution-security.md`

### NFR-SEC-004: Strategy Code Execution Security
**Priority:** Critical
**Requirement:** User-provided strategy code must execute in secure sandbox preventing malicious actions.

**Specifications:**
- Docker container isolation (--network none)
- RestrictedPython for code sandboxing
- Filesystem: Read-only except /tmp
- Memory limit: 512MB
- CPU limit: 0.5 core
- Timeout: 5 minutes maximum
- Blocked libraries: requests, urllib, subprocess, os, sys
- AST parsing to detect prohibited patterns


---

## NFR-SEC-005: Access Control

**Source File:** `NFR-SEC-005-access-control.md`  
**Path:** `non-functional-requirements\NFR-SEC-005-access-control.md`

### NFR-SEC-005: Access Control
**Priority:** High
**Requirement:** All resources must be protected with role-based access control.

**Specifications:**
- Roles: Admin, Beta Tester, Free User, Subscriber
- Permissions checked at API Gateway and service level
- Users can only access own resources (data isolation)
- Admin bypass only for moderation purposes
- Audit logging for all privileged operations


---

## NFR-SEC-006: Secrets Management

**Source File:** `NFR-SEC-006-secrets-management.md`  
**Path:** `non-functional-requirements\NFR-SEC-006-secrets-management.md`

### NFR-SEC-006: Secrets Management
**Priority:** Critical
**Requirement:** All secrets must be stored securely and never exposed in logs or code.

**Specifications:**
- Azure Key Vault for secret storage
- No secrets in environment variables (pull from Key Vault)
- No secrets in source code or configuration files
- Secrets rotated every 90 days (automated where possible)
- Audit logging for secret access


---

## NFR-SEC-007: Vulnerability Management

**Source File:** `NFR-SEC-007-vulnerability-management.md`  
**Path:** `non-functional-requirements\NFR-SEC-007-vulnerability-management.md`

### NFR-SEC-007: Vulnerability Management
**Priority:** High
**Requirement:** System must be regularly scanned for vulnerabilities and patched promptly.

**Specifications:**
- Automated dependency scanning in CI/CD pipeline
- Container image scanning before deployment
- Monthly security patching for all dependencies
- Critical vulnerabilities patched within 48 hours
- High vulnerabilities patched within 7 days


---

## NFR-STRATEGY-002-indicator-management-performance

**Source File:** `NFR-STRATEGY-002-indicator-management-performance.md`  
**Path:** `non-functional-requirements\NFR-STRATEGY-002-indicator-management-performance.md`

# NFR-STRATEGY-002: Indicator Management Performance

**Priority:** Medium
**Type:** Non-Functional Requirement

**Description:**
The Strategy Service must efficiently manage and serve technical indicator definitions to frontend with minimal latency.

**Requirements:**

**Caching:**
- Most common 20 indicators cached in Redis
- Cache TTL: 24 hours
- Cache invalidation on admin update
- Cache hit rate target: > 90%

**Synchronization:**
- Initial sync from Backtesting Service on deployment
- Periodic sync: Weekly (automated)
- Manual sync: Admin-triggered
- Sync preserves admin customizations (descriptions, active status)

**Performance:**
- Indicator list query: < 50ms (cached)
- Indicator detail query: < 100ms
- Sync operation: < 10 seconds for all indicators
- Database storage: ~1 MB for all indicator configs

**Availability:**
- Indicator list available even if Backtesting Service down (stale cache acceptable)
- Fallback to database if Redis unavailable
- Graceful degradation if sync fails

**Related:**
- FR-STRATEGY-010 (Browse indicators)
- ADR-030 (Indicator management architecture)


---

## NFR-USAB-001: User Interface Responsiveness

**Source File:** `NFR-USAB-001-user-interface-responsiveness.md`  
**Path:** `non-functional-requirements\NFR-USAB-001-user-interface-responsiveness.md`

### NFR-USAB-001: User Interface Responsiveness
**Priority:** High
**Requirement:** UI must be responsive and work on desktop and tablet devices.

**Specifications:**
- Responsive design: Desktop (1920×1080), Laptop (1366×768), Tablet (768×1024)
- Mobile support not required for Phase 1
- Touch-friendly UI elements (min 44×44px tap targets)
- Browser support: Chrome, Firefox, Safari, Edge (latest 2 versions)


---

## NFR-USAB-002: Accessibility

**Source File:** `NFR-USAB-002-accessibility.md`  
**Path:** `non-functional-requirements\NFR-USAB-002-accessibility.md`

### NFR-USAB-002: Accessibility
**Priority:** Medium
**Requirement:** UI must meet basic accessibility standards.

**Specifications:**
- WCAG 2.1 Level A compliance (minimum)
- Keyboard navigation support
- Color contrast ratio ≥ 4.5:1 for normal text
- Alt text for all images
- Semantic HTML
- Screen reader compatibility (basic)


---

## NFR-USAB-003: Error Messages

**Source File:** `NFR-USAB-003-error-messages.md`  
**Path:** `non-functional-requirements\NFR-USAB-003-error-messages.md`

### NFR-USAB-003: Error Messages
**Priority:** Medium
**Requirement:** All error messages must be clear and actionable.

**Specifications:**
- User-friendly language (no technical jargon)
- Specific error descriptions (not generic "Error occurred")
- Suggest corrective actions when possible
- Error codes for support troubleshooting
- Consistent error message format across platform


---

## NFR-USAB-004: Help & Documentation

**Source File:** `NFR-USAB-004-help-and-documentation.md`  
**Path:** `non-functional-requirements\NFR-USAB-004-help-and-documentation.md`

### NFR-USAB-004: Help & Documentation
**Priority:** Low
**Requirement:** Users must have access to help documentation.

**Specifications:**
- Built-in help documentation for strategy DSL
- Tooltips for complex UI elements
- Strategy template examples with explanations
- FAQ section
- Support contact information


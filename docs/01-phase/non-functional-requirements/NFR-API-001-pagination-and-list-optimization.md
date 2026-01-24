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

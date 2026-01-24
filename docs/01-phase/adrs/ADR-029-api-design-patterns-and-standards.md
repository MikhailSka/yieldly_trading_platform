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

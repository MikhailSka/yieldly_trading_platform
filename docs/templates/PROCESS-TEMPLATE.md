<!--
PURPOSE OF THIS TEMPLATE:
This template is for documenting BUSINESS PROCESSES - the "what" and "how" of system functionality.
Focus on describing the process flow, business logic, and component interactions.

DO NOT duplicate performance metrics here - reference Non-Functional Requirements instead.
DO NOT invent API schemas - reference existing API documentation and standards.
DO NOT create database queries without checking existing schemas in docs/01-phase/database-schemas/

CROSS-REFERENCES:
- Functional Requirements (FR-XXX): What features this process implements
- Non-Functional Requirements (NFR-XXX): Performance, security, scalability constraints
- Architecture Decision Records (ADR-XXX): Technical decisions affecting this process
- Database Schemas: docs/01-phase/database-schemas/{service}_db_schema.dbml
- API Standards: ADR-032 (Unified API and Message Schema Standards)

When AI agents use this template:
1. Check database schemas before writing SQL queries (docs/01-phase/database-schemas/)
2. Reference NFRs instead of duplicating performance targets
3. Use ADR-032 unified API request/response format for ALL processes
4. Use ADR-032 Service Bus message format for ALL async events
5. Validate that all referenced documents (FR, NFR, ADR) exist

DIRECT DATABASE ACCESS PATTERN:
Some services may access another service's database directly for performance-critical operations.
This is an intentional architectural decision in specific scenarios:
- Example: Backtesting Service accesses Historical Data Service's TimescaleDB directly for backtest execution
- Reason: High-volume data retrieval (10,000+ candles) requires direct DB access for performance
- API endpoints still exist for other use cases (frontend visualization, data preview)

When documenting such patterns:
1. Clearly note in the process documentation which service owns the data
2. Document which operations use direct DB access vs API calls
3. Reference the related process in both services (e.g., PROC-BACKTEST-001 references PROC-HISTORICAL-002)
4. Explain the performance justification in the Notes section
-->

### PROC-{SERVICE}-{NUMBER}: {Process Name}

**Service Owner:** {Service Name}
**Related FR:** {FR-XXX-XXX} _(comma-separated if multiple)_
**Related NFR:** {NFR-XXX-XXX} _(comma-separated if multiple)_
**Related ADR:** {ADR-XXX} _(comma-separated if multiple, optional)_

#### Trigger
{Describe what initiates this process - user action, system event, scheduled job, or external service call}

#### Actor
{Who or what performs this action - Authenticated User, Admin, System (Service Name), External Service, etc.}

#### Preconditions
- {List all conditions that must be true before this process can execute}
- {Include authentication/authorization requirements}
- {Include quota limits if applicable}
- {Include resource availability requirements}

#### Inputs
{IMPORTANT: Follow ADR-032 for unified API schema standards}
{NOTE: Use camelCase for JSON fields, snake_case for query parameters}

**API Endpoint:** `{METHOD} /api/v1/{resource}` _(if applicable)_

**Request Body:** _(for POST/PUT/PATCH, use camelCase)_
```json
{
  "fieldName": "type (required/optional, validation rules)",
  "anotherField": "type (optional, defaults to X)"
}
```

**Query Parameters:** _(for GET requests, use snake_case per ADR-029)_
```
GET /api/v1/resource?
  param1={value}
  &param2={value}
  &page={number}
  &page_size={number}
  &sort_by={field}
```

**Service Bus Message:** _(for async events, use ADR-032 envelope)_
```json
{
  "messageId": "uuid",
  "eventType": "domain.action.status",
  "timestamp": "ISO 8601",
  "version": "1.0",
  "source": {
    "service": "service-name",
    "instance": "instance-id"
  },
  "payload": {
    // Event-specific data (camelCase)
  },
  "metadata": {
    "correlationId": "uuid",
    "causationId": "uuid",
    "userId": "uuid"
  }
}
```

**File Upload:** _(if applicable)_
- **Multipart Form Data**:
  - `file`: Binary data (max size, allowed types)
  - `metadata`: Additional fields

#### Process Steps

1. **{Component Name} {action verb}** → {Route/destination if applicable}
2. **{Component Name} validates {what}**
   - {Validation rule 1}
   - {Validation rule 2S}
   - Return {HTTP code} if {condition}
3. **{Component Name} queries/calls {what}**
   ```sql
   -- IMPORTANT: Check database schema first: docs/01-phase/database-schemas/{service}_db_schema.dbml
   -- Verify table names, column names, and data types match the schema
   SELECT columns
   FROM table
   WHERE condition = $1
   ```
   ```python
   # For code operations, include code snippets
   result = function_call(params)
   ```
   ```
   # For external calls, show the format
   GET /api/v1/external/endpoint
   ```
4. **{Component Name} processes/transforms {what}**
   - {Processing logic explanation}
   - {Data transformation details}
5. **{Component Name} stores/updates {what}**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/{service}_db_schema.dbml
   INSERT INTO table (columns)
   VALUES ($1, $2, $3)
   RETURNING id;
   ```
6. **{Component Name} publishes/notifies {what}** _(if applicable)_
   - Publish to Service Bus: `topic.name`
   - Call {Service}: `endpoint`
7. **Return response** _(or specify async behavior)_

#### Outputs
{IMPORTANT: Follow ADR-032 unified response schema for ALL API responses}
{All responses MUST include: success, data/error, and meta fields}

**Success Response - Single Resource:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "fieldName": "value"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response - Collection (with pagination per ADR-029):**
```json
{
  "success": true,
  "data": [
    {"id": "uuid1", "name": "Item 1"},
    {"id": "uuid2", "name": "Item 2"}
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

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Email is invalid",
        "code": "INVALID_EMAIL"
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

**Async Process - Immediate Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "estimatedCompletion": "< 5 minutes",
    "pollUrl": "/api/v1/jobs/{jobId}/status"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- {Criterion 1 - what should happen}
- {Criterion 2 - what should be created/updated}
- {Criterion 3 - what should be returned}
- HTTP {code} {status}

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| {Error condition} | {code} | Return "{user-facing message}" |
| {Validation failure} | 400 | Return "{specific error with field}" |
| {Authorization failure} | 403 | Return "{permission denied message}" |
| {Resource not found} | 404 | Return "{not found message}" |
| {Conflict/duplicate} | 409 | Return "{conflict message}" |
| {Rate limit exceeded} | 429 | Return "{quota/limit message}" |
| {External service error} | 502 | Return "{service unavailable message}" |
| {Database error} | 500 | Log error, rollback if needed, return generic message |

#### Performance Requirements
{DO NOT duplicate metrics here - reference existing Non-Functional Requirements (NFRs)}
{This section should link to NFRs, not restate them}

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-PERF-003**: Backtest Execution Performance (for backtest operations)
- **{NFR-XXX-XXX}**: {Specific NFR that applies to this process}

**Process-Specific Notes:**
- Database Queries: {N} queries per request _(document for optimization)_
- Cache Strategy: {What is cached, TTL} _(if applicable)_
- Expected Execution Time: {Range} _(for async jobs, reference NFR for limits)_
- Special Performance Considerations: {Any unique aspects of this process}

{If this process has exceptional performance requirements different from standard NFRs, document why and reference the specific NFR that covers the exception}

#### Dependencies
**Database:**
- `{db_name}` ({PostgreSQL/TimescaleDB/etc.})
- Tables: `{table1}`, `{table2}` _(verify against: docs/01-phase/database-schemas/{service}_db_schema.dbml)_

**Cache:** _(if applicable)_
- {Redis/etc.} - {what is cached, TTL}

**Message Queue:** _(if applicable)_
- {Azure Service Bus/etc.} - topics: `{topic.name}`

**External Services:** _(if applicable)_
- {Service name}: {endpoint or purpose}

**Storage:** _(if applicable)_
- {Azure Blob Storage/etc.} - {what is stored}

**Libraries:** _(if applicable)_
- {library name} - {purpose}

**Secrets/Key Vault:** _(if applicable)_
- {Azure Key Vault/etc.} - {what secrets}

#### Notes
{Optional section for additional context}
- **Special Considerations**: {anything unique about this process}
- **Future Enhancements**: {planned improvements}
- **Related Processes**: Link to PROC-XXX-XXX for related workflows
- **Security Notes**: {special security considerations}
- **Business Rules**: {important business logic}

---


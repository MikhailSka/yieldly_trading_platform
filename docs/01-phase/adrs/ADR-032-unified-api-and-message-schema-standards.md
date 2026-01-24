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


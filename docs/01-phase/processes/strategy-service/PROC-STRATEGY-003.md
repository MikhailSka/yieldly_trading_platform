### PROC-STRATEGY-003: Create New Strategy

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-001
**Related NFR:** NFR-PERF-001, NFR-SECURITY-002
**Related ADR:** ADR-024, ADR-032

#### Trigger
User creates new strategy via code editor OR visual block editor

#### Actor
Authenticated User (Trader) or Admin

#### Preconditions
- User is authenticated
- User has not exceeded strategy quota (max 50 strategies per user, unlimited for admins)

#### Creation Methods
1. **Code Editor**: User writes Python code directly
2. **Visual Block Editor**: User drags and drops blocks, system generates Python code

#### Inputs

**API Endpoint:** `POST /api/v1/strategies`

**Request Body:**
```json
{
  "name": "string (required, 3-255 chars)",
  "description": "text (optional, markdown supported)",
  "code": "text (required if creationMethod='code', max 50,000 chars)",
  "visualBlocks": "object (required if creationMethod='visual', block configuration)",
  "creationMethod": "code|visual (required)",
  "tags": "array of strings (optional)",
  "status": "draft|active (optional, defaults to draft)",
  "isPublic": "boolean (optional, defaults to false)",
  "isTemplate": "boolean (admin only, defaults to false)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies` (POST)
2. **Strategy Controller validates input**
   - Check required fields (name, and either code OR visual_blocks)
   - Validate name length (3-255 chars)
   - Validate code length (max 50,000 chars if provided)
   - Validate creation_method is 'code' or 'visual'
3. **If creation_method = 'visual'**:
   - Visual Block Processor converts visual_blocks JSON to Python code
   - Generated code stored in `code` field
4. **Strategy Controller checks quota** (skip if admin)
   ```sql
   SELECT COUNT(*) FROM strategies WHERE user_id = $1 AND deleted_at IS NULL
   ```
   - If count >= 50 AND user is not admin → Return 429 "Strategy quota exceeded"
5. **Code Validator validates Python syntax**
   - Use Python AST parser: `ast.parse(code)`
   - Check for syntax errors
   - Return 400 with line number if error
6. **Code Validator checks security**
   - Scan for prohibited imports: `os`, `subprocess`, `eval`, `exec`, `open`, `__import__`
   - Check only allowed libraries imported (see whitelist)
   - Return 400 if security violation
7. **Code Validator checks required components**
   - Must define `entry_signal()` function
   - Must define `exit_signal()` function
   - Optional: `position_size()`, `stop_loss()`, `take_profit()`
8. **Strategy Manager checks for duplicate name**
   ```sql
   SELECT COUNT(*) FROM strategies
   WHERE user_id = $1 AND name = $2 AND deleted_at IS NULL
   ```
   - If exists → Return 409 "Strategy name already exists"
9. **Strategy Repository creates strategy**
   ```sql
   INSERT INTO strategies (
     user_id, name, description, code, tags,
     status, is_public, is_template, created_by_admin,
     current_version_id, version_count, created_at, updated_at
   ) VALUES (
     $1, $2, $3, $4, $5,
     COALESCE($6, 'draft'), COALESCE($7, false), COALESCE($8, false), $9,
     NULL, 1, NOW(), NOW()
   ) RETURNING id
   ```
10. **Version Manager creates initial version**
    ```sql
    INSERT INTO strategy_versions (
      strategy_id, version_number, code, created_by_user_id, created_at
    ) VALUES ($1, 1, $2, $3, NOW())
    RETURNING id
    ```
11. **Strategy Repository updates current_version_id**
    ```sql
    UPDATE strategies SET current_version_id = $1 WHERE id = $2
    ```
12. **Return strategy details**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "string",
    "description": "string",
    "code": "string",
    "version": 1,
    "createdAt": "2024-12-01T12:00:00Z",
    "validationStatus": "valid"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 400 - Validation Error):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Code validation failed",
    "details": [
      {
        "field": "code",
        "message": "Syntax error at line 15",
        "code": "SYNTAX_ERROR"
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

#### Success Criteria
- Strategy record created
- Initial version created
- Code validated successfully
- HTTP 201 Created

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Syntax error | 400 | Return error with line number |
| Security violation | 400 | Return "Prohibited library: {name}" |
| Missing required function | 400 | Return "Missing entry_signal() function" |
| Quota exceeded | 429 | Return "Maximum 50 strategies allowed" |
| Duplicate name | 409 | Return "Strategy name already exists" |
| Database error | 500 | Log error, rollback transaction |

#### Allowed Libraries Whitelist
```python
ALLOWED_IMPORTS = [
    'numpy',
    'pandas',
    'talib',  # Technical indicators
    'backtrader',  # Backtesting framework (limited imports)
    'datetime',
    'math',
    'statistics'
]
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SECURITY-002**: Code validation and security scanning requirements

**Process-Specific Notes:**
- Database Queries: 3 queries per request (quota check, duplicate check, insert)
- Expected Execution Time: P95 < 300ms
- Code Validation: < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`

**Libraries:**
- Python AST parser - Code syntax validation
- Regex - Security pattern scanning

---

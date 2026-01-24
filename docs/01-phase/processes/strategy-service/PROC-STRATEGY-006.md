### PROC-STRATEGY-006: Validate Strategy Code

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-007
**Related NFR:** NFR-PERF-001, NFR-SECURITY-002
**Related ADR:** ADR-032  

#### Trigger
User clicks "Validate" button or saves strategy

#### Actor
Authenticated User

#### Preconditions
- Strategy code has been written

#### Inputs

**API Endpoint:** `POST /api/v1/strategies/validate`

**Request Body:**
```json
{
  "code": "string (Python code to validate)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/validate` (POST)
2. **Code Validator parses Python code**
   ```python
   import ast
   try:
       tree = ast.parse(code)
   except SyntaxError as e:
       return {"valid": false, "errors": [{"line": e.lineno, "message": e.msg}]}
   ```
3. **Code Validator checks for prohibited imports**
   ```python
   PROHIBITED = ['os', 'subprocess', 'eval', 'exec', '__import__', 'open', 'file']
   for node in ast.walk(tree):
       if isinstance(node, ast.Import):
           for alias in node.names:
               if alias.name in PROHIBITED:
                   return error
   ```
4. **Code Validator checks for required functions**
   ```python
   required_functions = ['entry_signal', 'exit_signal']
   defined_functions = [node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]
   missing = set(required_functions) - set(defined_functions)
   if missing:
       return {"valid": false, "errors": [f"Missing required function: {fn}"]}
   ```
5. **Code Validator checks function signatures**
   - `entry_signal(data)` must accept exactly 1 parameter
   - `exit_signal(data)` must accept exactly 1 parameter
6. **Code Validator checks for dangerous patterns**
   - `eval()` calls
   - `exec()` calls
   - File I/O operations
   - Network calls
7. **Return validation result**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "message": "Code validation successful",
    "warnings": [
      "Consider adding stop-loss logic"
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Validation Failure Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "valid": false,
    "errors": [
      {
        "line": 15,
        "column": 5,
        "message": "Prohibited import: os",
        "severity": "error"
      },
      {
        "line": 42,
        "message": "Missing required function: entry_signal",
        "severity": "error"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Code parsed successfully
- No prohibited imports
- Required functions present
- No dangerous patterns

#### Error Scenarios
- All validation errors returned in structured format
- HTTP 200 OK even if validation fails (validation result in body)

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SECURITY-002**: Code validation and security scanning requirements

**Process-Specific Notes:**
- Expected Execution Time: P95 < 100ms
- Security scanning must complete within performance budget

#### Dependencies

**Libraries:**
- Python AST parser - Syntax validation
- Regex - Security pattern scanning

---

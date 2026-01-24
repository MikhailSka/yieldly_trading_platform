### FR-STRATEGY-007: Validate Strategy Code
**Priority:** High
**User Story:** As a user, I want my strategy code validated so that I know it will execute correctly.

**Acceptance Criteria:**
- System validates code on save and publish
- Validation checks:
  - Python syntax correctness
  - Only allowed libraries imported
  - No prohibited functions (eval, exec, os, subprocess)
  - Required strategy components present (entry rules, exit rules)
  - Proper data source references
- System displays validation errors with line numbers
- User cannot publish strategy with validation errors
- User can save draft with validation errors
- Validation runs in background (non-blocking)

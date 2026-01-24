### FR-STRATEGY-001: Create New Strategy via Code Editor
**Priority:** High
**User Story:** As a user, I want to create a new trading strategy using code so that I can define custom trading logic.

**Acceptance Criteria:**
- User can create new strategy from dashboard
- System displays Monaco code editor with Python syntax highlighting
- Editor pre-populated with starter template code
- User must provide:
  - Strategy name
  - Strategy description (optional)
- User can write strategy using Python-based DSL
- System validates code syntax in real-time
- System highlights syntax errors in editor
- User can save draft (incomplete strategy)
- User can publish strategy (marks as complete)
- System stores strategy in Strategy Service database
- System assigns version number (v1) automatically

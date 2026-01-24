### FR-STRATEGY-002: Edit Existing Strategy
**Priority:** High
**User Story:** As a user, I want to edit my existing strategies so that I can improve or fix them.

**Acceptance Criteria:**
- User can open any owned strategy for editing
- System loads strategy code into Monaco editor
- User can modify strategy name, description, and code
- System validates code syntax in real-time
- User can save changes
- System creates new version (v2, v3, etc.) when published
- User can revert to previous version
- User cannot edit strategies currently running backtests
- System timestamps last edit

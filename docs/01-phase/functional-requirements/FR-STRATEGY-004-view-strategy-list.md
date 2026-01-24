### FR-STRATEGY-004: View Strategy List
**Priority:** Medium
**User Story:** As a user, I want to view all my strategies so that I can manage them easily.

**Acceptance Criteria:**
- User can view list of all owned strategies
- Each strategy displays:
  - Strategy name
  - Description (truncated)
  - Version number
  - Last modified date
  - Status (Draft, Published)
  - Number of backtests run
- User can sort strategies by:
  - Name (ascending/descending)
  - Last modified date (newest/oldest)
  - Version number
  - Number of backtests
- User can search strategies by name or description
- User can filter strategies by status (Draft, Published)
- List paginated (20 per page, max 100 per page)
- Pagination includes total count and page navigation

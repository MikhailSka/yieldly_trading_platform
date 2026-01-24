### FR-ADMIN-002: Search Users
**Priority:** Medium
**User Story:** As an admin, I want to search for specific users so that I can find accounts quickly.

**Acceptance Criteria:**
- Admin can search users by:
  - Email (exact or partial match)
  - Name (partial match)
  - User ID (exact match)
- Search results displayed in same format as user list
- Search results clickable to view user details
- Search results paginated (50 per page, max 200 per page)
- Admin can sort search results by any column
- Empty search query returns validation error

### FR-ADMIN-004: Generate Invite Codes
**Priority:** High
**User Story:** As an admin, I want to generate invite codes so that I can control platform access.

**Acceptance Criteria:**
- Admin can generate invite codes from admin panel
- Admin can specify:
  - Number of codes to generate (1-100)
  - Max uses per code (1, unlimited, or custom number)
  - Expiration date (optional)
  - Role assigned to new users (Beta Tester, Free User)
- System generates unique codes (format: YIELDLY-XXXXX-XXXXX)
- Admin can view all generated codes
- Admin can view code usage statistics:
  - Times used
  - Users registered with code
  - Remaining uses
  - Status (active, expired, fully used)
- Admin can revoke codes
- Admin can export codes to CSV

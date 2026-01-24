### FR-PROFILE-001: View and Edit Profile Information
**Priority:** Medium
**User Story:** As a user, I want to view and edit my profile information so that I can keep my details up to date.

**Acceptance Criteria:**
- User can view current profile information (name, email, avatar, bio)
- User can edit name and bio
- User can upload profile avatar (max 5MB, formats: JPG, PNG, WEBP)
- System stores avatar in Azure Blob Storage
- System generates thumbnail (150x150px) automatically
- Email cannot be changed without verification process
- Changes must be saved to User Profile Service database
- Success/error messages displayed after update

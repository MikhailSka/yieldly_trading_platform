### FR-MEDIA-001: Upload Profile Avatar
**Priority:** Low
**User Story:** As a user, I want to upload a profile avatar so that I can personalize my account.

**Acceptance Criteria:**
- User can upload avatar from profile settings
- Supported formats: JPG, PNG, WEBP
- Maximum file size: 5MB
- System validates file type and size before upload
- System stores original in Azure Blob Storage
- System generates thumbnail (150x150px) automatically
- System replaces existing avatar if uploading new one
- Old avatar deleted from storage
- Avatar displayed throughout application
- Default avatar provided if none uploaded

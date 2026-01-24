### PROC-USER-008: Profile Avatar Upload

**Service Owner:** User Service
**Related FR:** FR-MEDIA-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-009, ADR-032

#### Trigger
User uploads profile picture

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Image file size ≤ 5MB
- Image format: JPEG, PNG, or WebP

#### Inputs

**API Endpoint:** `POST /api/v1/users/profile/avatar`

**Multipart Form Data:**
- `file`: Binary image data (max 5MB, allowed types: image/jpeg, image/png, image/webp)
- `user_id`: UUID (from JWT)

#### Process Steps

1. **API Gateway receives multipart request** → `/api/v1/users/profile/avatar` (POST)
2. **Profile Controller validates file**
   - Check file size ≤ 5MB
   - Check MIME type (image/jpeg, image/png, image/webp)
   - Check image dimensions (max 2000x2000)
3. **Profile Controller generates blob name**
   - Format: `avatars/{user_id}/{timestamp}.{extension}`
   - Example: `avatars/123e4567-e89b-12d3-a456-426614174000/1638360000.jpg`
4. **Profile Controller uploads to Azure Blob Storage**
   ```go
   blobClient := containerClient.NewBlockBlobClient(blobName)
   _, err := blobClient.UploadStream(ctx, fileStream, &azblob.UploadStreamOptions{})
   ```
5. **Profile Controller retrieves blob URL**
   - Public read URL from Azure Blob Storage
6. **User Repository retrieves old avatar URL** (if exists)
   ```sql
   SELECT avatar_url FROM users WHERE user_id = $1
   ```
7. **User Repository updates avatar URL**
   ```sql
   UPDATE users
   SET avatar_url = $1,
       updated_at = NOW()
   WHERE user_id = $2
   RETURNING avatar_url
   ```
8. **Profile Controller deletes old avatar** (if exists and not default)
   - Background job to clean up old blob
9. **Cache Manager invalidates cached profile**
10. **Return new avatar URL**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "avatarUrl": "https://yieldlystorage.blob.core.windows.net/avatars/user_id/image.jpg",
    "message": "Avatar uploaded successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (413 Payload Too Large):**
```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File size exceeds 5MB limit",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Image uploaded to Azure Blob Storage
- Avatar URL updated in database
- Old avatar deleted
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| File too large | 413 | Return "File size exceeds 5MB limit" |
| Invalid file type | 400 | Return "Only JPEG, PNG, WebP allowed" |
| Azure upload error | 500 | Log error, retry with exponential backoff |
| Database error | 500 | Rollback blob upload, return error |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Database Queries**: 2 queries (1 SELECT old avatar, 1 UPDATE avatar URL)
- **Cache Operations**: 1 delete (profile cache invalidation)
- **Expected Execution Time**: < 2 seconds (depends on upload size and file size)
- **Blob Upload Time**: < 1.5 seconds (5MB file)
- **Special Considerations**: File upload operations have higher latency than standard API operations

#### Dependencies
**Database:**
- `user_db` (PostgreSQL)
- Tables: `users`

**Cache:**
- Redis - profile cache

**Storage:**
- Azure Blob Storage - avatar storage: `avatars/{user_id}/{timestamp}.{extension}`

---

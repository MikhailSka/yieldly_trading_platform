## ADR-009: Media Storage Strategy

### Context
Need reliable and scalable solution for storing media assets like user avatars, strategy screenshots, and other files. Cloud-based solution is more robust and accessible than local storage.

### Decision
Use Azure Blob Storage for storing all media assets.

### Rationale
Scalability and Reliability

Designed to handle large amounts of data
Provides redundancy to ensure files are always available
Scales seamlessly with application growth

Easy Integration

Integrates smoothly with other Azure services
Accessible via APIs
Simple to use within application

Simplified Architecture

No need for separate media service
Store files directly in Blob Storage
Keep URL references in appropriate services
Azure handles infrastructure

Cost-Effective

Pay only for storage used
Multiple storage tiers for cost optimization
No infrastructure management overhead


### Implementation Notes

Store files directly in Azure Blob Storage
Keep references (URLs) in User Profile Service and other services
No dedicated media service needed in Phase 1
Can add CDN later for performance optimization

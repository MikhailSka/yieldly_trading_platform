## ADR-007: Security and Access Control

### Context
Need robust security for both internal team operations and external application users. Internally, must manage who can deploy, configure, and monitor resources. Externally, need secure authentication for users accessing the application.

### Decision
For internal access control, use Azure Active Directory (Azure AD) to define roles and permissions. For external user authentication, use Auth0 integrated with Nginx as API gateway.

### Rationale
Layered Security Approach

Separation of internal and external authentication concerns
Internal team access controlled through Azure AD
External users authenticated through Auth0
Defense in depth strategy

Azure AD for Internal Access

Centralized identity management
Define roles: Admin, Developer, Viewer
Control access to Azure resources
Seamless integration with Azure services

Auth0 for External Authentication

Specialized in user authentication
Proven security practices
OAuth/OIDC support
Easy integration with Nginx gateway

Secure Communication

All internal service communication secured via HTTPS
Appropriate network security groups
Data in transit protection

User Profile Service Separation

Auth0 handles authentication and JWT generation
User Profile Service stores user preferences, settings, portfolio configs
Clean separation: authentication vs. user data management
Different access patterns allow independent scaling


### Implementation Notes

Configure Azure AD for team access to Azure resources
Set up Auth0 tenant for application users
Configure Nginx to validate Auth0 tokens
Implement role-based access control (RBAC)
User Profile Service communicates with other services via APIs

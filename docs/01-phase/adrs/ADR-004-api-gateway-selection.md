## ADR-004: API Gateway Selection

### Context
Multiple microservices require a unified entry point for client requests. An API gateway handles routing, authentication, load balancing, and rate limiting.

### Decision
Use Nginx as the API gateway.

### Rationale
Proven Reliability

Battle-tested web server and reverse proxy
High performance and stability
Efficient API gateway functionality

Simplicity

Lightweight compared to specialized API gateways
Straightforward configuration
Maintainable for solo developer

Flexibility

Supports wide range of plugins and modules
Rate limiting, SSL termination, and caching capabilities
HTTP Basic Auth and JWT verification
Can handle authentication at gateway level

Integration

Well-supported in Kubernetes ingress controllers
Easy integration with AKS
Works seamlessly with existing infrastructure

Caching Capabilities

Nginx can act as caching layer
Reduces backend load for appropriate endpoints
Built-in caching mechanisms


### Implementation Notes

Configure Nginx for routing to microservices
Implement JWT validation
Set up caching for appropriate endpoints
Consider Redis for distributed caching if needed

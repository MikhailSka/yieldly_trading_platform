## ADR-020: Resilience Pattern Approach

### Context
In microservices architecture, services need to be resilient to failures. Question arose whether to implement resilience patterns (circuit breakers, retries, timeouts) as separate shared service or as pattern within each microservice.

### Decision
Implement resilience pattern directly inside each microservice rather than as separate service.

### Rationale
Simplicity

Easier and faster to develop
Less infrastructure to maintain
Straightforward implementation

Reduced Overhead

No complexity of maintaining additional service
No extra network hop for resilience checks
Lower operational burden

Service Autonomy

Each service handles its own resilience logic
Services remain independent
No dependency on external resilience service

Quick Development

Aligns with Phase 1 goals of building functional MVP
Can use established libraries
Faster time to market

Future Flexibility

Can standardize patterns across services
Can extract to shared library if needed
Can migrate to service mesh later if requirements grow


### Implementation Notes

Each microservice implements own resilience patterns
Use established libraries:

Polly for .NET
resilience4j for Java
tenacity for Python


Standardize pattern implementation for consistency
Document resilience patterns per service

Patterns to Implement

Circuit Breaker - Prevent cascading failures
Retry with Exponential Backoff - Handle transient failures
Timeout - Prevent hanging operations
Bulkhead - Isolate resources
Fallback - Graceful degradation

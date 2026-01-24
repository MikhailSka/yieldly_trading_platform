## ADR-019: Azure Service Bus for Service Communication

### Context
As platform grows into microservices architecture, reliable and scalable communication between services becomes crucial.

### Decision
Integrate Azure Service Bus as primary messaging service for inter-service communication.

### Rationale
Reliability

Messages delivered even if service temporarily unavailable
Built-in retry mechanisms
Dead-lettering capabilities for failed messages
Guaranteed message delivery

Scalability

Handles large volume of messages
Communication remains smooth under load
Automatic scaling of messaging infrastructure

Integration with Azure Ecosystem

Seamless integration with other Azure services
Leverages existing Azure infrastructure
Unified management and monitoring
Consistent with Azure-first approach

Flexibility

Supports both queues and topics
Queues (Point-to-Point): Direct service communication
Topics (Publish-Subscribe): Broadcasting events to multiple subscribers
Choose right pattern based on needs

Decoupling

Services don't need direct knowledge of each other
Asynchronous communication reduces tight coupling
Services updated independently
Better fault isolation

Implementation
Setup

Configure Azure Service Bus namespaces
Set up queues for point-to-point messaging
Set up topics for publish-subscribe patterns
Update microservices to connect to Service Bus

Message Patterns

Define standard message formats and contracts
Implement message schemas
Version messages appropriately
Document message flows


### Error Handling

Implement retry policies
Dead-letter queue processing
Error logging and monitoring
Alert on message failures

Use Cases
Queue Examples (Point-to-Point)

Backtesting job requests
User registration notifications
Report generation requests

Topic Examples (Publish-Subscribe)

Market data updates
User action events
System-wide notifications

Considerations

Monitor message throughput and latency
Implement proper error handling and logging
Consider message ordering requirements
Plan for message schema evolution
Handle poison messages appropriately

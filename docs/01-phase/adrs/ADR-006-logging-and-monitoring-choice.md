## ADR-006: Logging and Monitoring Choice

### Context
Need straightforward logging and monitoring for microservices. Azure-native tools provide the most value given standardization on Azure.

### Decision
Use Azure Monitor for logging and monitoring in both development and production environments.

### Rationale
Integrated Tooling

Designed to work seamlessly with other Azure services
Simplified setup and maintenance
Native integration reduces configuration complexity

Comprehensive Features

Application performance monitoring
Log aggregation and search
Metrics and dashboards
Alerting capabilities

Unified Monitoring

Works across both development and production
Consistent monitoring experience
Single tool to master

Azure Alignment

Supports Azure certification goals
Deepens Azure expertise
Part of Azure ecosystem


### Implementation Notes

Configure Azure Monitor for all services
Set up application insights
Define key metrics to track
Create dashboards for visibility

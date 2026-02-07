# THESIS-ADR-002: Document Hierarchy and Source of Truth

## Status

Accepted

## Decision

We will establish a clear source-of-truth hierarchy that defines which document type is authoritative for which information.

### Source-of-Truth Hierarchy

| Priority | Document Type                        | Authoritative For                                                                    |
| :------: | ------------------------------------ | ------------------------------------------------------------------------------------ |
|    1     | **OpenAPI Specifications**           | API endpoints, HTTP methods, request/response schemas, error codes, authentication  |
|    2     | **DBML Schemas**                     | Database tables, columns, data types, constraints, foreign keys, indexes            |
|    3     | **Functional Requirements (FR)**     | Business logic, validation rules, user stories, acceptance criteria, error scenarios |
|    4     | **Non-Functional Requirements (NFR)** | Quality attributes, performance targets, security requirements, scalability limits  |
|    5     | **Architecture Decision Records (ADR)** | Architectural decisions, rationale, trade-offs, constraints                       |
|    6     | **C4 Diagrams (text descriptions)**  | System boundaries, service responsibilities, component relationships                |
|    7     | **User-Centric Mind Map**            | User roles, high-level capabilities, workflow overview                              |
|    8     | **Business Description**             | Vision, scope, market context                                                       |

### Conflict Resolution Rules

1. **Higher priority wins** — If OpenAPI says `/api/v1/users` and an ADR example says `/users`, OpenAPI is correct
2. **Update lower priority** — When conflict is found, update the lower priority document to match
3. **Examples are illustrative** — Code examples in ADRs are for understanding, not specification
4. **No code in requirements** — FRs and NFRs describe WHAT, not HOW

### Document Content Boundaries

| Document Type    | MUST Contain                                        | MUST NOT Contain                          |
| ---------------- | --------------------------------------------------- | ----------------------------------------- |
| **OpenAPI**      | Endpoints, schemas, error codes                     | Business logic explanations, rationale    |
| **DBML**         | Tables, columns, constraints                        | Application logic, API details            |
| **FR**           | User stories, validation rules, acceptance criteria | Code examples, implementation details     |
| **NFR**          | Measurable quality targets                          | Specific technology choices               |
| **ADR**          | Decision context, options, consequences             | Authoritative API specs (use OpenAPI)     |
| **C4 Diagrams**  | System structure, relationships                     | Detailed business rules                   |

### Information Ownership

| Information Type         | Owner Document | Referenced By                  |
| ------------------------ | -------------- | ------------------------------ |
| API endpoint paths       | OpenAPI        | FRs, ADRs                      |
| Request/response schemas | OpenAPI        | FRs                            |
| Database table structure | DBML           | OpenAPI (for data types), FRs  |
| Validation rules         | FR             | OpenAPI (for error codes)      |
| Performance targets      | NFR            | ADRs (for technology choices)  |
| Why decisions were made  | ADR            | All documents can reference    |

### Cross-Reference Format

All documents use Obsidian-style wiki-links for explicit relationships:

```markdown
## Related Documentation

- [[FR-AUTH-001-user-registration]] — Registration business logic
- [[ADR-015-password-hashing]] — Why bcrypt was chosen
- [[user-service-api.yaml]] — API specification
```

### Matrices

Matrices are **not separate documents**. They are embedded within relevant documents when needed:

- **When to use:** Complex relationships that are hard to describe in prose
- **Where to embed:** Inside the Markdown description of the related diagram or ADR
- **Example:** Service Interaction Matrix embedded in C4 Level 2 description

## Context

When AI generates code from documentation, conflicts between documents cause errors. If an ADR example shows one API path and a functional requirement mentions another, AI cannot determine which is correct.

This problem is described in [[../00-overview/problem-statement#Lack of Clear Hierarchy]].

A clear hierarchy establishes:
1. Which document type is authoritative for which information
2. How to resolve conflicts when they occur
3. What content belongs in each document type

## Consequences

### Positive

- AI can resolve conflicts by checking hierarchy
- Clear ownership of information reduces duplication
- Wiki-links enable programmatic document traversal
- Each document has a focused purpose

### Negative

- Requires discipline to maintain boundaries
- Initial effort to migrate content to correct documents
- Must update multiple documents when changes affect multiple areas

## Related Documentation

- [[THESIS-ADR-001-togaf-adaptation]] — Overall documentation approach
- [[THESIS-ADR-003-functional-requirements-detail-level]] — FR format for AI consumption
- [[THESIS-ADR-004-naming-and-folder-strategy]] — Folder structure and naming conventions
- [[THESIS-ADR-005-linking-strategy]] — Wiki-links, tags, and index files
- [[../00-overview/current-state-analysis]] — Current issues with documentation
- [[../00-overview/goals-and-objectives]] — Success criteria for hierarchy

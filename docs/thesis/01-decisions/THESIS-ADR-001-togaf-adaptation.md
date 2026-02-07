# THESIS-ADR-001: TOGAF Adaptation for AI-Assisted Development

## Status

Accepted

## Decision

We will adopt a simplified TOGAF-inspired documentation structure optimized for solo developer workflow and AI-assisted code generation.

### Document Types Adopted

| Priority | Document Type                       | Purpose                                                             | Format                          |
| :------: | ----------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
|    1     | Business Description                | Platform overview, vision, scope                                    | Markdown                        |
|    1     | User-Centric Mind Map               | Requirements source — user roles, capabilities, workflows           | Miro (visual) + Markdown (text) |
|    2     | Source-of-Truth Declaration         | Hierarchy defining document authority                               | Markdown                        |
|    3     | Functional Requirements (FR)        | User stories, acceptance criteria, validation rules, business logic | Markdown                        |
|    3     | Non-Functional Requirements (NFR)   | Quality attributes: performance, security, scalability              | Markdown                        |
|    3     | Architecture Decision Records (ADR) | Context, options, decision, consequences                            | Markdown                        |
|    4     | OpenAPI Specifications              | API contracts — endpoints, schemas, error codes                     | YAML (OpenAPI 3.0)              |
|    4     | Database Schemas                    | Data structure — tables, types, constraints                         | DBML                            |
|    5     | C4 Diagrams (L1-L4)                 | Architecture visualization — context to code level                  | Miro (visual) + Markdown (text) |
|    6     | Architecture Definition Document    | Navigation hub linking all artifacts                                | Markdown                        |

### TOGAF Equivalents

| Our Document Type               | TOGAF Equivalent                                                 |
| ------------------------------- | ---------------------------------------------------------------- |
| User-Centric Mind Map           | Business Architecture artifacts (Actor Catalog, Process Catalog) |
| Functional Requirements         | Architecture Requirements Specification                          |
| Non-Functional Requirements     | Architecture Requirements Specification                          |
| Architecture Decision Records   | Architecture Principles + Decision Log                           |
| OpenAPI Specifications          | Application Architecture artifacts                               |
| Database Schemas (DBML)         | Data Architecture artifacts (Data Entity Catalog)                |
| C4 Diagrams                     | Architecture Diagrams (various viewpoints)                       |
| Architecture Definition Document | Architecture Definition Document                                 |

### Comparison to Standard TOGAF

| Standard TOGAF                  | Our Approach                               | Rationale                                               |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| Architecture Vision document    | Covered by Mind Map + Business Description | Simpler for solo developer                              |
| Formal governance processes     | Self-review only                           | No team to coordinate                                   |
| Stakeholder sign-off workflows  | Not needed                                 | Solo developer is the stakeholder                       |
| Architecture Review Board       | Miro dashboard with all diagrams           | Visual overview replaces formal board reviews           |
| Implementation & Migration Plan | Informal roadmap in Mind Map               | Flexible timeline required                              |
| Compliance Assessment           | Self-checklist                             | Educational project                                     |
| Catalogs as separate documents  | Embedded in related documents              | Reduces document count                                  |
| Matrices as separate documents  | Embedded when needed for complex diagrams  | Context-appropriate                                     |

### What We Add (Beyond Standard TOGAF)

| Addition                              | Purpose                                                           |
| ------------------------------------- | ----------------------------------------------------------------- |
| OpenAPI as source of truth for APIs   | Machine-readable API contracts for AI consumption                 |
| DBML as source of truth for data      | Machine-readable data definitions for AI consumption              |
| Embedded matrices                     | Relationship data within relevant documents (not separate files)  |
| Wiki-links `[[document]]`             | Explicit, machine-readable document relationships                 |
| Source-of-Truth Declaration           | Explicit hierarchy for AI to resolve conflicts                    |
| User-centric organization             | Requirements organized by user role, not by service               |

### What We Remove

| Removed                      | Reason                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process Documents (PROC)     | Custom experiment that failed — these were NOT standard TOGAF but an attempt to provide detailed implementation guidance. They became prescriptive, contained code examples AI copied literally, and duplicated FR content. |
| Separate matrix documents    | Embedded within relevant documents instead                                                                                                                       |
| Formal deliverable templates | Simplified markdown structure                                                                                                                                    |

### Diagram Approach

| Purpose           | Tool     | Format                                  |
| ----------------- | -------- | --------------------------------------- |
| Human readability | Miro     | Visual diagrams with manual layout      |
| AI consumption    | Markdown | Text descriptions + embedded matrices   |

Diagrams are created in Miro for human review (allowing manual positioning for readability), then described in Markdown for AI consumption. This hybrid approach acknowledges that diagram-as-code tools cannot produce readable layouts for complex architectures.

## Context

Standard TOGAF is designed for enterprise teams with multiple stakeholders, governance boards, and formal review processes. This project adapts TOGAF for a different context:

- **Solo developer workflow** — no team coordination overhead
- **AI-assisted code generation** — documentation must be machine-readable
- **Educational/research purposes** — Master's thesis case study
- **Iterative development** — flexibility over formal governance

The goal is to maintain TOGAF compatibility while optimizing for AI-assisted development.

## Consequences

### Positive

- Documentation optimized for AI code generation
- Clear authority hierarchy prevents conflicts
- Reduced overhead for solo developer
- Maintains TOGAF compatibility — can scale to team if needed
- Machine-readable formats (OpenAPI, DBML) as sources of truth

### Negative

- Not directly usable in enterprise without adding governance artifacts
- Self-assessment may miss issues external review would catch
- Requires discipline to maintain document boundaries

## Related Documentation

- [[THESIS-ADR-002-document-hierarchy]] — Source of truth hierarchy
- [[THESIS-ADR-003-functional-requirements-detail-level]] — FR format for AI consumption
- [[THESIS-ADR-004-naming-and-folder-strategy]] — Folder structure and naming conventions
- [[THESIS-ADR-005-linking-strategy]] — Wiki-links, tags, and index files
- [[../00-overview/problem-statement]] — Why AI-friendly documentation matters
- [[../00-overview/methodology]] — How this will be validated

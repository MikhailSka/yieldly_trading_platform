# Current State Analysis

This document provides a detailed inventory and analysis of the current Yieldly documentation. For the research context and why these issues matter, see [[problem-statement]].

## Existing Documentation Overview

The documentation for Phase 01 of Yieldly consists of **277 files** organized in a TOGAF-inspired structure.

### Current File Structure

```
docs/01-phase/
├── Business_Description.md              # Platform overview
├── High_Level_Requirements.md           # User stories and epics
│
├── adrs/                                # Architecture Decision Records (33 files)
│   ├── 000-All-ADRs.md
│   ├── ADR-001-monolith-vs-microservices-architecture.md
│   └── ...
│
├── functional-requirements/             # Functional Requirements (66 files)
│   ├── 000-All-Functional-Requirements.md
│   ├── FR-AUTH-001-user-registration-with-invite-code.md
│   └── ...
│
├── non-functional-requirements/         # Non-Functional Requirements (46 files)
│   ├── 000-All-Non-Functional-Requirements.md
│   ├── NFR-SEC-001-authentication-security.md
│   └── ...
│
├── processes/                           # Process Documents (110 files)
│   ├── backtesting-service/
│   ├── broker-connectivity-service/
│   ├── historical-data-service/
│   ├── notification-service/
│   ├── portfolio-service/
│   ├── strategy-service/
│   └── user-service/
│
├── database-schemas/                    # DBML Schema Definitions (7 files)
│   └── {service}_db_schema.dbml
│
├── class-diagrams/                      # Mermaid Class Diagrams (10 files)
│   └── Class-Diagram-{Service}.mmd
│
└── c4-diagrams/                         # C4 Architecture Diagrams (3 files)
    ├── C4-level1_diagram.md
    ├── C4-level2_diagram.md
    └── C4-level3_diagram.md
```

### File Statistics

| Category | Files | Format |
|----------|-------|--------|
| Business Context | 2 | Markdown |
| ADRs | 33 | Markdown |
| Functional Requirements | 66 | Markdown |
| Non-Functional Requirements | 46 | Markdown |
| Process Documents | 110 | Markdown |
| Database Schemas | 7 | DBML |
| Class Diagrams | 10 | Mermaid |
| C4 Diagrams | 3 | Markdown + Mermaid |
| **Total** | **277** | |

## What Works Well

### 1. Domain-Based FR Naming
Functional requirements use domain prefixes (`FR-AUTH-*`, `FR-BACKTEST-*`, `FR-PORTFOLIO-*`) making scope immediately visible from the filename.

### 2. Category-Based NFR Naming
Non-functional requirements use category prefixes (`NFR-SEC-*`, `NFR-PERF-*`, `NFR-SCALE-*`) providing clear organization by concern area.

### 3. Database Schemas in DBML
DBML format provides clear, parseable table definitions with types, constraints, and relationships.

### 4. C4 Diagram Coverage
Three-level C4 documentation (Context, Container, Component) provides architectural overview from high-level to detailed view.

### 5. ADR Content Quality
ADRs capture context, options considered, decision made, and consequences. The content is informative and well-structured.

### 6. Index Files
Each folder contains a `000-All-*.md` index listing all documents in that category.

## Current Issues

### Process Documents

**What they are:** 110 files containing detailed implementation flows with code examples, SQL queries, JSON samples, and step-by-step procedures.

**Why they were created:**
- TOGAF methodology includes process documentation
- Hypothesis: detailed examples would help AI generate better code
- Goal: provide AI everything needed to implement features correctly

**Why they failed:**

| Problem | Impact on Humans | Impact on AI |
|---------|------------------|--------------|
| Prescriptive, not descriptive | Developers lose implementation freedom | AI follows examples rigidly, ignores better alternatives |
| Code examples embedded | Examples become outdated quickly | AI copies example values literally (IPs, ports, sample data) |
| Duplicates info from FRs | Maintenance burden, inconsistencies | Conflicting information causes confusion |
| 110 files to maintain | Unsustainable for solo developer | Context overload |

**Key insight:** It is not the architect's job to prescribe HOW to implement. The architect defines WHAT to build and WHY. Developers (human or AI) should have freedom in implementation.

This directly relates to [[problem-statement#Over-Specification Through Examples]].

### ADR Naming Convention Issues

**Current naming:** `ADR-001-monolith-vs-microservices-architecture.md`

**Problems:**
- No indication if ADR applies globally or to a specific service
- No indication of area (infrastructure, API, security, database)
- When AI lists the folder, it cannot determine which ADRs are relevant for a specific task
- Must read each ADR to understand its scope

This contributes to [[problem-statement#Context Window Limitations]] — AI cannot selectively load relevant ADRs.

### Flat Functional Requirements Structure

**Current:** All 66 FRs in one flat folder with only domain prefix for grouping.

**Problems:**
- No visual grouping by domain
- Hard to find related requirements
- Index file is the only navigation method
- Difficult to see which FRs belong together

### FRs Lack Detailed Business Logic

**Current state:** FRs contain high-level requirements. Detailed business logic lives in process documents.

**Problems:**
- Must read FR + corresponding PROC file(s) to understand a feature
- Business logic separated from its requirement definition
- Validation rules, error scenarios, and data requirements are in PROC files

### No API Specifications

**Current:** No dedicated API documentation exists. Endpoint information is scattered across:
- Process documents (with code examples that shouldn't be copied)
- ADRs (illustrative patterns)
- Functional requirements (partial mentions)

**Problems:**
- No single source of truth for API structure
- Endpoint paths, request/response schemas not formally defined
- Integration between services relies on implicit understanding

This is a key contributor to [[problem-statement#Lack of Clear Hierarchy]].

### No Explicit Document Relationships

**Current:** References between documents are prose-based: *"As decided in ADR-007..."*

**Problems:**
- Not machine-readable
- AI cannot programmatically traverse relationships
- No way to fetch "all documents related to authentication"
- Relationships only discoverable by reading full text

See [[problem-statement#No Explicit Relationships]] for why this matters for AI code generation.

### No Source-of-Truth Hierarchy

**Current:** No document declares what it's authoritative for.

**Problems:**
- When ADR example conflicts with PROC detail, which wins?
- API paths appear in multiple places with no canonical source

This is a core issue described in [[problem-statement#Lack of Clear Hierarchy]].

### ADR Coverage Gaps

**Observation:** Some infrastructure decisions are not documented as ADRs. Areas that may need additional documentation:
- Specific infrastructure patterns
- Service-specific architectural decisions
- Integration approaches between services

## AI Interaction Issues Observed

These issues were encountered during initial attempts to use AI for code generation:

| Issue | Example | Root Cause |
|-------|---------|------------|
| **Literal value copying** | Used `localhost:5432` as production DB host | Example values in ADR/PROC docs |
| **Schema rigidity** | Added fields from JSON example as mandatory | Examples treated as specifications |
| **Implementation lock-in** | Used complex pattern when simple would work | Process docs prescribe specific implementation |
| **Context overload** | Inconsistent output with full doc set | 277 files exceed effective context window |
| **Missing relationships** | Generated service without reading relevant ADRs | No explicit linking between documents |
| **Conflicting sources** | Different validation rules in FR vs PROC | Same information in multiple places |

These observations inform the [[goals-and-objectives]] for this research.

## Human Readability Assessment

### Strengths
- Good high-level overview in Business_Description.md
- ADRs explain reasoning behind decisions well
- Domain prefixes in filenames aid navigation
- Index files provide document listings

### Weaknesses
- 110 process files are overwhelming to navigate
- No visual navigation (e.g., relationship graph)
- Must read multiple files to fully understand one feature
- Relationships only discoverable by reading full document text
- No clear "start here" guidance for new readers

## Summary of Current Issues

| Category | Issue |
|----------|-------|
| **Process Documents** | Prescriptive, contains code examples, duplicates FR content, hard to maintain |
| **ADR Naming** | No scope or area indicators, hard to identify relevant ADRs |
| **FR Structure** | Flat folder, lacks detailed business logic |
| **API Documentation** | Missing entirely |
| **Relationships** | Prose-based, not machine-readable |
| **Source of Truth** | Undefined, conflicts possible |
| **ADR Coverage** | Some infrastructure decisions not documented |

## Related Documentation

- [[problem-statement]] — Why these issues matter for AI code generation
- [[goals-and-objectives]] — What we want to improve
- [[methodology]] — How we'll address these issues

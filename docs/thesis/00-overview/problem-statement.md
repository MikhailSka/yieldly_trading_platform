# Problem Statement

## Research Context

Large Language Models (LLMs) like Claude and GPT are increasingly used for code generation in software development. Developers provide documentation, requirements, and context, expecting AI to generate production-quality code. However, there is no established methodology for structuring technical documentation to optimize AI comprehension and code generation accuracy.

Traditional architectural frameworks (TOGAF, C4, ADRs) were designed for human readers and team communication. When these documents are used as input for AI code generation, the results are inconsistent — sometimes excellent, sometimes fundamentally flawed.

This research uses **Yieldly**, an algorithmic trading backtesting platform, as a case study. See [[current-state-analysis]] for detailed documentation inventory.

## The Problem

**Core Issue:** Documentation structures optimized for human understanding do not necessarily work well for AI code generation.

### 1. Lack of Clear Hierarchy

No explicit "source of truth" designation exists. When specifications conflict with examples, AI doesn't know which to follow. Multiple documents describe the same concept differently.

See [[current-state-analysis#No Source-of-Truth Hierarchy]] for current state details.

### 2. Over-Specification Through Examples

Code examples (SQL, JSON, API calls) are copied literally by AI. Sample values appear in generated production code. Examples imply a single "correct" implementation, restricting developer freedom.

**Key insight:** It is not the architect's job to prescribe implementation details. The architect defines WHAT to build and WHY. The developer (human or AI) should have freedom in HOW to implement.

See [[current-state-analysis#Process Documents]] for the failed experiment with detailed process files.

### 3. Context Window Limitations

Modern AI models have context window limits. Even advanced models cannot efficiently process entire documentation sets for large projects. When implementing a specific feature, AI needs only relevant documents — but without explicit relationships, there's no systematic way to identify which documents are relevant.

**What AI actually needs for a task:**

```
1. Global Context
   └── Infrastructure decisions (microservices vs monolith)
   └── Cross-cutting requirements (security, logging)

2. Service Context
   └── Which service owns this feature?
   └── Service-specific decisions

3. Feature Context
   └── Functional requirement
   └── Related API specifications
   └── Related database models
```

See [[current-state-analysis#No Explicit Document Relationships]] for current linking issues.

### 4. No Explicit Relationships

Documents reference each other in prose (*"As decided in ADR-007..."*) but these references are not machine-readable. AI cannot programmatically traverse relationships or fetch all documents related to a feature.

## Research Question

**How does documentation structure affect AI code generation accuracy and integration error rates?**

## Hypothesis

Layered documentation with explicit source-of-truth hierarchy, combined with AI usage patterns that leverage this structure (selective context loading, hierarchy-aware prompting), reduces AI-generated integration errors by 50%+ compared to unstructured documentation or naive full-context approaches.

## Scope

### In Scope

- Documentation structure and organization
- Hierarchy and "source of truth" designation
- Explicit relationship linking between documents
- AI-friendly document retrieval methodology
- Level of detail in functional requirements
- Restructuring of process document content
- AI usage patterns (prompting, context loading, orchestration)
- Comparative measurement of AI code generation outcomes

See [[methodology]] for detailed research approach.

### Constraints

**TOGAF Compatibility:** This research builds upon TOGAF methodology rather than replacing it. The goal is to improve existing architectural documentation practices for AI compatibility, not to create an entirely new approach.

- TOGAF is widely adopted in enterprise architecture
- Organizations should not need to learn a completely new methodology
- Improvements should be additive, not disruptive

### Out of Scope

- AI model capabilities or training (we use existing LLMs as-is)
- Specific implementation technologies (Go, Python, etc.)
- Business logic of the Yieldly platform itself
- Creating a new architectural framework from scratch

## Related Documentation

- [[current-state-analysis]] — Detailed inventory and issue analysis
- [[goals-and-objectives]] — What success looks like
- [[methodology]] — How we'll test the hypothesis

# Research Methodology

## Approach Overview

This research follows an **action research** methodology: restructure documentation once, then iteratively experiment with different AI usage approaches to find optimal patterns.

The goal is to test the hypothesis stated in [[problem-statement#Hypothesis]] — that layered documentation with explicit source-of-truth hierarchy, combined with AI usage patterns that leverage this structure, reduces AI-generated integration errors compared to unstructured documentation or naive approaches.

## Starting Point

The research begins with an existing documentation set of 277 files in a TOGAF-inspired structure. This provides a realistic baseline for measuring improvement.

See [[current-state-analysis]] for the complete inventory and [[current-state-analysis#Current Issues]] for the specific problems to address.

## Phases

### Phase 1: Documentation Restructuring (One-Time)

Transform the existing documentation to address identified issues:

1. **Define source-of-truth hierarchy** — Establish which document types are authoritative for what information
2. **Create new naming conventions** — Add scope and area indicators to filenames
3. **Restructure folders** — Group related documents for intuitive navigation
4. **Migrate process content** — Move business logic from PROC files to extended FRs, removing code examples
5. **Add wiki-links** — Implement explicit, machine-readable relationships between documents

**Objectives addressed:** [[goals-and-objectives#Objective 1]], [[goals-and-objectives#Objective 3]], [[goals-and-objectives#Objective 4]], [[goals-and-objectives#Objective 5]]

### Phase 2: AI Usage Experiments (Iterative)

Test different approaches to using the restructured documentation for code generation:

**Experiment Variables:**

1. **Context loading strategies**
   - Full documentation vs. selective loading
   - With layer/hierarchy knowledge vs. without
   - With tag/naming convention knowledge vs. without

2. **Orchestration approaches**
   - System prompt with source-of-truth rules
   - Separate "orchestrator document" defining layers
   - No explicit hierarchy guidance (let AI infer from structure)

3. **Prompt variations**
   - Minimal prompt (just the task)
   - Structured prompt (task + relevant document references)
   - Guided prompt (task + hierarchy rules + document references)

**Test methodology:**
- Implement the same module/feature using each approach
- Compare results across approaches
- Document which combinations produce best results

**Objectives addressed:** [[goals-and-objectives#Objective 6]]

### Phase 3: Comparative Analysis

Collect and compare results across different AI usage approaches:

| Approach | Description | Metrics Collected |
|----------|-------------|-------------------|
| Control baseline | Raw docs, minimal prompting, no hierarchy guidance | Integration errors, rework cycles |
| With layer knowledge | Explicit hierarchy rules in system prompt | Integration errors, rework cycles |
| With selective loading | Only relevant docs loaded per task | Integration errors, rework cycles |
| Full orchestration | Combined: layers + selective loading + guided prompts | Integration errors, rework cycles |

**Analysis focus:**
- Which approach produces fewest integration errors?
- Which approach requires least rework?
- What is the optimal balance between context size and guidance?

**Success criteria defined in:** [[goals-and-objectives#Success Criteria]]

## Measurement Approach

### Metrics

| Metric | Definition | How Measured |
|--------|------------|--------------|
| Integration errors | Mismatches between services (API contracts, DB schemas, data formats) | Count during integration testing |
| Rework cycles | Number of fix-regenerate iterations per feature | Log during code generation |
| Requirement compliance | Percentage of FR acceptance criteria met | Checklist against each FR |
| Context efficiency | Documents loaded vs. documents needed | Track during generation |

### Comparison Baseline

Results will be compared using:

1. **Control baseline** — Same task with minimal prompting and no hierarchy guidance (measures documentation structure alone)
2. **Cross-approach comparison** — Same task implemented with different AI usage strategies (measures impact of each variable)
3. **Literature benchmarks** — Published data on AI code generation error rates (external validation)

## Constraints

- **Use existing LLMs as-is** — No model training, fine-tuning, or custom prompting frameworks
- **TOGAF-compatible improvements** — Changes should be adoptable by organizations using TOGAF
- **Single case study** — Results based on Yieldly platform; generalization requires further research

See [[problem-statement#Constraints]] for the full rationale.

## Deliverables

| Deliverable | Description |
|-------------|-------------|
| Restructured documentation | Complete documentation set following new structure and conventions |
| AI usage patterns | Documented approaches for using structured documentation with AI |
| Generated MVP code | Working Yieldly platform code generated from documentation |
| Measurement data | Comparative data across different AI usage approaches |
| Guidelines | Practical recommendations for AI-friendly documentation and usage |

## Related Documentation

- [[problem-statement]] — Hypothesis being tested
- [[current-state-analysis]] — Starting point for restructuring
- [[goals-and-objectives]] — Success criteria and targets

### NFR-PERF-005: Page Load Time
**Priority:** Medium
**Requirement:** Initial page load must complete within 3 seconds on average broadband connection.

**Measurement:**
- Target: First Contentful Paint (FCP) < 1.5s
- Target: Time to Interactive (TTI) < 3s
- Monitoring: Lighthouse CI, Real User Monitoring (RUM)

**Optimizations:**
- Next.js server-side rendering
- Code splitting and lazy loading
- CDN for static assets
- Image optimization

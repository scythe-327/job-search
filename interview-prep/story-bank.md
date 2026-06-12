# Story Bank â€” Master STAR+R Stories

This file accumulates your best interview stories over time. Each evaluation (Block F) adds new stories here. Instead of memorizing 100 answers, maintain 5-10 deep stories that you can bend to answer almost any behavioral question.

## How it works

1. Every time `/career-ops oferta` generates Block F (Interview Plan), new STAR+R stories get appended here
2. Before your next interview, review this file â€” your stories are already organized by theme
3. The "Big Three" questions can be answered with stories from this bank:
   - "Tell me about yourself" â†’ combine 2-3 stories into a narrative
   - "Tell me about your most impactful project" â†’ pick your highest-impact story
   - "Tell me about a conflict you resolved" â†’ find a story with a Reflection

## Stories

<!-- Stories will be added here as you evaluate offers -->
<!-- Format:
### [Theme] Story Title
**Source:** Report #NNN â€” Company â€” Role
**S (Situation):** ...
**T (Task):** ...
**A (Action):** ...
**R (Result):** ...
**Reflection:** What I learned / what I'd do differently
**Best for questions about:** [list of question types this story answers]
-->

### [Security] API Gateway Auth Controls
**Source:** Report #001 — Glean — Cloud Security Engineer
**S (Situation):** APIs needed stronger security and identity validation in BT systems.
**T (Task):** Implement authentication and authorization without hurting performance.
**A (Action):** Built API Gateway authorizer with RSA/Azure AD signature verification and JWT validation.
**R (Result):** Improved API security while reducing backend load.
**Reflection:** Security controls must be designed alongside latency and reliability constraints.
**Best for questions about:** security design, auth, risk mitigation

### [Observability] CloudWatch Cost Optimization
**Source:** Report #001 — Glean — Cloud Security Engineer
**S (Situation):** Cloud OPEX was high with limited visibility into root causes.
**T (Task):** Improve monitoring and reduce cost without degrading reliability.
**A (Action):** Designed CloudWatch monitoring and cost-optimization measures and aligned teams on action thresholds.
**R (Result):** Reduced cloud OPEX by 30%.
**Reflection:** Monitoring is a force multiplier for both reliability and security posture.
**Best for questions about:** observability, cost control, operational discipline

### [Performance] Quarkus Migration + Cold-Start Reduction
**Source:** Report #002 — Glean — Software Engineer, Backend
**S (Situation):** Spring-based services suffered high cold-start latency in serverless.
**T (Task):** Improve startup performance to support AWS Lambda deployments.
**A (Action):** Migrated services from Spring JPA to Quarkus and optimized packaging.
**R (Result):** Reduced cold-start time by 60% and improved availability to 99.97%.
**Reflection:** Platform choices compound into major performance and reliability gains.
**Best for questions about:** performance, architecture decisions, cloud readiness

### [Reliability] Circuit Breaker + Retry Strategy
**Source:** Report #002 — Glean — Software Engineer, Backend
**S (Situation):** Downstream failures threatened a 2000 ms SLA.
**T (Task):** Stabilize service endpoints under failure conditions.
**A (Action):** Implemented circuit breaker and retry strategies with sane defaults.
**R (Result):** Met SLA consistently under load.
**Reflection:** Resilience patterns are simple, but they change system behavior dramatically.
**Best for questions about:** reliability, incident prevention, systems thinking

### [Scale] SOAP Integration at 5k RPM
**Source:** Report #002 — Glean — Software Engineer, Backend
**S (Situation):** Needed to integrate with a SOAP downstream at high throughput.
**T (Task):** Build a reliable integration that sustained 5,000 requests per minute.
**A (Action):** Designed integration flow, tested throughput, and tuned retry/backoff behavior.
**R (Result):** Achieved stable 5k RPM integration.
**Reflection:** Scale is often about good defaults and disciplined testing, not exotic tech.
**Best for questions about:** scalability, integrations, performance testing

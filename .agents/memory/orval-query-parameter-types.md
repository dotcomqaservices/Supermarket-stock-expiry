---
name: Orval query parameter types
description: Generator behavior to watch when expanding API query parameters in this workspace.
---

When adding query parameters to OpenAPI operations, rerun codegen and the shared library typecheck before using the new hooks. The current Orval setup can emit colliding `*Params` exports for query-bearing operations; do not remove useful filters blindly, but first check whether the generator configuration or schema naming can avoid the collision.

**Why:** Generated Zod and TypeScript exports collided during the AI Stock API build, while removing query parameters allowed codegen to pass.

**How to apply:** For new filters, verify `pnpm --filter @workspace/api-spec run codegen` and `pnpm run typecheck:libs` before delegating frontend work.

---
name: GitHub source control
description: Distinguish native GitHub Git authorization from connector API availability.
---

Do not conclude that GitHub pushes are blocked solely because the source-control integration reports authorization but `listConnections` exposes no usable API credential.

**Why:** In this workspace, native Git successfully used Replit's GitHub proxy and authorized repository writes while the connector API remained unavailable.

**How to apply:** Once the user supplies the target repository, try non-interactive native Git operations without reading or extracting credentials. Check remote history, avoid force-pushes, and preserve existing main-branch content when histories differ.

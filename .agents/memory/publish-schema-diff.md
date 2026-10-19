---
name: False-negative publish schema diff
description: A matching development and production schema can still be behind the application's declared schema.
---

An empty development→production schema diff does not mean the published app can use every column declared in the source schema. When both databases are missing the same column, publishing can succeed without adding it, and runtime queries can fail after the new code goes live.

**Why:** A login outage followed a successful publication because a user-access column existed in the Drizzle schema but neither database had it. The publish diff was empty until the development schema was brought up to date.

**How to apply:** For production missing-column incidents, compare the code declaration with both development and production `information_schema`, not only the dev→prod diff. Apply missing schema changes to development through the supported dev-side flow, verify the publish diff includes the needed addition, and have the user republish. Never run DDL directly against managed production.
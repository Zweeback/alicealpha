# Alice operator live probe

Date: 2026-09-21

This branch is an isolated end-to-end probe of the GitHub MCP executor boundary.

Observed path:

1. Alice operator boundary on `main` accepts `branch.create` envelopes.
2. The authenticated GitHub MCP executor successfully created this isolated branch from `main`.
3. No GitHub credential material is stored in Alice source or this artifact.
4. `main` was not modified directly.

This artifact exists only to make the live executor mutation reviewable through a PR and CI before merge.

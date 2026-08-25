# Alice connector audit

Audit date: 2026-08-26  
Method: read-only identity, workspace or resource-list calls. No messages, projects, deployments, assets, databases or account settings were created or changed.

## Directly reachable in this session

- Core/code: GitHub, OpenAI Developers
- Cloud/deployment: Vercel, Render, Railway, Replit, DigitalOcean, AppDeploy. Render now hosts the public full-stack preview.
- Data/memory: Supabase, Neon Postgres, Basic Memory Cloud
- Collaboration/knowledge: Google Drive, SharePoint, Slack, Notion
- Design/media: Figma, OpenArt, Cloudinary, Descript
- Operations: Honeycomb

`reachable` means the connector accepted a read-only call. It does not mean Alice has been deployed there or that a suitable project/database already exists.

## Deployment result

- Render service: `https://alicealpha.onrender.com`
- Git source: `Zweeback/alicealpha`, branch `main`
- region/plan: Frankfurt/free
- build/start: `npm ci && npm run build` / `npm run server`
- external health probe: `ok: true`, model `gpt-realtime-2.1`, `realtime: false`
- Realtime remains false until `OPENAI_API_KEY` is entered directly in Render's secret environment. Automated transfer was rejected by the security boundary and was not bypassed.
- GitHub Pages is manual-only. Automatic initialization was rejected by GitHub's integration permissions, and Pages cannot host the live session endpoint anyway.

## Connector present but authorization still required

- Hugging Face
- Runway
- Netlify
- HeyGen
- MongoDB Atlas

## Present but not exercised by a potentially billable/destructive action

- image/video/voice generation: TalkGen, Speechify, AI Voice Generator, Runway, HeyGen, Fal, OpenArt
- 3D generation: to3D, Meshy
- production writes: Vercel, Render, Railway, Replit, DigitalOcean, AppDeploy, Cloudinary
- database writes/migrations: Supabase, Neon Postgres, MongoDB Atlas, Convex, Redis
- analytics mutation: PostHog, Honeycomb, Sentry

These require a concrete target, confirmed cost/credit use where applicable, and a rollback plan. A connector's presence alone is not permission to create or overwrite external resources.

## Resource-bound or unavailable here

- GitHub Codespaces and Copilot: repository configuration is included, but neither is a callable Codex connector in this session.
- Jules, Gemini, NotebookLM and SuperGrok: no callable connector is exposed in this session.
- ScriptDB, DigiBib, city/state library and connected portals: no named connector or matching environment configuration is exposed in this session. ScriptDB is classified as a licensed library/form/database API source, not a screenplay system.
- Elicit: the read-only report-list probe returned an error and needs a later targeted retry.
- Unity: no Unity project or editor is present in this workspace; the current executable path is WebXR/Three.js, with a future Unity client consuming the same semantic performance contract.

## Required data before library API integration

- exact ScriptDB product/API name and base URL
- authentication method or OAuth entry point; credentials must go directly into a secret store, never chat, Git or model context
- city/state library and DigiBib portal identifiers/API documentation
- allowed operations and licence/reuse terms for records, forms, full text and exports
- one harmless read-only test query and expected response schema

Once supplied through an authenticated connector or secret setup, responses enter through `server/sourceArtifact.js`, which hashes provenance, requires source/access notes and rejects credential/library-card fields.

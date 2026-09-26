# Alice Minimal Viable Deployment

This document operationalizes the current Alice runtime without splitting it into premature microservices.

## Current production boundary

Alice already has:
- Node/Express runtime on port 8787
- Vite production build
- `/api/health`
- OpenAI Realtime session endpoint
- optional Ollama path
- stateless MCP HTTP surface
- browser-local confirmed memory
- CI tests/build/runtime smoke

The MVD keeps that boundary intact and makes it reproducible as one container first.

## Local / Codespaces container run

```bash
docker build -t alice:mvd .
docker run --rm -p 8787:8787 \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  alice:mvd
```

Then verify:

```bash
curl -fsS http://127.0.0.1:8787/api/health
```

Without `OPENAI_API_KEY`, Alice must still become healthy and report `realtime: false`.

## Kubernetes MVD

Apply:

```bash
kubectl create namespace alice
kubectl -n alice create secret generic alice-secrets \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY"

kubectl -n alice apply -f k8s/alice.yaml
kubectl -n alice apply -f k8s/hpa.yaml
```

The image reference in `k8s/alice.yaml` is `ghcr.io/zweeback/alicealpha:latest`.
Publishing that image is intentionally a separate deployment step; CI currently verifies the image but does not push production artifacts.

## Health and self-healing

The same `/api/health` endpoint is used by:
- Docker HEALTHCHECK
- Kubernetes startup probe
- Kubernetes readiness probe
- Kubernetes liveness probe
- CI container smoke test

Kubernetes can restart unhealthy pods and remove unready pods from service traffic.

## Horizontal scaling

The HPA targets 70% average CPU and scales from 2 to 6 replicas.
This requires a working Kubernetes Metrics Server.

Alice's current server endpoints are suitable for horizontal replicas because permanent companion memory is still browser-local. Any future server-side memory or account state must move to an external durable store before relying on unrestricted horizontal scaling.

## Secrets

Never bake secrets into the image or repository.

Supported runtime secrets/config include:
- `OPENAI_API_KEY`
- `ALICE_OLLAMA_URL`
- `ALICE_OLLAMA_MODEL`

For production, use a managed secret store or encrypted Kubernetes secret workflow rather than committing secret YAML.

## Rollout verification

```bash
kubectl -n alice rollout status deployment/alice
kubectl -n alice get pods
kubectl -n alice port-forward service/alice 8787:80
curl -fsS http://127.0.0.1:8787/api/health
```

## Rollback

```bash
kubectl -n alice rollout history deployment/alice
kubectl -n alice rollout undo deployment/alice
```

## MVD acceptance

The MVD is acceptable when:
1. existing unit tests pass;
2. the Vite build passes;
3. the Node runtime health smoke passes;
4. the Docker image builds;
5. the container health smoke passes;
6. the Kubernetes manifests apply in a test cluster;
7. the service stays healthy without an OpenAI key and enables Realtime only when the key is injected.

## Not yet claimed

This MVD does **not** yet claim:
- 99.9% measured uptime;
- multi-region failover;
- durable server-side memory;
- automated database backup;
- production ingress/TLS;
- production image promotion;
- centralized Prometheus/Grafana/Loki;
- automatic rollback on SLO breach.

Those belong after the reproducible deployment baseline is green.

import express from 'express';
import { DESKTOP_ACTIONS, createDesktopGateway, desktopGatewayConfig, tokensMatch } from './desktopGateway.js';

const ERROR_STATUS = Object.freeze({
  'desktop-proposal-not-found': 404,
  'desktop-queue-full': 429,
  'desktop-payload-hash-mismatch': 409,
  'desktop-proposal-not-awaiting-decision': 409,
  'desktop-proposal-not-approved': 409,
});

function fail(response, error) {
  const message = error instanceof Error ? error.message : 'desktop-gateway-error';
  const known = message.startsWith('desktop-');
  response.status(ERROR_STATUS[message] || (known ? 400 : 500)).json({ error: known ? message : 'desktop-gateway-error' });
}

function clientLabel(request) {
  const raw = String(request.get('x-alice-desktop-client') || 'desktop-client');
  return 'desktop-client:' + raw.replace(/[^\w.-]/g, '').slice(0, 48);
}

function bearer(request) {
  const header = String(request.get('authorization') || '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

/**
 * Mounts the Desktop-Gateway under /api/desktop.
 * Public:   GET /status (redacted: no client name, no counts, no journal head)
 * Proposer (Bearer ALICE_DESKTOP_PROPOSER_TOKEN): GET /status (full),
 *           POST /proposals, GET /proposals/:id
 * Client   (Bearer ALICE_DESKTOP_CLIENT_TOKEN): POST /client/next,
 *           POST /client/proposals/:id/decision, POST /client/proposals/:id/result
 * The two credentials must differ; neither is ever sent to or bundled into
 * the browser by the server, logged, or written to the journal.
 */
export function createDesktopGatewayRouter({ env = process.env, gateway, rateLimiter } = {}) {
  const config = desktopGatewayConfig(env);
  const core = gateway || createDesktopGateway({ ttlMs: config.ttlMs });
  const router = express.Router();
  const limit = rateLimiter || ((_request, _response, next) => next());
  const isProposer = (request) => config.enabled && tokensMatch(env.ALICE_DESKTOP_PROPOSER_TOKEN, bearer(request));
  const isClient = (request) => config.enabled && tokensMatch(env.ALICE_DESKTOP_CLIENT_TOKEN, bearer(request));

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/status', (request, response) => {
    const base = {
      schema: 'alice.desktop-gateway.v1',
      enabled: config.enabled,
      reason: config.reason,
      executes_on_server: false,
      approval: 'human-at-desktop-client',
      actions: Object.entries(DESKTOP_ACTIONS).map(([id, spec]) => ({ id, label: spec.label, risk: spec.risk })),
    };
    if (!config.enabled) {
      response.json({ ...base, authenticated: false, client: { connected: false } });
      return;
    }
    if (!isProposer(request)) {
      response.json({ ...base, authenticated: false, client: { connected: core.status().client.connected } });
      return;
    }
    response.json({ ...base, authenticated: true, ...core.status() });
  });

  router.use((request, response, next) => {
    if (!config.enabled) {
      response.status(503).json({ error: 'desktop-gateway-not-configured', reason: config.reason });
      return;
    }
    next();
  });

  const requireProposer = (request, response, next) => {
    if (!isProposer(request)) {
      response.status(401).json({ error: 'desktop-proposer-unauthorized' });
      return;
    }
    next();
  };

  const requireClient = (request, response, next) => {
    if (!isClient(request)) {
      response.status(401).json({ error: 'desktop-client-unauthorized' });
      return;
    }
    next();
  };

  const requireJson = (request, response, next) => {
    if (!request.is('application/json')) {
      response.status(415).json({ error: 'desktop-json-required' });
      return;
    }
    next();
  };

  router.post('/proposals', limit, requireProposer, requireJson, express.json({ limit: '16kb' }), (request, response) => {
    try {
      response.status(201).json(core.propose(request.body, 'proposer:' + (request.ip || 'unknown')));
    } catch (error) {
      fail(response, error);
    }
  });

  router.get('/proposals/:id', requireProposer, (request, response) => {
    try {
      response.json(core.read(request.params.id));
    } catch (error) {
      fail(response, error);
    }
  });

  router.post('/client/next', requireClient, (request, response) => {
    const proposal = core.next(clientLabel(request));
    if (!proposal) {
      response.status(204).end();
      return;
    }
    response.json(proposal);
  });

  router.post('/client/proposals/:id/decision', requireClient, requireJson, express.json({ limit: '4kb' }), (request, response) => {
    try {
      response.json(core.decide(request.params.id, request.body, clientLabel(request)));
    } catch (error) {
      fail(response, error);
    }
  });

  router.post('/client/proposals/:id/result', requireClient, requireJson, express.json({ limit: '8kb' }), (request, response) => {
    try {
      response.json(core.report(request.params.id, request.body, clientLabel(request)));
    } catch (error) {
      fail(response, error);
    }
  });

  return router;
}

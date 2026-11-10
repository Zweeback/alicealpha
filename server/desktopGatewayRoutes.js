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

/**
 * Mounts the Desktop-Gateway under /api/desktop.
 * UI side: GET /status, POST /proposals, GET /proposals/:id
 * Paired client (bearer ALICE_DESKTOP_CLIENT_TOKEN): POST /client/next,
 * POST /client/proposals/:id/decision, POST /client/proposals/:id/result
 */
export function createDesktopGatewayRouter({ env = process.env, gateway, rateLimiter } = {}) {
  const config = desktopGatewayConfig(env);
  const core = gateway || createDesktopGateway({ ttlMs: config.ttlMs });
  const router = express.Router();
  const limit = rateLimiter || ((_request, _response, next) => next());

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/status', (_request, response) => {
    response.json({
      schema: 'alice.desktop-gateway.v1',
      enabled: config.enabled,
      reason: config.reason,
      executes_on_server: false,
      approval: 'human-at-desktop-client',
      actions: Object.entries(DESKTOP_ACTIONS).map(([id, spec]) => ({ id, label: spec.label, risk: spec.risk })),
      ...(config.enabled ? core.status() : { client: { connected: false, last_seen_at: null, label: null }, counts: {}, journal_head: null, journal_length: 0 }),
    });
  });

  router.use((request, response, next) => {
    if (request.path === '/status') return next();
    if (!config.enabled) {
      response.status(503).json({ error: 'desktop-gateway-not-configured', reason: config.reason });
      return;
    }
    next();
  });

  router.post('/proposals', limit, express.json({ limit: '16kb' }), (request, response) => {
    try {
      response.status(201).json(core.propose(request.body, 'alice-ui:' + (request.ip || 'unknown')));
    } catch (error) {
      fail(response, error);
    }
  });

  router.get('/proposals/:id', (request, response) => {
    try {
      response.json(core.read(request.params.id));
    } catch (error) {
      fail(response, error);
    }
  });

  const requireClient = (request, response, next) => {
    const header = String(request.get('authorization') || '');
    const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!tokensMatch(env.ALICE_DESKTOP_CLIENT_TOKEN, provided)) {
      response.status(401).json({ error: 'desktop-client-unauthorized' });
      return;
    }
    next();
  };

  router.post('/client/next', requireClient, (request, response) => {
    const proposal = core.next(clientLabel(request));
    if (!proposal) {
      response.status(204).end();
      return;
    }
    response.json(proposal);
  });

  router.post('/client/proposals/:id/decision', requireClient, express.json({ limit: '4kb' }), (request, response) => {
    try {
      response.json(core.decide(request.params.id, request.body, clientLabel(request)));
    } catch (error) {
      fail(response, error);
    }
  });

  router.post('/client/proposals/:id/result', requireClient, express.json({ limit: '8kb' }), (request, response) => {
    try {
      response.json(core.report(request.params.id, request.body, clientLabel(request)));
    } catch (error) {
      fail(response, error);
    }
  });

  return router;
}

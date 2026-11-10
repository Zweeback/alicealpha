import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import VRMViewer from '../src/viewer/VRMViewer.jsx';
import DesktopGatewayPanel from '../src/viewer/DesktopGatewayPanel.jsx';

// CI's browser smoke (.github/workflows/ci.yml) waits on getByRole('status');
// Playwright strict mode fails if the viewer renders more than one.
describe('VRM viewer accessibility contract', () => {
  it('renders exactly one role="status" with the Desktop-Gateway panel mounted', () => {
    const html = renderToString(createElement(VRMViewer));
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('Desktop-Gateway');
  });
  it('gateway panel uses aria-live instead of a second status role', () => {
    const html = renderToString(createElement(DesktopGatewayPanel));
    expect(html).not.toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
  it('gateway panel CSS stays inside a 360px column (no fixed widths, long hashes wrap)', () => {
    const css = readFileSync(new URL('../src/viewer/vrmViewer.css', import.meta.url), 'utf8');
    const block = css.slice(css.indexOf('.vrm-desktop-form'));
    expect(block).toMatch(/\.vrm-desktop-item \{[^}]*overflow-wrap: anywhere/);
    expect(block).toMatch(/\.vrm-desktop-form select, \.vrm-desktop-form input \{[^}]*width: 100%[^}]*min-width: 0/);
    expect(block).not.toMatch(/position:\s*fixed|(?<![-\w])width:\s*\d{3,}px/);
  });
  it('does not claim a phone or tablet client exists', () => {
    const html = renderToString(createElement(DesktopGatewayPanel));
    expect(html).toContain('noch keinen eigenen Client');
  });
});

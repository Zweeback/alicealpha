import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
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
});

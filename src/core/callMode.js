export function callModeEnabled(search = globalThis.location?.search || '') {
  const params = new URLSearchParams(search);
  return params.get('call') === '1' || params.get('mode') === 'call';
}

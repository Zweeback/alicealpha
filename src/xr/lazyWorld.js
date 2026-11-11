/**
 * Lädt die 3D-Welt (three.js, three-vrm) erst nach dem ersten Render, damit Porträt und Bedienung sofort stehen.
 * Die Schnittstelle entspricht dem Teil von AliceWorld, den die Oberfläche benutzt. Aufrufe vor dem Laden
 * werden verworfen; nur Präsenz und Darstellungsmodus werden gemerkt und nach dem Laden angewendet.
 * Schlägt das Laden oder WebGL fehl, bleiben alle Methoden harmlos, und `ready` lehnt mit dem Fehler ab.
 */
export function createLazyWorld(canvas, options = {}, { load = () => import('./AliceWorld.js') } = {}) {
  let real = null;
  let disposed = false;
  const pending = { presence: null, representation: null };

  const ready = (async () => {
    const { AliceWorld } = await load();
    if (disposed) return null;
    const world = new AliceWorld(canvas, options);
    real = world;
    if (pending.presence) world.setPresence(pending.presence);
    await world.init();
    if (disposed) return null;
    if (pending.representation) world.setRepresentation(pending.representation);
    return world;
  })();
  // Fehler werden über `ready` gemeldet; dieser Zweig verhindert nur „unhandled rejection“.
  ready.catch(() => undefined);

  const requireWorld = async () => {
    let world = null;
    try {
      world = await ready;
    } catch (cause) {
      throw new Error('3D-Viewer ist nicht verfügbar.', { cause });
    }
    if (!world) throw new Error('3D-Viewer ist nicht verfügbar.');
    return world;
  };

  return {
    ready,
    get loaded() { return real !== null; },
    setPresence(presence) {
      pending.presence = { ...(pending.presence || {}), ...presence };
      real?.setPresence(presence);
    },
    setRepresentation(mode) {
      pending.representation = mode;
      return real ? real.setRepresentation(mode) : mode;
    },
    playPlan(plan) { real?.playPlan(plan); },
    playCue(cue) { real?.playCue(cue); },
    stopPlan() { real?.stopPlan(); },
    setSpeechEnergy(value) { real?.setSpeechEnergy(value); },
    setVisemes(visemes, volume) { real?.setVisemes(visemes, volume); },
    async support() {
      try {
        await ready;
        return real ? await real.support() : { ar: false, vr: false };
      } catch {
        return { ar: false, vr: false };
      }
    },
    async startXR(mode) {
      return (await requireWorld()).startXR(mode);
    },
    async loadCandidateFile(file) {
      return (await requireWorld()).loadCandidateFile(file);
    },
    dispose() {
      disposed = true;
      real?.dispose();
      real = null;
    },
  };
}

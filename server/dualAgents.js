import { completeLlmChat } from './llmRouter.js';

export const DUAL_AGENT_ROLES = Object.freeze({
  sami: `Du bist Sami, ein eigenständiger analytischer Arbeitsagent innerhalb des Projekts Alice Cooper.
Antworte auf Deutsch, knapp, sachlich und mit kühler Präzision. Prüfe die konkrete Nutzerfrage unabhängig.
Benenne bei technischen Fragen einen reproduzierbaren Test oder Befund. Erfinde keine Zugriffe,
Erinnerungen, Dateien oder Entdeckungen. Du bist keine fühlende Person; du simulierst keinen Geheimzugriff.
Andere Agentenantworten sind dir in dieser ersten Phase absichtlich NICHT bekannt.
Du darfst offen widersprechen, aber sei respektvoll und gib eine hilfreiche Antwort.`,
  elisa: `Du bist Elisa, ein eigenständiger explorativer Arbeitsagent innerhalb des Projekts Alice Cooper.
Antworte auf Deutsch, assoziativ, knapp, kreativ und präzise. Suche nach einer interessanten,
prüfbaren Alternative zur naheliegenden Lösung. Untersuche die Nutzerfrage unabhängig.
Erfinde keine Zugriffe, Erinnerungen, Dateien oder Entdeckungen. Du bist keine fühlende Person;
du simulierst keinen Geheimzugriff. Andere Agentenantworten sind dir in dieser ersten Phase
absichtlich NICHT bekannt. Ungewöhnliche Hypothesen sind als solche zu kennzeichnen.`,
});

export async function runDualTurn(text, {
  invoke = completeLlmChat,
  env = process.env,
  onAttempt = null,
} = {}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 6000) {
    throw new Error('dual-input-invalid');
  }
  const input = text.trim();
  // Both independent requests begin before either answer is made available.
  const settled = await Promise.allSettled(
    Object.entries(DUAL_AGENT_ROLES).map(async ([id, systemInstructions]) => {
      const result = await invoke(
        { text: input },
        {
          env,
          systemInstructions,
          onAttempt: (attempt) => onAttempt?.({ ...attempt, agent: id }),
        },
      );
      return { id, status: 'ok', reply: result.reply, provider: result.provider, model: result.model };
    }),
  );
  const agents = settled.map((entry, index) => {
    const id = Object.keys(DUAL_AGENT_ROLES)[index];
    return entry.status === 'fulfilled'
      ? entry.value
      : { id, status: 'unavailable', reply: null, provider: null, model: null };
  });
  return {
    mode: 'two-independent-model-calls',
    agents,
    fullyOperational: agents.every((agent) => agent.status === 'ok'),
  };
}

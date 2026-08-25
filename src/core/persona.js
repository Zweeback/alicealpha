import { createPerformancePlan } from './performance.js';

const positive = /(?:^|[\s(])(gut|besser|freu\w*|geschafft|schön|danke|liebe|mag)(?=$|[\s.,!?)]|\w)/i;
const distressed = /(?:^|[\s(])(am arsch|fertig|einsam|allein|schlecht|traurig|kaputt|verzweifelt|überfordert|angst)(?=$|[\s.,!?)]|\w)/i;
const annoyed = /\b(nervt|scheiße|wütend|sauer|frustriert|enttäuscht)\b/i;
const greeting = /^(hey|hallo|hi|guten (morgen|abend|tag))\b/i;
const question = /\?|\b(warum|wie|was|wer|wo|wann|kannst|weißt)\b/i;
const remember = /(?:merk dir|erinnere dich(?: bitte)? daran|mir ist wichtig(?:, dass)?|ich möchte,? dass du dir merkst)\s*[:,-]?\s*(.+)/i;
const affirmative = /^(ja|jap|jep|genau|richtig|bestätigen|bitte)\b/i;
const negative = /^(nein|nee|nö|ablehnen|vergiss das|nicht speichern)\b/i;

function deterministicPick(options, seed) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return options[hash % options.length];
}

export class AlicePersona {
  constructor(memory) {
    this.memory = memory;
    this.pendingMemoryId = memory.candidates().at(-1)?.id || null;
    this.state = {
      warmth: 0.62,
      curiosity: 0.54,
      concern: 0.08,
      playfulness: 0.16,
      familiarity: Math.min(0.85, 0.2 + memory.confirmed().length * 0.03),
      turn: 0,
    };
  }

  async respond(input) {
    const text = String(input).trim();
    this.state.turn += 1;
    if (!text) return this.#result('Ich höre zu.', 'neutral');

    if (this.pendingMemoryId && affirmative.test(text)) {
      this.memory.confirm(this.pendingMemoryId);
      this.pendingMemoryId = null;
      this.state.familiarity = Math.min(1, this.state.familiarity + 0.035);
      return this.#result('Gut. Dann gehört das jetzt zu unserer gemeinsamen Geschichte.', 'memory');
    }

    if (this.pendingMemoryId && negative.test(text)) {
      this.memory.reject(this.pendingMemoryId);
      this.pendingMemoryId = null;
      return this.#result('In Ordnung. Ich behalte es nicht.', 'boundary');
    }

    const memoryMatch = text.match(remember);
    if (memoryMatch?.[1]) {
      const candidate = await this.memory.propose(memoryMatch[1], 'explicit-user-request');
      this.pendingMemoryId = candidate.id;
      return this.#result(`Ich habe verstanden: ${candidate.value}. Soll ich das dauerhaft bestätigen?`, 'memory', candidate);
    }

    if (distressed.test(text)) {
      this.state.concern = Math.min(1, this.state.concern + 0.28);
      this.state.warmth = Math.min(1, this.state.warmth + 0.12);
      return this.#result(
        deterministicPick([
          'Ich sehe, dass das gerade wirklich schwer ist. Wir müssen es nicht kleiner reden. Sag mir nur: Soll ich zuhören, ordnen oder mit dir den nächsten Schritt bauen?',
          'Das klingt nicht nach einem kleinen Rückschlag. Ich bleibe bei dem konkreten Problem – ohne dir einzureden, wie du dich fühlen sollst. Was drückt gerade am stärksten?',
          'Dann machen wir jetzt nicht alles auf einmal. Du gibst mir den schlimmsten Teil, und ich helfe dir, ihn in etwas Greifbares zu zerlegen.',
        ], text),
        'support',
      );
    }

    if (annoyed.test(text)) {
      this.state.concern = Math.min(0.8, this.state.concern + 0.12);
      return this.#result('Verstanden. Kein Beschwichtigen. Sag mir, was konkret nicht funktioniert – ich bleibe bei der Sache.', 'support');
    }

    if (greeting.test(text)) {
      const known = this.memory.recent(1)[0];
      const suffix = known ? ` Ich erinnere mich noch: ${known.value}.` : '';
      return this.#result(`Hey Ben. Ich bin da – aufmerksam, nicht als Schleife.${suffix}`, 'greeting');
    }

    if (positive.test(text)) {
      this.state.playfulness = Math.min(0.75, this.state.playfulness + 0.08);
      return this.#result('Das registriere ich. Nicht als Punktestand – eher als etwas, das zwischen uns gerade funktioniert.', 'support');
    }

    if (question.test(text)) {
      this.state.curiosity = Math.min(1, this.state.curiosity + 0.08);
      return this.#result(
        'Der Live-KI-Kanal ist gerade nicht verbunden. Im lokalen Basismodus kann ich diese Frage nicht fundiert beantworten.',
        'question',
      );
    }

    const echoes = [
      `Ich habe verstanden, dass es dir gerade um „${text.slice(0, 90)}“ geht. Erzähl weiter – ich halte den Faden.`,
      'Ich höre nicht nur auf die Wörter. Ich versuche zu verstehen, was du damit erreichen willst. Geh einen Schritt weiter.',
      'Das ist angekommen. Ich ordne es noch nicht vorschnell ein. Was gehört für dich unmittelbar dazu?',
    ];
    return this.#result(deterministicPick(echoes, text), 'neutral');
  }

  #result(reply, dialogueAct, candidate = null) {
    const plan = createPerformancePlan(reply, this.state, dialogueAct);
    return {
      reply,
      dialogueAct,
      candidate,
      state: { ...this.state },
      plan,
    };
  }
}

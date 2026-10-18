import './offer.css';

const tiers = [
  {
    name: 'Pilot',
    price: '1.490 €',
    note: 'einmalig',
    items: [
      'Private Wissensbasis aus ausgewählten Dokumenten',
      'Quellenbelegte Antworten',
      'Web-Oberfläche auf eigener URL',
      '1 klar definierter Use Case',
      'Übergabe + kurze Einweisung',
    ],
  },
  {
    name: 'Production',
    price: '4.900 €',
    note: 'ab',
    items: [
      'Mehrere Datenquellen und Rollen',
      'RAG + Tool-/Workflow-Anbindung',
      'Deployment auf eigener Infrastruktur',
      'Logging, Evaluierung und Guardrails',
      '30 Tage Fehlerbehebung nach Übergabe',
    ],
  },
  {
    name: 'Embodied Agent',
    price: 'Custom',
    note: 'Voice / 3D / WebXR',
    items: [
      'Realtime Voice',
      '3D-Avatar / WebXR',
      'Live-Präsenz und Gesten',
      'Individuelle Integrationen',
      'White-Label möglich',
    ],
  },
];

export default function OfferPage() {
  return (
    <main className="offer-shell">
      <section className="offer-hero">
        <div className="offer-kicker">PRIVATE KNOWLEDGE AGENTS · BUILT & DEPLOYED</div>
        <h1>Aus euren Dokumenten wird ein nutzbarer KI-Agent.</h1>
        <p className="offer-lead">
          Kein Chatbot-Spielzeug: private Wissensbasis, Quellenbelege, Deployment und ein klar abgegrenzter Workflow.
          Optional mit Voice, Tool-Aufrufen und Echtzeit-3D-Avatar.
        </p>
        <div className="offer-actions">
          <a className="offer-primary" href="/?call=1">Live-Demo mit Alice starten</a>
          <a className="offer-secondary" href="#pricing">Pakete ansehen</a>
        </div>
        <div className="offer-proof">
          <span>React + Three.js + WebXR</span>
          <span>Realtime Voice</span>
          <span>RAG / Memory / MCP-ready</span>
          <span>Deployable full stack</span>
        </div>
      </section>

      <section className="offer-section">
        <div>
          <span className="offer-eyebrow">Was geliefert wird</span>
          <h2>Ein funktionierender Pilot statt monatelanger Strategiephase.</h2>
        </div>
        <div className="offer-grid">
          <article>
            <strong>1. Daten anbinden</strong>
            <p>Dokumente, Webseiten oder ausgewählte interne Quellen werden in eine klar begrenzte Wissensbasis überführt.</p>
          </article>
          <article>
            <strong>2. Antworten belegen</strong>
            <p>Der Agent soll nicht nur antworten, sondern Herkunft und Grenzen seiner Antworten sichtbar machen.</p>
          </article>
          <article>
            <strong>3. Workflow schließen</strong>
            <p>Ein definierter Prozess wird vom Input bis zum überprüfbaren Ergebnis durchgängig umgesetzt.</p>
          </article>
          <article>
            <strong>4. Deployment</strong>
            <p>Die Lösung endet nicht im Notebook. Sie wird als nutzbare Web-Anwendung bereitgestellt und dokumentiert.</p>
          </article>
        </div>
      </section>

      <section className="offer-section offer-demo">
        <div>
          <span className="offer-eyebrow">Live proof</span>
          <h2>Alice ist die laufende Referenz.</h2>
          <p>
            Die bestehende Demo kombiniert WebRTC-Sprachinteraktion, 3D/WebXR, lokale Fallbacks, Memory-Gates
            und einen deploybaren Node/React-Stack.
          </p>
        </div>
        <a className="offer-primary" href="/?call=1">Demo öffnen</a>
      </section>

      <section className="offer-section" id="pricing">
        <div>
          <span className="offer-eyebrow">Fixed-scope Einstieg</span>
          <h2>Klare Pakete. Erweiterung erst nach einem funktionierenden Pilot.</h2>
        </div>
        <div className="offer-pricing">
          {tiers.map((tier) => (
            <article className="offer-card" key={tier.name}>
              <span>{tier.name}</span>
              <h3>{tier.price}</h3>
              <small>{tier.note}</small>
              <ul>
                {tier.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <a href="/?call=1">Technik live ansehen</a>
            </article>
          ))}
        </div>
      </section>

      <section className="offer-section offer-final">
        <span className="offer-eyebrow">Start klein, beweisbar, produktionsnah</span>
        <h2>Ein realer Use Case. Ein klarer Scope. Eine laufende Lösung.</h2>
        <p>
          Der Pilot ist für Teams gedacht, die ihre eigenen Informationen sicherer und schneller nutzbar machen wollen,
          ohne direkt eine große Plattform einzukaufen.
        </p>
        <a className="offer-primary" href="/?call=1">Alice als Referenz testen</a>
      </section>
    </main>
  );
}

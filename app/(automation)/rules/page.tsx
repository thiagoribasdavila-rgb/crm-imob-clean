export default function RulesPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>📜 Regras de Automação</h1>

      <ul>
        <li>Se lead for HOT → enviar para corretor imediatamente</li>
        <li>Se não responder em 5 min → disparar WhatsApp</li>
        <li>Se score &lt; 40 → nutrir automaticamente</li>
      </ul>
    </div>
  );
}

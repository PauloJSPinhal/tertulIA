// Exporta a sessão completa (mensagens + configuração dos agentes à mesa)
export function downloadSessionFile(session, allAgents) {
  const seatedAgents = allAgents.filter(a => (session.selectedAgentIds || []).includes(a.id));
  
  const payload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    session: {
      id: session.id,
      title: session.title,
      date: session.date,
      messages: session.messages || [],
      selectedAgentIds: session.selectedAgentIds || []
    },
    agents: seatedAgents.map(a => ({
      ...a,
      apiKey: '' // Por segurança, não exporta a chave no ficheiro partilhável
    }))
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(session.title || 'tertulia').toLowerCase().replace(/[^a-z0-9]/gi, '_')}.tertulia.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Lê o ficheiro .tertulia.json importado pelo utilizador
export function readSessionFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o ficheiro local.'));
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.session || !data.session.title) {
          throw new Error('Ficheiro de tertúlia inválido ou corrompido.');
        }
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsText(file);
  });
}
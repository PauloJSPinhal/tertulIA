export function exportConversationToMarkdown(sessionTitle, messages, agents) {
  let content = `# TertulIA: ${sessionTitle || 'Sem título'}\n`;
  content += `Data: ${new Date().toLocaleString('pt-PT')}\n\n`;
  content += `## Participantes à Mesa\n`;
  
  agents.forEach(a => {
    content += `- **${a.displayName}** (${a.model}) - ${a.operator}\n`;
  });

  content += `\n---\n\n## Diálogo\n\n`;

  messages.forEach(msg => {
    const time = msg.timestamp || '';
    content += `### ${msg.senderName} [${time}]\n\n${msg.text}\n\n`;
  });

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(sessionTitle || 'tertulia').toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
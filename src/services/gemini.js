export async function sendGeminiMessage({ apiKey, model, messages, systemInstruction }) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API Key em falta para este interlocutor.');
  }

  // Filtra apenas mensagens de utilizador ou de modelo válidas (ignora balões de erro)
  const validMessages = messages
    .filter(msg => !msg.isError && msg.text && msg.text.trim() !== '')
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

  const targetModel = model?.trim() || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey.trim()}`;

  const payload = {
    contents: validMessages,
    ...(systemInstruction && systemInstruction.trim() !== '' && {
      systemInstruction: {
        parts: [{ text: systemInstruction.trim() }]
      }
    })
  };

  // Timeout de 30 segundos para nunca congelar
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.error?.message || `Erro HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMsg);
    }

    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) {
      if (data?.promptFeedback?.blockReason) {
        throw new Error(`Mensagem bloqueada por filtros de segurança: ${data.promptFeedback.blockReason}`);
      }
      throw new Error('Nenhuma resposta de texto devolvida pelo modelo.');
    }

    return answer;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('O pedido excedeu o tempo limite (30s). Verifica a ligação ou a API.');
    }
    throw err;
  }
}
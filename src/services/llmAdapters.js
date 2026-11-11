import { OPERATORS } from '../constants/operators';

// ============================================================================
// 1. FUNÇÃO PRINCIPAL DE DISPARO
// ============================================================================
export async function sendAgentMessage({ agent, messages, seatedAgents = [], imageAttachment = null }) {
  if (agent.operator === 'google') {
    return sendGemini({ agent, messages, seatedAgents, imageAttachment });
  } else {
    return sendOpenAICompatible({ agent, messages, seatedAgents, imageAttachment });
  }
}

// ============================================================================
// 2. FUNÇÕES AUXILIARES: IDENTIDADE & LIMPEZA
// ============================================================================
function buildAgentSystemPrompt(agent, seatedAgents = []) {
  const otherParticipants = seatedAgents
    .filter(a => a.id !== agent.id)
    .map(a => `@${a.displayName}`)
    .join(', ');

  const identityInstruction = `És o(a) "${agent.displayName}", um participante ativo nesta tertúlia/debate em grupo.
A tua identidade fixa é exclusivamente "${agent.displayName}". 
Nunca digas que és outro modelo ou outro participante e nunca tentes responder em nome de terceiros.
Os colegas que partilham a mesa contigo são: ${otherParticipants || 'nenhum'}.
${agent.builtInstruction ? `Personalidade e traços de estilo: ${agent.builtInstruction}` : ''}
Mantém-te sempre dentro da tua personagem de tertuliano.`;

  return identityInstruction.trim();
}

function sanitizeReply(text, agentName) {
  if (!text) return '';
  // Remove prefixos automáticos como "[Nome]: " ou "Nome: " que o LLM tente gerar
  const prefixRegex = new RegExp(`^(\\[${agentName}\\]|${agentName}):\\s*`, 'i');
  return text.replace(prefixRegex, '').trim();
}

// ============================================================================
// 3. ADAPTADOR GOOGLE GEMINI
// ============================================================================
async function sendGemini({ agent, messages, seatedAgents, imageAttachment }) {
  if (!agent.apiKey || agent.apiKey.trim() === '') {
    throw new Error('API Key Google em falta.');
  }

  const validContents = messages.map(msg => {
    const parts = [{ text: `[${msg.senderName}]: ${msg.text}` }];
    
    if (msg.imageAttachment && msg.role === 'user') {
      parts.push({
        inlineData: {
          mimeType: msg.imageAttachment.mimeType,
          data: msg.imageAttachment.base64Data
        }
      });
    }

    return {
      role: msg.role === 'user' ? 'user' : 'model',
      parts
    };
  });

  const model = agent.model || 'gemini-3.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${agent.apiKey.trim()}`;

  // Injeção da Identidade no Gemini
  const systemInstructionText = buildAgentSystemPrompt(agent, seatedAgents);

  const payload = {
    contents: validContents,
    systemInstruction: { 
      parts: [{ text: systemInstructionText }] 
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Erro HTTP ${response.status}`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('O modelo não devolveu resposta.');
    return sanitizeReply(text, agent.displayName);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ============================================================================
// 4. ADAPTADOR OPENAI COMPATÍVEL (Groq, DeepSeek, Ollama)
// ============================================================================
async function sendOpenAICompatible({ agent, messages, seatedAgents, imageAttachment }) {
  const opDef = OPERATORS.find(o => o.id === agent.operator);

  // Roteamento via Proxy Vite para evitar bloqueios CORS
  let baseUrl = agent.customBaseUrl || opDef?.defaultBaseUrl || 'http://localhost:11434/v1';
  if (agent.operator === 'deepseek') baseUrl = '/api-deepseek/v1';
  if (agent.operator === 'groq') baseUrl = '/api-groq/v1';

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const formattedMessages = [];

  // Injeção da Identidade no DeepSeek / Groq
  const systemInstructionText = buildAgentSystemPrompt(agent, seatedAgents);
  formattedMessages.push({ role: 'system', content: systemInstructionText });

  messages.forEach(msg => {
    let content = `[${msg.senderName}]: ${msg.text}`;
    
    const supportsVision = opDef?.models?.find(m => m.id === agent.model)?.supportsVision;
    if (supportsVision && msg.imageAttachment && msg.role === 'user') {
      content = [
        { type: 'text', text: content },
        { type: 'image_url', image_url: { url: msg.imageAttachment.dataUrl } }
      ];
    }

    formattedMessages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content
    });
  });

  const payload = {
    model: agent.model,
    messages: formattedMessages,
  };

  if (agent.model !== 'deepseek-reasoner') {
    payload.temperature = 0.7;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (agent.apiKey && agent.apiKey.trim() !== '') {
    headers['Authorization'] = `Bearer ${agent.apiKey.trim()}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error?.message || `Erro HTTP ${res.status}: ${res.statusText}`);
    }

    const reply = data.choices?.[0]?.message?.content || 'Sem resposta.';
    return sanitizeReply(reply, agent.displayName);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, Send, Settings, MessageSquare, Plus, Trash2, 
  Users, Square, Image as ImageIcon, X, 
  Download, RefreshCw, MoreVertical, Upload, Edit3
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { OPERATORS, PERSONALITY_TRAITS, PRESET_COLORS } from './constants/operators';
import { THEMES } from './constants/themes';
import { processAndCompressImage } from './services/imageUtils';
import { sendAgentMessage } from './services/llmAdapters';
import { exportConversationToMarkdown } from './services/exportUtils';
import { downloadSessionFile, readSessionFile } from './services/sessionFileUtils';

export default function App() {
  // --- Temas e Navegação ---
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'agents' | 'settings'
  const [themeId, setThemeId] = useState(() => localStorage.getItem('tertulia_theme') || 'slate');
  const theme = THEMES[themeId] || THEMES.slate;

  // --- Tertulianos Configurados ---
  const [agents, setAgents] = useState(() => {
    const saved = localStorage.getItem('tertulia_agents_v2');
    return saved ? JSON.parse(saved) : [
      {
        id: 'gemini-base',
        displayName: 'Gemini',
        operator: 'google',
        model: 'gemini-3.5-flash-lite',
        apiKey: '',
        color: '#0284c7',
        traits: { tones: ['informal'], stances: ['constructive'], styles: ['concise'] },
        customInstruction: '',
        builtInstruction: 'Responde de forma concisa e descontraída.'
      }
    ];
  });

  // --- Sessões Guardadas ---
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('tertulia_sessions');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessionTitle, setSessionTitle] = useState('Nova Tertúlia');
  const [openMenuSessionId, setOpenMenuSessionId] = useState(null);

  // --- Diálogo Atual ---
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [attachedImage, setAttachedImage] = useState(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState([]);

  // --- Dinâmica de Réplicas Entre IAs ---
  const [turnTakingMode, setTurnTakingMode] = useState('none'); // 'none' | 'sequential'
  const [maxReplicas, setMaxReplicas] = useState(0);
  const [isDialogueRunning, setIsDialogueRunning] = useState(false);
  const [loadingAgentName, setLoadingAgentName] = useState(null);

  const stopRequestedRef = useRef(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);

  // Inicializar quem está à mesa
  useEffect(() => {
    if (selectedAgentIds.length === 0 && agents.length > 0) {
      setSelectedAgentIds(agents.map(a => a.id));
    }
  }, [agents]);

  // Persistência
  useEffect(() => {
    localStorage.setItem('tertulia_agents_v2', JSON.stringify(agents));
  }, [agents]);

  useEffect(() => {
    localStorage.setItem('tertulia_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('tertulia_theme', themeId);
  }, [themeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingAgentName]);

  // Fechar menus dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuSessionId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Atualizar instruções de personalidade via checkboxes
  const updateAgentTraits = (agentId, category, traitId) => {
    setAgents(prev => prev.map(a => {
      if (a.id !== agentId) return a;
      const currentList = a.traits?.[category] || [];
      const updated = currentList.includes(traitId)
        ? currentList.filter(t => t !== traitId)
        : [...currentList, traitId];

      const newTraits = { ...(a.traits || {}), [category]: updated };

      const descParts = [];
      if (newTraits.tones?.length) descParts.push(`Tom: ${newTraits.tones.join(', ')}.`);
      if (newTraits.stances?.length) descParts.push(`Postura: ${newTraits.stances.join(', ')}.`);
      if (newTraits.styles?.length) descParts.push(`Estilo: ${newTraits.styles.join(', ')}.`);
      const built = `${descParts.join(' ')} ${a.customInstruction || ''}`.trim();

      return { ...a, traits: newTraits, builtInstruction: built };
    }));
  };

  // Processar imagem
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const processed = await processAndCompressImage(file);
      setAttachedImage(processed);
    } catch (err) {
      alert('Erro ao comprimir imagem: ' + err.message);
    }
  };

  // --- Gestão de Sessões ---
  const handleNewSession = () => {
    setCurrentSessionId(null);
    setSessionTitle('Nova Tertúlia');
    setMessages([]);
    setAttachedImage(null);
    setActiveTab('chat');
  };

  const handleLoadSession = (sess) => {
    setCurrentSessionId(sess.id);
    setSessionTitle(sess.title);
    setMessages(sess.messages || []);
    setSelectedAgentIds(sess.selectedAgentIds || agents.map(a => a.id));
    setActiveTab('chat');
  };

  const handleDeleteSession = (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Eliminar permanentemente esta conversa?')) return;
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      handleNewSession();
    }
    setOpenMenuSessionId(null);
  };

  const handleRenameSession = (session, e) => {
    e.stopPropagation();
    const newTitle = prompt('Novo título para a conversa:', session.title);
    if (newTitle && newTitle.trim()) {
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, title: newTitle.trim() } : s));
      if (currentSessionId === session.id) {
        setSessionTitle(newTitle.trim());
      }
    }
    setOpenMenuSessionId(null);
  };

  const handleExportSessionFile = (session, e) => {
    e.stopPropagation();
    downloadSessionFile(session, agents);
    setOpenMenuSessionId(null);
  };

  const handleImportSessionFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { session, agents: importedAgents } = await readSessionFile(file);

      if (importedAgents && importedAgents.length > 0) {
        setAgents(prev => {
          const existingIds = new Set(prev.map(a => a.id));
          const toAdd = importedAgents.filter(a => !existingIds.has(a.id));
          return [...prev, ...toAdd];
        });
      }

      const newSessionEntry = {
        ...session,
        id: `sess-${Date.now()}`
      };

      setSessions(prev => [newSessionEntry, ...prev.filter(s => s.id !== newSessionEntry.id)]);
      handleLoadSession(newSessionEntry);
    } catch (err) {
      alert('Erro ao importar tertúlia: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // --- Orquestração do Envio com Criação Automática Imediata na Aba ---
  const handleSendMessage = async (e) => {
    e.preventDefault();
    const query = inputMessage.trim();
    if (!query && !attachedImage) return;

    // Se não há sessão ativa, gera um ID de imediato
    const activeSessionId = currentSessionId || `sess-${Date.now()}`;
    if (!currentSessionId) setCurrentSessionId(activeSessionId);

    // Auto-título a partir da pergunta do utilizador
    let currentTitle = sessionTitle;
    if (sessionTitle === 'Nova Tertúlia' || sessionTitle === 'Tertúlia Aberta') {
      currentTitle = query.slice(0, 32) + (query.length > 32 ? '...' : '');
      setSessionTitle(currentTitle);
    }

    const userMsg = {
      id: `usr-${Date.now()}`,
      role: 'user',
      senderName: 'Utilizador',
      text: query,
      imageAttachment: attachedImage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const currentHistory = [...messages, userMsg];
    setMessages(currentHistory);
    setInputMessage('');
    const activeImage = attachedImage;
    setAttachedImage(null);

    // Sincroniza IMEDIATAMENTE a sessão na barra lateral
    setSessions(prev => {
      const existing = prev.find(s => s.id === activeSessionId);
      const updated = {
        id: activeSessionId,
        title: currentTitle,
        date: new Date().toLocaleDateString('pt-PT'),
        messages: currentHistory,
        selectedAgentIds
      };
      if (existing) {
        return prev.map(s => s.id === activeSessionId ? updated : s);
      }
      return [updated, ...prev];
    });

    // Tertulianos sentados à mesa
    const seatedAgents = agents.filter(a => selectedAgentIds.includes(a.id));
    if (seatedAgents.length === 0) return;

    // Regra de Ouro da Mesa:
    // Se a mensagem começar por dirigir-se a alguém com @Nome (ex: "@Daniel, o que achas...")
    // apenas esse tertuliano é o orador principal.
    let targetAgents = [];

    // Procura agentes cujo @Nome surge explicitamente como interlocutor (especialmente no início ou com vírgula/interrogação)
    const directAddressed = seatedAgents.filter(agent => {
      // Deteta @Nome no início ou após pontuação/espaço seguido de vírgula, dois pontos ou pergunta
      const addressedRegex = new RegExp(`(^|[.!?\\n])\\s*@${agent.displayName}\\b`, 'i');
      return addressedRegex.test(query);
    });

    if (directAddressed.length > 0) {
      // Foi feita uma chamada direta no arranque: fala APENAS quem foi chamado
      targetAgents = directAddressed;
    } else {
      // Se não começou com @Nome específico, verifica se há menções gerais
      const anyMention = seatedAgents.filter(agent => {
        const regex = new RegExp(`@${agent.displayName}\\b`, 'i');
        return regex.test(query);
      });

      if (anyMention.length > 0) {
        // Se mencionou alguém (mas não como vocativo inicial), fala o primeiro mencionado
        targetAgents = [anyMention[0]];
      } else {
        // Se não mencionou ninguém, fala a mesa toda (ronda geral normal)
        targetAgents = seatedAgents;
      }
    }

    // Dispara o ciclo passando explicitamente a lista de todos os presentes (seatedAgents)
    runDialogueCycle(currentHistory, targetAgents, seatedAgents, activeImage, activeSessionId);
  };

  const runDialogueCycle = async (startHistory, seatedAgents, initialImage, activeSessionId) => {
    setIsDialogueRunning(true);
    stopRequestedRef.current = false;
    let localHistory = [...startHistory];

    // FASE 1: 1 resposta inicial de cada tertuliano à questão colocada
    for (let i = 0; i < seatedAgents.length; i++) {
      if (stopRequestedRef.current) break;

      const agent = seatedAgents[i];
      setLoadingAgentName(agent.displayName);

      try {
        const replyText = await sendAgentMessage({
          agent,
          messages: localHistory,
          imageAttachment: i === 0 ? initialImage : null
        });

        if (stopRequestedRef.current) break;

        const aiMsg = {
          id: `ai-${Date.now()}-${agent.id}`,
          role: 'assistant',
          senderName: agent.displayName,
          color: agent.color,
          text: replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        localHistory = [...localHistory, aiMsg];
        setMessages([...localHistory]);

        // Auto-save no histórico de sessões
        setSessions(prev => prev.map(s => 
          s.id === activeSessionId ? { ...s, messages: [...localHistory] } : s
        ));

        if (i < seatedAgents.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err) {
        setMessages(prev => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            senderName: agent.displayName,
            color: agent.color,
            text: `⚠️ Erro: ${err.message}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    }

    // FASE 2: Réplicas adicionais entre agentes (apenas se 'sequential' e maxReplicas > 0)
    if (turnTakingMode === 'sequential' && maxReplicas > 0 && seatedAgents.length > 1) {
      let extraTurns = 0;
      let agentIndex = 0;

      while (extraTurns < maxReplicas && !stopRequestedRef.current) {
        const agent = seatedAgents[agentIndex % seatedAgents.length];
        setLoadingAgentName(`${agent.displayName} (Réplica)`);

        try {
          await new Promise(r => setTimeout(r, 1500));
          if (stopRequestedRef.current) break;

          const replyText = await sendAgentMessage({
            agent,
            messages: localHistory,
            imageAttachment: null
          });

          if (stopRequestedRef.current) break;

          const aiMsg = {
            id: `ai-rep-${Date.now()}-${agent.id}`,
            role: 'assistant',
            senderName: agent.displayName,
            color: agent.color,
            text: replyText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };

          localHistory = [...localHistory, aiMsg];
          setMessages([...localHistory]);

          setSessions(prev => prev.map(s => 
            s.id === activeSessionId ? { ...s, messages: [...localHistory] } : s
          ));

          extraTurns++;
          agentIndex++;
        } catch (err) {
          break;
        }
      }
    }

    setLoadingAgentName(null);
    setIsDialogueRunning(false);
  };

  const handleStopDialogue = () => {
    stopRequestedRef.current = true;
    setIsDialogueRunning(false);
    setLoadingAgentName(null);
  };

  return (
    <div className={`flex h-screen ${theme.bg} ${theme.textMain} font-sans`}>
      {/* --- BARRA LATERAL (Histórico & Sessões) --- */}
      <aside className={`w-20 md:w-64 border-r ${theme.border} ${theme.panelBg} flex flex-col justify-between shrink-0`}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Topo / Logótipo */}
          <div className={`p-4 border-b ${theme.border} flex items-center justify-between`}>
            <div className="flex items-center gap-2.5">
              <Bot className="w-6 h-6 text-emerald-400 shrink-0" />
              <span className="hidden md:block font-bold text-lg tracking-tight">
                Tertul<span className="text-emerald-400">IA</span>
              </span>
            </div>
            <button
              onClick={handleNewSession}
              className="hidden md:flex p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
              title="Nova Tertúlia"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Abas */}
          <nav className="p-2 space-y-1">
            <button
              onClick={() => setActiveTab('chat')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'chat' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="hidden md:block">Mesa Atual</span>
            </button>
            <button
              onClick={() => setActiveTab('agents')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'agents' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span className="hidden md:block">Tertulianos ({agents.length})</span>
            </button>
          </nav>

          {/* Cabeçalho de Conversas + Importação */}
          <div className="hidden md:flex items-center justify-between px-4 pt-3 pb-1 border-t border-slate-800/60">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
              Conversas ({sessions.length})
            </span>
            <input
              type="file"
              ref={importInputRef}
              accept=".json,.tertulia.json"
              onChange={handleImportSessionFile}
              className="hidden"
            />
            <button
              onClick={() => importInputRef.current?.click()}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"
              title="Importar Ficheiro (.tertulia)"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Lista de Sessões com Menu (...) */}
          <div className="hidden md:flex flex-col flex-1 overflow-y-auto px-2 py-1 space-y-1">
            {sessions.length === 0 ? (
              <p className="text-xs text-slate-500 px-3 py-2 italic">Nenhuma conversa ainda.</p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => handleLoadSession(s)}
                  className={`group relative w-full text-left p-2 rounded-lg text-xs transition flex items-center justify-between cursor-pointer ${
                    currentSessionId === s.id ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="truncate pr-2 flex-1">
                    <span className="truncate block">{s.title}</span>
                    <span className="text-[10px] text-slate-500 block">{s.date}</span>
                  </div>

                  {/* Menu (...) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuSessionId(openMenuSessionId === s.id ? null : s.id);
                    }}
                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white opacity-80 group-hover:opacity-100"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {/* Dropdown de Ações */}
                  {openMenuSessionId === s.id && (
                    <div 
                      className="absolute right-2 top-8 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 w-36 text-xs text-slate-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => handleRenameSession(s, e)}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-800 text-left"
                      >
                        <Edit3 className="w-3 h-3 text-slate-400" />
                        Renomear
                      </button>
                      <button
                        onClick={(e) => handleExportSessionFile(s, e)}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-800 text-left"
                      >
                        <Download className="w-3 h-3 text-emerald-400" />
                        Exportar (.tertulia)
                      </button>
                      <button
                        onClick={(e) => handleDeleteSession(s.id, e)}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-rose-950/60 text-rose-400 text-left"
                      >
                        <Trash2 className="w-3 h-3" />
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Rodapé Definições */}
        <div className={`p-3 border-t ${theme.border}`}>
          <button
            onClick={() => setActiveTab('settings')}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="hidden md:block">Definições & Temas</span>
          </button>
        </div>
      </aside>

      {/* --- ÁREA PRINCIPAL --- */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col h-full">
            {/* Cabeçalho */}
            <div className={`px-6 py-3 border-b ${theme.border} ${theme.panelBg} flex items-center justify-between gap-4`}>
              <div className="flex items-center gap-3">
                <h1 className="font-bold text-sm tracking-tight">{sessionTitle}</h1>
                <div className="hidden md:flex items-center gap-1.5 ml-2">
                  {agents.map(a => {
                    const isSeated = selectedAgentIds.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() => {
                          setSelectedAgentIds(prev => 
                            prev.includes(a.id) ? prev.filter(x => x !== a.id) : [...prev, a.id]
                          );
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 transition ${
                          isSeated ? 'opacity-100 shadow-sm' : 'opacity-40 border-slate-700 bg-slate-800'
                        }`}
                        style={{
                          borderColor: a.color,
                          backgroundColor: isSeated ? `${a.color}20` : undefined,
                          color: isSeated ? a.color : '#94a3b8'
                        }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                        {a.displayName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportConversationToMarkdown(sessionTitle, messages, agents)}
                  className="p-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition"
                  title="Exportar Markdown"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Balões de Conversa */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                  <Bot className="w-10 h-10 opacity-30 stroke-[1.5]" />
                  <p className="text-sm">A mesa está posta. Escreve uma mensagem para iniciar o debate.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isUser = m.role === 'user';
                  return (
                    <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                      {!isUser && (
                        <div className="flex items-center gap-2 mb-1 ml-1 text-xs font-bold" style={{ color: m.color }}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                          {m.senderName}
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-md ${
                          isUser ? theme.userBubble + ' rounded-tr-none' : theme.aiBubbleBg + ' border rounded-tl-none'
                        }`}
                        style={{ borderColor: !isUser ? `${m.color}40` : undefined }}
                      >
                        {m.imageAttachment && (
                          <img
                            src={m.imageAttachment.dataUrl}
                            alt="Anexo"
                            className="max-h-60 rounded-lg mb-2 object-contain"
                          />
                        )}
                        <div className="prose prose-invert prose-sm max-w-none leading-relaxed">
                          <ReactMarkdown>{m.text}</ReactMarkdown>
                        </div>
                        <span className="block text-[10px] mt-1 text-right opacity-60">
                          {m.timestamp}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Indicador de Réplicas / Debates */}
              {isDialogueRunning && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-emerald-500/30">
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>
                      <b>{loadingAgentName}</b> está a intervir...
                    </span>
                  </div>
                  <button
                    onClick={handleStopDialogue}
                    className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Interromper Mesa
                  </button>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input e Envio */}
            <form onSubmit={handleSendMessage} className={`p-4 border-t ${theme.border} ${theme.panelBg}`}>
              {attachedImage && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-slate-900 rounded-lg w-fit border border-slate-800">
                  <img src={attachedImage.dataUrl} alt="Preview" className="w-10 h-10 object-cover rounded" />
                  <span className="text-xs text-slate-400">Imagem comprimida</span>
                  <button onClick={() => setAttachedImage(null)} className="text-slate-500 hover:text-white p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 max-w-5xl mx-auto">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition"
                  title="Anexar imagem"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>

                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Lança um tópico para a mesa ou intervém..."
                  className={`flex-1 ${theme.inputBg} border ${theme.border} rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-slate-100 placeholder:text-slate-600`}
                />

                <button
                  type="submit"
                  disabled={(!inputMessage.trim() && !attachedImage) || isDialogueRunning}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 p-3 rounded-xl transition font-semibold"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* --- ABA DE TERTULIANOS --- */}
        {activeTab === 'agents' && (
          <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-between pb-6 border-b border-slate-800 mb-6">
              <div>
                <h2 className="text-xl font-bold">Gestão de Tertulianos</h2>
                <p className="text-xs text-slate-400 mt-1">Configura operadores, credenciais, cores e personalidades.</p>
              </div>
              <button
                onClick={() => {
                  const newA = {
                    id: `agent-${Date.now()}`,
                    displayName: `Tertuliano ${agents.length + 1}`,
                    operator: 'groq',
                    model: 'openai/gpt-oss-20b',
                    apiKey: '',
                    color: PRESET_COLORS[agents.length % PRESET_COLORS.length],
                    traits: { tones: ['informal'], stances: ['constructive'], styles: ['concise'] },
                    customInstruction: '',
                    builtInstruction: 'Responde de forma concisa.'
                  };
                  setAgents([...agents, newA]);
                }}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-lg text-sm font-semibold transition"
              >
                <Plus className="w-4 h-4" />
                Convidar Tertuliano
              </button>
            </div>

            <div className="space-y-6">
              {agents.map(agent => (
                <div key={agent.id} className="bg-slate-900 border rounded-xl p-5 space-y-4" style={{ borderColor: `${agent.color}40` }}>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: agent.color }} />
                      <input
                        type="text"
                        value={agent.displayName}
                        onChange={(e) => setAgents(agents.map(a => a.id === agent.id ? { ...a, displayName: e.target.value } : a))}
                        className="bg-transparent font-bold text-white border-b border-transparent focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    {agents.length > 1 && (
                      <button
                        onClick={() => setAgents(agents.filter(a => a.id !== agent.id))}
                        className="text-slate-500 hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Operador</label>
                      <select
                        value={agent.operator}
                        onChange={(e) => {
                          const op = OPERATORS.find(o => o.id === e.target.value);
                          setAgents(agents.map(a => a.id === agent.id ? {
                            ...a,
                            operator: op.id,
                            model: op.models[0].id
                          } : a));
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                      >
                        {OPERATORS.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Modelo</label>
                      <select
                        value={agent.model}
                        onChange={(e) => setAgents(agents.map(a => a.id === agent.id ? { ...a, model: e.target.value } : a))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                      >
                        {OPERATORS.find(o => o.id === agent.operator)?.models.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-slate-400 font-medium mb-1">API Key</label>
                      <input
                        type="password"
                        value={agent.apiKey}
                        onChange={(e) => setAgents(agents.map(a => a.id === agent.id ? { ...a, apiKey: e.target.value } : a))}
                        placeholder="Chave de API deste modelo..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-slate-400 font-medium mb-1.5">Cor Identificadora</label>
                      <div className="flex items-center gap-2">
                        {PRESET_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => setAgents(agents.map(a => a.id === agent.id ? { ...a, color: c } : a))}
                            className="w-6 h-6 rounded-full transition hover:scale-110"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="md:col-span-2 space-y-3 pt-2">
                      <label className="block text-slate-400 font-medium">Matriz de Personalidade</label>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Tom</span>
                          {PERSONALITY_TRAITS.tones.map(t => (
                            <label key={t.id} className="flex items-center gap-2 mt-1.5 cursor-pointer text-slate-300">
                              <input
                                type="checkbox"
                                checked={agent.traits?.tones?.includes(t.id)}
                                onChange={() => updateAgentTraits(agent.id, 'tones', t.id)}
                              />
                              {t.label}
                            </label>
                          ))}
                        </div>

                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Postura</span>
                          {PERSONALITY_TRAITS.stances.map(s => (
                            <label key={s.id} className="flex items-center gap-2 mt-1.5 cursor-pointer text-slate-300">
                              <input
                                type="checkbox"
                                checked={agent.traits?.stances?.includes(s.id)}
                                onChange={() => updateAgentTraits(agent.id, 'stances', s.id)}
                              />
                              {s.label}
                            </label>
                          ))}
                        </div>

                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Estilo</span>
                          {PERSONALITY_TRAITS.styles.map(st => (
                            <label key={st.id} className="flex items-center gap-2 mt-1.5 cursor-pointer text-slate-300">
                              <input
                                type="checkbox"
                                checked={agent.traits?.styles?.includes(st.id)}
                                onChange={() => updateAgentTraits(agent.id, 'styles', st.id)}
                              />
                              {st.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- ABA DE DEFINIÇÕES & TEMAS --- */}
        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-4xl mx-auto w-full space-y-8">
            <div>
              <h2 className="text-xl font-bold">Definições da Aplicação</h2>
              <p className="text-xs text-slate-400 mt-1">Gere temas visuais e o comportamento das réplicas entre agentes.</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-sm">Tema Visual</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.values(THEMES).map(th => (
                  <button
                    key={th.id}
                    onClick={() => setThemeId(th.id)}
                    className={`p-4 rounded-xl border text-left transition ${
                      themeId === th.id ? 'border-emerald-500 bg-slate-800' : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-bold text-xs block mb-1">{th.name}</span>
                    <div className="flex gap-1.5 mt-2">
                      <div className="w-4 h-4 rounded-full bg-slate-950 border border-slate-700" />
                      <div className="w-4 h-4 rounded-full bg-emerald-500" />
                      <div className="w-4 h-4 rounded-full bg-slate-800" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
              <h3 className="font-semibold text-sm">Dinâmica da Mesa</h3>
              
              <div>
                <label className="block text-slate-400 font-medium mb-1">Passagem de Palavra (Turn-Taking)</label>
                <select
                  value={turnTakingMode}
                  onChange={(e) => setTurnTakingMode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                >
                  <option value="none">Apenas com Intervenção Humana (1 resposta de cada à tua pergunta)</option>
                  <option value="sequential">Mesa Redonda Sequencial (IAs debatem entre si após responderem)</option>
                </select>
              </div>

              {turnTakingMode === 'sequential' && (
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Máximo de Réplicas Automáticas Entre IAs ({maxReplicas} réplicas adicionais)
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    value={maxReplicas}
                    onChange={(e) => setMaxReplicas(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
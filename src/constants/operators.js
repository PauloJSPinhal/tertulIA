export const OPERATORS = [
  {
    id: 'google',
    name: 'Google Gemini',
    type: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    models: [
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite (Ultra Rápido)', supportsVision: true },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (Padrão)', supportsVision: true },
      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', supportsVision: true },
      { id: 'gemini-pro-latest', name: 'Gemini Pro Latest (Reflexivo)', supportsVision: true },
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai_compatible',
    defaultBaseUrl: '/api-deepseek/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', supportsVision: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Raciocínio)', supportsVision: false },
    ]
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    type: 'openai_compatible',
    defaultBaseUrl: '/api-groq/v1',
    models: [
      { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B (Ultra Rápido)', supportsVision: false },
      { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B (Reflexivo)', supportsVision: false },
      { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B (Texto e Visão)', supportsVision: true },
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama (Localhost)',
    type: 'openai_compatible',
    defaultBaseUrl: 'http://localhost:11434/v1',
    models: [
      { id: 'llama3:latest', name: 'Llama 3 (Local)', supportsVision: false },
      { id: 'mistral:latest', name: 'Mistral (Local)', supportsVision: false },
      { id: 'llava:latest', name: 'LLaVA (Visão Local)', supportsVision: true },
    ]
  }
];

export const PERSONALITY_TRAITS = {
  tones: [
    { id: 'formal', label: 'Formal e Rigoroso' },
    { id: 'informal', label: 'Descontraído / Conversacional' },
    { id: 'incisive', label: 'Incisivo e Provocador' },
    { id: 'empathetic', label: 'Empático e Acolhedor' },
  ],
  stances: [
    { id: 'constructive', label: 'Construtivo / Cooperante' },
    { id: 'skeptical', label: 'Crítico e Cético' },
    { id: 'devils_advocate', label: 'Advogado do Diabo' },
  ],
  styles: [
    { id: 'concise', label: 'Estritamente Conciso' },
    { id: 'analytical', label: 'Minucioso e Analítico' },
    { id: 'socratic', label: 'Socrático (questiona de volta)' },
  ]
};

export const PRESET_COLORS = [
  '#0284c7', // Azul Céu
  '#16a34a', // Verde Esmeralda
  '#7c3aed', // Roxo
  '#ea580c', // Laranja
  '#db2777', // Rosa
  '#0d9488', // Cerceta / Teal
  '#ca8a04', // Âmbar
  '#64748b', // Ardósia
];
import { reactive } from 'vue';

export const state = reactive({
  apiKey: null,
  geminiApiKey: null,
  openRouterApiKey: null,
  chatId: null,
  messages: [],
  agent: null,
  model: "mistral-large-2512",
  globalMemories: [],
  aiConfig: null, // {name, goal} from wizard
  attachedFiles: [],  // array of {type, data, name, mimeType}
  isGenerating: false,
  abortController: null,
  selectedWorkflow: null, // currently selected workflow chain
  lang: 'fr' // 'fr' or 'ar'
});

/**
 * Configuración de proveedores de IA soportados.
 * Separado del componente para evitar warnings de Fast Refresh (HMR).
 */

export interface ProviderInfo {
  id: string;
  name: string;
  url: string;
  signupUrl: string;
  freeModels: string;
  icon: string;
  notes?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "groq", name: "Groq Cloud", url: "https://api.groq.com/openai/v1/chat/completions", signupUrl: "https://console.groq.com/keys", freeModels: "llama-3.3-70b-versatile", icon: "⚡", notes: "Free tier muy generoso, ultra rápido" },
  { id: "openrouter", name: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", signupUrl: "https://openrouter.ai/keys", freeModels: "meta-llama/llama-3.3-70b-instruct:free", icon: "🌐", notes: "Acceso a múltiples modelos free" },
  { id: "together", name: "Together AI", url: "https://api.together.xyz/v1/chat/completions", signupUrl: "https://api.together.ai/settings/api-keys", freeModels: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", icon: "🤝", notes: "Llama 3.3 70B gratis" },
  { id: "cerebras", name: "Cerebras", url: "https://api.cerebras.ai/v1/chat/completions", signupUrl: "https://cloud.cerebras.ai/", freeModels: "llama3.1-8b", icon: "🧠", notes: "El más rápido del mercado (4ms). Modelos: llama3.1-8b, qwen-3-235b, gpt-oss-120b" },
  { id: "deepinfra", name: "DeepInfra", url: "https://api.deepinfra.com/v1/openai/chat/completions", signupUrl: "https://deepinfra.com/dash/api_keys", freeModels: "meta-llama/Llama-3.3-70B-Instruct", icon: "🔥", notes: "Pay-per-token económico" },
  { id: "sambanova", name: "SambaNova", url: "https://api.sambanova.ai/v1/chat/completions", signupUrl: "https://cloud.sambanova.ai/apis", freeModels: "Meta-Llama-3.3-70B-Instruct", icon: "🚀", notes: "Free tier diario" },
  { id: "mistral", name: "Mistral AI", url: "https://api.mistral.ai/v1/chat/completions", signupUrl: "https://console.mistral.ai/api-keys/", freeModels: "mistral-small-latest", icon: "💨", notes: "Modelos europeos" },
  { id: "deepseek", name: "DeepSeek", url: "https://api.deepseek.com/v1/chat/completions", signupUrl: "https://platform.deepseek.com/api_keys", freeModels: "deepseek-chat", icon: "🔍", notes: "Muy económico" },
  { id: "gemini", name: "Google AI Studio (Gemini)", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", signupUrl: "https://aistudio.google.com/app/apikey", freeModels: "gemini-2.0-flash-exp", icon: "✨", notes: "Free tier muy generoso de Google" },
  { id: "cloudflare", name: "Cloudflare Workers AI", url: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions", signupUrl: "https://dash.cloudflare.com/profile/api-tokens", freeModels: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", icon: "☁️", notes: "Requiere también Account ID (formato: TOKEN:ACCOUNT_ID)" },
  { id: "huggingface", name: "Hugging Face Inference", url: "https://api-inference.huggingface.co/v1/chat/completions", signupUrl: "https://huggingface.co/settings/tokens", freeModels: "meta-llama/Llama-3.3-70B-Instruct", icon: "🤗", notes: "Miles de modelos open source" },
  { id: "nebius", name: "Nebius AI", url: "https://api.studio.nebius.ai/v1/chat/completions", signupUrl: "https://studio.nebius.ai/settings/api-keys", freeModels: "meta-llama/Llama-3.3-70B-Instruct", icon: "🌌", notes: "Free credits iniciales" },
];

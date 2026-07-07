import AnthropicMono from '@lobehub/icons/es/Anthropic/components/Mono'
import OpenAIMono from '@lobehub/icons/es/OpenAI/components/Mono'
import GeminiIcon from '@lobehub/icons/es/Gemini/components/Color'
import MistralIcon from '@lobehub/icons/es/Mistral/components/Color'
import DeepSeekIcon from '@lobehub/icons/es/DeepSeek/components/Color'
import OllamaMono from '@lobehub/icons/es/Ollama/components/Mono'
import MinimaxIcon from '@lobehub/icons/es/Minimax/components/Color'
import LMStudioMono from '@lobehub/icons/es/LmStudio/components/Mono'
import ZAIMono from '@lobehub/icons/es/ZAI/components/Mono'
import XiaomiMiMoMono from '@lobehub/icons/es/XiaomiMiMo/components/Mono'
import HuggingFaceIcon from '@lobehub/icons/es/HuggingFace/components/Color'
import OpenRouterMono from '@lobehub/icons/es/OpenRouter/components/Mono'
import OpenCodeMono from '@lobehub/icons/es/OpenCode/components/Mono'
import OmlxIcon from '@/components/icons/OmlxIcon'

import { COLOR_PRIMARY as AnthropicColor } from '@lobehub/icons/es/Anthropic/style'
import { COLOR_PRIMARY as OpenAIColor } from '@lobehub/icons/es/OpenAI/style'
import { COLOR_PRIMARY as GeminiColor } from '@lobehub/icons/es/Gemini/style'
import { COLOR_PRIMARY as MistralColor } from '@lobehub/icons/es/Mistral/style'
import { COLOR_PRIMARY as DeepSeekColor } from '@lobehub/icons/es/DeepSeek/style'
import { COLOR_PRIMARY as OllamaColor } from '@lobehub/icons/es/Ollama/style'
import { COLOR_PRIMARY as MinimaxColor } from '@lobehub/icons/es/Minimax/style'
import { COLOR_PRIMARY as LMStudioColor } from '@lobehub/icons/es/LmStudio/style'
import { COLOR_PRIMARY as ZAIColor } from '@lobehub/icons/es/ZAI/style'
import { COLOR_PRIMARY as XiaomiMiMoColor } from '@lobehub/icons/es/XiaomiMiMo/style'
import { COLOR_PRIMARY as HuggingFaceColor } from '@lobehub/icons/es/HuggingFace/style'
import { COLOR_PRIMARY as OpenRouterColor } from '@lobehub/icons/es/OpenRouter/style'
import { COLOR_PRIMARY as OpenCodeColor } from '@lobehub/icons/es/OpenCode/style'

const OmlxColor = '#6366F1'

const PROVIDER_ICON_MAP = {
  anthropic: { Icon: AnthropicMono, color: AnthropicColor, label: 'Anthropic' },
  openai: { Icon: OpenAIMono, color: OpenAIColor, label: 'OpenAI' },
  google: { Icon: GeminiIcon, color: GeminiColor, label: 'Google AI' },
  mistral: { Icon: MistralIcon, color: MistralColor, label: 'Mistral' },
  deepseek: { Icon: DeepSeekIcon, color: DeepSeekColor, label: 'DeepSeek' },
  ollama: { Icon: OllamaMono, color: OllamaColor, label: 'Ollama' },
  minimax: { Icon: MinimaxIcon, color: MinimaxColor, label: 'MiniMax' },
  'minimax-cn': { Icon: MinimaxIcon, color: MinimaxColor, label: 'MiniMax' },
  lmstudio: { Icon: LMStudioMono, color: LMStudioColor, label: 'LM Studio' },
  omlx: { Icon: OmlxIcon, color: OmlxColor, label: 'oMLX' },
  glm: { Icon: ZAIMono, color: ZAIColor, label: 'GLM (智谱)' },
  mimo: { Icon: XiaomiMiMoMono, color: XiaomiMiMoColor, label: 'MiMo (小米)' },
  'ollama-cloud': { Icon: OllamaMono, color: OllamaColor, label: 'Ollama Cloud' },
  openrouter: { Icon: OpenRouterMono, color: OpenRouterColor, label: 'OpenRouter' },
  ravens: { Icon: OpenCodeMono, color: OpenCodeColor, label: 'Ravens' },
  huggingface: { Icon: HuggingFaceIcon, color: HuggingFaceColor, label: 'HuggingFace' },
}

export function getProviderColor(provider) {
  const entry = PROVIDER_ICON_MAP[provider]
  return entry ? entry.color : null
}

export function getProviderLabel(provider) {
  const entry = PROVIDER_ICON_MAP[provider || 'custom']
  return entry ? entry.label : (provider || 'Custom')
}

export default function ProviderIcon({ provider, size = 24 }) {
  const providerKey = provider || 'custom'
  const entry = PROVIDER_ICON_MAP[providerKey]

  if (entry?.Icon) {
    return <entry.Icon size={size} style={{ flexShrink: 0 }} />
  }

  const brandColor = entry?.color
  const fallbackColor = brandColor || 'var(--txt3)'
  const displayLetter = (entry?.label || providerKey).charAt(0).toUpperCase()
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        background: brandColor
          ? `color-mix(in srgb, ${brandColor} 12%, var(--surface-soft))`
          : `color-mix(in srgb, var(--txt3) 10%, var(--surface-soft))`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.45,
        fontWeight: 600,
        color: fallbackColor,
        flexShrink: 0,
      }}
    >
      {displayLetter}
    </span>
  )
}
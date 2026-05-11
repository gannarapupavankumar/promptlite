import { useMemo, useState } from 'react'
import llamaTokenizer from 'llama-tokenizer-js'
import './App.css'

type OllamaStreamChunk = {
  response?: string
  error?: string
}

const EXAMPLE_PROMPT =
  'Please rewrite the following product description so that it is clearer, shorter, and more persuasive while keeping a friendly tone.'

const OLLAMA_URL = 'http://localhost:11434/api/generate'
const OLLAMA_MODEL = 'llama2:latest'

function countTokens(text: string) {
  if (!text) {
    return 0
  }

  return llamaTokenizer.encode(text, false).length
}

function hasCodeInstruction(text: string) {
  return /\b(?:explain|fix|optimize|convert|review)\b/i.test(text)
}

function isCodeLine(line: string) {
  return /[{};=<>()[\]]|^\s*(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|def|from|public|private|protected|#include)\b/.test(
    line,
  )
}

function isMostlyCode(text: string) {
  const lines = text.split('\n').filter((line) => line.trim())

  if (lines.length === 0) {
    return false
  }

  const codeLines = lines.filter((line) => isCodeLine(line))
  const codeCharacters = (text.match(/[{};=<>()[\]`]|=>|&&|\|\|/g) ?? [])
    .length

  return (
    codeLines.length / lines.length >= 0.5 ||
    (lines.length <= 3 && codeCharacters >= 3)
  )
}

function shouldReturnCodeUnchanged(text: string) {
  return isMostlyCode(text) && !hasCodeInstruction(text)
}

function splitInstructionAndCode(text: string) {
  const lines = text.split('\n')
  const firstCodeLineIndex = lines.findIndex((line) => isCodeLine(line))

  if (firstCodeLineIndex <= 0) {
    return null
  }

  const instruction = lines.slice(0, firstCodeLineIndex).join('\n').trim()
  const code = lines.slice(firstCodeLineIndex).join('\n')

  if (!instruction || !isMostlyCode(code)) {
    return null
  }

  return { instruction, code }
}

function optimizeInstructionText(instruction: string) {
  let optimized = instruction
    .replace(/\bplease\b/gi, '')
    .replace(/\bkindly\b/gi, '')
    .replace(/\bcan you\b/gi, '')
    .replace(/\bcould you\b/gi, '')
    .replace(/\bi want you to\b/gi, '')
    .replace(/\bi would like you to\b/gi, '')
    .replace(/\bin short\b/gi, 'briefly')
    .replace(/\s+/g, ' ')
    .trim()

  optimized = optimized.replace(/\bexplain the code briefly\b/i, 'briefly explain this code')
  optimized = optimized.replace(/\bexplain this code briefly\b/i, 'briefly explain this code')

  if (!optimized) {
    return ''
  }

  optimized = optimized.charAt(0).toUpperCase() + optimized.slice(1)

  if (!/[.:!?]$/.test(optimized)) {
    optimized += ':'
  }

  return optimized
}

function optimizeInstructionAndPreserveCode(text: string) {
  const parts = splitInstructionAndCode(text)

  if (!parts) {
    return null
  }

  const optimizedInstruction = optimizeInstructionText(parts.instruction)

  if (!optimizedInstruction) {
    return parts.code
  }

  return `${optimizedInstruction}\n\n${parts.code}`
}

function buildOllamaPrompt(originalText: string) {
  return `You are PromptLite, a prompt compression engine.

Your task is ONLY to rewrite USER_PROMPT into the shortest useful prompt.
Do not answer USER_PROMPT.
Do not explain.
Do not give advice.
Do not add new information.
Do not mention token counts, percentages, savings, or how much shorter it is.
Preserve important names, numbers, tools, technologies, code, commands, dates, constraints, and required output format.
Keep multi-line format only if needed.
Return only the optimized prompt.

Code handling:
- If USER_PROMPT is only code, return the same code unchanged.
- If USER_PROMPT contains instructions plus code, compress only the natural-language instruction.
- Preserve code exactly.
- Do not explain code.
- Do not modify, minify, rename, remove, rewrite, reformat, or remove comments from code.
- PromptLite is an input optimizer, not a code editor.
- Even if the instruction says rewrite, optimize, or fix the code, only optimize that instruction text and keep the code unchanged.

Output rules:
- Return only the optimized prompt.
- Keep multi-line format if the original prompt has important multi-line context.
- Preserve important names, numbers, tools, technologies, dates, code, commands, constraints, and expected output format.
- Remove filler words, repeated ideas, and unnecessary politeness.
- The optimized prompt should be shorter than the original.
- If you cannot make it shorter, return the shortest faithful version without explanation.
- Do not wrap the output in triple quotes.
- Do not add a summary, note, percentage, or comparison after the prompt.

USER_PROMPT:
"""
${originalText}
"""

OPTIMIZED_PROMPT:`
}

function cleanOptimizedPrompt(text: string) {
  let cleaned = text.trim().replace(/^["'`]+|["'`]+$/g, '')

  const prefixPattern =
    /^(?:optimized prompt:\s*|here is the shortest useful prompt:\s*|here is the shorter version:\s*|sure,\s*)/i

  while (prefixPattern.test(cleaned)) {
    cleaned = cleaned.replace(prefixPattern, '').trim()
  }

  return cleaned
    .split('\n')
    .filter((line) => {
      const normalized = line.trim()

      if (!normalized || normalized === '"""') {
        return false
      }

      return !/^the optimized prompt is\b/i.test(normalized)
    })
    .join('\n')
    .replace(/"""[\s\S]*$/g, '')
    .trim()
}

async function optimizeWithOllama(
  originalText: string,
  onChunk: (text: string) => void,
) {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: buildOllamaPrompt(originalText),
      raw: true,
      stream: true,
      options: {
        temperature: 0,
      },
    }),
  })

  if (!response.ok) {
    const message = await response.text()

    throw new Error(message.trim() || `Ollama returned ${response.status}`)
  }

  if (!response.body) {
    throw new Error('Ollama returned an empty response stream.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let streamedText = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmedLine = line.trim()

      if (!trimmedLine) {
        continue
      }

      const chunk = JSON.parse(trimmedLine) as OllamaStreamChunk

      if (chunk.error) {
        throw new Error(chunk.error)
      }

      streamedText += chunk.response ?? ''
      onChunk(streamedText)
    }

    if (done) {
      break
    }
  }

  if (buffer.trim()) {
    const chunk = JSON.parse(buffer.trim()) as OllamaStreamChunk

    if (chunk.error) {
      throw new Error(chunk.error)
    }

    streamedText += chunk.response ?? ''
    onChunk(streamedText)
  }

  const optimized = cleanOptimizedPrompt(streamedText)

  if (!optimized) {
    throw new Error('Ollama returned an empty optimized prompt.')
  }

  return optimized
}

function App() {
  const [originalPrompt, setOriginalPrompt] = useState(EXAMPLE_PROMPT)
  const [optimizedPrompt, setOptimizedPrompt] = useState('')
  const [copyLabel, setCopyLabel] = useState('Copy')
  const [errorMessage, setErrorMessage] = useState('')
  const [isOptimizing, setIsOptimizing] = useState(false)

  const originalTokens = useMemo(
    () => countTokens(originalPrompt),
    [originalPrompt],
  )
  const optimizedTokens = useMemo(
    () => countTokens(optimizedPrompt),
    [optimizedPrompt],
  )
  const savedTokens = Math.max(originalTokens - optimizedTokens, 0)
  const savingsPercentage =
    originalTokens === 0 ? 0 : Math.round((savedTokens / originalTokens) * 100)

  async function handleOptimize() {
    const trimmedPrompt = originalPrompt.trim()

    if (!trimmedPrompt) {
      setOptimizedPrompt('')
      setErrorMessage('')
      return
    }

    setIsOptimizing(true)
    setErrorMessage('')
    setOptimizedPrompt('')
    setCopyLabel('Copy')

    if (shouldReturnCodeUnchanged(originalPrompt)) {
      setOptimizedPrompt(originalPrompt)
      setIsOptimizing(false)
      return
    }

    const codePreservingPrompt = optimizeInstructionAndPreserveCode(originalPrompt)

    if (codePreservingPrompt) {
      setOptimizedPrompt(codePreservingPrompt)
      setIsOptimizing(false)
      return
    }

    try {
      const optimized = await optimizeWithOllama(trimmedPrompt, setOptimizedPrompt)
      setOptimizedPrompt(optimized)
    } catch (error) {
      setOptimizedPrompt('')
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to optimize with local Ollama.',
      )
    } finally {
      setIsOptimizing(false)
    }
  }

  async function handleCopy() {
    if (!optimizedPrompt) {
      return
    }

    await navigator.clipboard.writeText(optimizedPrompt)
    setCopyLabel('Copied')
    window.setTimeout(() => setCopyLabel('Copy'), 1600)
  }

  function handleReset() {
    setOriginalPrompt('')
    setOptimizedPrompt('')
    setCopyLabel('Copy')
    setErrorMessage('')
  }

  return (
    <main className="app-shell">
      <section className="intro">
        <p className="eyebrow">Local prompt optimizer</p>
        <h1>PromptLite</h1>
        <p className="lede">
          Compress prompts with your local Ollama model. Nothing is sent to a
          cloud service.
        </p>
      </section>

      <section className="workspace" aria-label="Prompt optimizer">
        <div className="toolbar">
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={handleOptimize}
              disabled={isOptimizing}
            >
              {isOptimizing ? 'Optimizing...' : 'Optimize'}
            </button>
            <button type="button" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>

        <div className="prompt-grid">
          <label className="prompt-panel">
            <span>Original prompt</span>
            <textarea
              value={originalPrompt}
              onChange={(event) => setOriginalPrompt(event.target.value)}
              placeholder="Paste your prompt here..."
            />
          </label>

          <label className="prompt-panel">
            <span>Optimized prompt</span>
            <textarea
              value={optimizedPrompt}
              onChange={(event) => setOptimizedPrompt(event.target.value)}
              placeholder="Your optimized prompt will appear here..."
            />
          </label>
        </div>

        {errorMessage ? (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="stats" aria-label="Token statistics">
          <div>
            <span>Original tokens</span>
            <strong>{originalTokens}</strong>
          </div>
          <div>
            <span>Optimized tokens</span>
            <strong>{optimizedTokens}</strong>
          </div>
          <div>
            <span>Saved tokens</span>
            <strong>{savedTokens}</strong>
          </div>
          <div>
            <span>Savings</span>
            <strong>{savingsPercentage}%</strong>
          </div>
        </div>

        <div className="footer-actions">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!optimizedPrompt}
            aria-live="polite"
          >
            {copyLabel} optimized prompt
          </button>
        </div>
      </section>
    </main>
  )
}

export default App

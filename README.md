# PromptLite

PromptLite is a privacy-first local prompt optimizer powered by Ollama.

It compresses prompts on-device without cloud APIs, login, a backend server, or subscription cost. The app runs in your browser with React, then sends optimization requests to your locally running Ollama model.

## Features

- Local prompt optimization
- Uses the Ollama local API
- No API key required
- No cloud processing
- Code-preservation rules for code-only and instruction-plus-code prompts
- Streaming optimized output
- Copy optimized output
- Token savings display with local tokenizer-based counting

## Tech Stack

- React
- TypeScript
- Vite
- Ollama

## How It Works

1. The user enters a prompt.
2. The app sends a local request to Ollama at `http://localhost:11434/api/generate`.
3. Ollama returns an optimized prompt.
4. The app streams and displays the optimized result.
5. PromptLite shows original tokens, optimized tokens, saved tokens, and savings percentage.

PromptLite is an input optimizer, not a code editor. If the input is only code, it returns the code unchanged. If the input contains instructions plus code, it compresses only the natural-language instruction and preserves the code exactly.

## Setup

### Requirements

- Node.js
- npm
- Ollama

### Install And Run

```bash
npm install
ollama pull qwen2.5:0.5b
ollama serve
npm run dev
```

Then open:

```text
http://localhost:5173
```

The default model is configured in [src/App.tsx](src/App.tsx):

```ts
const OLLAMA_MODEL = 'qwen2.5:0.5b'
```

## Troubleshooting

### Ollama Not Running

If optimization fails with a fetch or connection error, start Ollama:

```bash
ollama serve
```

### Model Missing

If Ollama returns a model-not-found error, pull the default model:

```bash
ollama pull qwen2.5:0.5b
```

You can see installed models with:

```bash
ollama list
```

### Fetch Failed

Make sure Ollama is reachable at:

```text
http://localhost:11434/api/generate
```

Also make sure the Vite app is running at:

```text
http://localhost:5173
```

### Slow Response Time

Local model speed depends on your machine and the selected Ollama model. For faster responses, use a smaller model such as `qwen2.5:0.5b`.

## Project Structure

```text
promptlite/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/
│   │   ├── hero.png
│   │   ├── react.svg
│   │   └── vite.svg
│   ├── App.css
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── .gitignore
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── README.md
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## Future Improvements

- Electron desktop app
- Browser extension
- Model selector
- Prompt history
- Better token counting for non-LLaMA tokenizers

## License

MIT License. See [LICENSE](LICENSE).

# Using TokenOS with Ollama Embeddings

TokenOS uses Ollama to generate semantic vector embeddings. While TokenOS works perfectly fine for exact-text search without it, running Ollama lets TokenOS understand *meaning* (e.g. searching for "auth handler" will find the `login()` function).

## 1. Do I need Ollama?
- **Without Ollama:** The MCP `find_nodes` tool will only do text/name matching.
- **With Ollama:** The MCP `find_nodes` tool will do deep semantic concept matching.

## 2. Installing Ollama
1. Download Ollama from [ollama.com](https://ollama.com/)
2. On Mac, it installs as a menubar app and runs in the background.
3. Open your terminal and pull the embedding model (TokenOS defaults to `mxbai-embed-large:latest`):
   ```bash
   ollama pull mxbai-embed-large
   ```

## 3. Using TokenOS via npm package (Recommended)

When using the `npx` method, TokenOS automatically talks to the default Ollama port on localhost (`http://localhost:11434`) and uses the `mxbai-embed-large` model.

**If you want to change the model using npx:**
You can set environment variables in your IDE's MCP config:

### Antigravity IDE Example:
```json
"tokenos-myapp": {
  "command": "npx",
  "args": ["-y", "tokenos", "/path/to/myapp"],
  "env": {
    "EMBEDDING_MODEL": "nomic-embed-text"
  }
}
```

### Claude Desktop Example:
```json
"tokenos-myapp": {
  "command": "npx",
  "args": ["-y", "tokenos", "/path/to/myapp"],
  "env": {
    "EMBEDDING_MODEL": "nomic-embed-text"
  }
}
```

## 4. Using TokenOS locally (Cloned repo)

If you are developing TokenOS itself or have it checked out locally, you don't use `npx`. Instead, you use the `tokenos.config.json` file in the root of your clone.

1. Clone TokenOS: `git clone https://github.com/wripcode/TokenOS.git && cd TokenOS`
2. Copy `tokenos.config.json.example` to `tokenos.config.json`
3. Edit it to specify Ollama settings and point to the project you want to index:

```json
{
  "watchPath": "/absolute/path/to/your/custom-app",
  "ollama": {
    "url": "http://localhost:11434",
    "model": "mxbai-embed-large:latest"
  }
}
```

Then hook up your IDE directly to your local dist folder:
```json
"tokenos-myapp": {
  "command": "node",
  "args": ["/Users/wripcode_/Desktop/myLab/ongoing-project/TokenOS/dist/main.js"]
}
```

## How It Works Together
1. You connect your IDE to TokenOS.
2. TokenOS instantly connects.
3. In the background, TokenOS sends your un-embedded code chunks to `localhost:11434`.
4. The vectors are saved in your project's `.tokenos/graph.db` so they never have to be computed again unless the file changes.

# Trace Analyst


AI-powered trace analysis tool. Upload trace files, ask questions, and get intelligent insights.

## Soft Clustering with a Reasoning Copilot

This project leverages three key concepts:

* **Soft clustering**: Promptable clusters that can be iteratively modified through chat
* **Background reasoning model**: Continuously analyzes traces and surfaces interesting findings
* **Hybrid UX**: Combines chat and traditional UI components for a seamless workflow

## Quick Start

1. **Clone and install**
   ```bash
   git clone https://github.com/FieldDataInc/trace-analyst.git
   cd trace-analyst
   npm install
   ```

2. **Set up environment**
   ```bash
   # Create .env file
   echo "OPENAI_API_KEY=your-openai-api-key" > .env
   ```

3. **Run**
   ```bash
   npm run dev
   ```

Visit `http://localhost:5173` to start analyzing traces.

## Environment Variables

```bash
# Required
OPENAI_API_KEY="your-openai-api-key"

# Optional - for persistent storage
DATABASE_URL="postgresql://username:password@localhost:5432/dbname"
```

## Usage

1. Upload your files:
   - **Trace files**: .txt format 
   - **Dataset files**: .json format
2. Ask questions like:
   - "What patterns do you see?"
   - "Identify unusual user questions"
   - "What interesting patterns may I be missing from my datasets?"
3. Get AI-powered insights and analysis

**Note**: Code can be modified sparingly to support different file formats or analysis needs.

## Tech Stack

- React + TypeScript + Vite
- Express.js + Node.js  
- OpenAI API (supports any model)
- Optional: PostgreSQL for persistence

## Production

```bash
npm run build
npm start
```

## License

MIT 
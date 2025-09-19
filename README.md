# Trace Analyst

AI-powered trace analysis tool. Upload trace files, ask questions, and get intelligent insights.

## Learn More

- 🐦 **Twitter Thread**: [https://x.com/fpingham/status/1947659171358286170]
- 🎥 **Demo Video**: [https://www.loom.com/share/7195786e0714452ab017de7e5471ec2c?sid=7433d715-cb64-4120-a506-5dbed9a5fe9a]

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

Visit `http://localhost:5000` to start analyzing traces.

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

## Performance Optimization

For optimal performance and discoverability, the system automatically samples a random subset of 300 traces at each new interaction. This approach balances thorough analysis with response speed, ensuring you get meaningful insights without lengthy wait times.

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

## Contributing & Feedback

We welcome contributions, feedback, and forks! Whether you want to:


- **Enhance the UI/UX** - Better visualizations or workflow improvements  
- **Add features** - Any improvements are appreciated
- **Optimize performance** - Better sampling strategies or caching

Feel free to:
- 🍴 **Fork the project** and make it your own
- 📝 **Submit pull requests** with improvements
- 🐛 **Report issues** or suggest enhancements
- 💡 **Share ideas** for new features or use cases

Your contributions help make trace analysis more accessible and powerful for everyone!

## Future Roadmap

Here are some exciting ideas to take this project to the next level:

- **Multi-turn conversations** - Enable persistent context across multiple questions for deeper analysis
- **Traditional filters at tool call level** - Add standard filtering capabilities (date ranges, user types, etc.) alongside AI analysis
- **Deep drilling queries** - g longer analytical sessions that can process 100% of data for comprehensive insights (e.g., "show me all examples where users got frustrated with the bot")
- **Native LangSmith integration** - Built-in support with custom preprocessing steps for seamless workflow integration

These features would transform the tool from a quick analysis helper into a comprehensive trace investigation platform.

## License

MIT
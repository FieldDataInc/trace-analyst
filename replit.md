# LangSmith Pattern Analyzer

## Overview

This is a farm management data analysis application that compares LangSmith production traces with structured JSON datasets to identify gaps and patterns in livestock transaction data. The application uses a modern full-stack architecture with React frontend, Express backend, and PostgreSQL database with Drizzle ORM.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

**January 2025 - Multiple Dataset Support:**
- Added support for multiple dataset file uploads (up to 10 files)
- Enhanced dataset processing to handle both core and mixto complement structures
- Core dataset: supports `data_input` examples for agricultural operations
- Mixto complement dataset: supports `animal_transactions` examples for livestock operations
- Removed percentage indicators from stats cards for cleaner interface
- Updated UI to display all uploaded dataset filenames with total example counts
- Backend now processes multiple JSON files simultaneously for comprehensive analysis

**January 2025 - UI Simplification Update:**
- Removed pattern insights section for cleaner interface
- Removed footer to maximize content space
- Removed gap analysis visualization for simplified dashboard
- Updated chat interface to show example suggestions instead of patterns/insights
- Added welcome message with usage instructions for better user onboarding
- Improved placeholder text to guide user interactions
- Focused on core functionality: file upload, analysis, and example generation

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter for client-side routing
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Style**: REST API with JSON responses
- **File Processing**: Multer for file uploads and parsing
- **Validation**: Zod for schema validation

### Database Architecture
- **Database**: PostgreSQL (configured via DATABASE_URL)
- **ORM**: Drizzle ORM with TypeScript support
- **Migration**: Drizzle-kit for schema migrations
- **Connection**: Neon Database serverless driver

## Key Components

### Data Models
- **Users**: Basic user authentication system
- **Analysis Results**: Stores LangSmith traces, dataset examples, and analysis results
- **Farm Transactions**: Specialized types for livestock transaction data (sales, purchases, births, deaths)

### File Upload System
- Supports JSON file uploads for LangSmith traces and dataset examples
- Parses various JSON structures to extract user messages and questions
- Validates file formats and content structure

### Analysis Engine
- **OpenAI Integration**: Uses GPT-4o for intelligent analysis
- **Pattern Recognition**: Identifies gaps between production data and training examples
- **Coverage Analysis**: Calculates coverage scores and transaction distributions
- **Insight Generation**: Provides actionable insights and recommendations

### UI Components
- **Dashboard**: Main interface for file uploads and analysis results
- **File Upload**: Drag-and-drop interface with validation
- **Analysis Display**: Rich visualization of patterns, gaps, and insights
- **Chat Interface**: Interactive analysis with natural language queries

## Data Flow

1. **File Upload**: Users upload LangSmith traces and dataset JSON files
2. **File Processing**: Backend parses files and extracts relevant data
3. **Analysis Request**: Frontend sends analysis requests with user queries
4. **AI Analysis**: OpenAI service analyzes patterns and generates insights
5. **Result Storage**: Analysis results are stored in PostgreSQL database
6. **Visualization**: Frontend displays results with interactive components

## External Dependencies

### Core Framework Dependencies
- React ecosystem (React, React-DOM, React Query)
- Express.js with TypeScript support
- Drizzle ORM with PostgreSQL adapter

### UI and Styling
- Tailwind CSS for utility-first styling
- Radix UI primitives for accessible components
- Lucide React for consistent iconography
- shadcn/ui component library

### Data Processing
- Multer for file upload handling
- Zod for runtime type validation
- date-fns for date manipulation

### AI Integration
- OpenAI API for intelligent analysis
- Custom prompt engineering for farm-specific insights

### Development Tools
- Vite for fast development builds
- TypeScript for type safety
- ESLint and Prettier for code quality
- PostCSS for CSS processing

## Deployment Strategy

### Development
- **Local Development**: Vite dev server with hot reload
- **Database**: Requires PostgreSQL instance with DATABASE_URL
- **API Keys**: Requires OpenAI API key for analysis features

### Production Build
- **Frontend**: Vite builds optimized React bundle
- **Backend**: ESBuild creates Node.js bundle
- **Static Assets**: Served from dist/public directory
- **Process**: Single Node.js process serving both API and static files

### Environment Configuration
- **Development**: NODE_ENV=development with tsx for TypeScript execution
- **Production**: NODE_ENV=production with compiled JavaScript
- **Database**: PostgreSQL connection via DATABASE_URL environment variable
- **AI Service**: OpenAI API key configuration

### Key Features
- **File Upload**: Support for JSON file parsing and validation
- **Pattern Analysis**: AI-powered comparison of production vs training data
- **Gap Identification**: Automated detection of missing scenarios
- **Coverage Metrics**: Quantitative analysis of dataset completeness
- **Interactive Chat**: Natural language queries for deeper analysis
- **Responsive Design**: Mobile-friendly interface with dark theme
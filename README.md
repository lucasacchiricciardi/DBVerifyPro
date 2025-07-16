# DB-Verify

A comprehensive database migration verification tool that simplifies and automates the validation process of database migrations by comparing schemas and data between source and target databases.

## Author

**Luca Sacchi Ricciardi**  
Email: luca.sacchi@gmail.com

## License

This work is licensed under the Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License. 

**License Summary:**
- **Attribution Required**: You must give appropriate credit to Luca Sacchi Ricciardi
- **Non-Commercial Use Only**: You may not use this material for commercial purposes
- **No Derivatives**: You may not distribute modified versions of this material
- **Distribution Allowed**: You may copy and redistribute the material in any medium or format

To view a copy of this license, visit [http://creativecommons.org/licenses/by-nc-nd/4.0/](http://creativecommons.org/licenses/by-nc-nd/4.0/) or see the LICENSE file.

## Description

DB-Verify is a diagnostic web application designed to help developers, database administrators (DBAs), and students quickly and reliably verify that a migration between two database servers (e.g., from MySQL to PostgreSQL) has been completed successfully. The tool provides an intuitive web interface where users can enter connection information for both databases and receive a detailed comparison report.

## Key Features

- **Multi-Database Support**: Compatible with MySQL/MariaDB and PostgreSQL databases
- **Comprehensive Schema Comparison**: Validates table structures, column definitions, data types, and constraints
- **Row Count Verification**: Ensures data integrity by comparing row counts across all tables
- **Real-time Verification**: Live progress updates during the verification process
- **Detailed Reporting**: Clear, actionable reports highlighting any discrepancies found
- **Security-First Design**: Passwords are processed in memory only and never stored locally
- **Smart Storage**: Connection details (excluding passwords) are automatically saved for convenience
- **Modern UI**: Clean, responsive interface with professional database tool aesthetics
- **Error Handling**: Robust connection error handling with helpful troubleshooting tips

## Tech Stack

### Backend
- **Node.js** with Express.js framework
- **mysql2** for MySQL/MariaDB connections
- **pg** for PostgreSQL connections
- **Zod** for request validation
- **TypeScript** for type safety

### Frontend
- **React** with TypeScript
- **Tailwind CSS** for styling
- **shadcn/ui** component library
- **React Hook Form** with Zod validation
- **TanStack Query** for API state management
- **Wouter** for routing

### Communication
- RESTful API between frontend and backend
- JSON-based request/response format

## How to Run

### Prerequisites
- Node.js (v18 LTS or higher) - **Recommended: Use Volta.sh for Node.js version management**
- npm or yarn package manager

### Node.js Version Management (Recommended)

For the best development experience, we recommend using [Volta.sh](https://volta.sh/) to manage your Node.js version:

1. **Install Volta** (if not already installed):
   ```bash
   curl https://get.volta.sh | bash
   ```

2. **Install Node.js LTS**:
   ```bash
   volta install node@lts
   ```

3. **Verify Installation**:
   ```bash
   node --version
   npm --version
   ```

Volta automatically ensures you're using the correct Node.js version for this project and provides consistent environments across different machines.

### Installation & Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration** (Optional)
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings
   ```

3. **Development Mode**
   ```bash
   npm run dev
   ```
   This starts both the Express server (backend) and Vite server (frontend) on the configured port (default: 5000).

4. **Production Build**
   ```bash
   npm run build
   npm start
   ```

5. **Type Checking**
   ```bash
   npm run check
   ```

## Environment Configuration

The application supports the following environment variables in your `.env` file:

### Server Configuration
- `PORT`: Server port (default: 5000)

### Database Configuration (when using PostgreSQL for app data storage)
- `DATABASE_URL`: Full PostgreSQL connection string
- `PGHOST`: PostgreSQL host
- `PGPORT`: PostgreSQL port (default: 5432)
- `PGUSER`: PostgreSQL username
- `PGPASSWORD`: PostgreSQL password
- `PGDATABASE`: PostgreSQL database name

**Example `.env` file:**
```bash
# Server Configuration
PORT=5000

# Database Configuration (if using PostgreSQL for app data)
DATABASE_URL=postgresql://user:password@host:5432/database
PGHOST=localhost
PGPORT=5432
PGUSER=your_username
PGPASSWORD=your_password
PGDATABASE=your_database
```

### Usage

1. Open your browser and navigate to `http://localhost:5000`
2. Fill in the connection details for both source and target databases:
   - Database type (MySQL/MariaDB or PostgreSQL)
   - Host, port, username, password, and database name
3. Click "Verify Migration" to start the verification process
4. Review the comprehensive report showing:
   - Overall migration status
   - Table-by-table comparison results
   - Detailed schema differences (click on any table row)
   - Row count discrepancies

### Example API Request

```json
POST /api/verify
{
  "source": {
    "type": "mysql",
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "password",
    "database": "source_db"
  },
  "target": {
    "type": "postgres",
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "password",
    "database": "target_db"
  }
}
```

## Contributing

While this project is licensed under a NoDerivatives license, we welcome:
- Bug reports and feature requests via GitHub issues
- Documentation improvements
- Testing and feedback

For any questions about licensing or contributions, please contact: luca.sacchi@gmail.com

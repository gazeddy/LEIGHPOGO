# Pokémon Go Community Website

Welcome to the Pokémon Go Community Website project! This self-hosted application is designed to bring together Pokémon Go enthusiasts, providing features for raids, community discussions, and more.

## Project Structure

```
poke-community-site
├── src
│   ├── server
│   │   ├── index.ts          # Entry point for the server
│   │   ├── routes            # API routes for the application
│   │   │   ├── api.ts        # Community features API
│   │   │   ├── raids.ts      # Raids-related routes
│   │   │   └── users.ts      # User-related routes
│   │   └── services          # Business logic services
│   │       ├── auth.ts       # Authentication logic
│   │       └── notifications.ts # Notification services
│   ├── client
│   │   ├── pages             # Client-side pages
│   │   │   ├── index.tsx     # Main landing page
│   │   │   ├── map.tsx       # Map page for Pokémon locations
│   │   │   └── community.tsx  # Community events and discussions
│   │   ├── components        # Reusable components
│   │   │   ├── Header.tsx    # Navigation bar
│   │   │   ├── Footer.tsx    # Footer information
│   │   │   └── RaidCard.tsx  # Displays raid information
│   │   ├── styles            # CSS styles
│   │   │   └── globals.css   # Global styles
│   │   └── utils             # Utility functions
│   │       └── api.ts        # API call utilities
│   └── shared                # Shared models and types
│       ├── models
│       │   └── index.ts      # Data models
│       └── types
│           └── index.ts      # TypeScript types and interfaces
├── config
│   ├── nginx
│   │   └── site.conf         # Nginx configuration
│   └── docker
│       └── docker-compose.yml # Docker services configuration
├── scripts
│   └── deploy.sh             # Deployment script
├── .env.example               # Example environment variables
├── package.json              # npm configuration
├── tsconfig.json             # TypeScript configuration
└── README.md                 # Project documentation
```

## Getting Started

### Prerequisites

- Node.js
- TypeScript
- Docker (optional, for containerized deployment)

### Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd poke-community-site
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env` and fill in the required values.

### Running the Application

- To start the server:
  ```
  npm run start
  ```

- To build the client:
  ```
  npm run build
  ```

### Deployment

For deployment instructions, refer to the `scripts/deploy.sh` file.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or features.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
#!/bin/bash

# Navigate to the project directory
cd "$(dirname "$0")/.."

# Build the client application
echo "Building the client application..."
npm run build --prefix src/client

# Start the server
echo "Starting the server..."
npm start --prefix src/server

# Notify deployment success
echo "Deployment completed successfully!"
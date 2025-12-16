const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  testEnvironment: 'node',
  clearMocks: true,
};

module.exports = createJestConfig(customJestConfig);

module.exports = {
    // Look for test files
    testMatch: ['**/src/test/**/*.test.js'],

    // Automatically clear mocks between tests
    clearMocks: true,

    // Collect test coverage
    collectCoverage: true,

    // Include only app source code, exclude test files and config
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/test/**',
        '!**/node_modules/**',
        '!**/config/**',
        '!src/**/index.js'
    ],

    // Output coverage reports here (SonarQube uses this)
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'json-summary'],

    // Increase timeout to prevent DB connection failures
    testTimeout: 30000,

    // Run some setup after environment loads (like DB mocking)
    // setupFilesAfterEnv: ['./jest.setup.js'],

    // Fix open handle warnings
    detectOpenHandles: true,
      setupFilesAfterEnv: ['<rootDir>/src/test/setup.js'], // Adjust if file is elsewhere

    // Run in Node environment (not jsdom)
    testEnvironment: 'node',
};

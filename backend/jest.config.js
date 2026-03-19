module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'commonjs',
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        allowSyntheticDefaultImports: true,
        target: 'ES2021',
        skipLibCheck: true,
        strictNullChecks: false,
        noImplicitAny: false,
      },
    },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/infrastructure/persistence/entities/*.ts',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageDirectory: 'coverage',
};

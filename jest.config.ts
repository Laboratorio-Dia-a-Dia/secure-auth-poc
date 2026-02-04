import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^@config/(.*)$': '<rootDir>/src/config/$1',
        '^@modules/(.*)$': '<rootDir>/src/modules/$1',
        '^@shared/(.*)$': '<rootDir>/src/shared/$1',
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            isolatedModules: true,
        }],
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.spec.ts',
        '!src/**/*.test.ts',
        '!src/server.ts', // Entry point
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70,
        },
    },
    verbose: true,
    testTimeout: 10000, // 10s para testes de integração
    setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
};

export default config;

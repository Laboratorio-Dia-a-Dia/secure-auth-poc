module.exports = {
    env: {
        es2021: true,
        node: true,
    },
    extends: [
        'airbnb-base',
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
    },
    plugins: ['@typescript-eslint', 'prettier', 'import'],
    rules: {
        // Prettier integration
        'prettier/prettier': 'error',

        // Import rules
        'import/extensions': [
            'error',
            'ignorePackages',
            {
                ts: 'never',
            },
        ],
        'import/prefer-default-export': 'off',
        'import/no-extraneous-dependencies': [
            'error',
            {
                devDependencies: ['**/*.spec.ts', '**/*.test.ts'],
            },
        ],

        // TypeScript specific
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            },
        ],
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'error',

        // General
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'class-methods-use-this': 'off',
        'no-underscore-dangle': 'off',
        'consistent-return': 'off',
    },
    settings: {
        'import/resolver': {
            typescript: {},
        },
    },
};

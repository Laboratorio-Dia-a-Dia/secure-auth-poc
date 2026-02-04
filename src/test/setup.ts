import 'dotenv/config';

// Set test environment BEFORE any other imports
process.env['NODE_ENV'] = 'test';

// Override sensitive configs for testing
process.env['JWT_ACCESS_SECRET'] = process.env['JWT_ACCESS_SECRET'] || 'test-access-secret-key-min-32-chars-long';
process.env['JWT_REFRESH_SECRET'] = process.env['JWT_REFRESH_SECRET'] || 'test-refresh-secret-key-min-32-chars-long';
process.env['CSRF_SECRET'] = process.env['CSRF_SECRET'] || 'test-csrf-secret-key-min-32-chars-long';

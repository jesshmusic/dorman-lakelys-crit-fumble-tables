/**
 * Jest Test Setup
 * Runs before all tests to set up global mocks and utilities
 */

import { setupMocks } from './mocks/foundry';

// Set up all global mocks before tests run
setupMocks();

// Suppress console output during tests (optional - uncomment to silence)
// global.console.log = jest.fn();
// global.console.warn = jest.fn();
// global.console.error = jest.fn();

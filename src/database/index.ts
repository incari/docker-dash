/**
 * Database module exports
 */

export { db, initializeSchema, getTableInfo, columnExists } from '../config/database.js';
export { runMigrations } from './migrations.js';


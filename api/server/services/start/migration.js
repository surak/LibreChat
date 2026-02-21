/**
 * Check if permissions migrations are needed for shared resources
 * This is a no-op in stateless mode.
 */
async function checkMigrations() {
  // No-op in stateless mode
}

module.exports = {
  checkMigrations,
};

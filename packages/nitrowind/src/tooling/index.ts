export {
  AUTOCOMPLETE_SCHEMA_VERSION,
  generateAutocomplete,
  renderAutocompleteTypes,
} from "./autocomplete";
export type {
  AutocompleteManifest,
  GenerateAutocompleteOptions,
  GenerateAutocompleteResult,
} from "./autocomplete";
export { analyzeMigration, inspectMigration } from "./migrate";
export type {
  MigrationFinding,
  MigrationReport,
  MigrationSeverity,
  MigrationSource,
} from "./migrate";
export { analyzeCompatibility, inspectCompatibility } from "./doctor";
export type {
  CompatibilityReport,
  CompatibilitySnapshot,
  DoctorCheck,
  DoctorStatus,
} from "./doctor";

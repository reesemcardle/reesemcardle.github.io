// Compatibility launcher: metadata now uses the shared, non-destructive updater.
import {updateMetadata} from './update-metadata.mjs';
await updateMetadata({report:process.argv.includes('--report') || process.argv.includes('--dry-run')});

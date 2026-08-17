// Metro, taught about the monorepo.
//
// pnpm keeps every dependency in a content-addressed store and symlinks it in,
// so Metro has to be told to watch the repository root and to resolve modules
// from both node_modules trees. Without this the app cannot see @yaseen/shared
// and hoisted packages resolve to nothing.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Symlinks are how pnpm works; following them is not optional here.
config.resolver.unstable_enableSymlinks = true;
// Hierarchical lookup stays ON, unlike the usual monorepo recipe. That recipe
// assumes a hoisted node_modules; pnpm instead nests each package's own
// dependencies beside it, and turning the walk off leaves Metro unable to
// resolve them — expo cannot find expo-modules-core, and nothing bundles.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;

// scripts/sync-client.mjs
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { Project, SyntaxKind } from 'ts-morph';

const args = process.argv.slice(2);
const repoArg = args.find(a => a.startsWith('--repo='))?.split('=')[1];
const modulesArg = args.find(a => a.startsWith('--modules='))?.split('=')[1];

if (!repoArg || !modulesArg) {
  console.error('Usage: node scripts/sync-client.mjs --repo=<url> --modules=<pack1,pack2>');
  process.exit(1);
}

const requestedModules = modulesArg.split(',').map(m => m.trim());
const BUILD_DIR = path.resolve('.client-build');
const BLUEPRINT_DIR = path.resolve('.');

// Phase 1: Initialization
console.log('--- Phase 1: Initialization ---');
if (fs.existsSync(BUILD_DIR)) {
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
}

if (repoArg === 'new') {
  fs.mkdirSync(BUILD_DIR);
  execSync('git init', { cwd: BUILD_DIR, stdio: 'inherit' });
} else {
  execSync(git clone  + repoArg +   + BUILD_DIR, { stdio: 'inherit' });
}

// Phase 2: Engine Extraction (Backend)
console.log('--- Phase 2: Engine Extraction ---');
const copyDir = (src, dest, ignorePatterns = []) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (ignorePatterns.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, ignorePatterns);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

// Copy Core
copyDir(path.join(BLUEPRINT_DIR, 'apps/api/src/core'), path.join(BUILD_DIR, 'apps/api/src/core'));
copyDir(path.join(BLUEPRINT_DIR, 'packages'), path.join(BUILD_DIR, 'packages'), ['node_modules']);

// Targeted Copy of Modules
for (const mod of requestedModules) {
  const modSrc = path.join(BLUEPRINT_DIR, 'apps/api/src/modules', mod);
  if (fs.existsSync(modSrc)) {
    copyDir(modSrc, path.join(BUILD_DIR, 'apps/api/src/modules', mod));
  } else {
    console.warn('Warning: Requested module ' + mod + ' not found in Blueprint.');
  }
}

// Active Pruning
const clientModulesDir = path.join(BUILD_DIR, 'apps/api/src/modules');
if (fs.existsSync(clientModulesDir)) {
  const existingModules = fs.readdirSync(clientModulesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  for (const mod of existingModules) {
    if (!requestedModules.includes(mod)) {
      console.log('Pruning unrequested module: ' + mod);
      fs.rmSync(path.join(clientModulesDir, mod), { recursive: true, force: true });
    }
  }
}

// Prisma Scaffolding
const prismaSrc = path.join(BLUEPRINT_DIR, 'apps/api/prisma/schema');
const prismaDest = path.join(BUILD_DIR, 'apps/api/prisma/schema');
fs.mkdirSync(prismaDest, { recursive: true });
if (fs.existsSync(path.join(prismaSrc, 'core.prisma'))) {
  fs.copyFileSync(path.join(prismaSrc, 'core.prisma'), path.join(prismaDest, 'core.prisma'));
}
if (fs.existsSync(path.join(prismaSrc, 'schema.prisma'))) {
  fs.copyFileSync(path.join(prismaSrc, 'schema.prisma'), path.join(prismaDest, 'schema.prisma'));
}
for (const mod of requestedModules) {
  const schemaPath = path.join(prismaSrc, mod + '.prisma');
  if (fs.existsSync(schemaPath)) {
    fs.copyFileSync(schemaPath, path.join(prismaDest, mod + '.prisma'));
  }
}

// Phase 3: AST Modification
console.log('--- Phase 3: AST Modification (TypeScript) ---');
const project = new Project();
const registryFileSrc = path.join(BLUEPRINT_DIR, 'apps/api/src/modules/modules.registry.ts');
const registryFileDest = path.join(BUILD_DIR, 'apps/api/src/modules/modules.registry.ts');

if (fs.existsSync(registryFileSrc)) {
  fs.copyFileSync(registryFileSrc, registryFileDest);
  const sourceFile = project.addSourceFileAtPath(registryFileDest);
  
  // Remove Imports
  const imports = sourceFile.getImportDeclarations();
  imports.forEach(imp => {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    if (moduleSpecifier.startsWith('./')) {
      const moduleName = moduleSpecifier.split('/')[1];
      if (moduleName && !requestedModules.includes(moduleName) && moduleName !== 'core') {
        imp.remove();
      }
    }
  });

  // Remove from FEATURE_MODULES array
  const varDecl = sourceFile.getVariableDeclaration('FEATURE_MODULES');
  if (varDecl) {
    const arrayLiteral = varDecl.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
    if (arrayLiteral) {
      const elements = arrayLiteral.getElements();
      elements.forEach(element => {
        if (element.getKind() === SyntaxKind.ObjectLiteralExpression) {
          const prop = element.getProperty('name');
          if (prop) {
            const val = prop.getInitializer()?.getText().replace(/['"]/g, '');
            if (val && !requestedModules.includes(val)) {
              arrayLiteral.removeElement(element);
            }
          }
        }
      });
    }
  }
  sourceFile.saveSync();
}

// Phase 4: Glass Protection
console.log('--- Phase 4: Glass Protection ---');
copyDir(path.join(BLUEPRINT_DIR, 'apps/web/src/app/(admin)'), path.join(BUILD_DIR, 'apps/web/src/app/(admin)'));
if (repoArg === 'new') {
  copyDir(path.join(BLUEPRINT_DIR, 'apps/web/src/app/(storefront)'), path.join(BUILD_DIR, 'apps/web/src/app/(storefront)'));
  if (fs.existsSync(path.join(BLUEPRINT_DIR, 'apps/web/theme.config.ts'))) {
    fs.copyFileSync(path.join(BLUEPRINT_DIR, 'apps/web/theme.config.ts'), path.join(BUILD_DIR, 'apps/web/theme.config.ts'));
  }
}

// Phase 5: IaaS & Environment
console.log('--- Phase 5: IaaS Scaffolding ---');
let envContent = DATABASE_URL="postgres://..."\nSMTP_URL="smtp://..."\n;
if (requestedModules.includes('managed-services')) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  envContent += AGENCY_API_KEY=""\n;
  console.log('>>> [ACTION REQUIRED] Register this API Key for the client in the Master Database: ' + apiKey);
}
fs.writeFileSync(path.join(BUILD_DIR, '.env.example'), envContent);

// Phase 6: CI/CD & Database Cleanup
console.log('--- Phase 6: CI/CD & Database Cleanup ---');
const migrationsDir = path.join(BUILD_DIR, 'apps/api/prisma/migrations');
if (fs.existsSync(migrationsDir)) {
  fs.rmSync(migrationsDir, { recursive: true, force: true });
}
const githubDir = path.join(BUILD_DIR, '.github/workflows');
if (fs.existsSync(githubDir)) {
  fs.rmSync(githubDir, { recursive: true, force: true });
}

console.log('--- Phase 7: Delivery Ready ---');
console.log('Code successfully extracted to .client-build!');
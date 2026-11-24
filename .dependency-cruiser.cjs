/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make state and bundling harder to reason about.',
      from: { path: '^src/' },
      to: { circular: true },
    },
    {
      name: 'core-must-not-depend-on-ui',
      severity: 'error',
      comment: 'Core layers (auth, db, sync, types, utils) must stay decoupled from SolidJS UI.',
      from: { path: '^src/(auth|db|sync|types|utils)/' },
      to: { path: '^src/ui/' },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Runtime source files must not import devDependencies.',
      from: { path: '^src/' },
      to: {
        dependencyTypes: ['npm-dev'],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};

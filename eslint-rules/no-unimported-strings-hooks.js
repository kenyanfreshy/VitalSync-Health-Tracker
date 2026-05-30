/**
 * eslint-rules/no-unimported-strings-hooks.js
 *
 * Custom ESLint rule: no-unimported-strings-hooks
 *
 * Flags any call to a `useXxxStrings()` hook whose name is NOT present in an
 * import statement from '@/hooks' in the same file.
 *
 * This rule was introduced after the v2.9.22 production crash where five files
 * called useCorrelationStrings() / useRecordsStrings() without importing them,
 * causing a ReferenceError at render time on device.
 *
 * Pattern matched: any identifier matching /^use[A-Z][a-zA-Z]*Strings$/
 * called as a function (i.e. `useXxxStrings()`)
 *
 * The rule is intentionally conservative — it only fires when:
 *   1. The call matches the naming pattern, AND
 *   2. No import from '@/hooks' in the file includes that identifier
 *
 * Usage in eslint.config.js:
 *   import noUnimportedStringsHooks from './eslint-rules/no-unimported-strings-hooks.js';
 *   const stringsHooksPlugin = { rules: { 'no-unimported-strings-hooks': noUnimportedStringsHooks } };
 *   // then in a config block:
 *   { plugins: { 'vitalsync': stringsHooksPlugin }, rules: { 'vitalsync/no-unimported-strings-hooks': 'error' } }
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require that every useXxxStrings() hook call is present in an import from @/hooks.',
      category: 'Possible Errors',
      recommended: true,
      url: 'https://github.com/vitalsync/vitalsync-app/blob/main/eslint-rules/no-unimported-strings-hooks.js',
    },
    fixable: null, // intentionally not auto-fixable; the developer must choose the right import line
    schema: [], // no options
    messages: {
      missingImport:
        "'{{hookName}}' is called but not imported from '@/hooks'. " +
        "Add it to the import statement: import { {{hookName}} } from '@/hooks';",
    },
  },

  create(context) {
    // ── Collect all identifiers imported from '@/hooks' ───────────────────
    /** @type {Set<string>} */
    const importedFromHooks = new Set();

    // ── Collect all useXxxStrings() call sites ────────────────────────────
    /** @type {Array<{name: string, node: import('eslint').Rule.Node}>} */
    const stringsHookCalls = [];

    const STRINGS_HOOK_RE = /^use[A-Z][a-zA-Z]*Strings$/;

    return {
      // Gather imports from '@/hooks'
      ImportDeclaration(node) {
        const src = node.source.value;
        // Match '@/hooks' exactly, or '@/hooks/...' sub-paths
        if (typeof src === 'string' && (src === '@/hooks' || src.startsWith('@/hooks/'))) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' ||
              specifier.type === 'ImportDefaultSpecifier' ||
              specifier.type === 'ImportNamespaceSpecifier'
            ) {
              // For named imports: `import { useFoo } from '@/hooks'`
              // specifier.imported.name is the exported name
              const importedName =
                specifier.type === 'ImportSpecifier'
                  ? specifier.imported.name
                  : specifier.local.name;
              importedFromHooks.add(importedName);
            }
          }
        }
      },

      // Collect useXxxStrings() call expressions
      'CallExpression > Identifier'(node) {
        if (
          STRINGS_HOOK_RE.test(node.name) &&
          node.parent &&
          node.parent.type === 'CallExpression' &&
          node.parent.callee === node
        ) {
          stringsHookCalls.push({ name: node.name, node });
        }
      },

      // After the whole file is processed, report any calls that lack an import
      'Program:exit'() {
        for (const { name, node } of stringsHookCalls) {
          if (!importedFromHooks.has(name)) {
            context.report({
              node,
              messageId: 'missingImport',
              data: { hookName: name },
            });
          }
        }
      },
    };
  },
};

export default rule;

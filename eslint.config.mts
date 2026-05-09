import tseslint from 'typescript-eslint';
import globals from "globals";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
		rules: {
			'no-console': 'off',
			'no-restricted-globals': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-deprecated': 'off',
			'no-misused-promises': 'off',
			'no-floating-promises': 'off',
		},
		ignores: [
			"node_modules",
			"dist",
			"esbuild.config.mjs",
			"eslint.config.js",
			"version-bump.mjs",
			"versions.json",
			"main.js",
		],
	},
);
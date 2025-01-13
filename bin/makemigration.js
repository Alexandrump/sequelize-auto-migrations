#!/usr/bin/env node

import commandLineArgs from 'command-line-args';
import * as migrate from '../lib/migrate.js';
import pathConfig from '../lib/pathconfig.js';

import fs from 'fs';
import _ from 'lodash';

const optionDefinitions = [
    { name: 'preview', alias: 'p', type: Boolean, description: 'Show migration preview (does not change any files)' },
    { name: 'name', alias: 'n', type: String, description: 'Set migration name (default: "noname")' },
    { name: 'comment', alias: 'c', type: String, description: 'Set migration comment' },
    { name: 'execute', alias: 'x', type: Boolean, description: 'Create new migration and execute it' },
    { name: 'migrations-path', type: String, description: 'The path to the migrations folder' },
    { name: 'models-path', type: String, description: 'The path to the models folder' },
    { name: 'help', alias: 'h', type: Boolean, description: 'Show help' }
];

const options = commandLineArgs(optionDefinitions);

if (options.help) {
    console.log('Usage: makemigration [options]');
    console.log('Options:');
    optionDefinitions.forEach(option => {
        console.log(`  --${option.name}${option.alias ? `, -${option.alias}` : ''}: ${option.description}`);
    });
    process.exit(0);
}

(async () => {
    const migrationsPath = options['migrations-path'] || pathConfig.getMigrationsPath();
    const modelsPath = options['models-path'] || pathConfig.getModelsPath();

    if (!fs.existsSync(modelsPath)) {
        console.error(`Models path does not exist: ${modelsPath}`);
        process.exit(1);
    }

    const migrationName = options.name || 'noname';
    const comment = options.comment || '';

    console.log('Generating migration...');

    const diff = await migrate.generateMigration({
        migrationsPath,
        modelsPath,
        preview: options.preview,
        migrationName,
        comment
    });

    if (options.preview) {
        console.log('Migration preview:');
        console.log(diff);
    } else {
        console.log('Migration generated successfully.');
        console.log(`Path: ${migrationsPath}`);
    }

    if (options.execute) {
        console.log('Executing migration...');
        await migrate.runMigration({ migrationsPath });
        console.log('Migration executed successfully.');
    }
})();

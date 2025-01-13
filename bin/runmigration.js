#!/usr/bin/env node

import commandLineArgs from 'command-line-args';
import fs from 'fs';
import migrate from '../lib/migrate.js';
import pathConfig from '../lib/pathconfig.js';

const optionDefinitions = [
    { name: 'rev', alias: 'r', type: Number, description: 'Set migration revision (default: 0)', defaultValue: 0 },
    { name: 'pos', alias: 'p', type: Number, description: 'Run first migration at pos (default: 0)', defaultValue: 0 },
    { name: 'one', type: Boolean, description: 'Do not run next migrations', defaultValue: false },
    { name: 'list', alias: 'l', type: Boolean, description: 'Show migration file list (without execution)', defaultValue: false },
    { name: 'migrations-path', type: String, description: 'The path to the migrations folder' },
    { name: 'models-path', type: String, description: 'The path to the models folder' },
    { name: 'help', alias: 'h', type: Boolean, description: 'Show help' }
];

const options = commandLineArgs(optionDefinitions);

if (options.help) {
    console.log('Usage: runmigration [options]');
    console.log('Options:');
    optionDefinitions.forEach(option => {
        console.log(`  --${option.name}${option.alias ? `, -${option.alias}` : ''}: ${option.description}`);
    });
    process.exit(0);
}

(async () => {
    const migrationsPath = options['migrations-path'] || pathConfig.getMigrationsPath();

    if (!fs.existsSync(migrationsPath)) {
        console.error(`Migrations path does not exist: ${migrationsPath}`);
        process.exit(1);
    }

    if (options.list) {
        console.log('Available migrations:');
        const files = fs.readdirSync(migrationsPath).filter(file => file.endsWith('.js'));
        files.forEach(file => console.log(file));
        process.exit(0);
    }

    console.log('Running migrations...');

    await migrate.runMigration({
        migrationsPath,
        revision: options.rev,
        pos: options.pos,
        one: options.one
    });

    console.log('Migrations executed successfully.');
})();

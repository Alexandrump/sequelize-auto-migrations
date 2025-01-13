#!/usr/bin/env node

import commandLineArgs from 'command-line-args';
import fs from 'fs';
import path from 'path';
import Async from 'async';
import migrate from '../lib/migrate.js';
import { getPaths } from '../lib/pathconfig.js';

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
    console.log("Usage: runmigration [options]");
    optionDefinitions.forEach(option => {
        console.log(`  --${option.name}${option.alias ? `, -${option.alias}` : ''}: ${option.description}`);
    });
    process.exit(0);
}

// Windows support
if (!process.env.PWD) {
    process.env.PWD = process.cwd();
}

const { migrationsDir, modelsDir } = getPaths(options);

if (!fs.existsSync(modelsDir)) {
    console.error(`Models directory not found: ${modelsDir}`);
    process.exit(1);
}

if (!fs.existsSync(migrationsDir)) {
    console.error(`Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
}

if (options.list) {
    console.log("Migrations to execute:");
    const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.js'))
        .sort((a, b) => parseInt(a.split('-')[0]) - parseInt(b.split('-')[0]));
    migrationFiles.forEach(file => console.log(file));
    process.exit(0);
}

const sequelize = require(modelsDir).sequelize;
const queryInterface = sequelize.getQueryInterface();

let migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.js'))
    .sort((a, b) => parseInt(a.split('-')[0]) - parseInt(b.split('-')[0]))
    .filter(file => parseInt(file.split('-')[0]) >= options.rev);

console.log("Migrations to execute:");
migrationFiles.forEach(file => console.log(file));

Async.eachSeries(
    migrationFiles,
    (file, callback) => {
        console.log(`Executing migration: ${file}`);
        migrate.executeMigration(queryInterface, path.join(migrationsDir, file), options.pos, err => {
            if (options.one) return callback("Stopped after first migration");
            callback(err);
        });
    },
    err => {
        if (err) console.error(err);
        console.log("All migrations executed.");
        process.exit(0);
    }
);

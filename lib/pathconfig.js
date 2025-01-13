import path from 'path';
import fs from 'fs';

export async function getMigrationsPath(options) {
    const sequelizercPath = path.join(process.env.PWD, '.sequelizerc');
    let migrationsDir = path.join(process.env.PWD, 'migrations');

    if (fs.existsSync(sequelizercPath)) {
        const sequelizercConfigs = (await import(sequelizercPath)).default;
        if (sequelizercConfigs['migrations-path']) {
            migrationsDir = sequelizercConfigs['migrations-path'];
        }
    }

    if (options['migrations-path']) {
        migrationsDir = path.join(process.env.PWD, options['migrations-path']);
    }

    return migrationsDir;
}

export async function getModelsPath(options) {
    const sequelizercPath = path.join(process.env.PWD, '.sequelizerc');
    let modelsDir = path.join(process.env.PWD, 'models');

    if (fs.existsSync(sequelizercPath)) {
        const sequelizercConfigs = (await import(sequelizercPath)).default;
        if (sequelizercConfigs['models-path']) {
            modelsDir = sequelizercConfigs['models-path'];
        }
    }

    if (options['models-path']) {
        modelsDir = path.join(process.env.PWD, options['models-path']);
    }

    return modelsDir;
}

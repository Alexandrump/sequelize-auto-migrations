import path from 'path';
import fs from 'fs';

export default function(options) {
    let sequelizercConfigs = [];
    const sequelizercPath = path.join(process.env.PWD, '.sequelizerc');

    if (fs.existsSync(sequelizercPath)) {
        sequelizercConfigs = (await import(sequelizercPath)).default;
    }

    if (!process.env.PWD) {
        process.env.PWD = process.cwd();
    }

    let migrationsDir = path.join(process.env.PWD, 'migrations');
    let modelsDir = path.join(process.env.PWD, 'models');

    if (options['migrations-path']) {
        migrationsDir = path.join(process.env.PWD, options['migrations-path']);
    } else if (sequelizercConfigs['migrations-path']) {
        migrationsDir = sequelizercConfigs['migrations-path'];
    }

    if (options['models-path']) {
        modelsDir = path.join(process.env.PWD, options['models-path']);
    } else if (sequelizercConfigs['models-path']) {
        modelsDir = sequelizercConfigs['models-path'];
    }

    return {
        getMigrationsPath: () => migrationsDir,
        getModelsPath: () => modelsDir,
    };
}

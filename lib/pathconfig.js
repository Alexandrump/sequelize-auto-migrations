import path from 'path';
import fs from 'fs';

export default async function getPaths(options) {
    let sequelizercConfigs = {};
    const sequelizercPath = path.join(process.env.PWD || process.cwd(), '.sequelizerc');

    // Cargar configuración de .sequelizerc si existe
    if (fs.existsSync(sequelizercPath)) {
        sequelizercConfigs = (await import(sequelizercPath)).default;
    }

    // Directorios por defecto
    const defaultMigrationsDir = path.join(process.env.PWD || process.cwd(), 'migrations');
    const defaultModelsDir = path.join(process.env.PWD || process.cwd(), 'models');

    // Determinar migrationsDir
    const migrationsDir = options['migrations-path']
        ? path.join(process.env.PWD || process.cwd(), options['migrations-path'])
        : sequelizercConfigs['migrations-path'] || defaultMigrationsDir;

    // Determinar modelsDir
    const modelsDir = options['models-path']
        ? path.join(process.env.PWD || process.cwd(), options['models-path'])
        : sequelizercConfigs['models-path'] || defaultModelsDir;

    return {
        migrationsDir,
        modelsDir,
    };
}

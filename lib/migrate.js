import Sequelize from "sequelize";
import hash from "object-hash";
import _ from "lodash";
import deepDif from "deep-diff";
const { diff } = deepDif;
import jsBeautify from "js-beautify";
const { js_beautify: beautify } = jsBeautify;

import fs from "fs";
import path from "path";

const log = console.log;

const reverseSequelizeColType = function (col, prefix = "Sequelize.") {
    const attrName = col["type"].key;
    const attrObj = col.type;
    const options = col["type"]["options"] ? col["type"]["options"] : {};
    const DataTypes = Sequelize.DataTypes;

    switch (attrName) {
        case DataTypes.CHAR.key:
            if (options.binary) return prefix + "CHAR.BINARY";
            return prefix + "CHAR(" + options.length + ")";

        case DataTypes.STRING.key:
            return prefix + "STRING" + (options.length ? "(" + options.length + ")" : "") +
                (options.binary ? ".BINARY" : "");

        case DataTypes.TEXT.key:
            if (!options.length) return prefix + "TEXT";
            return prefix + "TEXT(" + options.length.toLowerCase() + ")";

        case DataTypes.NUMBER.key:
        case DataTypes.TINYINT.key:
        case DataTypes.SMALLINT.key:
        case DataTypes.MEDIUMINT.key:
        case DataTypes.BIGINT.key:
        case DataTypes.FLOAT.key:
        case DataTypes.REAL.key:
        case DataTypes.DOUBLE.key:
        case DataTypes.DECIMAL.key:
        case DataTypes.INTEGER.key: {
            let ret = attrName;
            if (options.length) {
                ret += "(" + options.length;
                if (options.decimals) ret += ", " + options.decimals;
                ret += ")";
            }

            if (options.precision) {
                ret += "(" + options.precision;
                if (options.scale) ret += ", " + options.scale;
                ret += ")";
            }

            ret = [ret];

            if (options.zerofill) ret.push("ZEROFILL");

            if (options.unsigned) ret.push("UNSIGNED");

            return prefix + ret.join(".");
        }

        case DataTypes.ENUM.key:
            return prefix + "ENUM('" + options.values.join("', '") + "')";

        case DataTypes.BLOB.key:
            if (!options.length) return prefix + "BLOB";
            return prefix + "BLOB(" + options.length.toLowerCase() + ")";

        case DataTypes.GEOMETRY.key:
            if (options.type) {
                if (options.srid) return prefix + "GEOMETRY('" + options.type + "', " + options.srid + ")";
                else return prefix + "GEOMETRY('" + options.type + "')";
            }
            return prefix + "GEOMETRY";

        case DataTypes.GEOGRAPHY.key:
            return prefix + "GEOGRAPHY";

        case DataTypes.ARRAY.key:
            const _type = attrObj.toString();
            let arrayType;
            if (_type === "INTEGER[]" || _type === "STRING[]") {
                arrayType = prefix + _type.replace("[]", "");
            } else {
                arrayType = col.seqType === "Sequelize.ARRAY(Sequelize.INTEGER)" ? prefix + "INTEGER" : prefix + "STRING";
            }
            return prefix + `ARRAY(${arrayType})`;

        case DataTypes.RANGE.key:
            console.warn(attrName + " type not supported, you should make it by");
            return prefix + attrObj.toSql();

        default:
            return prefix + attrName;
    }
};

const reverseSequelizeDefValueType = function (defaultValue, prefix = "Sequelize.") {
    if (typeof defaultValue === "object") {
        if (defaultValue.constructor && defaultValue.constructor.name) {
            return { internal: true, value: prefix + defaultValue.constructor.name };
        }
    }

    if (typeof defaultValue === "function") return { notSupported: true, value: "" };

    return { value: defaultValue };
};

const parseIndex = function (idx) {
    delete idx.parser;
    if (idx.type == "") delete idx.type;

    let options = {};

    if (idx.name) options.name = options.indexName = idx.name;

    if (idx.unique) options.type = options.indicesType = "UNIQUE";

    if (idx.method) options.indexType = idx.type;

    if (idx.parser && idx.parser != "") options.parser = idx.parser;

    idx.options = options;

    idx.hash = hash(idx);

    return idx;
};

const reverseModels = function (sequelize, models) {
    let tables = {};

    // Eliminar la propiedad 'default' si existe en los modelos
    delete models.default;

    for (let model in models) {
        // Validar que el modelo tenga atributos definidos
        let attributes = models[model].attributes || models[model].rawAttributes;
        if (!attributes) {
            console.warn(`Skipping model "${model}" because it lacks attributes.`);
            continue;
        }

        // Procesar cada columna del modelo
        for (let column in attributes) {
            delete attributes[column].Model;
            delete attributes[column].fieldName;

            for (let property in attributes[column]) {
                if (property.startsWith("_")) {
                    delete attributes[column][property];
                    continue;
                }

                if (property === "defaultValue") {
                    let _val = reverseSequelizeDefValueType(attributes[column][property]);
                    if (_val.notSupported) {
                        log(`[Not supported] Skip defaultValue column of attribute ${model}:${column}`);
                        delete attributes[column][property];
                        continue;
                    }
                    attributes[column][property] = _val;
                }

                if (typeof attributes[column][property] === "function") {
                    delete attributes[column][property];
                }
            }

            if (typeof attributes[column]["type"] === "undefined") {
                if (!attributes[column]["seqType"]) {
                    log(`[Not supported] Skip column with undefined type ${model}:${column}`);
                    delete attributes[column];
                    continue;
                } else {
                    if (!["Sequelize.ARRAY(Sequelize.INTEGER)", "Sequelize.ARRAY(Sequelize.STRING)"].includes(attributes[column]["seqType"])) {
                        delete attributes[column];
                        continue;
                    }
                    attributes[column]["type"] = {
                        key: Sequelize.ARRAY.key,
                    };
                }
            }

            let seqType = reverseSequelizeColType(attributes[column]);

            if (seqType === "Sequelize.VIRTUAL") {
                log(`[SKIP] Skip Sequelize.VIRTUAL column "${column}", defined in model "${model}"`);
                delete attributes[column];
                continue;
            }

            if (!seqType) {
                if (
                    typeof attributes[column]["type"]["options"] !== "undefined" &&
                    typeof attributes[column]["type"]["options"].toString === "function"
                ) {
                    seqType = attributes[column]["type"]["options"].toString(sequelize);
                }

                if (typeof attributes[column]["type"].toString === "function") {
                    seqType = attributes[column]["type"].toString(sequelize);
                }
            }

            attributes[column]["seqType"] = seqType;

            delete attributes[column].type;
            delete attributes[column].values; // Eliminar valores ENUM
        }

        // Validar que el modelo tenga la propiedad options
        if (!models[model].options) {
            console.warn(`Skipping model "${model}" because it lacks the "options" property.`);
            continue;
        }

        tables[models[model].tableName] = {
            tableName: models[model].tableName,
            schema: attributes,
        };

        // Validar que el modelo tenga índices definidos
        if (!models[model].options.indexes) {
            console.warn(`Model "${model}" does not have "indexes". Initializing as an empty array.`);
            models[model].options.indexes = [];
        }

        if (models[model].options.indexes.length > 0) {
            let idx_out = {};
            for (let _i in models[model].options.indexes) {
                let index = parseIndex(models[model].options.indexes[_i]);
                idx_out[index.hash + ""] = index;
                delete index.hash;

                Object.freeze(index);
            }
            models[model].options.indexes = idx_out;
        }

        if (typeof models[model].options.charset !== "undefined") {
            tables[models[model].tableName].charset = models[model].options.charset;
        }

        tables[models[model].tableName].indexes = models[model].options.indexes;
    }

    return tables;
};

const parseDifference = function(previousState, currentState)
{
//    log(JSON.stringify(currentState, null, 4));
    let actions = [];
    let difference = diff(previousState, currentState);
    
    for(let _d in difference) 
    {
        let df = difference[_d];
    //    log (JSON.stringify(df, null, 4));
        switch (df.kind) 
        {
            // add new
            case 'N':
            {
                // new table created
                if (df.path.length === 1)
                {
                    let depends = [];
                    let tableName = df.rhs.tableName;
                    _.each(df.rhs.schema, (v) => { if ( v.references ) depends.push(v.references.model)});

                    let options = {};
                    if (typeof df.rhs.charset !== 'undefined') 
                    {
                        options.charset = df.rhs.charset;
                    }

                    actions.push({
                        actionType: 'createTable',
                        tableName: tableName,
                        attributes: df.rhs.schema,
                        options: options,
                        depends: depends
                    });
                    
                    // create indexes
                    if (df.rhs.indexes)
                        for(let _i in df.rhs.indexes)
                        {
                            actions.push(_.extend({
                                actionType: 'addIndex', 
                                tableName: tableName,
                                depends: [ tableName ]
                            }, _.clone(df.rhs.indexes[_i])));
                        }
                    break;
                }
                
                let tableName = df.path[0];
                let depends = [tableName];
                        
                if (df.path[1] === 'schema')
                {
                    // if (df.path.length === 3) - new field
                    if (df.path.length === 3)
                    {
                        // new field
                        if (df.rhs && df.rhs.references)
                            depends.push(df.rhs.references.model);
                        
                        actions.push({
                            actionType: 'addColumn',
                            tableName: tableName,
                            attributeName: df.path[2],
                            options: df.rhs,
                            depends: depends
                        });
                        break;
                    }
                    
                    // if (df.path.length > 3) - add new attribute to column (change col)            
                    if (df.path.length > 3)
                    {
                        if (df.path[1] === 'schema')
                        {                
                            // new field attributes
                            let options = currentState[tableName].schema[df.path[2]];
                            if (options.references)
                                depends.push(options.references.nodel);
                            
                            actions.push({
                                actionType: 'changeColumn',
                                tableName: tableName,
                                attributeName: df.path[2],
                                options: options,
                                depends: depends
                            });
                            break;
                        }
                    }                
                }
    
                // new index
                if (df.path[1] === 'indexes')
                {
                    let tableName = df.path[0];
                    let index = _.clone(df.rhs);
                    index.actionType = 'addIndex';
                    index.tableName = tableName;
                    index.depends = [ tableName ];
                    actions.push(index);
                    break;
                }
            }
            break;
            
            // drop
            case 'D':
            {
                let tableName = df.path[0];
                let depends = [tableName];
                
                if (df.path.length === 1)
                {
                    // drop table
                    actions.push({
                        actionType: 'dropTable',
                        tableName: tableName,
                        depends: []
                    });
                    break;
                }
                
                if (df.path[1] === 'schema')
                {
                    // if (df.path.length === 3) - drop field
                    if (df.path.length === 3)
                    {
                        // drop column
                        actions.push({
                            actionType: 'removeColumn',
                            tableName: tableName,
                            columnName: df.path[2],
                            depends: [ tableName ],
                            options: df.lhs
                        });
                        break;
                    }
                    
                    // if (df.path.length > 3) - drop attribute from column (change col)            
                    if (df.path.length > 3)
                    {
                        // new field attributes
                        let options = currentState[tableName].schema[df.path[2]];
                        if (options.references)
                            depends.push(options.references.nodel);
                        
                        actions.push({
                            actionType: 'changeColumn',
                            tableName: tableName,
                            attributeName: df.path[2],
                            options: options,
                            depends: depends
                        });
                        break;
                    }                  
                }
                
                if (df.path[1] === 'indexes')
                {
//                    log(df)
                     actions.push({
                         actionType: 'removeIndex',
                         tableName: tableName,
                         fields: df.lhs.fields,
                         options: df.lhs.options,
                         depends: [ tableName ]
                     });
                     break;
                }
            }
            break;
                
            // edit
            case 'E':
            {
                let tableName = df.path[0];
                let depends = [tableName];
                
                if (df.path[1] === 'schema')
                {
                    // new field attributes
                    let options = currentState[tableName].schema[df.path[2]];
                    if (options.references)
                        depends.push(options.references.nodel);
                    
                    actions.push({
                        actionType: 'changeColumn',
                        tableName: tableName,
                        attributeName: df.path[2],
                        options: options,
                        depends: depends
                    });
                }
                
                // updated index
                // only support updating and dropping indexes
                if (df.path[1] === 'indexes')
                {
                    let tableName = df.path[0];
                    let keys = Object.keys(df.rhs)

                    for (let k in keys) {
                        let key = keys[k]
                        let index = _.clone(df.rhs[key]);
                        actions.push({
                            actionType: 'addIndex',
                            tableName: tableName,
                            fields: df.rhs[key].fields,
                            options: df.rhs[key].options,
                            depends: [ tableName ]
                        });
                        break;
                    }

                    keys = Object.keys(df.lhs)
                    for (let k in keys) {
                        let key = keys[k]
                        let index = _.clone(df.lhs[key]);
                        actions.push({
                            actionType: 'removeIndex',
                            tableName: tableName,
                            fields: df.lhs[key].fields,
                            options: df.lhs[key].options,
                            depends: [ tableName ]
                        });
                        break;
                    }
                }

            }
            break;
    
            // array change indexes
            case 'A':
            {
                log("[Not supported] Array model changes! Problems are possible. Please, check result more carefully!");
                log("[Not supported] Difference: ");
                log(JSON.stringify(df, null, 4));
            }
            break;
            
            default:
                // code
                break;
        }
    }
    return actions;
};


function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

const sortActions = function(actions)
{
    const orderedActionTypes = [
        'removeIndex',
        'removeColumn',       
        'dropTable',
        'createTable',
        'addColumn',
        'changeColumn',
        'addIndex'
    ];
    
    //test
    //actions = shuffleArray(actions);
    
    actions.sort((a, b) => {
        if (orderedActionTypes.indexOf(a.actionType) < orderedActionTypes.indexOf(b.actionType))
            return -1;
        if (orderedActionTypes.indexOf(a.actionType) > orderedActionTypes.indexOf(b.actionType))
            return 1;  
            
        if (a.depends.length === 0 && b.depends.length > 0)
            return -1; // a < b
        if (b.depends.length === 0 && a.depends.length > 0)
            return 1; // b < a
            
        return 0;    
    });    
    
    for (let k = 0; k <= actions.length ; k++)
        for (let i = 0; i < actions.length ; i++)
        {
            if (!actions[i].depends)
                continue;
            if (actions[i].depends.length === 0)
                continue;
                
            let a = actions[i];
            
            for (let j = 0; j < actions.length; j++)
            {
                if (!actions[j].depends)
                    continue;
                if (actions[j].depends.length === 0)
                    continue;            
                    
                let b = actions[j];
                
                if (a.actionType != b.actionType)
                    continue;
                
                if (b.depends.indexOf(a.tableName) !== -1 && i > j)
                {
                    let c = actions[i];
                    actions[i] = actions[j];
                    actions[j] = c;
                }
    
            }
        }
};


const getMigration = function(actions) 
{
    let propertyToStr = (obj) => {
        let vals = [];
        for (let k in obj)
        {
            if (k === 'seqType')
            {
                vals.push('"type": '+obj[k]);
                continue;
            }
            
            if (k === 'defaultValue')
            {
                if (obj[k].internal)
                {
                    vals.push('"defaultValue": '+obj[k].value);
                    continue;
                }
                if (obj[k].notSupported)
                    continue;

                let x = {};
                x[k] = obj[k].value;
                vals.push(JSON.stringify(x).slice(1, -1));
                continue;
            }
            
            let x = {};
            x[k] = obj[k];
            vals.push(JSON.stringify(x).slice(1, -1));
        }
        
        return '{ ' + vals.reverse().join(', ') + ' }';
    };
    
    let getAttributes = (attrs) => {
        let ret = [];
        for (let attrName in attrs)
        {
            ret.push(`      "${attrName}": ${propertyToStr(attrs[attrName])}`);
        }
        return " { \n" + ret.join(", \n") + "\n     }";
    };

    let commandsUp = [];
    let consoleOut = [];
    
    for (let _i in actions)
    {
        let action = actions[_i];
        switch (action.actionType) 
        {
            case 'createTable':
            {
let resUp =`{ fn: "createTable", params: [
    "${action.tableName}",
    ${getAttributes(action.attributes)},
    ${JSON.stringify(action.options)}
] }`;
                commandsUp.push(resUp);
                
                consoleOut.push(`createTable "${action.tableName}", deps: [${action.depends.join(', ')}]`);
            }
            break;

            case 'dropTable':
            {
                let res = `{ fn: "dropTable", params: ["${action.tableName}"] }`;
                commandsUp.push(res);
                
                consoleOut.push(`dropTable "${action.tableName}"`);
            }
            break;
            
            case 'addColumn':
            {
let resUp = `{ fn: "addColumn", params: [
    "${action.tableName}",
    "${(action.options && action.options.field) ? action.options.field : action.attributeName}",
    ${propertyToStr(action.options)}
] }`;

                commandsUp.push(resUp);

                consoleOut.push(`addColumn "${action.attributeName}" to table "${action.tableName}"`);
            }
            break;

            case 'removeColumn':
            {
                let res = `{ fn: "removeColumn", params: ["${action.tableName}", "${(action.options && action.options.field) ? action.options.field : action.columnName}"] }`;
                commandsUp.push(res);
                
                consoleOut.push(`removeColumn "${(action.options && action.options.field) ? action.options.field : action.columnName}" from table "${action.tableName}"`);
            }
            break;
            
            case 'changeColumn':
            {
let res = `{ fn: "changeColumn", params: [
    "${action.tableName}",
    "${(action.options && action.options.field) ?  action.options.field : action.attributeName}",
    ${propertyToStr(action.options)}
] }`;
                commandsUp.push(res);
                
                consoleOut.push(`changeColumn "${action.attributeName}" on table "${action.tableName}"`);
            }
            break;
            
            case 'addIndex':
            {
let res = `{ fn: "addIndex", params: [
    "${action.tableName}",
    ${JSON.stringify(action.fields)},
    ${JSON.stringify(action.options)}
] }`;
                commandsUp.push(res);
                
                let nameOrAttrs = (action.options && action.options.indexName && action.options.indexName != '') ? `"${action.options.indexName}"` : JSON.stringify(action.fields);
                consoleOut.push(`addIndex ${nameOrAttrs} to table "${action.tableName}"`);
            }
            break;
            
            case 'removeIndex':
            {
//                log(action)
                let nameOrAttrs = (action.options && action.options.indexName && action.options.indexName != '') ? `"${action.options.indexName}"` : JSON.stringify(action.fields);
                
let res = `{ fn: "removeIndex", params: [
    "${action.tableName}",
    ${nameOrAttrs}
] }`;
                commandsUp.push(res);
                
                consoleOut.push(`removeIndex ${nameOrAttrs} from table "${action.tableName}"`);
            }
            
            default:
                // code
        }
    }

    return { commandsUp, consoleOut };
};

const writeMigration = function (revision, migration, migrationsDir, name = '', comment = '') {
    let _commands = "const migrationCommands = [ \n" + migration.commandsUp.join(", \n") + ' \n];\n';
    let _actions = ' * ' + migration.consoleOut.join("\n * ");

    _commands = beautify(_commands);
    let info = {
        revision,
        name,
        created: new Date(),
        comment
    };

    let template = `/**
 * Actions summary:
 *
${_actions}
 *
 **/

const info = ${JSON.stringify(info, null, 4)};

${_commands}

export const up = async (queryInterface, Sequelize) => {
    let index = 0;
    for (const command of migrationCommands) {
        console.log("[#" + index + "] execute: " + command.fn);
        index++;
        await queryInterface[command.fn](...command.params);
    }
};

export default { info, up };
`;

    name = name.replace(' ', '_');
    let filename = path.join(migrationsDir, revision + ((name !== '') ? `-${name}` : '') + '.js');

    fs.writeFileSync(filename, template);

    return { filename, info };
};

const executeMigration = async (queryInterface, filename, pos = 0, cb) => {
    try {
        const { default: mig } = await import(filename);

        if (!mig) {
            return cb(`Cannot import file ${filename}`);
        }

        if (pos > 0) {
            console.log(`Set position to ${pos}`);
            mig.pos = pos;
        }

        try {
            await mig.up(queryInterface, Sequelize);
            cb();
        } catch (err) {
            cb(err);
        }
    } catch (err) {
        cb(`Error importing file ${filename}: ${err.message}`);
    }
};

async function generateMigration({ migrationsPath, modelsPath, preview, migrationName, comment }) {
    // 1. Validar que los directorios existan
    if (!fs.existsSync(migrationsPath)) {
        throw new Error(`Migrations path does not exist: ${migrationsPath}`);
    }
    if (!fs.existsSync(modelsPath)) {
        throw new Error(`Models path does not exist: ${modelsPath}`);
    }

    // 2. Cargar modelos
    const models = await import(path.resolve(modelsPath)); // Cargar los modelos usando ESM

    // 3. Obtener estado actual y previo
    const currentState = reverseModels(Sequelize, models.default); // Convierte los modelos a un esquema legible
    const previousStatePath = path.join(migrationsPath, 'state.json');
    const previousState = fs.existsSync(previousStatePath)
        ? JSON.parse(fs.readFileSync(previousStatePath, 'utf-8'))
        : {};

    // 4. Comparar estados
    const differences = parseDifference(previousState, currentState);

    // 5. Generar comandos de migración
    const sortedActions = sortActions(differences);
    const migration = getMigration(sortedActions);

    // 6. Vista previa
    if (preview) {
        console.log('Migration preview:');
        console.log(migration.commandsUp.join('\n'));
        return migration.commandsUp.join('\n');
    }

    // 7. Guardar el estado actual y crear el archivo de migración
    const revision = Object.keys(previousState).length + 1; // Incrementar revisión
    const { filename } = writeMigration(revision, migration, migrationsPath, migrationName, comment);

    // Guardar el nuevo estado
    fs.writeFileSync(previousStatePath, JSON.stringify(currentState, null, 4));

    console.log(`Migration generated: ${filename}`);
    return filename;
}

export { writeMigration, getMigration, sortActions, parseDifference, reverseModels, executeMigration, generateMigration };

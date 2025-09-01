'use strict';

import fs from 'fs';
import Sequelize from 'sequelize';
import user from './user.js';
import repository from './repository.js';

const env = process.env.NODE_ENV || 'development';
const config = JSON.parse(fs.readFileSync('./config/config.json'))[env];

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(
    config.database,
    config.username,
    config.password,
    config
  );
}

const models = {
  User: user(sequelize, Sequelize.DataTypes),
  Repository: repository(sequelize, Sequelize.DataTypes),
};

Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});
export { models };
export { sequelize, Sequelize };

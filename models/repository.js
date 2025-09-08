'use strict';
import { Model } from 'sequelize';

export default (sequelize, DataTypes) => {
  /**
   * Repository class
   */
  class Repository extends Model {
    /**
     * associate
     *
     * @param {object} models
     */
    static associate(models) {
      this.belongsTo(models.User, { foreignKey: 'userId' });
    }
  }
  Repository.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      owner: DataTypes.STRING,
      repo: DataTypes.STRING,
      configured: DataTypes.BOOLEAN,
      userId: DataTypes.UUID,
    },
    {
      sequelize,
      modelName: 'Repository',
    }
  );
  return Repository;
};

'use strict';
import { Model } from 'sequelize';

export default (sequelize, DataTypes) => {
  /**
   * User class
   */
  class User extends Model {
    /**
     * associate
     *
     * @param {object} models
     */
    static associate(models) {
      this.hasMany(models.Repository, {
        foreignKey: 'userId',
      });
    }
  }
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      githubAccessToken: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'User',
    }
  );
  return User;
};

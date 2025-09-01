import React from 'react';
import PropTypes from 'prop-types';
import styles from '../../../static/css/repository.module.css';

/**
 * Repository class
 **/
export class Repository extends React.Component {
  // eslint-disable-line no-unused-vars
  /**
   * contructor - The constructor
   *
   * @param {object} props - The properties
   * @return {void}
   **/
  constructor(props) {
    super(props);
  }

  /**
   * render - renders
   * @return {object} - The element to be renderd
   **/
  render() {
    let content = <div className={styles.content}></div>;
    console.log(this.props.repository);
    if (this.props.repository) {
      content = (
        <div className={styles.content}>
          <a href={this.props.repository.htmlUrl}>
            <h1>{this.props.repository.fullName}</h1>
          </a>
          <div>{this.props.repository.description}</div>
        </div>
      );
    }
    return content;
  }
}

Repository.propTypes = {
  repository: PropTypes.object,
};

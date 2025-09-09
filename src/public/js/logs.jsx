import React from 'react';

/**
 * Logs class
 **/
export class Logs extends React.Component {
  // eslint-disable-line no-unused-vars
  /**
   * contructor - The constructor
   *
   * @param {object} props - The properties
   * @return {void}
   **/
  constructor(props) {
    super(props);
    this.state = {
      dataFromServer: [],
    };
    this.initWS = this.initWS.bind(this);
  }

  /**
   * componentDidUpdate - When the component updated
   *
   * @return {void}
   **/
  componentDidUpdate() {
    this.node.scrollTop = this.node.scrollHeight;
  }

  /**
   * initWS - Initializes the websocket connection
   *
   * @return {void}
   **/
  initWS() {
    let protocol = 'wss';
    if (window.location.protocol === 'http:') {
      protocol = 'ws';
    }
    const url = `${protocol}://${window.location.hostname}:${window.location.port}/admin/logs`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      console.log('connected');
    };

    this.ws.onmessage = event => {
      const dataFromServer = this.state.dataFromServer;
      dataFromServer.push(event.data);
      if (dataFromServer.length > 100) {
        dataFromServer.shift();
      }
      this.setState({ dataFromServer: dataFromServer });
    };

    this.ws.onclose = () => {
      console.log('disconnected');
      this.initWS();
    };
  }

  /**
   * componentDidMount - on build of the component
   *
   * @return {void}
   **/
  componentDidMount() {
    this.initWS();
  }

  /**
   * render - renders
   * @return {object} - The element to be renderd
   **/
  render() {
    const lines = [];
    for (let i = 0; i < this.state.dataFromServer.length; i++) {
      lines.push(<li key={i}>{this.state.dataFromServer[i]}</li>);
    }
    const ulStyle = {
      listStyleType: 'none',
      paddingLeft: '0px',
    };
    return (
      <div
        className="log"
        ref={node => {
          this.node = node;
        }}
      >
        <ul style={ulStyle}>{lines}</ul>
      </div>
    );
  }
}

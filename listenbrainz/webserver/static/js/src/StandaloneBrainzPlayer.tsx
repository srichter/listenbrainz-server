import { AlertList } from "react-bs-notifier";
import * as React from "react";
import * as ReactDOM from "react-dom";
import BrainzPlayer from "./BrainzPlayer";
import APIService from "./APIService";

export interface RecentListensProps {
  apiUrl: string;
  listens?: Array<Listen>;
  spotify: SpotifyUser;
}

export interface RecentListensState {
  alerts: Array<Alert>;
  currentListen?: Listen;
  listens: Array<Listen>;
}

export default class RecentListens extends React.Component<
  RecentListensProps,
  RecentListensState
> {
  private APIService: APIService;

  private brainzPlayer = React.createRef<BrainzPlayer>();

  constructor(props: RecentListensProps) {
    super(props);
    this.state = {
      alerts: [],
      currentListen: props.listens?.length ? props.listens[0] : undefined,
      listens: props.listens ?? [],
    };

    this.APIService = new APIService(
      props.apiUrl || `${window.location.origin}/1`
    );
    // @ts-ignore
    window.playListen = this.playListen;
  }

  playListen = (listen: Listen): void => {
    if (!listen) {
      this.newAlert(
        "warning",
        undefined,
        "No listen passed to playListen method"
      );
    }
    if (this.brainzPlayer.current) {
      this.brainzPlayer.current.playListen(listen);
    }
  };

  handleCurrentListenChange = (listen: Listen): void => {
    this.setState({ currentListen: listen });
  };

  newAlert = (
    type: AlertType,
    title?: string,
    message?: string | JSX.Element
  ): void => {
    const newAlert = {
      id: new Date().getTime(),
      type,
      title: title ?? "BrainzPlayer",
      message,
    } as Alert;

    this.setState((prevState) => {
      return {
        alerts: [...prevState.alerts, newAlert],
      };
    });
  };

  onAlertDismissed = (alert: Alert): void => {
    const { alerts } = this.state;

    // find the index of the alert that was dismissed
    const idx = alerts.indexOf(alert);

    if (idx >= 0) {
      this.setState({
        // remove the alert from the array
        alerts: [...alerts.slice(0, idx), ...alerts.slice(idx + 1)],
      });
    }
  };

  render() {
    const { alerts, currentListen, listens } = this.state;
    const { spotify } = this.props;

    return (
      <div role="main">
        <BrainzPlayer
          apiService={this.APIService}
          currentListen={currentListen}
          listens={listens}
          newAlert={this.newAlert}
          onCurrentListenChange={this.handleCurrentListenChange}
          ref={this.brainzPlayer}
          spotifyUser={spotify}
        />
        <AlertList
          position="bottom-right"
          alerts={alerts}
          timeout={15000}
          dismissTitle="Dismiss"
          onDismiss={this.onAlertDismissed}
        />
      </div>
    );
  }
}

/* eslint-disable camelcase */
document.addEventListener("DOMContentLoaded", () => {
  const domContainer = document.querySelector("#react-container");
  const propsElement = document.getElementById("react-props");
  let reactProps;
  try {
    reactProps = JSON.parse(propsElement!.innerHTML);
  } catch (err) {
    // TODO: Show error to the user and ask to reload page
  }
  const { api_url, listens, spotify } = reactProps;

  ReactDOM.render(
    <RecentListens apiUrl={api_url} listens={listens} spotify={spotify} />,
    domContainer
  );
});
/* eslint-enable camelcase */

import * as ReactDOM from "react-dom";
import * as React from "react";

import * as Sentry from "@sentry/react";
import ErrorBoundary from "../ErrorBoundary";
import Pill from "../components/Pill";
import { getArtistsStatsRow } from "./TopStatRow";
import { getPageProps } from "../utils";
import SitewideTopEntity from "./SitewideTopEntity";

export type SitewideReportsProps = {
  apiUrl: string;
};

export type SitewideReportsState = {
  range: UserStatsAPIRange;
};

export default class SitewideReports extends React.Component<
  SitewideReportsProps,
  SitewideReportsState
> {
  constructor(props: SitewideReportsProps) {
    super(props);

    this.state = {
      range: "" as UserStatsAPIRange,
    };
  }

  componentDidMount() {
    window.addEventListener("popstate", this.syncStateWithURL);

    const range = this.getURLParams();
    window.history.replaceState(
      null,
      "",
      `?range=${range}${window.location.hash}`
    );
    this.syncStateWithURL();
  }

  componentWillUnmount() {
    window.removeEventListener("popstate", this.syncStateWithURL);
  }

  changeRange = (newRange: UserStatsAPIRange): void => {
    this.setURLParams(newRange);
    this.syncStateWithURL();
  };

  syncStateWithURL = async (): Promise<void> => {
    const range = this.getURLParams();
    this.setState({ range });
  };

  getURLParams = (): UserStatsAPIRange => {
    const url = new URL(window.location.href);

    let range: UserStatsAPIRange = "week";
    if (url.searchParams.get("range")) {
      range = url.searchParams.get("range") as UserStatsAPIRange;
    }

    return range;
  };

  setURLParams = (range: UserStatsAPIRange): void => {
    window.history.pushState(null, "", `?range=${range}`);
  };

  render() {
    const { range } = this.state;
    const { apiUrl } = this.props;

    return (
      <div>
        <div className="row mt-15">
          <div className="col-xs-12">
            <Pill
              active={range === "week"}
              type="secondary"
              onClick={() => this.changeRange("week")}
            >
              Week
            </Pill>
            <Pill
              active={range === "month"}
              type="secondary"
              onClick={() => this.changeRange("month")}
            >
              Month
            </Pill>
            <Pill
              active={range === "year"}
              type="secondary"
              onClick={() => this.changeRange("year")}
            >
              Year
            </Pill>
            <Pill
              active={range === "all_time"}
              type="secondary"
              onClick={() => this.changeRange("all_time")}
            >
              All Time
            </Pill>
          </div>
        </div>
        <section id="top-entity">
          <div className="row">
            <div className="col-md-4">
              <ErrorBoundary>
                <SitewideTopEntity
                  range={range}
                  entity="artist"
                  apiUrl={apiUrl}
                  statsRowMapper={getArtistsStatsRow}
                />
              </ErrorBoundary>
            </div>
          </div>
        </section>
      </div>
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const { domContainer, globalReactProps } = getPageProps();
  const { api_url, sentry_dsn } = globalReactProps;

  if (sentry_dsn) {
    Sentry.init({ dsn: sentry_dsn });
  }

  ReactDOM.render(
    <ErrorBoundary>
      <SitewideReports apiUrl={api_url} />
    </ErrorBoundary>,
    domContainer
  );
});

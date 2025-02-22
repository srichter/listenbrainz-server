/*
 * listenbrainz-server - Server for the ListenBrainz project.
 *
 * Copyright (C) 2020 Param Singh <iliekcomputers@gmail.com>
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as Sentry from "@sentry/react";
import { Integrations } from "@sentry/tracing";
import { isEmpty, isNil } from "lodash";
import FollowButton from "./FollowButton";
import APIService from "./APIService";
import GlobalAppContext, { GlobalAppContextT } from "./GlobalAppContext";
import ReportUserButton from "./ReportUser";
import { getPageProps } from "./utils";

const UserPageHeading = ({
  user,
  loggedInUser,
  loggedInUserFollowsUser = false,
  alreadyReportedUser = false,
}: {
  user: ListenBrainzUser;
  loggedInUser?: ListenBrainzUser;
  loggedInUserFollowsUser: boolean;
  alreadyReportedUser: boolean;
}) => {
  const hasLoggedInUser = !isNil(loggedInUser) && !isEmpty(loggedInUser);
  return (
    <>
      <h2 className="page-title">
        {user.name}
        {hasLoggedInUser && user.name !== loggedInUser?.name && (
          <FollowButton
            type="icon-only"
            user={user}
            loggedInUserFollowsUser={loggedInUserFollowsUser}
          />
        )}
      </h2>
      {hasLoggedInUser && user?.name !== loggedInUser?.name && (
        <ReportUserButton user={user} alreadyReported={alreadyReportedUser} />
      )}
    </>
  );
};

export default UserPageHeading;

document.addEventListener("DOMContentLoaded", () => {
  const domContainer = document.querySelector("#user-page-heading-container");
  const { reactProps, globalReactProps } = getPageProps();
  const {
    api_url,
    sentry_dsn,
    current_user,
    spotify,
    youtube,
    sentry_traces_sample_rate,
  } = globalReactProps;
  const {
    user,
    already_reported_user,
    logged_in_user_follows_user,
  } = reactProps;

  const apiService: APIService = new APIService(
    api_url || `${window.location.origin}/1`
  );

  if (sentry_dsn) {
    Sentry.init({
      dsn: sentry_dsn,
      integrations: [new Integrations.BrowserTracing()],
      tracesSampleRate: sentry_traces_sample_rate,
    });
  }
  const globalProps: GlobalAppContextT = {
    APIService: apiService,
    currentUser: current_user,
    spotifyAuth: spotify,
    youtubeAuth: youtube,
  };

  ReactDOM.render(
    <GlobalAppContext.Provider value={globalProps}>
      <UserPageHeading
        user={user}
        loggedInUser={current_user || null}
        loggedInUserFollowsUser={logged_in_user_follows_user}
        alreadyReportedUser={already_reported_user}
      />
    </GlobalAppContext.Provider>,
    domContainer
  );
});

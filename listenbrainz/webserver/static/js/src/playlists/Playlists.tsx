/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable camelcase */

import * as React from "react";
import * as ReactDOM from "react-dom";

import {
  faPen,
  faPlusCircle,
  faTrashAlt,
  faSave,
  faCog,
} from "@fortawesome/free-solid-svg-icons";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { sanitize } from "dompurify";
import * as Sentry from "@sentry/react";
import { Integrations } from "@sentry/tracing";
import {
  withAlertNotifications,
  WithAlertNotificationsInjectedProps,
} from "../AlertNotificationsHOC";
import APIServiceClass from "../APIService";
import GlobalAppContext, { GlobalAppContextT } from "../GlobalAppContext";
import Card from "../components/Card";
import Loader from "../components/Loader";
import CreateOrEditPlaylistModal from "./CreateOrEditPlaylistModal";
import DeletePlaylistConfirmationModal from "./DeletePlaylistConfirmationModal";
import ErrorBoundary from "../ErrorBoundary";
import {
  getPlaylistExtension,
  getPlaylistId,
  MUSICBRAINZ_JSPF_PLAYLIST_EXTENSION,
} from "./utils";
import { getPageProps } from "../utils";

export type UserPlaylistsProps = {
  playlists?: JSPFObject[];
  user: ListenBrainzUser;
  paginationOffset: string;
  playlistsPerPage: string;
  playlistCount: number;
  activeSection: "playlists" | "recommendations" | "collaborations";
} & WithAlertNotificationsInjectedProps;

export type UserPlaylistsState = {
  playlists: JSPFPlaylist[];
  playlistSelectedForOperation?: JSPFPlaylist;
  loading: boolean;
  paginationOffset: number;
  playlistsPerPage: number;
  playlistCount: number;
};

export default class UserPlaylists extends React.Component<
  UserPlaylistsProps,
  UserPlaylistsState
> {
  static contextType = GlobalAppContext;
  declare context: React.ContextType<typeof GlobalAppContext>;

  private APIService!: APIServiceClass;
  private DEFAULT_PLAYLISTS_PER_PAGE = 25;

  constructor(props: UserPlaylistsProps) {
    super(props);

    const concatenatedPlaylists = props.playlists?.map((pl) => pl.playlist);
    this.state = {
      playlists: concatenatedPlaylists ?? [],
      loading: false,
      paginationOffset: parseInt(props.paginationOffset, 10) || 0,
      playlistCount: props.playlistCount,
      playlistsPerPage:
        parseInt(props.playlistsPerPage, 10) || this.DEFAULT_PLAYLISTS_PER_PAGE,
    };
  }

  componentDidMount(): void {
    const { APIService } = this.context;
    this.APIService = APIService;

    // Listen to browser previous/next events and load page accordingly
    window.addEventListener("popstate", this.handleURLChange);
    // Call it once to allow navigating straight to a certain page
    // The server route provides for this, but just in case…
    // There's a check in handleURLChange to prevent wasting an API call.
    this.handleURLChange();
  }

  componentWillUnmount() {
    window.removeEventListener("popstate", this.handleURLChange);
  }

  handleURLChange = async (): Promise<void> => {
    const url = new URL(window.location.href);
    const { paginationOffset, playlistsPerPage } = this.state;
    let offset = paginationOffset;
    let count = playlistsPerPage;
    if (url.searchParams.get("offset")) {
      offset = Number(url.searchParams.get("offset"));
    }
    if (url.searchParams.get("count")) {
      count = Number(url.searchParams.get("count"));
    }
    if (offset === paginationOffset && count === playlistsPerPage) {
      // Nothing changed
      return;
    }

    this.setState({ loading: true });
    const { user, activeSection, newAlert } = this.props;
    const { currentUser } = this.context;
    try {
      const newPlaylists = await this.APIService.getUserPlaylists(
        user.name,
        currentUser?.auth_token,
        offset,
        count,
        activeSection === "recommendations",
        activeSection === "collaborations"
      );

      this.handleAPIResponse(newPlaylists, false);
    } catch (error) {
      newAlert("danger", "Error loading playlists", error?.message ?? error);
      this.setState({ loading: false });
    }
  };

  isOwner = (playlist: JSPFPlaylist): boolean => {
    const { currentUser } = this.context;
    return Boolean(currentUser) && currentUser?.name === playlist.creator;
  };

  alertNotAuthorized = () => {
    const { newAlert } = this.props;
    newAlert(
      "danger",
      "Not allowed",
      "You are not authorized to modify this playlist"
    );
  };

  copyPlaylist = async (
    playlistId: string,
    playlistTitle: string
  ): Promise<void> => {
    const { newAlert } = this.props;
    const { currentUser } = this.context;
    if (!currentUser?.auth_token) {
      this.alertMustBeLoggedIn();
      return;
    }
    if (!playlistId?.length) {
      newAlert("danger", "Error", "No playlist to copy; missing a playlist ID");
      return;
    }
    try {
      const newPlaylistId = await this.APIService.copyPlaylist(
        currentUser.auth_token,
        playlistId
      );
      // Fetch the newly created playlist and add it to the state if it's the current user's page
      const JSPFObject: JSPFObject = await this.APIService.getPlaylist(
        newPlaylistId,
        currentUser.auth_token
      );
      newAlert(
        "success",
        "Duplicated playlist",
        <>
          Duplicated to playlist&ensp;
          <a href={`/playlist/${newPlaylistId}`}>{JSPFObject.playlist.title}</a>
        </>
      );
      if (this.isCurrentUserPage()) {
        this.setState((prevState) => ({
          playlists: [JSPFObject.playlist, ...prevState.playlists],
        }));
      }
    } catch (error) {
      newAlert("danger", "Error", error.message);
    }
  };

  deletePlaylist = async (): Promise<void> => {
    const { newAlert } = this.props;
    const { currentUser } = this.context;
    const { playlistSelectedForOperation: playlist, playlists } = this.state;
    if (!currentUser?.auth_token) {
      this.alertMustBeLoggedIn();
      return;
    }
    if (!playlist) {
      newAlert("danger", "Error", "No playlist to delete");
      return;
    }
    if (!this.isOwner(playlist)) {
      this.alertNotAuthorized();
      return;
    }
    try {
      await this.APIService.deletePlaylist(
        currentUser.auth_token,
        getPlaylistId(playlist)
      );
      // redirect
      // Remove playlist from state and display success message afterwards
      this.setState(
        {
          playlists: playlists.filter(
            (pl) => getPlaylistId(pl) !== getPlaylistId(playlist)
          ),
          playlistSelectedForOperation: undefined,
        },
        newAlert.bind(
          this,
          "success",
          "Deleted playlist",
          `Deleted playlist ${playlist.title}`
        )
      );
    } catch (error) {
      newAlert("danger", "Error", error.message);
    }
  };

  selectPlaylistForEdit = (playlist: JSPFPlaylist): void => {
    this.setState({ playlistSelectedForOperation: playlist });
  };

  createPlaylist = async (
    title: string,
    description: string,
    isPublic: boolean,
    // Not sure what to do with those yet
    collaborators: string[],
    id?: string,
    onSuccessCallback?: () => void
  ): Promise<void> => {
    const { newAlert } = this.props;
    const { currentUser } = this.context;
    if (id) {
      newAlert(
        "danger",
        "Error",
        "Called createPlaylist method with an ID; should call editPlaylist instead"
      );
      return;
    }
    if (!currentUser?.auth_token) {
      this.alertMustBeLoggedIn();
      return;
    }
    if (!this.isCurrentUserPage()) {
      // Just in case the user find a way to access this method, let's nudge them to their own page
      newAlert(
        "warning",
        "",
        <span>
          Please go to&nbsp;
          <a href={`/user/${currentUser.name}/playlists`}>your playlists</a> to
          create a new one
        </span>
      );
      return;
    }
    try {
      const newPlaylist: JSPFObject = {
        playlist: {
          // Th following 4 fields to satisfy TS type
          creator: currentUser?.name,
          identifier: "",
          date: "",
          track: [],

          title,
          annotation: description,
          extension: {
            [MUSICBRAINZ_JSPF_PLAYLIST_EXTENSION]: {
              public: isPublic,
              collaborators,
            },
          },
        },
      };
      const newPlaylistId = await this.APIService.createPlaylist(
        currentUser.auth_token,
        newPlaylist
      );
      newAlert(
        "success",
        "Created playlist",
        <>
          Created new {isPublic ? "public" : "private"} playlist{" "}
          <a href={`/playlist/${newPlaylistId}`}>{title}</a>
        </>
      );
      // Fetch the newly created playlist and add it to the state
      const JSPFObject: JSPFObject = await this.APIService.getPlaylist(
        newPlaylistId,
        currentUser.auth_token
      );
      this.setState(
        (prevState) => ({
          playlists: [JSPFObject.playlist, ...prevState.playlists],
        }),
        onSuccessCallback
      );
    } catch (error) {
      newAlert("danger", "Error", error.message);
    }
  };

  editPlaylist = async (
    name: string,
    description: string,
    isPublic: boolean,
    collaborators: string[],
    id?: string
  ): Promise<void> => {
    const { newAlert } = this.props;
    const { currentUser } = this.context;
    if (!id) {
      newAlert(
        "danger",
        "Error",
        "Trying to edit a playlist without an id. This shouldn't have happened, please contact us with the error message."
      );
      return;
    }
    if (!currentUser?.auth_token) {
      this.alertMustBeLoggedIn();
      return;
    }
    const { playlists } = this.state;
    const playlistsCopy = [...playlists];
    const playlistIndex = playlistsCopy.findIndex(
      (pl) => getPlaylistId(pl) === id
    );
    const playlistToEdit = playlists[playlistIndex];
    if (!this.isOwner(playlistToEdit)) {
      this.alertNotAuthorized();
      return;
    }
    try {
      // Owner can't be collaborator
      const collaboratorsWithoutOwner = collaborators.filter(
        (username) =>
          username.toLowerCase() !== playlistToEdit.creator.toLowerCase()
      );
      const editedPlaylist: JSPFPlaylist = {
        ...playlistToEdit,
        annotation: description,
        title: name,
        extension: {
          [MUSICBRAINZ_JSPF_PLAYLIST_EXTENSION]: {
            public: isPublic,
            collaborators: collaboratorsWithoutOwner,
          },
        },
      };
      await this.APIService.editPlaylist(currentUser.auth_token, id, {
        playlist: editedPlaylist,
      });

      newAlert("success", "Saved playlist", "");

      // Once API call succeeds, update playlist in state
      playlistsCopy[playlistIndex] = editedPlaylist;
      this.setState({
        playlists: playlistsCopy,
        playlistSelectedForOperation: undefined,
      });
    } catch (error) {
      newAlert("danger", "Error", error.message);
    }
  };

  alertMustBeLoggedIn = () => {
    const { newAlert } = this.props;
    newAlert("danger", "Error", "You must be logged in for this operation");
  };

  isCurrentUserPage = () => {
    const { user, activeSection } = this.props;
    const { currentUser } = this.context;
    if (activeSection === "recommendations") {
      return false;
    }
    return currentUser?.name === user.name;
  };

  handleClickNext = async () => {
    const { user, activeSection, newAlert } = this.props;
    const { currentUser } = this.context;
    const { paginationOffset, playlistsPerPage, playlistCount } = this.state;
    const newOffset = paginationOffset + playlistsPerPage;
    // No more playlists to fetch
    if (newOffset >= playlistCount) {
      return;
    }
    this.setState({ loading: true });
    try {
      const newPlaylists = await this.APIService.getUserPlaylists(
        user.name,
        currentUser?.auth_token,
        newOffset,
        playlistsPerPage,
        activeSection === "recommendations",
        activeSection === "collaborations"
      );

      this.handleAPIResponse(newPlaylists);
    } catch (error) {
      newAlert("danger", "Error loading playlists", error?.message ?? error);
      this.setState({ loading: false });
    }
  };

  handleClickPrevious = async () => {
    const { user, activeSection, newAlert } = this.props;
    const { currentUser } = this.context;
    const { paginationOffset, playlistsPerPage } = this.state;
    // No more playlists to fetch
    if (paginationOffset === 0) {
      return;
    }
    const newOffset = Math.max(0, paginationOffset - playlistsPerPage);
    this.setState({ loading: true });
    try {
      const newPlaylists = await this.APIService.getUserPlaylists(
        user.name,
        currentUser?.auth_token,
        newOffset,
        playlistsPerPage,
        activeSection === "recommendations",
        activeSection === "collaborations"
      );

      this.handleAPIResponse(newPlaylists);
    } catch (error) {
      newAlert("danger", "Error loading playlists", error?.message ?? error);
      this.setState({ loading: false });
    }
  };

  handleAPIResponse = (
    newPlaylists: {
      playlists: JSPFObject[];
      playlist_count: number;
      count: string;
      offset: string;
    },
    pushHistory: boolean = true
  ) => {
    const parsedOffset = parseInt(newPlaylists.offset, 10);
    const parsedCount = parseInt(newPlaylists.count, 10);
    this.setState({
      playlists: newPlaylists.playlists.map((pl: JSPFObject) => pl.playlist),
      playlistCount: newPlaylists.playlist_count,
      paginationOffset: parsedOffset,
      playlistsPerPage: parsedCount,
      loading: false,
    });
    if (pushHistory) {
      window.history.pushState(
        null,
        "",
        `?offset=${parsedOffset}&count=${parsedCount}`
      );
    }
  };

  render() {
    const { user, activeSection } = this.props;
    const {
      playlists,
      playlistSelectedForOperation,
      paginationOffset,
      playlistsPerPage,
      playlistCount,
      loading,
    } = this.state;
    const isRecommendations = activeSection === "recommendations";
    const isCollaborations = activeSection === "collaborations";
    return (
      <div>
        <Loader isLoading={loading} />
        {isRecommendations && (
          <>
            <h3>Recommendation playlists created for {user.name}</h3>
            <p>
              These playlists are ephemeral and will only be available for a
              month. Be sure to save the ones you like to your own playlists !
            </p>
          </>
        )}
        {isCollaborations && <h2>Collaborative playlists</h2>}
        {!playlists.length && (
          <p>No playlists to show yet. Come back later !</p>
        )}
        <div
          id="playlists-container"
          style={{ opacity: loading ? "0.4" : "1" }}
        >
          {playlists.map((playlist: JSPFPlaylist) => {
            const isOwner = this.isOwner(playlist);
            const playlistId = getPlaylistId(playlist);
            const customFields = getPlaylistExtension(playlist);
            return (
              <Card className="playlist" key={playlistId}>
                {isRecommendations ? (
                  <button
                    className="playlist-card-action-button"
                    onClick={this.copyPlaylist.bind(
                      this,
                      playlistId,
                      playlist.title
                    )}
                    type="button"
                  >
                    <FontAwesomeIcon
                      icon={faSave as IconProp}
                      title="Save to my playlists"
                    />
                    &nbsp;Save
                  </button>
                ) : (
                  <>
                    <div className="dropup playlist-card-action-dropdown">
                      <button
                        className="dropdown-toggle playlist-card-action-button"
                        type="button"
                        id="playlistOptionsDropdown"
                        data-toggle="dropdown"
                        aria-haspopup="true"
                        aria-expanded="true"
                        onClick={this.selectPlaylistForEdit.bind(
                          this,
                          playlist
                        )}
                      >
                        <FontAwesomeIcon
                          icon={faCog as IconProp}
                          title="More options"
                        />
                        &nbsp;Options
                      </button>
                      <ul
                        className="dropdown-menu"
                        aria-labelledby="playlistOptionsDropdown"
                      >
                        <li>
                          <button
                            onClick={this.copyPlaylist.bind(
                              this,
                              playlistId,
                              playlist.title
                            )}
                            type="button"
                          >
                            Duplicate
                          </button>
                        </li>
                        {isOwner && (
                          <>
                            <li role="separator" className="divider" />
                            <li>
                              <button
                                type="button"
                                data-toggle="modal"
                                data-target="#playlistEditModal"
                              >
                                <FontAwesomeIcon icon={faPen as IconProp} />{" "}
                                Edit
                              </button>
                            </li>
                            <li>
                              <button
                                type="button"
                                data-toggle="modal"
                                data-target="#confirmDeleteModal"
                              >
                                <FontAwesomeIcon
                                  icon={faTrashAlt as IconProp}
                                />{" "}
                                Delete
                              </button>
                            </li>
                          </>
                        )}
                      </ul>
                    </div>
                  </>
                )}
                <a className="info" href={`/playlist/${sanitize(playlistId)}`}>
                  <h4>{playlist.title}</h4>
                  {playlist.annotation && (
                    <div
                      className="description"
                      // Sanitize the HTML string before passing it to dangerouslySetInnerHTML
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{
                        __html: sanitize(playlist.annotation),
                      }}
                    />
                  )}
                  <div>
                    Created:{" "}
                    {new Date(playlist.date).toLocaleString(undefined, {
                      // @ts-ignore see https://github.com/microsoft/TypeScript/issues/40806
                      dateStyle: "short",
                    })}
                  </div>
                  <div>
                    {customFields?.last_modified_at &&
                      `Last Modified: ${new Date(
                        customFields.last_modified_at
                      ).toLocaleString(undefined, {
                        // @ts-ignore see https://github.com/microsoft/TypeScript/issues/40806
                        dateStyle: "short",
                      })}`}
                  </div>
                </a>
              </Card>
            );
          })}
          {!isRecommendations && !isCollaborations && this.isCurrentUserPage() && (
            <>
              <Card
                className="new-playlist"
                data-toggle="modal"
                data-target="#playlistCreateModal"
              >
                <div>
                  <FontAwesomeIcon icon={faPlusCircle as IconProp} size="2x" />
                  <span>Create new playlist</span>
                </div>
              </Card>
              <CreateOrEditPlaylistModal
                onSubmit={this.createPlaylist}
                htmlId="playlistCreateModal"
              />
              <CreateOrEditPlaylistModal
                onSubmit={this.editPlaylist}
                playlist={playlistSelectedForOperation}
                htmlId="playlistEditModal"
              />
              <DeletePlaylistConfirmationModal
                onConfirm={this.deletePlaylist}
                playlist={playlistSelectedForOperation}
              />
            </>
          )}
        </div>
        <ul className="pager" style={{ display: "flex" }}>
          <li className={`previous ${paginationOffset <= 0 ? "disabled" : ""}`}>
            <a
              role="button"
              onClick={this.handleClickPrevious}
              onKeyDown={(e) => {
                if (e.key === "Enter") this.handleClickPrevious();
              }}
              tabIndex={0}
            >
              &larr; Previous
            </a>
          </li>
          <li
            className={`next ${
              playlistCount &&
              playlistCount <= paginationOffset + playlistsPerPage
                ? "disabled"
                : ""
            }`}
            style={{ marginLeft: "auto" }}
          >
            <a
              role="button"
              onClick={this.handleClickNext}
              onKeyDown={(e) => {
                if (e.key === "Enter") this.handleClickNext();
              }}
              tabIndex={0}
            >
              Next &rarr;
            </a>
          </li>
        </ul>
      </div>
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const {
    domContainer,
    reactProps,
    globalReactProps,
    optionalAlerts,
  } = getPageProps();
  const {
    api_url,
    sentry_dsn,
    current_user,
    spotify,
    youtube,
    sentry_traces_sample_rate,
  } = globalReactProps;
  const {
    playlists,
    user,
    playlist_count: playlistCount,
    active_section: activeSection,
    pagination_offset: paginationOffset,
    playlists_per_page: playlistsPerPage,
  } = reactProps;

  if (sentry_dsn) {
    Sentry.init({
      dsn: sentry_dsn,
      integrations: [new Integrations.BrowserTracing()],
      tracesSampleRate: sentry_traces_sample_rate,
    });
  }

  const UserPlaylistsWithAlertNotifications = withAlertNotifications(
    UserPlaylists
  );

  const apiService = new APIServiceClass(
    api_url || `${window.location.origin}/1`
  );

  const globalProps: GlobalAppContextT = {
    APIService: apiService,
    currentUser: current_user,
    spotifyAuth: spotify,
    youtubeAuth: youtube,
  };

  ReactDOM.render(
    <ErrorBoundary>
      <GlobalAppContext.Provider value={globalProps}>
        <UserPlaylistsWithAlertNotifications
          initialAlerts={optionalAlerts}
          activeSection={activeSection}
          playlistCount={playlistCount}
          playlists={playlists}
          paginationOffset={paginationOffset}
          playlistsPerPage={playlistsPerPage}
          user={user}
        />
      </GlobalAppContext.Provider>
    </ErrorBoundary>,
    domContainer
  );
});

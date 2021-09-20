// eslint-disable-next-line max-classes-per-file
import * as React from "react";
import getEntityLink from "./utils";

interface TopStatRow<Type> {
  getStatsRow(data: Type): JSX.Element[];
}

// eslint-disable-next-line import/prefer-default-export
export function getArtistsStatsRow(data: UserArtistsResponse): JSX.Element[] {
  return data.payload.artists.map((artist, index) => {
    return (
      // eslint-disable-next-line react/no-array-index-key
      <tr key={index} style={{ height: 44 }}>
        <td style={{ width: "10%", textAlign: "end" }}>{index + 1}.&nbsp;</td>
        <td
          style={{
            textOverflow: "ellipsis",
            overflow: "hidden",
            paddingRight: 10,
          }}
        >
          {getEntityLink(
            "artist",
            artist.artist_name,
            artist.artist_mbids && artist.artist_mbids[0]
          )}
        </td>
        <td style={{ width: "10%" }}>{artist.listen_count}</td>
      </tr>
    );
  });
}

class ReleaseTopStatRow implements TopStatRow<UserReleasesResponse> {
  getStatsRow = (data: UserReleasesResponse): JSX.Element[] => {
    return data.payload.releases.map((release, index) => {
      return (
        // eslint-disable-next-line react/no-array-index-key
        <React.Fragment key={index}>
          <tr style={{ height: 22 }}>
            <td style={{ width: "10%", textAlign: "end" }}>
              {index + 1}.&nbsp;
            </td>
            <td
              style={{
                textOverflow: "ellipsis",
                overflow: "hidden",
                paddingRight: 10,
              }}
            >
              {getEntityLink(
                "release",
                release.release_name,
                release.release_mbid
              )}
            </td>
            <td style={{ width: "10%" }}>{release.listen_count}</td>
          </tr>
          <tr style={{ height: 22 }}>
            <td />
            <td
              style={{
                fontSize: 12,
                textOverflow: "ellipsis",
                overflow: "hidden",
                paddingRight: 10,
              }}
            >
              {getEntityLink(
                "artist",
                release.artist_name,
                release.artist_mbids && release.artist_mbids[0]
              )}
            </td>
          </tr>
        </React.Fragment>
      );
    });
  };
}

class RecordingTopStatRow implements TopStatRow<UserRecordingsResponse> {
  getStatsRow = (data: UserRecordingsResponse): JSX.Element[] => {
    return data.payload.recordings.map((recording, index) => {
      return (
        // eslint-disable-next-line react/no-array-index-key
        <React.Fragment key={index}>
          <tr style={{ height: 22 }}>
            <td style={{ width: "10%", textAlign: "end" }}>
              {index + 1}.&nbsp;
            </td>
            <td
              style={{
                textOverflow: "ellipsis",
                overflow: "hidden",
                paddingRight: 10,
              }}
            >
              {getEntityLink(
                "recording",
                recording.track_name,
                recording.recording_mbid
              )}
            </td>
            <td style={{ width: "10%" }}>{recording.listen_count}</td>
          </tr>
          <tr style={{ height: 22 }}>
            <td />
            <td
              style={{
                fontSize: 12,
                textOverflow: "ellipsis",
                overflow: "hidden",
                paddingRight: 10,
              }}
            >
              {getEntityLink(
                "artist",
                recording.artist_name,
                recording.artist_mbids && recording.artist_mbids[0]
              )}
            </td>
          </tr>
        </React.Fragment>
      );
    });
  };
}

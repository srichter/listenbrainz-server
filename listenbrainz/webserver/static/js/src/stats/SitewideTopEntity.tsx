import * as React from "react";
import { faExclamationCircle, faLink } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";

import APIService from "../APIService";
import Card from "../components/Card";
import Loader from "../components/Loader";

export type SitewideTopEntityProps<Type> = {
  range: UserStatsAPIRange;
  entity: Entity;
  statsRowMapper: (data: Type) => JSX.Element[];
  apiUrl: string;
};

export type SitewideTopEntityState<Type> = {
  data: Type;
  loading: boolean;
  errorMessage: string;
  hasError: boolean;
};

export default class SitewideTopEntity<Type> extends React.Component<
  SitewideTopEntityProps<Type>,
  SitewideTopEntityState<Type>
> {
  APIService: APIService;

  constructor(props: SitewideTopEntityProps<Type>) {
    super(props);

    this.APIService = new APIService(
      props.apiUrl || `${window.location.origin}/1`
    );

    this.state = {
      data: {} as Type,
      loading: false,
      hasError: false,
      errorMessage: "",
    };
  }

  componentDidUpdate(prevProps: SitewideTopEntityProps<Type>) {
    const { range: prevRange } = prevProps;
    const { range: currRange } = this.props;
    if (prevRange !== currRange) {
      if (["week", "month", "year", "all_time"].indexOf(currRange) < 0) {
        this.setState({
          loading: false,
          hasError: true,
          errorMessage: `Invalid range: ${currRange}`,
        });
      } else {
        this.loadData();
      }
    }
  }

  loadData = async (): Promise<void> => {
    this.setState({
      hasError: false,
      loading: true,
    });
    const data = ((await this.getData()) as unknown) as Type;
    this.setState({ loading: false, data });
  };

  getData = async (): Promise<UserEntityResponse> => {
    const { entity, range } = this.props;
    try {
      return await this.APIService.getSitewideEntity(entity, range, 0, 10);
    } catch (error) {
      if (error.response && error.response.status === 204) {
        this.setState({
          loading: false,
          hasError: true,
          errorMessage: "Statistics for the user have not been calculated",
        });
      } else {
        throw error;
      }
    }
    return {} as UserEntityResponse;
  };

  render() {
    const { entity, range, statsRowMapper } = this.props;
    const { data, loading, hasError, errorMessage } = this.state;

    const entityTextOnCard = `${entity}s`;

    return (
      <Card
        style={{
          minHeight: 550,
          marginTop: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <h3 className="capitalize-bold" style={{ display: "inline" }}>
          Top {entityTextOnCard}
        </h3>
        <h4
          style={{
            display: "inline",
            position: "absolute",
            marginTop: 20,
            right: 20,
          }}
        >
          <a href="#top-entity">
            <FontAwesomeIcon
              icon={faLink as IconProp}
              size="sm"
              color="#46443A"
              style={{ marginRight: 20 }}
            />
          </a>
        </h4>
        <Loader isLoading={loading}>
          <table
            style={{
              whiteSpace: "nowrap",
              tableLayout: "fixed",
              width: "90%",
            }}
          >
            <tbody>
              {hasError && (
                <tr style={{ height: 440 }}>
                  <td
                    style={{
                      fontSize: 24,
                      textAlign: "center",
                      whiteSpace: "initial",
                    }}
                  >
                    <FontAwesomeIcon icon={faExclamationCircle as IconProp} />{" "}
                    {errorMessage}
                  </td>
                </tr>
              )}
              {!hasError &&
                Object.keys(data).length > 0 &&
                statsRowMapper(data)}
            </tbody>
          </table>
          {!hasError && (
            <a
              href={`${window.location.origin}/sitewide-stats/charts?range=${range}&entity=${entity}`}
              className="mt-15"
            >
              View More
            </a>
          )}
        </Loader>
      </Card>
    );
  }
}
